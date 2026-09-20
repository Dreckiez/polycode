import { ChevronLeft } from "./icons";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { FileTypeIcon } from "./FileTypeIcon";
import { MatchText } from "./MatchText";
import {
  loadProjectFiles,
  peekProjectFiles,
  rankProjectFiles,
  recentOpenedFiles,
  type RankedFile,
} from "../lib/fileIndex";
import { looksLikeProject } from "../lib/recents";
import type { OpenFileFn } from "../lib/search";
import { useLockOverscroll } from "../hooks/useLockOverscroll";

type Props = {
  cwd: string;
  focusToken?: number;
  onOpenFile: OpenFileFn;
  onClose: () => void;
};

export function ProjectSearch({
  cwd,
  focusToken = 0,
  onOpenFile,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [files, setFiles] = useState(() => peekProjectFiles(cwd) ?? []);
  const [loading, setLoading] = useState(() => peekProjectFiles(cwd) == null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusToken) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (!cwd || cwd === "~" || !looksLikeProject(cwd)) {
      setFiles([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void loadProjectFiles(cwd, true)
      .then((next) => {
        if (cancelled) return;
        setFiles(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const recents = useMemo(() => recentOpenedFiles(cwd), [cwd]);

  const results = useMemo(
    () => rankProjectFiles(files, query, recents),
    [files, query, recents],
  );

  useEffect(() => {
    setActive((index) =>
      results.length === 0 ? 0 : Math.min(index, results.length - 1),
    );
  }, [results.length]);

  const pick = (file: RankedFile) => {
    onOpenFile(file.path, undefined, { exact: true });
    onClose();
  };

  const onQueryKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) return;
      setActive((index) => (index + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      setActive((index) => (index - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const file = results[active];
      if (file) pick(file);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  if (!cwd || cwd === "~") {
    return <p className="px-3 py-2 text-[12px] text-content/50">No project folder</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-content/10 px-1.5 py-1">
        <button
          type="button"
          onClick={onClose}
          title="Back to files"
          aria-label="Back to files"
          className="grid size-7 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/10 hover:text-content"
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] text-content/55">
          Search files
        </span>
      </div>
      <div className="shrink-0 border-b border-content/10 p-2">
        <div className="flex items-center gap-1 rounded-md border border-content/10 bg-content/5 px-2 pr-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onQueryKeyDown}
            placeholder="Search file names"
            aria-label="Search file names"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[12px] text-content outline-none placeholder:text-content/35"
          />
        </div>
      </div>

      <div className="flex min-h-8 shrink-0 items-center gap-2 px-3 py-1.5 text-[11px] text-content/45">
        {error && results.length === 0 ? (
          <span className="text-red-400">{error}</span>
        ) : loading && results.length === 0 ? (
          <span>Indexing files…</span>
        ) : query.trim() ? (
          <span>
            {results.length === 0
              ? "No matching files"
              : `${results.length} file${results.length === 1 ? "" : "s"}`}
          </span>
        ) : (
          <span>Type a file name to search</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
        <FileList
          files={results}
          active={active}
          query={query.trim()}
          onActive={setActive}
          onPick={pick}
        />
      </div>
    </div>
  );
}

function FileList({
  files,
  active,
  query,
  onActive,
  onPick,
}: {
  files: RankedFile[];
  active: number;
  query: string;
  onActive: (index: number) => void;
  onPick: (file: RankedFile) => void;
}) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const activeRef = useRef<HTMLButtonElement>(null);
  const pointer = useRef({ x: Number.NaN, y: Number.NaN, allow: false });
  const fromPointer = useRef(false);

  useEffect(() => {
    pointer.current.allow = false;
  }, [files]);

  useEffect(() => {
    if (fromPointer.current) {
      fromPointer.current = false;
      return;
    }
    pointer.current.allow = false;
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onListMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.clientX === pointer.current.x && e.clientY === pointer.current.y) {
      return;
    }
    pointer.current = { x: e.clientX, y: e.clientY, allow: true };
  };

  const onRowEnter = (index: number) => {
    if (!pointer.current.allow) return;
    fromPointer.current = true;
    onActive(index);
  };

  return (
    <div
      ref={lockOverscroll}
      role="listbox"
      aria-label="Files"
      onMouseMove={onListMouseMove}
      className="px-1.5 pb-1.5"
    >
      {files.map((file, index) => {
        const highlighted = index === active;
        const slash = file.relative.lastIndexOf("/");
        const dir = slash === -1 ? "" : file.relative.slice(0, slash);
        const nameOffset = slash === -1 ? 0 : slash + 1;
        return (
          <button
            key={file.path}
            ref={highlighted ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={highlighted}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onRowEnter(index)}
            onClick={() => onPick(file)}
            className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm leading-normal ${
              highlighted ? "bg-content/10 text-content" : "text-content"
            }`}
          >
            <span className="shrink-0">
              <FileTypeIcon name={file.name} isDir={false} />
            </span>
            <span className="min-w-0 flex-1 truncate py-0.5">
              <MatchText
                text={file.name}
                positions={file.positions
                  .filter((pos) => pos >= nameOffset)
                  .map((pos) => pos - nameOffset)}
                active={Boolean(query)}
              />
            </span>
            {dir ? (
              <span className="min-w-0 max-w-[45%] truncate font-mono text-[11px] text-content/40">
                <MatchText
                  text={dir}
                  positions={file.positions.filter((pos) => pos < slash)}
                  active={Boolean(query)}
                />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}