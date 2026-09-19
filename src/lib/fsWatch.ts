import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const FS_CHANGED = "fs-changed";

export type FsChangedPayload = { cwd: string; paths: string[] };

type FsChangeListener = (paths: string[]) => void;

const listenersByCwd = new Map<string, Set<FsChangeListener>>();
let bridgeInstalled = false;

/** Native filesystem watcher for the backend (see `fs_watch_register`). When no
 * caller watches a folder anymore, tell the backend to drop its watcher. */
export function watchProjectFs(cwd: string): Promise<unknown> {
  return invoke("fs_watch_register", { cwd });
}

export function unwatchProjectFs(cwd: string): Promise<unknown> {
  return invoke("fs_watch_unregister", { cwd });
}

/** Subscribe to filesystem changes for a single project folder. The latest
 * Tauri event carries the folder that changed, so one listener set per cwd. */
export function subscribeFsChanged(
  cwd: string,
  listener: FsChangeListener,
): () => void {
  if (!bridgeInstalled) {
    bridgeInstalled = true;
    void listen<FsChangedPayload>(FS_CHANGED, (event) => {
      const matching = listenersByCwd.get(event.payload.cwd);
      if (!matching) return;
      for (const handle of matching) handle(event.payload.paths);
    }).catch(() => {
      bridgeInstalled = false;
    });
  }
  let listeners = listenersByCwd.get(cwd);
  if (!listeners) {
    listeners = new Set();
    listenersByCwd.set(cwd, listeners);
  }
  listeners.add(listener);
  return () => {
    const set = listenersByCwd.get(cwd);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) listenersByCwd.delete(cwd);
  };
}