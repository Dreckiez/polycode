import {
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LoaderCircle, Plus, Search } from "../chrome/icons";
import { ProjectLogoIcon } from "../chrome/ProjectLogoIcon";
import { ProjectMascot } from "../chrome/ProjectMascot";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { formatRelativeTime } from "../lib/formatTime";
import { notePreview, noteSourceProject, type Note } from "../lib/notes";
import { projectKey, projectName } from "../lib/paths";
import {
  resolveTabGroupColor,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
} from "../lib/tabGroups";

export type ProjectMarks = {
  logos: Record<string, string>;
  mascots: Record<string, string>;
  colors: Record<string, number>;
  customColors: Record<string, string>;
};

export function NoteProjectMark({
  cwd,
  logos,
  mascots,
  colors,
  customColors,
}: { cwd: string } & ProjectMarks) {
  const project = projectName(cwd);
  const key = projectKey(cwd);
  const logoPath = resolveTabGroupLogo(key, logos);
  const mascotName = resolveTabGroupMascot(key, mascots);
  const mascotColor = resolveTabGroupColor(key, colors, customColors, project);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {logoPath ? (
        <ProjectLogoIcon
          path={logoPath}
          className="size-3.5 shrink-0 rounded-sm"
          imageClassName="size-3.5"
        />
      ) : (
        <ProjectMascot
          project={project}
          color={mascotColor}
          name={mascotName}
          className="size-3 shrink-0"
        />
      )}
      <span className="min-w-0 truncate">{project}</span>
    </span>
  );
}

function NoteCard({
  note,
  active,
  logos,
  mascots,
  colors,
  customColors,
  onSelect,
}: {
  note: Note;
  active: boolean;
  onSelect: () => void;
} & ProjectMarks) {
  const preview = notePreview(note.body, note.title);
  const project = noteSourceProject(note.sourceCwd);
  const time = formatRelativeTime(new Date(note.updatedAt).toISOString());
  const hint = [note.title, project].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      title={hint}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      className={`flex w-full flex-col rounded-md border px-2.5 py-2 text-left ${
        active
          ? "border-transparent bg-content/10 text-content"
          : "border-transparent text-content/80 hover:bg-content/5 hover:text-content"
      }`}
    >
      <span className="flex items-center gap-2">
        {project && note.sourceCwd ? (
          <span className="min-w-0 flex-1 text-[11px] text-content/50">
            <NoteProjectMark
              cwd={note.sourceCwd}
              logos={logos}
              mascots={mascots}
              colors={colors}
              customColors={customColors}
            />
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {time ? (
          <span className="shrink-0 text-[11px] tabular-nums text-content/45">
            {time}
          </span>
        ) : null}
      </span>
      <span className="mt-1 line-clamp-1 text-[13px] font-semibold leading-snug text-content">
        {note.title}
      </span>
      {preview ? (
        <span className="mt-1 line-clamp-1 text-[12px] leading-snug text-content/45">
          {preview}
        </span>
      ) : null}
      {note.tags.length > 0 ? (
        <span className="mt-1.5 flex min-w-0 items-center gap-1 overflow-hidden">
          {note.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="max-w-24 truncate rounded bg-content/8 px-1.5 py-0.5 text-[10px] leading-none text-content/55"
            >
              #{tag}
            </span>
          ))}
          {note.tags.length > 3 ? (
            <span className="shrink-0 text-[10px] text-content/40">
              +{note.tags.length - 3}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

type Props = {
  paneRef: (el: HTMLElement | null) => void;
  dragging: boolean;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeReset: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  creating: boolean;
  onCreate: () => void;
  error: string | null;
  loading: boolean;
  notes: Note[];
  visible: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
} & ProjectMarks;

export function NotesRail({
  paneRef,
  dragging,
  onResizeStart,
  onResizeReset,
  query,
  onQueryChange,
  creating,
  onCreate,
  error,
  loading,
  notes,
  visible,
  selectedId,
  onSelect,
  logos,
  mascots,
  colors,
  customColors,
}: Props) {
  const listLock = useLockOverscroll<HTMLDivElement>();
  return (
    <div
      ref={paneRef}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-content/10"
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-content/10 px-2">
        <div className="relative flex h-7 min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-2 size-3 shrink-0 opacity-50" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter notes"
            aria-label="Filter notes"
            spellCheck={false}
            autoComplete="off"
            className="h-7 w-full rounded-md bg-transparent pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/40"
          />
        </div>
        <button
          type="button"
          title="New note"
          aria-label="New note"
          disabled={creating}
          onClick={() => void onCreate()}
          className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content disabled:opacity-40"
        >
          {creating ? (
            <LoaderCircle
              className="size-3.5 animate-spin"
              strokeWidth={1.75}
            />
          ) : (
            <Plus className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
      </div>
      <div
        ref={listLock}
        className="min-h-0 flex-1 overflow-y-auto overscroll-none"
      >
        {error && notes.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-content/50">{error}</p>
        ) : loading && notes.length === 0 ? (
          <div className="flex justify-center py-10 text-content/40">
            <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
          </div>
        ) : visible.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-content/50">
            {query.trim()
              ? "No matching notes"
              : "No notes yet. Save a turn from the transcript, or create one here."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 p-1.5">
            {visible.map((note) => (
              <li key={note.id}>
                <NoteCard
                  note={note}
                  active={selectedId === note.id}
                  logos={logos}
                  mascots={mascots}
                  colors={colors}
                  customColors={customColors}
                  onSelect={() => onSelect(note.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes list"
        className={`absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none ${
          dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={onResizeStart}
        onDoubleClick={onResizeReset}
      />
    </div>
  );
}