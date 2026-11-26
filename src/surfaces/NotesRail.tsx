import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  LoaderCircle,
  MoreHorizontal,
  PanelRight,
  Plus,
  Search,
} from "../chrome/icons";
import { Popover } from "../chrome/Popover";
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
          project={key}
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
  onOpenBesideSession,
}: {
  note: Note;
  active: boolean;
  onSelect: () => void;
  onOpenBesideSession?: () => void;
} & ProjectMarks) {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuItem = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const preview = notePreview(note.body, note.title);
  const project = noteSourceProject(note.sourceCwd);
  const time = formatRelativeTime(new Date(note.updatedAt).toISOString());
  const hint = [note.title, project].filter(Boolean).join(" · ");
  return (
    <li
      className={`relative flex min-w-0 flex-col rounded-md border px-2.5 py-2 ${
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
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5">
        <button
          type="button"
          title={hint}
          aria-current={active ? "true" : undefined}
          onClick={onSelect}
          className={`row-start-1 min-w-0 text-left text-[13px] font-semibold leading-snug text-content after:absolute after:inset-0 after:rounded-md after:content-[''] ${
            preview ? "col-span-full" : "col-start-1"
          }`}
        >
          <span className="block truncate">{note.title}</span>
        </button>
        {preview ? (
          <span className="col-start-1 row-start-2 mt-1 line-clamp-1 text-[12px] leading-snug text-content/45">
            {preview}
          </span>
        ) : null}
        {onOpenBesideSession ? (
          <button
            ref={menuTrigger}
            type="button"
            title="Note actions"
            aria-label={`Actions for ${note.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={`relative z-[1] col-start-2 grid size-5 place-items-center rounded text-content/50 hover:bg-content/10 hover:text-content ${
              preview ? "row-start-2 mt-1" : "row-start-1"
            }`}
          >
            <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
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
      {menuOpen && onOpenBesideSession ? (
        <Popover
          anchor={menuTrigger}
          align="end"
          gap={4}
          autoFocus
          role="menu"
          aria-label={`Actions for ${note.title}`}
          tabIndex={-1}
          className="p-1"
          onFocus={(event) => {
            if (event.target === event.currentTarget) menuItem.current?.focus();
          }}
          onBlur={(event) => {
            if (
              event.relatedTarget !== menuTrigger.current &&
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setMenuOpen(false);
            }
          }}
          onDismiss={(reason) => {
            setMenuOpen(false);
            if (reason === "escape") menuTrigger.current?.focus();
          }}
        >
          <button
            ref={menuItem}
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onOpenBesideSession();
            }}
            className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-[12px] text-content hover:bg-content/10 focus-visible:bg-content/10"
          >
            <PanelRight className="size-3.5" strokeWidth={1.75} />
            Open beside session
          </button>
        </Popover>
      ) : null}
    </li>
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
  onOpenBesideSession?: (id: string) => void;
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
  onOpenBesideSession,
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
              <NoteCard
                key={note.id}
                note={note}
                active={selectedId === note.id}
                logos={logos}
                mascots={mascots}
                colors={colors}
                customColors={customColors}
                onSelect={() => onSelect(note.id)}
                onOpenBesideSession={
                  onOpenBesideSession
                    ? () => onOpenBesideSession(note.id)
                    : undefined
                }
              />
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
