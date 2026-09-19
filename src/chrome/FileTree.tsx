import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  Search,
} from "./icons";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  leafName,
  validateFileName,
  wellFormedFileName,
  type NameIssue,
} from "../lib/fileName";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { useVirtualWindow } from "../hooks/useVirtualWindow";
import {
  createParentOf,
  dirsTouchedByCreate,
  dirsTouchedByMove,
  forgetDir,
  listCachedDir,
  loadExpanded,
  loadSelected,
  notifyDirsChanged,
  peekDir,
  refreshDir,
  saveExpanded,
  saveSelected,
  subscribeDirsChanged,
} from "../lib/fileTree";
import {
  basename,
  copyPath,
  createPath,
  deletePath,
  movePath,
  renamePath,
  revealPath,
  type FsEntry,
} from "../lib/fs";
import { displayPath, parentPath, rebasePath } from "../lib/paths";
import { IS_MAC, IS_WIN, MOD } from "../lib/platform";
import type { OpenFileFn } from "../lib/search";
import type { GitStatusMap } from "../hooks/useGitFileStatuses";
import {
  emitExplorerFilePointerDrag,
  setGrabbing,
  suppressTextSelection,
} from "../lib/drag";
import { ExplorerMenu, type ExplorerMenuItem } from "./ExplorerMenu";
import { FileTypeIcon } from "./FileTypeIcon";

const GIT_STATUS_COLOR: Record<string, string> = {
  modified: "text-amber-400",
  added: "text-emerald-400",
  untracked: "text-emerald-400",
  deleted: "text-red-400",
};

const TREE_ROW_PX = 30;

type FlatRow =
  | {
      kind: "entry";
      entry: FsEntry;
      depth: number;
      posInSet: number;
      setSize: number;
    }
  | { kind: "placeholder"; id: string; depth: number; text: string }
  | { kind: "create"; id: number; depth: number; posInSet: number; setSize: number };

type Props = {
  cwd: string;
  onOpenFile: OpenFileFn;
  onOpenTerminal?: (cwd: string) => void;
  onFileMoved?: (from: string, to: string) => void;
  onFileDeleted?: (path: string) => void;
  onSearch?: () => void;
  gitStatuses?: GitStatusMap;
};

type Creating = { id: number; parent: string; isDir: boolean };
type Clip = { mode: "copy" | "cut"; path: string; isDir: boolean };
type MenuTarget = { path: string; isDir: boolean; isRoot: boolean };
type MenuState = { x: number; y: number; target: MenuTarget };

const REVEAL_LABEL = IS_MAC
  ? "Reveal in Finder"
  : IS_WIN
    ? "Reveal in File Explorer"
    : "Open Containing Folder";

type TreeState = {
  expanded: Set<string>;
  selectedPath: string | null;
  creating: Creating | null;
  renaming: string | null;
  cutPath: string | null;
  epoch: number;
  gitStatuses?: GitStatusMap;
};

type TreeStore = {
  getState: () => TreeState;
  setState: (updater: (prev: TreeState) => TreeState) => void;
  subscribe: (listener: () => void) => () => void;
};

function createTreeStore(initialState: TreeState): TreeStore {
  let state = initialState;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (updater) => {
      const next = updater(state);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const TreeStoreCtx = createContext<TreeStore | null>(null);

function useTreeStore(): TreeStore {
  const store = useContext(TreeStoreCtx);
  if (!store) throw new Error("TreeStoreCtx missing");
  return store;
}

type TreeActionsValue = {
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onFilePointerDown: (
    path: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  consumeFileClick: () => boolean;
  onOpenFile: OpenFileFn;
  onCreateCommit: (id: number, raw: string) => Promise<void>;
  onCreateCancel: (id: number) => void;
  onRenameCommit: (path: string, raw: string) => Promise<void>;
  onRenameCancel: () => void;
  onItemContextMenu: (
    entry: { path: string; isDir: boolean },
    e: ReactMouseEvent,
  ) => void;
};

const TreeActionsCtx = createContext<TreeActionsValue | null>(null);

function useTreeActions(): TreeActionsValue {
  const ctx = useContext(TreeActionsCtx);
  if (!ctx) throw new Error("TreeActionsCtx missing");
  return ctx;
}


function isDirAt(cwd: string, path: string): boolean {
  if (path === cwd) return true;
  return (
    peekDir(parentPath(path))?.find((entry) => entry.path === path)?.isDir ??
    peekDir(path) != null
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    el.remove();
  }
}

function flattenRows(opts: {
  cwd: string;
  children: FsEntry[] | null;
  expanded: Set<string>;
  creating: Creating | null;
  dirErrors: Record<string, string>;
}): FlatRow[] {
  const { cwd, children, expanded, creating, dirErrors } = opts;
  const rows: FlatRow[] = [];

  const visit = (path: string, depth: number, entries: FsEntry[]) => {
    const folders: FsEntry[] = [];
    const files: FsEntry[] = [];
    for (const entry of entries) {
      if (entry.isDir) folders.push(entry);
      else files.push(entry);
    }
    const creatingHere = creating && creating.parent === path ? creating : null;
    const setSize = folders.length + files.length + (creatingHere ? 1 : 0);
    let pos = 0;
    if (creatingHere?.isDir) {
      pos += 1;
      rows.push({ kind: "create", id: creatingHere.id, depth, posInSet: pos, setSize });
    }
    for (const folder of folders) {
      pos += 1;
      rows.push({
        kind: "entry",
        entry: folder,
        depth,
        posInSet: pos,
        setSize,
      });
      if (expanded.has(folder.path)) {
        const sub = peekDir(folder.path);
        if (sub) {
          visit(folder.path, depth + 1, sub);
        } else {
          rows.push({
            kind: "placeholder",
            id: `${folder.path}:load`,
            depth: depth + 1,
            text: dirErrors[folder.path] ?? "…",
          });
        }
      }
    }
    if (creatingHere && !creatingHere.isDir) {
      pos += 1;
      rows.push({ kind: "create", id: creatingHere.id, depth, posInSet: pos, setSize });
    }
    for (const file of files) {
      pos += 1;
      rows.push({ kind: "entry", entry: file, depth, posInSet: pos, setSize });
    }
  };

  if (children) visit(cwd, 0, children);
  return rows;
}

function explorerItems(
  target: MenuTarget,
  clip: Clip | null,
  canOpenTerminal: boolean,
): ExplorerMenuItem[] {
  const pasteParent = target.isDir ? target.path : parentPath(target.path);
  const pasteBlocked =
    !clip ||
    (clip.isDir &&
      (pasteParent === clip.path || pasteParent.startsWith(`${clip.path}/`)));
  return [
    { kind: "item", id: "new-file", label: "New File" },
    { kind: "item", id: "new-folder", label: "New Folder" },
    { kind: "sep" },
    {
      kind: "item",
      id: "cut",
      label: "Cut",
      shortcut: `${MOD}X`,
      disabled: target.isRoot,
    },
    {
      kind: "item",
      id: "copy",
      label: "Copy",
      shortcut: `${MOD}C`,
      disabled: target.isRoot,
    },
    {
      kind: "item",
      id: "paste",
      label: "Paste",
      shortcut: `${MOD}V`,
      disabled: pasteBlocked,
    },
    {
      kind: "item",
      id: "duplicate",
      label: "Duplicate",
      disabled: target.isRoot,
    },
    { kind: "sep" },
    { kind: "item", id: "copy-path", label: "Copy Path" },
    { kind: "item", id: "copy-relative-path", label: "Copy Relative Path" },
    { kind: "sep" },
    {
      kind: "item",
      id: "rename",
      label: "Rename",
      shortcut: "F2",
      disabled: target.isRoot,
    },
    {
      kind: "item",
      id: "delete",
      label: "Delete",
      shortcut: "⌫",
      disabled: target.isRoot,
      danger: true,
    },
    { kind: "sep" },
    ...(canOpenTerminal
      ? [
          {
            kind: "item" as const,
            id: "open-terminal",
            label: "Open in Terminal",
          },
        ]
      : []),
    { kind: "item", id: "reveal", label: REVEAL_LABEL },
  ];
}

// Chat updates rerender the sidebar even when Files is hidden. Keep its tree
// intact unless file-tree props, local state, or subscriptions actually change.
export const FileTree = memo(function FileTree({
  cwd,
  onOpenFile,
  onOpenTerminal,
  onFileMoved,
  onFileDeleted,
  onSearch,
  gitStatuses,
}: Props) {
  const store = useMemo(() => {
    return createTreeStore({
      expanded: loadExpanded(cwd),
      selectedPath: loadSelected(cwd),
      creating: null,
      renaming: null,
      cutPath: null,
      epoch: 0,
      gitStatuses,
    });
  }, [cwd]);

  useLayoutEffect(() => {
    store.setState((prev) => {
      if (prev.gitStatuses === gitStatuses) return prev;
      return { ...prev, gitStatuses };
    });
  }, [store, gitStatuses]);

  const [children, setChildren] = useState<FsEntry[] | null>(() =>
    peekDir(cwd),
  );
  const [error, setError] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [dirErrors, setDirErrors] = useState<Record<string, string>>({});
  const [loadedTick, setLoadedTick] = useState(0);
  const pendingDirLoads = useRef(new Set<string>());

  const updateClip = useCallback(
    (nextClip: Clip | null | ((cur: Clip | null) => Clip | null)) => {
      setClip((cur) => {
        const resolved =
          typeof nextClip === "function" ? nextClip(cur) : nextClip;
        const cutPath = resolved?.mode === "cut" ? resolved.path : null;
        store.setState((s) => (s.cutPath === cutPath ? s : { ...s, cutPath }));
        return resolved;
      });
    },
    [store],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const name = basename(cwd);

  const rootOpen = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getState().expanded.has(cwd), [store, cwd]),
  );
  const epoch = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getState().epoch, [store]),
  );
  const expanded = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getState().expanded, [store]),
  );
  const creating = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getState().creating, [store]),
  );
  const renaming = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getState().renaming, [store]),
  );

  const toggle = useCallback(
    (path: string) => {
      store.setState((prev) => {
        const next = new Set(prev.expanded);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        saveExpanded(cwd, next);
        return { ...prev, expanded: next };
      });
    },
    [cwd, store],
  );

  const onSelect = useCallback(
    (path: string) => {
      store.setState((prev) => {
        if (prev.selectedPath === path) return prev;
        saveSelected(cwd, path);
        return { ...prev, selectedPath: path };
      });
    },
    [cwd, store],
  );

  const fileDragCleanup = useRef<(() => void) | null>(null);
  const suppressFileClickUntil = useRef(0);

  const onFilePointerDown = useCallback(
    (
      path: string,
      event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (event.button !== 0 || fileDragCleanup.current) return;
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let lastX = startX;
      let lastY = startY;
      let active = false;
      let restoreSelection: (() => void) | undefined;
      let preview: HTMLDivElement | null = null;

      const movePreview = () => {
        if (!preview) return;
        const edge = 8;
        const grabX = 12;
        const grabY = 13;
        const width = preview.offsetWidth;
        const height = preview.offsetHeight;
        const x = Math.min(
          Math.max(edge, lastX - grabX),
          Math.max(edge, window.innerWidth - width - edge),
        );
        const y = Math.min(
          Math.max(edge, lastY - grabY),
          Math.max(edge, window.innerHeight - height - edge),
        );
        preview.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(
          y,
        )}px, 0)`;
      };

      const createPreview = () => {
        preview = document.createElement("div");
        preview.setAttribute("aria-hidden", "true");
        preview.classList.add("explorer-file-drag-preview");

        // Keep the useful identity of the row without dragging its full-width
        // layout, indentation spacer, selection state, or button behavior.
        const icon = handle.children.item(1)?.cloneNode(true);
        const label = handle.children.item(2)?.cloneNode(true);
        if (icon) preview.append(icon);
        if (label) preview.append(label);

        document.body.append(preview);
        movePreview();
      };

      const release = () => {
        delete handle.dataset.explorerDragging;
        preview?.remove();
        preview = null;
        document.documentElement.classList.remove("is-explorer-file-dragging");
        if (restoreSelection) {
          restoreSelection();
          restoreSelection = undefined;
          setGrabbing(false);
        }
        try {
          if (handle.hasPointerCapture(pointerId))
            handle.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
      };

      const reset = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("blur", onCancel);
        release();
        if (active) emitExplorerFilePointerDrag({ type: "end", path });
        fileDragCleanup.current = null;
      };

      const activate = () => {
        active = true;
        onSelect(path);
        restoreSelection = suppressTextSelection();
        setGrabbing(true);
        createPreview();
        document.documentElement.classList.add("is-explorer-file-dragging");
        handle.dataset.explorerDragging = "true";
        try {
          handle.setPointerCapture(pointerId);
        } catch {
          /* window listeners still track the gesture */
        }
      };

      function onMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        if (!active) {
          if (Math.hypot(lastX - startX, lastY - startY) < 5) return;
          activate();
        }
        moveEvent.preventDefault();
        movePreview();
        emitExplorerFilePointerDrag({ type: "move", path, x: lastX, y: lastY });
      }

      function finish(commit: boolean, upEvent?: PointerEvent) {
        if (commit && upEvent) onMove(upEvent);
        if (active) {
          suppressFileClickUntil.current = performance.now() + 400;
          if (commit) {
            emitExplorerFilePointerDrag({
              type: "drop",
              path,
              x: lastX,
              y: lastY,
            });
          }
        }
        reset();
      }

      function onUp(upEvent: PointerEvent) {
        if (upEvent.pointerId === pointerId) finish(true, upEvent);
      }
      function onCancel() {
        finish(false);
      }
      function onKey(keyEvent: KeyboardEvent) {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        finish(false);
      }

      fileDragCleanup.current = onCancel;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey);
      window.addEventListener("blur", onCancel);
    },
    [onSelect],
  );

  const consumeFileClick = useCallback(
    () => performance.now() < suppressFileClickUntil.current,
    [],
  );

  useEffect(() => () => fileDragCleanup.current?.(), []);

  const expandDirs = useCallback(
    (dirs: string[]) => {
      store.setState((prev) => {
        const next = new Set(prev.expanded);
        for (const dir of dirs) next.add(dir);
        saveExpanded(cwd, next);
        return { ...prev, expanded: next };
      });
    },
    [cwd, store],
  );

  const refreshTouched = useCallback(
    async (touched: string[], forget: string[] = []) => {
      for (const path of forget) forgetDir(path);
      await Promise.all([...new Set(touched)].map((path) => refreshDir(path)));
      store.setState((cur) => ({ ...cur, epoch: cur.epoch + 1 }));
    },
    [store],
  );

  const remapTreePaths = useCallback(
    (from: string, to: string) => {
      store.setState((prev) => {
        const nextExpanded = new Set<string>();
        for (const path of prev.expanded)
          nextExpanded.add(rebasePath(path, from, to));
        saveExpanded(cwd, nextExpanded);
        const nextSelected = prev.selectedPath
          ? rebasePath(prev.selectedPath, from, to)
          : prev.selectedPath;
        saveSelected(cwd, nextSelected);
        return {
          ...prev,
          expanded: nextExpanded,
          selectedPath: nextSelected,
        };
      });
      updateClip((cur) =>
        cur && (cur.path === from || cur.path.startsWith(`${from}/`))
          ? { ...cur, path: rebasePath(cur.path, from, to) }
          : cur,
      );
    },
    [cwd, store, updateClip],
  );

  const startCreate = (
    isDir: boolean,
    atPath: string | null = store.getState().selectedPath,
  ) => {
    const parent = createParentOf(cwd, atPath);
    expandDirs([cwd, parent]);
    store.setState((prev) => ({
      ...prev,
      renaming: null,
      creating: { id: Date.now(), parent, isDir },
    }));
  };

  const startRename = (path: string) => {
    if (path === cwd) return;
    setMenu(null);
    onSelect(path);
    store.setState((prev) => ({
      ...prev,
      creating: null,
      renaming: path,
    }));
  };

  const onCreateCancel = useCallback(
    (id: number) => {
      store.setState((cur) =>
        cur.creating?.id === id ? { ...cur, creating: null } : cur,
      );
    },
    [store],
  );

  const onCreateCommit = useCallback(
    async (id: number, raw: string) => {
      const session = store.getState().creating;
      if (!session || session.id !== id) return;
      const asFolder = session.isDir || /[/\\]$/.test(raw);
      const fileName = wellFormedFileName(raw);
      const created = await createPath(session.parent, fileName, asFolder);
      const touched = dirsTouchedByCreate(session.parent, fileName);
      await refreshTouched(touched);
      store.setState((cur) => {
        const nextExpanded = new Set(cur.expanded);
        for (const dir of touched) nextExpanded.add(dir);
        saveExpanded(cwd, nextExpanded);
        saveSelected(cwd, created);
        return {
          ...cur,
          creating: cur.creating?.id === id ? null : cur.creating,
          expanded: nextExpanded,
          selectedPath: created,
        };
      });
      if (!asFolder) onOpenFile(created, undefined, { exact: true });
    },
    [cwd, onOpenFile, refreshTouched, store],
  );

  const onRenameCancel = useCallback(() => {
    store.setState((cur) => (cur.renaming ? { ...cur, renaming: null } : cur));
  }, [store]);

  const onRenameCommit = useCallback(
    async (path: string, raw: string) => {
      const fileName = wellFormedFileName(raw);
      if (!fileName || (fileName === basename(path) && !/[/\\]/.test(raw))) {
        store.setState((cur) =>
          cur.renaming ? { ...cur, renaming: null } : cur,
        );
        return;
      }
      const next = await renamePath(path, fileName);
      const wasDir = isDirAt(cwd, path);
      const parent = parentPath(path);
      await refreshTouched(
        [...dirsTouchedByCreate(parent, fileName), parent],
        wasDir ? [path] : [],
      );
      expandDirs(dirsTouchedByCreate(parent, fileName));
      remapTreePaths(path, next);
      store.setState((cur) => ({ ...cur, renaming: null }));
      onFileMoved?.(path, next);
    },
    [cwd, expandDirs, onFileMoved, refreshTouched, remapTreePaths, store],
  );

  const removeEntry = async (path: string) => {
    if (path === cwd) return;
    const isDir = isDirAt(cwd, path);
    const label = basename(path);
    const ok = window.confirm(
      isDir
        ? `Delete folder “${label}” and everything inside it?`
        : `Delete “${label}”?`,
    );
    if (!ok) return;
    await deletePath(path);
    await refreshTouched([parentPath(path)], isDir ? [path] : []);
    store.setState((prev) => {
      if (
        !prev.selectedPath ||
        prev.selectedPath === path ||
        prev.selectedPath.startsWith(`${path}/`)
      ) {
        const parent = parentPath(path);
        saveSelected(cwd, parent);
        return { ...prev, selectedPath: parent };
      }
      return prev;
    });
    updateClip((cur) =>
      cur && (cur.path === path || cur.path.startsWith(`${path}/`))
        ? null
        : cur,
    );
    onFileDeleted?.(path);
  };

  const pasteAt = async (targetPath: string) => {
    if (!clip) return;
    const destParent = createParentOf(cwd, targetPath);
    if (
      clip.isDir &&
      (destParent === clip.path || destParent.startsWith(`${clip.path}/`))
    ) {
      throw new Error("Cannot paste a folder into itself.");
    }
    const from = clip.path;
    const mode = clip.mode;
    const isDir = clip.isDir;
    const created =
      mode === "cut"
        ? await movePath(from, destParent)
        : await copyPath(from, destParent);
    if (mode === "cut") {
      await refreshTouched(
        dirsTouchedByMove(from, created),
        isDir ? [from] : [],
      );
      remapTreePaths(from, created);
      onFileMoved?.(from, created);
      updateClip(null);
    } else {
      await refreshTouched([destParent]);
    }
    expandDirs([destParent]);
    onSelect(created);
  };

  const duplicateAt = async (path: string) => {
    if (path === cwd) return;
    const destParent = parentPath(path);
    const created = await copyPath(path, destParent);
    await refreshTouched([destParent]);
    onSelect(created);
  };

  const run = async (work: () => Promise<void>) => {
    setOpError(null);
    try {
      await work();
    } catch (err: unknown) {
      setOpError(err instanceof Error ? err.message : String(err));
    }
  };

  const openMenu = useCallback(
    (target: MenuTarget, x: number, y: number) => {
      store.setState((prev) => ({ ...prev, creating: null, renaming: null }));
      onSelect(target.path);
      setMenu({ x, y, target });
    },
    [onSelect, store],
  );

  const runAction = async (id: string, target: MenuTarget) => {
    switch (id) {
      case "new-file":
        startCreate(false, target.path);
        return;
      case "new-folder":
        startCreate(true, target.path);
        return;
      case "cut":
        if (target.isRoot) return;
        updateClip({ mode: "cut", path: target.path, isDir: target.isDir });
        return;
      case "copy":
        if (target.isRoot) return;
        updateClip({ mode: "copy", path: target.path, isDir: target.isDir });
        return;
      case "paste":
        await run(() => pasteAt(target.path));
        return;
      case "duplicate":
        await run(() => duplicateAt(target.path));
        return;
      case "copy-path":
        await copyText(target.path);
        return;
      case "copy-relative-path":
        await copyText(displayPath(target.path, cwd));
        return;
      case "rename":
        startRename(target.path);
        return;
      case "delete":
        await run(() => removeEntry(target.path));
        return;
      case "reveal":
        await run(() => revealPath(target.path));
        return;
      case "open-terminal":
        onOpenTerminal?.(target.isDir ? target.path : parentPath(target.path));
        return;
    }
  };

  const onItemContextMenu = useCallback(
    (
      entry: { path: string; isDir: boolean },
      e: ReactMouseEvent,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu(
        { path: entry.path, isDir: entry.isDir, isRoot: false },
        e.clientX,
        e.clientY,
      );
    },
    [openMenu],
  );

  const onBackgroundMenu = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("input")) return;
    e.preventDefault();
    openMenu({ path: cwd, isDir: true, isRoot: true }, e.clientX, e.clientY);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input")) return;
    if (
      (e.target as HTMLElement).closest("button") &&
      !(e.target as HTMLElement).closest("[role='treeitem']")
    ) {
      return;
    }
    const path = store.getState().selectedPath ?? cwd;
    const isRoot = path === cwd;
    const isDir = isDirAt(cwd, path);
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && !e.altKey && !e.shiftKey && key === "c") {
      if (isRoot) return;
      e.preventDefault();
      updateClip({ mode: "copy", path, isDir });
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && key === "x") {
      if (isRoot) return;
      e.preventDefault();
      updateClip({ mode: "cut", path, isDir });
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && key === "v") {
      e.preventDefault();
      void run(() => pasteAt(path));
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      startRename(path);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void run(() => removeEntry(path));
      return;
    }
    if (e.key === "Escape" && clip?.mode === "cut") {
      e.preventDefault();
      updateClip(null);
    }
  };

  useEffect(() => {
    if (!menu) return;
    const onScroll = () => setMenu(null);
    const scrollParent = rootRef.current?.closest(".overflow-y-auto") ?? window;
    scrollParent.addEventListener("scroll", onScroll, true);
    return () => scrollParent.removeEventListener("scroll", onScroll, true);
  }, [menu]);

  useEffect(() => {
    const unsub = subscribeDirsChanged(() => {
      store.setState((cur) => ({ ...cur, epoch: cur.epoch + 1 }));
    });
    const onResume = () => {
      if (!document.hidden) notifyDirsChanged();
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      unsub();
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [store]);

  useEffect(() => {
    const hit = peekDir(cwd);
    if (hit) {
      setChildren(hit);
      setError(null);
      return;
    }
    let cancelled = false;
    setChildren(null);
    setError(null);
    void listCachedDir(cwd)
      .then((entries) => {
        if (!cancelled) setChildren(entries);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setChildren([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, epoch]);

  useEffect(() => {
    if (!rootOpen) return;
    for (const path of expanded) {
      if (path === cwd) continue;
      if (pendingDirLoads.current.has(path)) continue;
      if (peekDir(path) !== null) continue;
      pendingDirLoads.current.add(path);
      listCachedDir(path)
        .then(() => {
          setLoadedTick((tick) => tick + 1);
        })
        .catch((err: unknown) => {
          setDirErrors((prev) => ({
            ...prev,
            [path]: err instanceof Error ? err.message : String(err),
          }));
          setLoadedTick((tick) => tick + 1);
        })
        .finally(() => {
          pendingDirLoads.current.delete(path);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootOpen, expanded, cwd, epoch]);

  const flat = useMemo(
    () =>
      flattenRows({
        cwd,
        children,
        expanded,
        creating,
        dirErrors,
      }),
    [cwd, children, expanded, creating, dirErrors, loadedTick],
  );
  const pinnedIndex = useMemo(() => {
    for (let i = 0; i < flat.length; i += 1) {
      const row = flat[i];
      if (!row) continue;
      if (row.kind === "create") return i;
      if (row.kind === "entry" && renaming === row.entry.path) return i;
    }
    return null;
  }, [flat, renaming]);

  const vw = useVirtualWindow(flat.length, TREE_ROW_PX);
  const scrollerRef = useCallback(
    (el: HTMLDivElement | null) => {
      lockOverscroll(el);
      vw.containerRef(el);
    },
    [lockOverscroll, vw.containerRef],
  );

  const treeActionsValue = useMemo<TreeActionsValue>(
    () => ({
      onToggle: toggle,
      onSelect,
      onFilePointerDown,
      consumeFileClick,
      onOpenFile,
      onCreateCommit,
      onCreateCancel,
      onRenameCommit,
      onRenameCancel,
      onItemContextMenu,
    }),
    [
      toggle,
      onSelect,
      onFilePointerDown,
      consumeFileClick,
      onOpenFile,
      onCreateCommit,
      onCreateCancel,
      onRenameCommit,
      onRenameCancel,
      onItemContextMenu,
    ],
  );

  return (
    <TreeStoreCtx.Provider value={store}>
      <TreeActionsCtx.Provider value={treeActionsValue}>
        <div
          ref={rootRef}
          tabIndex={-1}
          className="flex h-full min-h-0 flex-col outline-none"
          onKeyDown={onKeyDown}
          onContextMenu={onBackgroundMenu}
        >
          <div
            className="flex h-9 shrink-0 items-center gap-px overflow-visible border-b border-content/10 px-2"
            onContextMenu={(e) => e.stopPropagation()}
          >
            <HeaderIcon label="New File" onClick={() => startCreate(false)}>
              <FilePlus className="size-3.5" strokeWidth={1.75} />
            </HeaderIcon>
            <HeaderIcon label="New Folder" onClick={() => startCreate(true)}>
              <FolderPlus className="size-3.5" strokeWidth={1.75} />
            </HeaderIcon>
            {onSearch ? (
              <HeaderIcon
                label={`Search in files (${MOD}Shift+F)`}
                onClick={onSearch}
              >
                <Search className="size-3.5" strokeWidth={1.75} />
              </HeaderIcon>
            ) : null}
          </div>
          <div className="flex h-8 shrink-0 items-center">
            <button
              type="button"
              aria-expanded={rootOpen}
              title={cwd}
              onClick={() => {
                onSelect(cwd);
                toggle(cwd);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openMenu(
                  { path: cwd, isDir: true, isRoot: true },
                  e.clientX,
                  e.clientY,
                );
              }}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 h-full pl-2 text-left"
            >
              <span className="grid size-4 shrink-0 place-items-center text-content/50">
                {rootOpen ? (
                  <ChevronDown className="size-3.5" strokeWidth={1.75} />
                ) : (
                  <ChevronRight className="size-3.5" strokeWidth={1.75} />
                )}
              </span>
              <span className="min-w-0 truncate text-[11px] font-semibold tracking-[0.08em] text-content/50 uppercase">
                {name}
              </span>
            </button>
          </div>
          {opError ? (
            <p className="px-3 py-1 text-[12px] leading-4 text-red-400">
              {opError}
            </p>
          ) : null}
          {error ? (
            <p
              className="truncate px-3 py-1 text-[12px] leading-4 text-content/50"
              style={{ paddingLeft: 8 }}
            >
              {error}
            </p>
          ) : null}
          {rootOpen && children === null && !error ? (
            <p className="px-3 py-1 text-[12px] leading-4 text-content/50">
              …
            </p>
          ) : null}
          <div
            ref={scrollerRef}
            onScroll={vw.onScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-none"
          >
            {rootOpen ? (
              <div
                role="tree"
                aria-label={`${name} files`}
                aria-rowcount={flat.length}
                className="relative min-w-0"
                style={{ position: "relative", height: vw.totalHeight }}
              >
                {pinnedIndex !== null && flat[pinnedIndex] ? (
                  <TreeRowView
                    key={flatRowKey(flat[pinnedIndex])}
                    row={flat[pinnedIndex]}
                    top={pinnedIndex * TREE_ROW_PX}
                  />
                ) : null}
                {flat.slice(vw.start, vw.end).map((row, sliceIndex) => {
                  const index = vw.start + sliceIndex;
                  if (index === pinnedIndex) return null;
                  return (
                    <TreeRowView
                      key={flatRowKey(row)}
                      row={row}
                      top={index * TREE_ROW_PX}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
        {menu ? (
          <ExplorerMenu
            x={menu.x}
            y={menu.y}
            items={explorerItems(menu.target, clip, !!onOpenTerminal)}
            onPick={(id) => {
              const target = menu.target;
              setMenu(null);
              void runAction(id, target);
            }}
            onClose={() => setMenu(null)}
          />
        ) : null}
      </TreeActionsCtx.Provider>
    </TreeStoreCtx.Provider>
  );
});

function HeaderIcon({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-6 min-w-0 flex-1 cursor-pointer items-center justify-center self-center rounded-md ${
        active
          ? "bg-content/10 text-content"
          : "text-content/50 hover:bg-content/5 hover:text-content"
      }`}
    >
      {children}
    </button>
  );
}

function flatRowKey(row: FlatRow): string {
  switch (row.kind) {
    case "entry":
      return row.entry.path;
    case "placeholder":
      return row.id;
    case "create":
      return `create:${row.id}`;
  }
}

function rowsEqual(a: FlatRow, b: FlatRow): boolean {
  if (a.kind === "entry") {
    return b.kind === "entry" && a.entry === b.entry && a.depth === b.depth;
  }
  if (a.kind === "create") {
    return b.kind === "create" && a.id === b.id && a.depth === b.depth;
  }
  return (
    b.kind === "placeholder" && a.id === b.id && a.text === b.text && a.depth === b.depth
  );
}

const TreeRowView = memo(
  function TreeRowView({ row, top }: { row: FlatRow; top: number }) {
    return (
      <div
        className="absolute left-0 right-0"
        style={{ top, height: TREE_ROW_PX }}
      >
        {row.kind === "entry" ? (
          <EntryRow
            entry={row.entry}
            depth={row.depth}
            posInSet={row.posInSet}
            setSize={row.setSize}
          />
        ) : row.kind === "create" ? (
          <CreateRow row={row} />
        ) : (
          <div
            className="flex h-full w-full items-center pr-2 text-[12px] leading-4 text-content/50"
            style={{ paddingLeft: 28 + row.depth * 12 }}
          >
            {row.text}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => prev.top === next.top && rowsEqual(prev.row, next.row),
);

const EntryRow = memo(function EntryRow({
  entry,
  depth,
  posInSet,
  setSize,
}: {
  entry: FsEntry;
  depth: number;
  posInSet: number;
  setSize: number;
}) {
  const store = useTreeStore();
  const {
    onToggle,
    onSelect,
    onFilePointerDown,
    consumeFileClick,
    onOpenFile,
    onRenameCommit,
    onRenameCancel,
    onItemContextMenu,
  } = useTreeActions();

  const open = useSyncExternalStore(
    store.subscribe,
    useCallback(
      () => (entry.isDir ? store.getState().expanded.has(entry.path) : false),
      [store, entry.isDir, entry.path],
    ),
  );
  const selected = useSyncExternalStore(
    store.subscribe,
    useCallback(
      () => store.getState().selectedPath === entry.path,
      [store, entry.path],
    ),
  );
  const editing = useSyncExternalStore(
    store.subscribe,
    useCallback(
      () => store.getState().renaming === entry.path,
      [store, entry.path],
    ),
  );
  const cut = useSyncExternalStore(
    store.subscribe,
    useCallback(
      () => store.getState().cutPath === entry.path,
      [store, entry.path],
    ),
  );
  const gitStatus = useSyncExternalStore(
    store.subscribe,
    useCallback(() => {
      const statuses = store.getState().gitStatuses;
      if (!statuses) return undefined;
      return entry.isDir
        ? statuses.dirs.get(entry.path)
        : statuses.files.get(entry.path);
    }, [store, entry.isDir, entry.path]),
  );
  const gitColor = gitStatus ? GIT_STATUS_COLOR[gitStatus] : undefined;

  const siblings = useMemo(
    () =>
      editing
        ? (peekDir(parentPath(entry.path)) ?? [])
            .map((child) => child.name)
            .filter((name) => name !== entry.name)
        : [],
    [editing, entry.path, entry.name],
  );

  const onClick = useCallback(() => {
    if (consumeFileClick()) return;
    onSelect(entry.path);
    if (entry.isDir) onToggle(entry.path);
    else onOpenFile(entry.path, undefined, { exact: true });
  }, [consumeFileClick, onSelect, onToggle, onOpenFile, entry.path, entry.isDir]);

  const onPointerDownHandler = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!entry.isDir) onFilePointerDown(entry.path, event);
    },
    [entry.isDir, entry.path, onFilePointerDown],
  );

  const onContextMenuHandler = useCallback(
    (e: ReactMouseEvent) => {
      onItemContextMenu(entry, e);
    },
    [entry, onItemContextMenu],
  );

  const rowStyle = useMemo(() => ({ paddingLeft: 8 + depth * 12 }), [depth]);

  if (editing) {
    return (
      <NameRow
        depth={depth}
        isDir={entry.isDir}
        initial={entry.name}
        selectStem={!entry.isDir}
        siblings={siblings}
        overlay
        onCommit={(raw) => onRenameCommit(entry.path, raw)}
        onCancel={onRenameCancel}
      />
    );
  }
  return (
    <button
      type="button"
      role="treeitem"
      title={entry.path}
      aria-level={depth + 1}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      aria-expanded={entry.isDir ? open : undefined}
      onClick={onClick}
      onPointerDown={onPointerDownHandler}
      onContextMenu={onContextMenuHandler}
      style={rowStyle}
      className={`flex h-7.5 w-full cursor-pointer items-center gap-1 pr-2 text-left text-[14px] leading-normal data-[explorer-dragging]:opacity-50 ${
        selected
          ? "bg-content/10 text-content"
          : "text-content hover:bg-content/5"
      } ${cut ? "opacity-50" : ""}`}
    >
      <span className="grid size-4 shrink-0 place-items-center text-content/50">
        {entry.isDir ? (
          open ? (
            <ChevronDown className="size-3.5" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="size-3.5" strokeWidth={1.75} />
          )
        ) : null}
      </span>
      <span className="shrink-0">
        <FileTypeIcon name={entry.name} isDir={entry.isDir} isOpen={open} />
      </span>
      <span
        className={`min-w-0 truncate py-0.5 ${
          entry.ignored ? "italic text-content/50" : (gitColor ?? "")
        }`}
      >
        {entry.name}
      </span>
    </button>
  );
});

const CreateRow = memo(function CreateRow({
  row,
}: {
  row: Extract<FlatRow, { kind: "create" }>;
}) {
  const store = useTreeStore();
  const { onCreateCommit, onCreateCancel } = useTreeActions();
  const creating = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.getState().creating, [store]),
  );
  if (!creating || creating.id !== row.id) return null;
  return (
    <NameRow
      depth={row.depth}
      isDir={creating.isDir}
      siblings={(peekDir(creating.parent) ?? []).map((entry) => entry.name)}
      overlay
      onCommit={(raw) => onCreateCommit(creating.id, raw)}
      onCancel={() => onCreateCancel(creating.id)}
    />
  );
});

function NameRow({
  depth,
  isDir,
  initial = "",
  selectStem = false,
  siblings,
  overlay = false,
  onCommit,
  onCancel,
}: {
  depth: number;
  isDir: boolean;
  initial?: string;
  selectStem?: boolean;
  siblings: string[];
  overlay?: boolean;
  onCommit: (raw: string) => Promise<void>;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const [value, setValue] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const issue = validateFileName(value, siblings);
  const leaf = leafName(value);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.scrollIntoView({ block: "nearest" });
    if (!selectStem) return;
    const dot = initial.lastIndexOf(".");
    if (dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  }, [initial, selectStem]);

  const finish = (success: boolean) => {
    if (finished.current) return;
    if (success) {
      const current = validateFileName(value, siblings);
      if (current && current.severity === "error") {
        setAttempted(true);
        return;
      }
      finished.current = true;
      setBusy(true);
      setSubmitError(null);
      void onCommit(value).catch((err: unknown) => {
        finished.current = false;
        setBusy(false);
        setSubmitError(err instanceof Error ? err.message : String(err));
      });
      return;
    }
    finished.current = true;
    onCancel();
  };

  const showIssue =
    submitError ||
    (issue &&
      (issue.severity === "warning" ||
        (issue.kind !== "empty" && value.length > 0) ||
        (issue.kind === "empty" && attempted)));

  return (
    <div
      className={overlay ? "relative" : undefined}
      style={{ height: overlay ? TREE_ROW_PX : undefined }}
    >
      <div
        style={{ paddingLeft: 8 + depth * 12 }}
        className="flex h-7.5 w-full items-center gap-1 bg-content/10 pr-2"
      >
        <span className="grid size-4 shrink-0 place-items-center text-content/50">
          {isDir ? (
            <ChevronRight className="size-3.5" strokeWidth={1.75} />
          ) : null}
        </span>
        <span className="shrink-0">
          <FileTypeIcon name={leaf} isDir={isDir} />
        </span>
        <input
          ref={inputRef}
          value={value}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Type file name. Press Enter to confirm or Escape to cancel."
          onChange={(e) => {
            setValue(e.target.value);
            setSubmitError(null);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              finish(false);
            }
          }}
          onBlur={() => finish(issue === null || issue.severity !== "error")}
          className="h-6 min-w-0 flex-1 rounded-sm bg-content/10 px-1 text-[14px] leading-normal text-content outline-none ring-1 ring-accent"
        />
      </div>
      {showIssue ? (
        <NameIssueView
          depth={depth}
          issue={issue}
          fallback={submitError}
          overlay={overlay}
        />
      ) : null}
    </div>
  );
}

function NameIssueView({
  depth,
  issue,
  fallback,
  overlay = false,
}: {
  depth: number;
  issue: NameIssue | null;
  fallback: string | null;
  overlay?: boolean;
}) {
  let body: ReactNode = null;
  if (fallback) {
    body = fallback;
  } else if (issue) {
    switch (issue.kind) {
      case "empty":
        body = "A file or folder name must be provided.";
        break;
      case "slash":
        body = "A file or folder name cannot start with a slash.";
        break;
      case "exists":
        body = (
          <>
            A file or folder <span className="font-semibold">{issue.name}</span>{" "}
            already exists at this location. Please choose a different name.
          </>
        );
        break;
      case "invalid":
        body = (
          <>
            The name <span className="font-semibold">{issue.name}</span> is not
            valid as a file or folder name. Please choose a different name.
          </>
        );
        break;
      case "whitespace":
        body =
          "Leading or trailing whitespace detected in file or folder name.";
        break;
    }
  }
  if (!body) return null;
  const error = Boolean(fallback) || !issue || issue.severity === "error";
  return (
    <p
      className={`${overlay ? "absolute top-full left-0 right-0 z-10" : ""} pr-2 pb-1 text-[12px] leading-4 ${
        error ? "text-red-400" : "text-amber-400"
      }`}
      style={
        overlay
          ? {
              paddingTop: 4,
              paddingLeft: 28 + depth * 12,
              backgroundColor: "var(--color-background-base)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.18)",
            }
          : { paddingLeft: 28 + depth * 12 }
      }
    >
      {body}
    </p>
  );
}
