use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::{Component, Path};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::fs;

/// Tauri event pushed to the webview when files change on disk under a watched
/// project root. Only working-tree paths (bulk `.git` stores excluded) are
/// reported, so the git UIs can reload without a fixed poll.
const FS_CHANGED_EVENT: &str = "fs-changed";

/// Debounce window. Editors rewrite a file as a burst of create/truncate/write
/// events, so coalesce every burst into a single emit.
const DEBOUNCE: Duration = Duration::from_millis(150);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FsChangedPayload {
    cwd: String,
    paths: Vec<String>,
}

/// Per-cwd coalescing buffer shared between the watcher callback thread and the
/// debounce flush thread.
struct Pending {
    paths: Vec<String>,
    scheduled: bool,
}

struct Entry {
    /// Keep the watcher alive for the lifetime of the entry; dropping it stops
    /// watching.
    _watcher: RecommendedWatcher,
    /// Refcount: several windows can watch the same project folder.
    count: u32,
}

#[derive(Default)]
pub struct FsWatchState {
    inner: Mutex<HashMap<String, Entry>>,
}

/// True when an event path should be ignored. Working-tree changes matter for
/// git status; `.git` bookkeeping (index/HEAD/refs) matters for states changed
/// from an external terminal. Bulk object/lfs stores are pure noise.
fn ignored(rel: &Path) -> bool {
    let mut components = rel.components();
    match components.next() {
        Some(Component::Normal(segment)) if segment == OsStr::new(".git") => {
            match components.next() {
                Some(Component::Normal(segment)) => {
                    segment == OsStr::new("objects") || segment == OsStr::new("lfs")
                }
                _ => false,
            }
        }
        Some(_) => false,
        None => true,
    }
}

/// Start watching `cwd` recursively, emitting `fs-changed` after files change.
/// Idempotent and refcounted, so several windows watching the same folder keep
/// the watcher alive until the last one unregisters.
#[tauri::command]
pub fn fs_watch_register(
    app: AppHandle,
    state: State<'_, FsWatchState>,
    cwd: String,
) -> Result<(), String> {
    let root = fs::expand_home(&cwd);
    if !root.is_dir() {
        return Err(format!("Not a directory: {root:?}"));
    }

    {
        let mut inner = state.inner.lock().unwrap();
        if let Some(entry) = inner.get_mut(&cwd) {
            entry.count += 1;
            return Ok(());
        }
    }

    let shared = Arc::new(Mutex::new(Pending {
        paths: Vec::new(),
        scheduled: false,
    }));
    let watch_shared = Arc::clone(&shared);
    let watch_app = app.clone();
    let watch_cwd = cwd.clone();
    let watch_root = root.clone();

    let event_handler = move |res: Result<notify::Event, notify::Error>| {
        let Ok(event) = res else { return };
        if event.paths.is_empty() {
            return;
        }
        if matches!(event.kind, EventKind::Access(_) | EventKind::Other) {
            return;
        }
        let mut paths = Vec::with_capacity(event.paths.len());
        for path in event.paths {
            let Ok(rel) = path.strip_prefix(&watch_root) else {
                continue;
            };
            if ignored(rel) {
                continue;
            }
            paths.push(fs::path_to_js(&path));
        }
        if paths.is_empty() {
            return;
        }
        let mut pending = watch_shared.lock().unwrap();
        pending.paths.extend(paths);
        if pending.scheduled {
            return;
        }
        pending.scheduled = true;
        drop(pending);
        let pending = Arc::clone(&watch_shared);
        let app = watch_app.clone();
        let cwd = watch_cwd.clone();
        std::thread::spawn(move || {
            std::thread::sleep(DEBOUNCE);
            let paths = {
                let mut guard = pending.lock().unwrap();
                guard.scheduled = false;
                std::mem::take(&mut guard.paths)
            };
            if paths.is_empty() {
                return;
            }
            let _ = app.emit(FS_CHANGED_EVENT, FsChangedPayload { cwd, paths });
        });
    };

    let mut watcher =
        notify::recommended_watcher(event_handler).map_err(|error| error.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    let mut inner = state.inner.lock().unwrap();
    inner.insert(
        cwd,
        Entry {
            _watcher: watcher,
            count: 1,
        },
    );
    Ok(())
}

/// Stop watching `cwd` once every caller has unregistered.
#[tauri::command]
pub fn fs_watch_unregister(state: State<'_, FsWatchState>, cwd: String) -> Result<(), String> {
    let mut inner = state.inner.lock().unwrap();
    if let Some(entry) = inner.get_mut(&cwd) {
        entry.count = entry.count.saturating_sub(1);
        if entry.count == 0 {
            inner.remove(&cwd);
        }
    }
    Ok(())
}
