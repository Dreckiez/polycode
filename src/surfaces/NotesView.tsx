import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { File, Maximize2, X } from "../chrome/icons";
import { IconButton, OverlayNav } from "../chrome/TitleBar";
import { WindowControls } from "../chrome/WindowControls";
import { useDragResize } from "../hooks/useDragResize";
import { useTabGroupLogos } from "../hooks/useTabGroupLogos";
import {
  createNote,
  deleteNote,
  loadNotes,
  noteSourceProject,
  requestAddNoteToChat,
  type Note,
} from "../lib/notes";
import { IS_MAC } from "../lib/platform";
import { looksLikeProject } from "../lib/recents";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupMascots,
} from "../lib/tabGroups";
import { NoteDetail } from "./NotesEditor";
import { NotesRail } from "./NotesRail";

const MIN_WIDTH = 240;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 280;

let rememberedWidth = DEFAULT_WIDTH;
let rememberedNoteId: string | null = null;

type Props = {
  besideRail?: boolean;
  besideSession?: boolean;
  cwd?: string;
  onClose: () => void;
  onOpenBesideSession?: () => void;
  onOpenFull?: () => void;
  onToggleSidebar?: () => void;
};

export function NotesView({
  besideRail = false,
  besideSession = false,
  cwd,
  onClose,
  onOpenBesideSession,
  onOpenFull,
  onToggleSidebar,
}: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const resize = useDragResize({
    min: MIN_WIDTH,
    max: () => Math.min(MAX_WIDTH, Math.round(window.innerWidth * 0.5)),
    defaultWidth: DEFAULT_WIDTH,
    initial: rememberedWidth,
    onCommit: (width) => {
      rememberedWidth = width;
    },
  });
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(rememberedNoteId);
  const [creating, setCreating] = useState(false);
  const logos = useTabGroupLogos();
  const [groupMascots] = useState(loadTabGroupMascots);
  const [groupColors] = useState(loadTabGroupColors);
  const [groupCustomColors] = useState(loadTabGroupCustomColors);

  const refresh = useCallback(async () => {
    try {
      const next = await loadNotes(true);
      setNotes(next);
      setError(null);
      setSelectedId((current) => {
        const preferred = current ?? rememberedNoteId;
        if (preferred && next.some((note) => note.id === preferred)) {
          return preferred;
        }
        return next[0]?.id ?? null;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    rememberedNoteId = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (besideSession) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [besideSession]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((note) => {
      const project = noteSourceProject(note.sourceCwd)?.toLowerCase() ?? "";
      return (
        note.title.toLowerCase().includes(needle) ||
        note.body.toLowerCase().includes(needle) ||
        note.slug.toLowerCase().includes(needle) ||
        note.tags.some((tag) => tag.includes(needle.replace(/^#/, ""))) ||
        project.includes(needle)
      );
    });
  }, [notes, query]);

  const selected =
    visible.find((note) => note.id === selectedId) ??
    notes.find((note) => note.id === selectedId) ??
    null;

  const onCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const note = await createNote({
        title: "Untitled",
        body: "",
        ...(cwd && looksLikeProject(cwd) ? { sourceCwd: cwd } : {}),
      });
      setNotes(await loadNotes(true));
      setSelectedId(note.id);
      setQuery("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const onSaved = (note: Note) => {
    setNotes((current) => {
      const next = current.map((item) => (item.id === note.id ? note : item));
      next.sort(
        (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
      );
      return next;
    });
  };

  const onDelete = async (id: string) => {
    try {
      await deleteNote(id);
      const next = await loadNotes(true);
      setNotes(next);
      setSelectedId((current) => {
        if (current !== id) return current;
        return next[0]?.id ?? null;
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onAddToChat = (note: Note) => {
    requestAddNoteToChat(note);
    onClose();
  };

  const openBesideSession = (id: string) => {
    setSelectedId(id);
    onOpenBesideSession?.();
  };

  return (
    <div
      role="region"
      aria-label={besideSession ? "Note beside session" : "Notes"}
      data-app-notes
      className={`flex min-h-0 min-w-0 flex-1 flex-col text-content ${
        besideSession ? "border-l border-content/10" : ""
      }`}
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-content/10"
        data-tauri-drag-region={besideSession ? undefined : "deep"}
      >
        {IS_MAC && !besideRail && !besideSession ? (
          <div className="w-[78px] shrink-0" />
        ) : null}
        {besideRail || besideSession ? null : (
          <OverlayNav onBack={onClose} onToggleSidebar={onToggleSidebar} />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <File
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate text-content">
            {besideSession ? (selected?.title ?? "Note") : "Notes"}
          </span>
        </div>
        {besideSession ? (
          <div className="flex shrink-0 items-center gap-1 px-2">
            <IconButton label="Open full Notes" onClick={onOpenFull}>
              <Maximize2 className="size-3.5" />
            </IconButton>
            <IconButton label="Close note pane" onClick={onClose}>
              <X className="size-3.5" />
            </IconButton>
          </div>
        ) : IS_MAC ? null : (
          <WindowControls />
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">
        {besideSession ? null : (
          <NotesRail
            paneRef={resize.setPaneRef}
            dragging={resize.dragging}
            onResizeStart={resize.onPointerDown}
            onResizeReset={resize.onDoubleClick}
            query={query}
            onQueryChange={setQuery}
            creating={creating}
            onCreate={onCreate}
            error={error}
            loading={loading}
            notes={notes}
            visible={visible}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onOpenBesideSession={
              onOpenBesideSession ? openBesideSession : undefined
            }
            logos={logos}
            mascots={groupMascots}
            colors={groupColors}
            customColors={groupCustomColors}
          />
        )}
        <NoteDetail
          note={selected}
          compact={besideSession}
          logos={logos}
          mascots={groupMascots}
          colors={groupColors}
          customColors={groupCustomColors}
          onSaved={onSaved}
          onDelete={onDelete}
          onAddToChat={onAddToChat}
        />
      </div>
    </div>
  );
}
