import { ChevronDown, ChevronRight } from "./icons";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  leafName,
  validateFileName,
  type NameIssue,
} from "../lib/fileName";
import { peekDir } from "../lib/fileTree";
import { type FsEntry } from "../lib/fs";
import type { GitStatusMap } from "../hooks/useGitFileStatuses";
import { parentPath } from "../lib/paths";
import type { OpenFileFn } from "../lib/search";
import { FileTypeIcon } from "./FileTypeIcon";

const GIT_STATUS_COLOR: Record<string, string> = {
  modified: "text-amber-400",
  added: "text-emerald-400",
  untracked: "text-emerald-400",
  deleted: "text-red-400",
};

export const TREE_ROW_PX = 30;

export type FlatRow =
  | {
      kind: "entry";
      entry: FsEntry;
      depth: number;
      posInSet: number;
      setSize: number;
    }
  | { kind: "placeholder"; id: string; depth: number; text: string }
  | { kind: "create"; id: number; depth: number; posInSet: number; setSize: number };

type TreeState = {
  expanded: Set<string>;
  selectedPath: string | null;
  creating: Creating | null;
  renaming: string | null;
  cutPath: string | null;
  epoch: number;
  gitStatuses?: GitStatusMap;
};

export type Creating = { id: number; parent: string; isDir: boolean };

type TreeStore = {
  getState: () => TreeState;
  setState: (updater: (prev: TreeState) => TreeState) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createTreeStore(initialState: TreeState): TreeStore {
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

export const TreeStoreCtx = createContext<TreeStore | null>(null);

function useTreeStore(): TreeStore {
  const store = useContext(TreeStoreCtx);
  if (!store) throw new Error("TreeStoreCtx missing");
  return store;
}

export type TreeActionsValue = {
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

export const TreeActionsCtx = createContext<TreeActionsValue | null>(null);

function useTreeActions(): TreeActionsValue {
  const ctx = useContext(TreeActionsCtx);
  if (!ctx) throw new Error("TreeActionsCtx missing");
  return ctx;
}

export function flatRowKey(row: FlatRow): string {
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

export const TreeRowView = memo(
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