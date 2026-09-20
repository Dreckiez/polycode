import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { File } from "../chrome/icons";
import { OverlayNav } from "../chrome/TitleBar";
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
  cwd?: string;
  onClose: () => void;
  onToggleSidebar?: () => void;
};

export function NotesView({
  besideRail = false,
  cwd,
  onClose,
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

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

  return (
    <div
      role="region"
      aria-label="Notes"
      data-app-notes
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-content/10"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        {besideRail ? null : (
          <OverlayNav onBack={onClose} onToggleSidebar={onToggleSidebar} />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <File
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate text-content">Notes</span>
        </div>
        {IS_MAC ? null : <WindowControls />}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1">
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
          logos={logos}
          mascots={groupMascots}
          colors={groupColors}
          customColors={groupCustomColors}
        />
        <NoteDetail
          note={selected}
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