import {
  Clock,
  File,
  ListFilter,
  Pin,
  Plus,
  Search,
  Settings,
} from "./icons";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  loadSidebarTabOrder,
  saveSidebarTabOrder,
  type SidebarTabId,
} from "../lib/appearance";
import {
  type GitFileDiffKind,
  type GitHistoryCommit,
} from "../lib/fs";
import { IS_MAC, MOD } from "../lib/platform";
import type { OpenFileFn } from "../lib/search";
import { nextUnseenFinishedSessions } from "../lib/sessionDone";
import {
  orderedSessionActionIds,
  pruneSessionSelection,
  toggleSessionSelection,
} from "../lib/sessionSelection";
import type { PaneEdge } from "../lib/layout";
import {
  compareSessionSummaries,
  filterSessionsByArchive,
  filterSessionsByQuery,
} from "../lib/sessionHistory";
import {
  addSessionToFolder,
  applySessionListDrop,
  buildSessionList,
  createFolderWithSessions,
  dissolveFolder,
  folderContaining,
  folderShellFill,
  loadPinnedSessionsCollapsed,
  loadReminderSessionsCollapsed,
  loadSessionFolders,
  mergeFolderSessionSummaries,
  pruneSessionFolders,
  removeSessionFromFolder,
  renameFolder,
  reorderSessionFolders,
  savePinnedSessionsCollapsed,
  saveReminderSessionsCollapsed,
  saveSessionFolders,
  sessionListNavigationIds,
  setFolderCollapsed,
  setFolderColor,
  setFolderCustomColor,
  subscribeSessionFolders,
  ungroupedSessions,
  type SessionFolder,
  type SessionListDropTarget,
} from "../lib/sessionFolders";
import { SESSION_LIST_PAGE, sessionListWindow } from "../lib/sessionListWindow";
import {
  filterSessionsByHarness,
  filterSessionsByStatus,
  filterSessionsByTime,
  harnessesInSessions,
  hasActiveSessionFilters,
  loadSessionSidebarFilters,
  saveSessionSidebarFilters,
  type SessionSidebarFilters,
} from "../lib/sessionFilters";
import type { HarnessId } from "../lib/session";
import type { LiveAgent } from "../lib/liveAgents";
import type { SessionSummary } from "../lib/sessionStore";
import type { SettingsSectionId } from "../lib/settings";
import type { InstalledUpdate } from "../lib/updateNotice";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupLabels,
  loadTabGroupMascots,
} from "../lib/tabGroups";
import { useDragResize } from "../hooks/useDragResize";
import { useGitFileStatuses } from "../hooks/useGitFileStatuses";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { useProjectDiffStats } from "../hooks/useProjectDiffStats";
import { useSortable } from "../hooks/useSortable";
import {
  looksLikeProject,
  sameProjectPath,
  type RecentProject,
} from "../lib/recents";
import { DevModeSlot, TabVisitNav } from "./TitleBar";
import { DiffStat } from "./DiffStat";
import { ExplorerMenu, type ExplorerMenuItem } from "./ExplorerMenu";
import { FileTree } from "./FileTree";
import { FolderColorSwatches } from "./FolderColorSwatches";
import { FolderRenameRow } from "./FolderRenameRow";
import { FolderRow } from "./FolderRow";
import { LiveAgentsPreview } from "./ProjectRail";
import { ProjectSearch } from "./ProjectSearch";
import { RailAction, RailSearch } from "./RailAction";
import { SessionCard } from "./SessionCard";
import { SessionFiltersMenu } from "./SessionFiltersMenu";
import { sessionReminderPresets } from "./sessionReminderPresets";
import {
  formatReminderTime,
  reminderTime,
  type SessionReminder,
} from "../lib/sessionReminders";
import { SessionRenameRow } from "./SessionRenameRow";
import { SessionsEmpty } from "./SessionsEmpty";
import { SessionsHeaderButton } from "./SessionsHeaderButton";
import { SettingsNav } from "./SettingsRail";
import { SidebarProjectPicker } from "./SidebarProjectPicker";
import { SidebarUpdateFooter } from "./SidebarUpdate";
import { SourceControl } from "./SourceControl";

const MIN_WIDTH = 260;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 260;
const REMINDERS_COLOR = "#f59e0b";

let rememberedWidth = DEFAULT_WIDTH;

type SidebarTab = SidebarTabId;

const TAB_LABELS: Record<SidebarTab, string> = {
  sessions: "Sessions",
  files: "Explorer",
  changes: "Changes",
};

function projectPathBusy(
  paths: Iterable<string> | undefined,
  cwd: string,
): boolean {
  if (!paths) return false;
  for (const path of paths) {
    if (sameProjectPath(path, cwd)) return true;
  }
  return false;
}

type Props = {
  cwd: string;
  /** Working copy for Changes / explorer git. Falls back to `cwd`. */
  gitCwd?: string;
  open: boolean;
  sessions: SessionSummary[];
  busySessionIds: Set<string>;
  approvalSessionIds: Set<string>;
  activeSessionId?: string;
  /** Open tabs, including blank ones not yet in history. */
  openSessions?: readonly SessionSummary[];
  status: "idle" | "error";
  /** First listing for this project has not arrived yet. */
  pending: boolean;
  onSelectSession: (sessionId: string) => void;
  onSessionNavigationOrder?: (ids: readonly string[]) => void;
  onPrefetchSession?: (sessionId: string) => void;
  onPlaceSessionOnPane?: (
    sessionId: string,
    targetId: string,
    edge: PaneEdge,
  ) => void;
  onRenameSession?: (sessionId: string, title: string) => void;
  onArchiveSession?: (sessionId: string, archived: boolean) => void;
  onArchiveSessions?: (
    sessionIds: readonly string[],
    archived: boolean,
  ) => void;
  onPinSession?: (sessionId: string, pinned: boolean) => void;
  onPinSessions?: (sessionIds: readonly string[], pinned: boolean) => void;
  reminders?: readonly SessionReminder[];
  onSetReminders?: (sessionIds: readonly string[], dueAt: number) => void;
  onCancelReminders?: (sessionIds: readonly string[]) => void;
  onDeleteSession?: (sessionId: string) => void;
  onDeleteSessions?: (sessionIds: readonly string[]) => void;
  onOpenFile: OpenFileFn;
  onOpenTerminal?: (cwd: string) => void;
  onFileMoved?: (from: string, to: string) => void;
  onFileDeleted?: (path: string) => void;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  filesSearchOpen: boolean;
  onFilesSearchOpenChange: (open: boolean) => void;
  onOpenFilesSearch?: () => void;
  searchFocusToken?: number;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onOpenDiff?: (path: string, kind?: GitFileDiffKind) => void;
  onOpenAllChanges?: () => void;
  onOpenCommit?: (commit: GitHistoryCommit) => void;
  selectedDiffPath?: string;
  selectedDiffKind?: GitFileDiffKind;
  selectedCommitSha?: string;
  textHarness?: HarnessId;
  onShowSourceControl?: () => void;
  recents?: RecentProject[];
  busyProjectPaths?: Iterable<string>;
  liveAgents?: LiveAgent[];
  onSelectAgent?: (sessionId: string) => void;
  onSelectProject?: (path: string) => void;
  onOpenProject?: () => void;
  onRemoveProject?: (path: string, options: { purgeData: boolean }) => void;
  onNew?: () => string | void;
  onNewTerminal?: () => void;
  onSearch?: () => void;
  onOpenNotes?: () => void;
  onGoToFile?: () => void;
  searchActive?: boolean;
  notesActive?: boolean;
  notesEnabled?: boolean;
  onToggleProjectRail?: () => void;
  projectRailOpen?: boolean;
  unseenFinishedIds?: Set<string>;
  settingsOpen?: boolean;
  settingsSection?: SettingsSectionId;
  onOpenSettings?: () => void;
  onSelectSettingsSection?: (section: SettingsSectionId) => void;
  onCloseSettings?: () => void;
  updateNotice?: InstalledUpdate | null;
  onOpenWhatsNew?: (version: string) => void;
  onDismissUpdate?: () => void;
};

function SidebarComponent({
  cwd,
  gitCwd,
  open,
  sessions,
  busySessionIds,
  approvalSessionIds,
  activeSessionId,
  openSessions = [],
  status,
  pending,
  onSelectSession,
  onSessionNavigationOrder,
  onPrefetchSession,
  onPlaceSessionOnPane,
  onRenameSession,
  onArchiveSession,
  onArchiveSessions,
  onPinSession,
  onPinSessions,
  reminders = [],
  onSetReminders,
  onCancelReminders,
  onDeleteSession,
  onDeleteSessions,
  onOpenFile,
  onOpenTerminal,
  onFileMoved,
  onFileDeleted,
  tab,
  onTabChange,
  filesSearchOpen,
  onFilesSearchOpenChange,
  onOpenFilesSearch,
  searchFocusToken = 0,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
  onOpenDiff,
  onOpenAllChanges,
  onOpenCommit,
  selectedDiffPath,
  selectedDiffKind,
  selectedCommitSha,
  textHarness,
  onShowSourceControl: _onShowSourceControl,
  recents = [],
  busyProjectPaths,
  liveAgents = [],
  onSelectAgent,
  onSelectProject,
  onOpenProject,
  onRemoveProject: _onRemoveProject,
  onNew,
  onSearch,
  onOpenNotes,
  onGoToFile: _onGoToFile,
  searchActive = false,
  notesActive = false,
  notesEnabled = true,
  onToggleProjectRail,
  projectRailOpen = true,
  unseenFinishedIds: unseenFinishedIdsProp,
  settingsOpen = false,
  settingsSection = "general",
  onOpenSettings,
  onSelectSettingsSection,
  onCloseSettings,
  updateNotice = null,
  onOpenWhatsNew,
  onDismissUpdate,
}: Props) {
  const gitRoot = gitCwd || cwd;
  const resize = useDragResize({
    min: MIN_WIDTH,
    max: () => Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.5)),
    defaultWidth: DEFAULT_WIDTH,
    initial: rememberedWidth,
    onCommit: (next) => {
      rememberedWidth = next;
    },
  });
  const [tabOrder, setTabOrder] = useState<SidebarTab[]>(loadSidebarTabOrder);
  const [now, setNow] = useState(() => Date.now());
  const sessionsLock = useLockOverscroll<HTMLDivElement>();
  const sessionsScrollRef = useRef<HTMLDivElement>(null);
  const [sessionMenu, setSessionMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
  } | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const selectedSessionIdsRef = useRef(selectedSessionIds);
  selectedSessionIdsRef.current = selectedSessionIds;
  const contextSelectionRef = useRef(false);
  const [folderMenu, setFolderMenu] = useState<{
    x: number;
    y: number;
    folderId: string;
  } | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  );
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [sessionFolders, setSessionFolders] = useState<SessionFolder[]>(() =>
    loadSessionFolders(cwd),
  );
  const [pinnedSessionsCollapsed, setPinnedSessionsCollapsed] = useState(() =>
    loadPinnedSessionsCollapsed(cwd),
  );
  const [reminderSessionsCollapsed, setReminderSessionsCollapsed] = useState(
    () => loadReminderSessionsCollapsed(cwd),
  );
  const [sessionDrop, setSessionDrop] = useState<SessionListDropTarget | null>(
    null,
  );
  const [sessionFilters, setSessionFilters] = useState(
    loadSessionSidebarFilters,
  );
  const [filterMenu, setFilterMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionListLimit, setSessionListLimit] = useState(SESSION_LIST_PAGE);
  const loadMoreRef = useRef<HTMLLIElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingFolderSessionIds = useRef(new Set<string>());
  const busyIdsRef = useRef(busySessionIds);
  const focusedSessionIdRef = useRef(activeSessionId);
  const unseenFinishedLocalRef = useRef<Set<string>>(new Set());
  if (
    busyIdsRef.current !== busySessionIds ||
    focusedSessionIdRef.current !== activeSessionId
  ) {
    unseenFinishedLocalRef.current = nextUnseenFinishedSessions({
      previousBusyIds: busyIdsRef.current,
      busyIds: busySessionIds,
      previousUnseenIds: unseenFinishedLocalRef.current,
      focusedSessionId: activeSessionId,
    });
    busyIdsRef.current = busySessionIds;
    focusedSessionIdRef.current = activeSessionId;
  }
  const unseenFinishedIds =
    unseenFinishedIdsProp ?? unseenFinishedLocalRef.current;
  // Revisits render straight from cache, so this is only ever true the first
  // time a project is opened.
  const pendingFirstLoad = pending && sessions.length === 0;
  const listedSessions = useMemo(
    () => mergeFolderSessionSummaries(sessions, openSessions, sessionFolders),
    [sessions, openSessions, sessionFolders],
  );
  const visibleSessions = useMemo(
    () =>
      [
        ...filterSessionsByQuery(
          filterSessionsByStatus(
            filterSessionsByTime(
              filterSessionsByHarness(
                filterSessionsByArchive(
                  listedSessions,
                  sessionFilters.showArchived,
                ),
                sessionFilters.hiddenHarnesses,
              ),
              sessionFilters.time,
              now,
            ),
            sessionFilters.status,
            busySessionIds,
            approvalSessionIds,
            unseenFinishedIds,
          ),
          searchQuery,
        ),
      ].sort(compareSessionSummaries),
    [
      listedSessions,
      sessionFilters.showArchived,
      sessionFilters.hiddenHarnesses,
      sessionFilters.time,
      sessionFilters.status,
      now,
      busySessionIds,
      approvalSessionIds,
      unseenFinishedIds,
      searchQuery,
    ],
  );
  const filtersActive = hasActiveSessionFilters(sessionFilters);
  const searchNarrowed = Boolean(searchQuery.trim());
  // Summaries for the whole project stay in `sessions` so filters still work.
  // Folders sit above the ungrouped list. Only a page of ungrouped cards
  // mounts; the sentinel below asks for the next page.
  const reminderIds = useMemo(
    () => new Set(reminders.map((reminder) => reminder.sessionId)),
    [reminders],
  );
  const reminderGroup = useMemo(
    () => ({
      sessionIds: [...reminders]
        .sort((a, b) => a.dueAt - b.dueAt)
        .map((reminder) => reminder.sessionId),
      collapsed: reminderSessionsCollapsed,
    }),
    [reminders, reminderSessionsCollapsed],
  );
  const ungroupedVisible = useMemo(
    () =>
      ungroupedSessions(visibleSessions, sessionFolders).filter(
        (session) => !reminderIds.has(session.id),
      ),
    [visibleSessions, sessionFolders, reminderIds],
  );
  const activeUngroupedIndex = ungroupedVisible.findIndex(
    (session) => session.id === activeSessionId,
  );
  const shownUngroupedCount = sessionListWindow(
    ungroupedVisible.length,
    sessionListLimit,
    activeUngroupedIndex,
  );
  const shownUngrouped = useMemo(
    () => ungroupedVisible.slice(0, shownUngroupedCount),
    [ungroupedVisible, shownUngroupedCount],
  );
  const fullSessionListEntries = useMemo(
    () =>
      buildSessionList(
        visibleSessions,
        sessionFolders,
        ungroupedVisible,
        pinnedSessionsCollapsed,
        reminderGroup,
      ),
    [
      visibleSessions,
      sessionFolders,
      ungroupedVisible,
      pinnedSessionsCollapsed,
      reminderGroup,
    ],
  );
  const sessionListEntries = useMemo(
    () =>
      buildSessionList(
        visibleSessions,
        sessionFolders,
        shownUngrouped,
        pinnedSessionsCollapsed,
        reminderGroup,
      ),
    [
      visibleSessions,
      sessionFolders,
      shownUngrouped,
      pinnedSessionsCollapsed,
      reminderGroup,
    ],
  );
  const sessionNavigationIds = useMemo(
    () => sessionListNavigationIds(fullSessionListEntries, searchNarrowed),
    [fullSessionListEntries, searchNarrowed],
  );
  const sessionNavigationKey = sessionNavigationIds.join("\0");
  useEffect(() => {
    onSessionNavigationOrder?.(sessionNavigationIds);
  }, [onSessionNavigationOrder, sessionNavigationKey]);
  useEffect(() => {
    if (tab !== "sessions") {
      setSelectedSessionIds(new Set());
      return;
    }
    const available = new Set(sessionNavigationIds);
    setSelectedSessionIds((current) =>
      pruneSessionSelection(current, available),
    );
  }, [cwd, tab, sessionNavigationKey]);
  const hasMoreSessions = shownUngroupedCount < ungroupedVisible.length;
  const sessionListKey = `${cwd}\0${sessionFilters.showArchived}\0${sessionFilters.time}\0${sessionFilters.hiddenHarnesses.join(",")}\0${sessionFilters.status.working}\0${sessionFilters.status.needsApproval}\0${sessionFilters.status.done}\0${searchQuery}`;
  const sessionHarnesses = useMemo(
    () => harnessesInSessions(sessions),
    [sessions],
  );
  const narrowedByUser = searchNarrowed || filtersActive;
  const sortable = useSortable(tabOrder, (ids) => {
    const next = ids as SidebarTab[];
    setTabOrder(next);
    saveSidebarTabOrder(next);
    if (next[0]) onTabChange(next[0]);
  });
  const visibleFolderIds = useMemo(
    () =>
      sessionListEntries.flatMap((entry) =>
        entry.kind === "folder" ? [entry.folder.id] : [],
      ),
    [sessionListEntries],
  );
  const folderSortable = useSortable(
    visibleFolderIds,
    (ids) => {
      setSessionFolders((current) => {
        const next = reorderSessionFolders(current, ids);
        if (next === current) return current;
        saveSessionFolders(cwd, next);
        return next;
      });
    },
    { axis: "y" },
  );
  const visibleTabs = tabOrder;
  const inProject = looksLikeProject(cwd);
  const showSidebarFooter = !settingsOpen;
  const sidebarVisible =
    open &&
    (projectRailOpen || settingsOpen) &&
    (inProject || settingsOpen);
  const [groupLabels] = useState(loadTabGroupLabels);
  const [groupColors] = useState(loadTabGroupColors);
  const [groupCustomColors] = useState(loadTabGroupCustomColors);
  const [groupMascots] = useState(loadTabGroupMascots);
  const gitStatuses = useGitFileStatuses(gitRoot, open && tab === "files");
  const changeStats = useProjectDiffStats(gitRoot, open);

  useEffect(() => {
    setSessionListLimit(SESSION_LIST_PAGE);
    const scroller = sessionsScrollRef.current;
    if (scroller) scroller.scrollTop = 0;
  }, [sessionListKey]);

  useEffect(() => {
    if (tab !== "sessions" || !hasMoreSessions) return;
    const sentinel = loadMoreRef.current;
    const root = sessionsScrollRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setSessionListLimit((current) => current + SESSION_LIST_PAGE);
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, hasMoreSessions, shownUngroupedCount]);

  useEffect(() => {
    setSessionFolders(loadSessionFolders(cwd));
    setPinnedSessionsCollapsed(loadPinnedSessionsCollapsed(cwd));
    setReminderSessionsCollapsed(loadReminderSessionsCollapsed(cwd));
    setRenamingFolderId(null);
    setFolderMenu(null);
    setSessionDrop(null);
    pendingFolderSessionIds.current.clear();
  }, [cwd]);

  useEffect(
    () =>
      subscribeSessionFolders(cwd, () => {
        setSessionFolders(loadSessionFolders(cwd));
      }),
    [cwd],
  );

  useEffect(() => {
    if (pending || status === "error") return;
    const known = new Set(sessions.map((session) => session.id));
    for (const session of openSessions) known.add(session.id);
    if (activeSessionId) known.add(activeSessionId);
    for (const id of pendingFolderSessionIds.current) {
      known.add(id);
      if (
        sessions.some((session) => session.id === id) ||
        openSessions.some((session) => session.id === id)
      ) {
        pendingFolderSessionIds.current.delete(id);
      }
    }
    setSessionFolders((current) => {
      const next = pruneSessionFolders(current, known);
      if (next === current) return current;
      saveSessionFolders(cwd, next);
      return next;
    });
  }, [activeSessionId, cwd, openSessions, pending, sessions, status]);

  useEffect(() => {
    if (tab !== "sessions") return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [tab]);

  useEffect(() => {
    if (tab !== "sessions") {
      setFilterMenu(null);
      setSearchQuery("");
    }
  }, [tab]);

  useEffect(() => {
    if (!sessionMenu && !folderMenu && !filterMenu) return;
    const onScroll = () => {
      closeSessionMenu();
      setFolderMenu(null);
      setFilterMenu(null);
    };
    const scrollParent = sessionsScrollRef.current ?? window;
    scrollParent.addEventListener("scroll", onScroll, true);
    return () => scrollParent.removeEventListener("scroll", onScroll, true);
  }, [sessionMenu, folderMenu, filterMenu]);

  useEffect(() => {
    if (selectedSessionIds.size === 0) return;
    const clear = () => {
      contextSelectionRef.current = false;
      setSelectedSessionIds(new Set());
      setSessionMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clear();
    };
    // A pointer landing off the cards drops the selection; a menu acting on
    // it stays open, and the cards handle their own clicks.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const el = target instanceof Element ? target : null;
      if (el?.closest("[data-session-card],[data-popover-side]")) return;
      clear();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [selectedSessionIds.size]);

  const commitSessionFolders = (next: SessionFolder[]) => {
    setSessionFolders(next);
    saveSessionFolders(cwd, next);
  };

  const onNewInFolder = (folderId: string) => {
    const sessionId = onNew?.();
    if (!sessionId) return;
    pendingFolderSessionIds.current.add(sessionId);
    setSearchQuery("");
    setSessionFolders((current) => {
      const next = setFolderCollapsed(
        addSessionToFolder(current, folderId, sessionId),
        folderId,
        false,
      );
      saveSessionFolders(cwd, next);
      return next;
    });
  };

  const menuSessionIds = sessionMenu
    ? orderedSessionActionIds(
        sessionMenu.sessionId,
        selectedSessionIds,
        sessionNavigationIds,
      )
    : [];
  const menuSessions = menuSessionIds.flatMap((sessionId) => {
    const session = listedSessions.find((entry) => entry.id === sessionId);
    return session ? [session] : [];
  });
  const multipleMenuSessions = menuSessionIds.length > 1;
  const menuReminderTimes = [
    ...new Set(
      reminders
        .filter((reminder) => menuSessionIds.includes(reminder.sessionId))
        .map((reminder) => reminder.dueAt),
    ),
  ];
  const allMenuSessionsPinned =
    menuSessions.length > 0 && menuSessions.every((session) => session.pinned);
  const allMenuSessionsArchived =
    menuSessions.length > 0 &&
    menuSessions.every((session) => session.archived);
  const menuSessionFolder =
    menuSessionIds.length === 1
      ? folderContaining(sessionFolders, menuSessionIds[0])
      : undefined;
  const anyMenuSessionFoldered = menuSessionIds.some((sessionId) =>
    sessionFolders.some((folder) => folder.sessionIds.includes(sessionId)),
  );
  const canRemoveMenuSessionsFromFolders = multipleMenuSessions
    ? anyMenuSessionFoldered
    : !!menuSessionFolder;
  const menuFolder = folderMenu
    ? sessionFolders.find((folder) => folder.id === folderMenu.folderId)
    : undefined;
  const folderMenuItems: ExplorerMenuItem[] = [
    { kind: "item", id: "rename", label: "Rename", shortcut: "F2" },
    { kind: "sep" },
    { kind: "item", id: "ungroup", label: "Ungroup" },
  ];
  const sessionMenuItems: ExplorerMenuItem[] = [
    ...(onCancelReminders && menuReminderTimes.length > 0
      ? [
          {
            kind: "item" as const,
            id: "reminder:cancel",
            label: "Cancel reminder",
            description:
              menuReminderTimes.length === 1
                ? formatReminderTime(menuReminderTimes[0])
                : "Multiple reminder times",
          },
          { kind: "sep" as const },
        ]
      : []),
    ...(onPinSession || onPinSessions
      ? [
          {
            kind: "item" as const,
            id: "pin",
            label: allMenuSessionsPinned ? "Unpin" : "Pin",
          },
        ]
      : []),
    ...(!multipleMenuSessions && onRenameSession
      ? [
          {
            kind: "item" as const,
            id: "rename",
            label: "Rename",
            shortcut: "F2",
          },
        ]
      : []),
    {
      kind: "item",
      id: "reminder",
      label: "Remind me",
      disabled: !onSetReminders,
      submenu: sessionReminderPresets(),
    },
    { kind: "sep" as const },
    { kind: "item" as const, id: "folder-new", label: "New folder" },
    ...(sessionFolders.length > 0 ? [{ kind: "sep" as const }] : []),
    ...sessionFolders.map((folder) => ({
      kind: "item" as const,
      id: `folder-add:${folder.id}`,
      label: `Add to ${folder.name}`,
      checked:
        menuSessionIds.length > 0 &&
        menuSessionIds.every((sessionId) =>
          folder.sessionIds.includes(sessionId),
        ),
    })),
    ...(canRemoveMenuSessionsFromFolders
      ? [
          {
            kind: "item" as const,
            id: "folder-remove",
            label: multipleMenuSessions
              ? "Remove from folders"
              : "Remove from folder",
          },
        ]
      : []),
    ...(onArchiveSession ||
    onArchiveSessions ||
    onDeleteSession ||
    onDeleteSessions
      ? [
          { kind: "sep" as const },
          ...(onArchiveSession || onArchiveSessions
            ? [
                {
                  kind: "item" as const,
                  id: "archive",
                  label: allMenuSessionsArchived ? "Unarchive" : "Archive",
                },
              ]
            : []),
          ...(onDeleteSession || onDeleteSessions
            ? [
                {
                  kind: "item" as const,
                  id: "delete",
                  label: "Delete",
                  shortcut: "⌫",
                  danger: true,
                },
              ]
            : []),
        ]
      : []),
  ];

  const onSessionContextMenu = useCallback(
    (sessionId: string, e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      contextSelectionRef.current =
        !selectedSessionIdsRef.current.has(sessionId);
      if (contextSelectionRef.current) {
        setSelectedSessionIds(new Set([sessionId]));
      }
      setFilterMenu(null);
      setFolderMenu(null);
      setSessionMenu({ x: e.clientX, y: e.clientY, sessionId });
    },
    [],
  );

  const closeSessionMenu = () => {
    setSessionMenu(null);
    if (!contextSelectionRef.current) return;
    contextSelectionRef.current = false;
    setSelectedSessionIds(new Set());
  };

  const onFolderContextMenu = (
    folderId: string,
    e: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setFilterMenu(null);
    setSessionMenu(null);
    setFolderMenu({ x: e.clientX, y: e.clientY, folderId });
  };

  const onSessionMenuPick = (id: string) => {
    if (!sessionMenu) return;
    const sessionId = sessionMenu.sessionId;
    const sessionIds = menuSessionIds;
    const archived = allMenuSessionsArchived;
    const pinned = allMenuSessionsPinned;
    closeSessionMenu();
    if (id === "reminder:cancel") {
      onCancelReminders?.(sessionIds);
      return;
    }
    if (id.startsWith("reminder:")) {
      const dueAt = reminderTime(id);
      if (dueAt != null) {
        setReminderSessionsCollapsed(false);
        saveReminderSessionsCollapsed(cwd, false);
        onSetReminders?.(sessionIds, dueAt);
      }
      return;
    }
    if (id === "pin") {
      if (sessionIds.length > 1 && onPinSessions) {
        onPinSessions(sessionIds, !pinned);
      } else {
        for (const id of sessionIds) onPinSession?.(id, !pinned);
      }
      return;
    }
    if (id === "rename") {
      setRenamingSessionId(sessionId);
      return;
    }
    if (id === "folder-new") {
      const { folders, id: createdId } = createFolderWithSessions(
        sessionFolders,
        sessionIds,
      );
      if (!createdId) return;
      commitSessionFolders(folders);
      setRenamingFolderId(createdId);
      return;
    }
    if (id.startsWith("folder-add:")) {
      const folderId = id.slice("folder-add:".length);
      const folders = sessionIds.reduce(
        (current, id) => addSessionToFolder(current, folderId, id),
        sessionFolders,
      );
      commitSessionFolders(setFolderCollapsed(folders, folderId, false));
      return;
    }
    if (id === "folder-remove") {
      commitSessionFolders(
        sessionIds.reduce(
          (current, id) => removeSessionFromFolder(current, id),
          sessionFolders,
        ),
      );
      return;
    }
    if (id === "archive") {
      if (sessionIds.length > 1 && onArchiveSessions) {
        onArchiveSessions(sessionIds, !archived);
      } else {
        for (const id of sessionIds) onArchiveSession?.(id, !archived);
      }
      return;
    }
    if (id === "delete") {
      if (sessionIds.length > 1 && onDeleteSessions) {
        onDeleteSessions(sessionIds);
      } else {
        for (const id of sessionIds) onDeleteSession?.(id);
      }
    }
  };

  const onFolderMenuPick = (id: string) => {
    if (!folderMenu) return;
    const folderId = folderMenu.folderId;
    setFolderMenu(null);
    if (id === "rename") {
      setRenamingFolderId(folderId);
      return;
    }
    if (id === "ungroup") {
      commitSessionFolders(dissolveFolder(sessionFolders, folderId));
    }
  };

  const onFolderColorChange = (colorIndex: number | null) => {
    if (!folderMenu) return;
    commitSessionFolders(
      setFolderColor(sessionFolders, folderMenu.folderId, colorIndex),
    );
  };

  const onFolderCustomColorChange = (color: string) => {
    if (!folderMenu) return;
    commitSessionFolders(
      setFolderCustomColor(sessionFolders, folderMenu.folderId, color),
    );
  };

  const onSessionListDrop = useCallback(
    (draggedId: string, target: SessionListDropTarget) => {
      setSessionFolders((current) => {
        const { folders, createdId } = applySessionListDrop(
          current,
          draggedId,
          target,
        );
        if (folders === current) return current;
        saveSessionFolders(cwdRef.current, folders);
        if (createdId) setRenamingFolderId(createdId);
        return folders;
      });
    },
    [],
  );

  const isSessionDrop = useCallback(
    (kind: "folder" | "session", id: string) =>
      sessionDrop?.kind === kind && sessionDrop.id === id,
    [sessionDrop],
  );

  const onSessionCardSelect = useCallback(
    (sessionId: string, event: { shiftKey: boolean }) => {
      if (event.shiftKey) {
        contextSelectionRef.current = false;
        setSessionMenu(null);
        setSelectedSessionIds((current) =>
          toggleSessionSelection(current, sessionId),
        );
        return;
      }
      setSelectedSessionIds(new Set());
      onSelectSession(sessionId);
    },
    [onSelectSession],
  );

  const handleArchiveSession = useCallback(
    (sessionId: string, nextArchived: boolean) => {
      onArchiveSession?.(sessionId, nextArchived);
    },
    [onArchiveSession],
  );

  const handleRenameSession = useCallback((sessionId: string) => {
    setRenamingSessionId(sessionId);
  }, []);

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      onDeleteSession?.(sessionId);
    },
    [onDeleteSession],
  );

  const renderSessionCard = (session: SessionSummary, compact = false) =>
    renamingSessionId === session.id && onRenameSession ? (
      <SessionRenameRow
        session={session}
        isActive={session.id === activeSessionId}
        needsApproval={approvalSessionIds.has(session.id)}
        onCommit={(title) => {
          onRenameSession(session.id, title);
          setRenamingSessionId(null);
        }}
        onCancel={() => setRenamingSessionId(null)}
      />
    ) : (
      <SessionCard
        session={session}
        isActive={session.id === activeSessionId}
        isSelected={selectedSessionIds.has(session.id)}
        busy={busySessionIds.has(session.id)}
        done={unseenFinishedIds.has(session.id)}
        needsApproval={approvalSessionIds.has(session.id)}
        dropTarget={isSessionDrop("session", session.id)}
        compact={compact}
        now={now}
        onSelect={onSessionCardSelect}
        onPrefetch={onPrefetchSession}
        onPlaceOnPane={onPlaceSessionOnPane}
        onListDrop={reminderIds.has(session.id) ? undefined : onSessionListDrop}
        onListDropTargetChange={setSessionDrop}
        onContextMenu={onSessionContextMenu}
        onArchive={onArchiveSession ? handleArchiveSession : undefined}
        onRename={onRenameSession ? handleRenameSession : undefined}
        onDelete={onDeleteSession ? handleDeleteSession : undefined}
      />
    );

  const onSessionFiltersChange = (next: SessionSidebarFilters) => {
    setSessionFilters(next);
    saveSessionSidebarFilters(next);
  };

  const onFilterButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (filterMenu) {
      setFilterMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setSessionMenu(null);
    setFolderMenu(null);
    setFilterMenu({
      x: rect.right - 228,
      y: rect.bottom + 2,
    });
  };

  const sessionSearchInput = (
    <input
      ref={searchInputRef}
      type="text"
      value={searchQuery}
      placeholder="Search conversations..."
      aria-label="Search conversations"
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      onChange={(event) => setSearchQuery(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (searchQuery) {
          setSearchQuery("");
        }
      }}
      className="h-full w-full min-w-0 rounded-md bg-transparent py-0 pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/35"
    />
  );

  const onTabPick = (itemId: SidebarTab) => {
    onTabChange(itemId);
  };

  const changeAdditions = changeStats?.additions ?? 0;
  const changeDeletions = changeStats?.deletions ?? 0;
  const hasChangeStats = changeAdditions > 0 || changeDeletions > 0;

  const workspaceTabItems = visibleTabs.map((itemId, index) => {
    const active = tab === itemId;
    const isChangesTab = itemId === "changes";
    const draggingTab = sortable.draggingId === itemId;
    const showStart =
      sortable.draggingId &&
      sortable.toIndex === index &&
      sortable.fromIndex !== null &&
      sortable.toIndex < sortable.fromIndex;
    const showEnd =
      sortable.draggingId &&
      sortable.toIndex === index &&
      sortable.fromIndex !== null &&
      sortable.toIndex > sortable.fromIndex;
    return (
      <div
        key={itemId}
        ref={(el) => sortable.setItemRef(itemId, el)}
        className={`relative flex min-w-0 flex-1 touch-none items-stretch ${
          draggingTab ? "opacity-40" : ""
        }`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          onTabPick(itemId);
          sortable.onItemPointerDown(itemId, event);
        }}
      >
        {showStart ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0.5 bg-accent" />
        ) : null}
        {showEnd ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-0.5 bg-accent" />
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={active}
          aria-label={
            isChangesTab
              ? hasChangeStats
                ? [
                    "Changes",
                    changeAdditions > 0 ? `+${changeAdditions}` : "",
                    changeDeletions > 0 ? `-${changeDeletions}` : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                : "Changes"
              : undefined
          }
          data-tauri-drag-region="false"
          onClick={() => {
            if (sortable.consumeClick()) return;
            onTabPick(itemId);
          }}
          className={`flex h-6 min-w-0 flex-1 cursor-pointer items-center justify-center self-center rounded-md px-2 text-[12px] leading-none ${
            active
              ? "bg-content/10 text-content"
              : "text-content/50 hover:bg-content/5 hover:text-content"
          }`}
        >
          {isChangesTab && hasChangeStats ? (
            <DiffStat additions={changeAdditions} deletions={changeDeletions} />
          ) : (
            <span className="block truncate leading-label">
              {TAB_LABELS[itemId]}
            </span>
          )}
        </button>
      </div>
    );
  });

  const sidebarContent = (
    <aside
      ref={resize.setPaneRef}
      className="sidebar-glass relative flex h-full min-h-0 shrink-0 flex-col border-r border-content/10"
    >
      {settingsOpen ? (
        <>
          <div
            className="flex h-10 shrink-0 select-none items-center border-b border-content/10 pr-1.5"
            data-tauri-drag-region="deep"
          >
            {IS_MAC ? <div className="w-[78px] shrink-0" /> : null}
            <DevModeSlot />
            <TabVisitNav
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onGoBack={onGoBack}
              onGoForward={onGoForward}
              onTogglePanel={onToggleProjectRail}
              panelActive
            />
          </div>
          <SettingsNav
            section={settingsSection}
            onSelect={(next) => onSelectSettingsSection?.(next)}
            onClose={() => onCloseSettings?.()}
          />
        </>
      ) : (
        <>
          <div
            className="flex h-10 shrink-0 select-none items-center pr-1.5"
            data-tauri-drag-region="deep"
          >
            {IS_MAC ? <div className="w-[78px] shrink-0" /> : null}
            <DevModeSlot />
            <TabVisitNav
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onGoBack={onGoBack}
              onGoForward={onGoForward}
              onTogglePanel={onToggleProjectRail}
              panelActive
            />
          </div>

          <div className="flex shrink-0 flex-col gap-px px-2 pb-2 pt-0.5">
            <RailSearch
              label="Search"
              icon={Search}
              onClick={onSearch}
              active={searchActive}
              shortcut={`${MOD}K`}
              ariaLabel={`Search (${MOD}K)`}
            />
            {notesEnabled ? (
              <RailAction
                label="Notes"
                icon={File}
                onClick={onOpenNotes}
                active={notesActive}
                ariaLabel="Notes"
              />
            ) : null}
          </div>

          {onSelectProject ? (
            <SidebarProjectPicker
              cwd={cwd}
              recents={recents}
              busy={projectPathBusy(busyProjectPaths, cwd)}
              onSelectProject={onSelectProject}
              onOpenProject={onOpenProject}
            />
          ) : null}

          <div
            role="tablist"
            aria-label="Workspace"
            className="flex h-9 shrink-0 items-center gap-px overflow-visible border-b border-content/10 px-2"
          >
            {workspaceTabItems}
          </div>
        </>
      )}
      {!settingsOpen ? (
        <>
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
            tab === "files" ? "" : "hidden"
          }`}
        >
          {filesSearchOpen ? (
            <ProjectSearch
              cwd={gitRoot}
              focusToken={searchFocusToken}
              onOpenFile={onOpenFile}
              onClose={() => onFilesSearchOpenChange(false)}
            />
          ) : cwd && cwd !== "~" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <FileTree
                key={gitRoot}
                cwd={gitRoot}
                onOpenFile={onOpenFile}
                onOpenTerminal={onOpenTerminal}
                onFileMoved={onFileMoved}
                onFileDeleted={onFileDeleted}
                onSearch={onOpenFilesSearch}
                gitStatuses={gitStatuses}
              />
            </div>
          ) : (
            <p className="px-3 py-2 text-[12px] text-content/50">
              No project folder
            </p>
          )}
        </div>
        {tab === "sessions" && cwd && cwd !== "~" ? (
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-content/10 px-2">
            <div className="relative flex h-7 min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-2 size-3 shrink-0 opacity-50" />
              {sessionSearchInput}
            </div>
            <SessionsHeaderButton
              label="Filter sessions"
              active={filtersActive}
              open={!!filterMenu}
              hasPopup
              onClick={onFilterButtonClick}
            >
              <ListFilter className="size-3" strokeWidth={1.75} />
            </SessionsHeaderButton>
          </div>
        ) : null}
        <div
          ref={(el) => {
            sessionsLock(el);
            sessionsScrollRef.current = el;
          }}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-none ${
            tab === "sessions" ? "" : "hidden"
          }`}
        >
          {!cwd || cwd === "~" ? (
            <p className="px-3 py-2 text-[12px] text-content/50">
              No project folder
            </p>
          ) : (
            <div>
              {/*
              A project's first load stays deliberately blank. The listing is
              served from a covering index and resolves within a frame or two,
              so a placeholder only ever flashed — reading as a glitch rather
              than as progress. This is checked before the empty state so that
              cannot claim "No sessions yet" before the rows have landed.
            */}
              {pendingFirstLoad ? null : status === "error" &&
                sessions.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-content/50">
                  Couldn’t load sessions
                </p>
              ) : visibleSessions.length === 0 ? (
                // A narrowed-down result is a transient answer to what the user
                // just typed, so it stays a quiet line of text. Only the genuine
                // "this project has nothing in it" case earns the illustration.
                narrowedByUser ? (
                  <p className="px-3 py-2 text-[12px] text-content/50">
                    {searchNarrowed
                      ? "No matching sessions"
                      : "No sessions match these filters"}
                  </p>
                ) : (
                  <SessionsEmpty message="Sessions you start will show up here" />
                )
              ) : (
                <ul className="flex flex-col gap-0.5 p-1.5">
                  {sessionListEntries.map((entry, index) => {
                    if (entry.kind === "pinned" || entry.kind === "reminders") {
                      const isReminders = entry.kind === "reminders";
                      const expanded = searchNarrowed || !entry.collapsed;
                      const beforeUngrouped =
                        sessionListEntries[index + 1]?.kind === "session";
                      return (
                        <li
                          key={`${entry.kind}-sessions`}
                          data-pinned-sessions={isReminders ? undefined : ""}
                          data-reminder-sessions={isReminders ? "" : undefined}
                          className={`relative ${
                            expanded || beforeUngrouped ? "mb-1.5" : ""
                          }`}
                        >
                          <div className="overflow-hidden rounded-md bg-content/5">
                            <FolderRow
                              folder={
                                isReminders
                                  ? {
                                      name: "Reminders",
                                      customColor: REMINDERS_COLOR,
                                    }
                                  : { name: "Pinned" }
                              }
                              sessions={entry.sessions}
                              expanded={expanded}
                              dropTarget={false}
                              busy={entry.sessions.some((session) =>
                                busySessionIds.has(session.id),
                              )}
                              done={entry.sessions.some((session) =>
                                unseenFinishedIds.has(session.id),
                              )}
                              needsApproval={entry.sessions.some((session) =>
                                approvalSessionIds.has(session.id),
                              )}
                              groupIcon={
                                isReminders ? (
                                  <Clock
                                    className="size-3.5"
                                    strokeWidth={1.75}
                                  />
                                ) : (
                                  <Pin
                                    className="size-3.5 text-content"
                                    strokeWidth={1.75}
                                  />
                                )
                              }
                              onToggle={() => {
                                if (searchNarrowed) return;
                                const collapsed = !entry.collapsed;
                                if (isReminders) {
                                  setReminderSessionsCollapsed(collapsed);
                                  saveReminderSessionsCollapsed(cwd, collapsed);
                                  return;
                                }
                                setPinnedSessionsCollapsed(collapsed);
                                savePinnedSessionsCollapsed(cwd, collapsed);
                              }}
                            />
                            {expanded ? (
                              <ul className="flex flex-col gap-px p-1">
                                {entry.sessions.map((session) => (
                                  <li key={session.id}>
                                    {renderSessionCard(session, true)}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </li>
                      );
                    }
                    if (entry.kind === "folder") {
                      const expanded =
                        searchNarrowed || !entry.folder.collapsed;
                      const shellFill = folderShellFill(
                        entry.folder.colorIndex,
                        entry.folder.customColor,
                      );
                      const folderIndex = visibleFolderIds.indexOf(
                        entry.folder.id,
                      );
                      const beforeUngrouped =
                        sessionListEntries[index + 1]?.kind === "session";
                      const draggingFolder =
                        folderSortable.draggingId === entry.folder.id;
                      const showFolderDropStart =
                        folderSortable.draggingId &&
                        folderSortable.toIndex === folderIndex &&
                        folderSortable.fromIndex !== null &&
                        folderSortable.toIndex < folderSortable.fromIndex;
                      const showFolderDropEnd =
                        folderSortable.draggingId &&
                        folderSortable.toIndex === folderIndex &&
                        folderSortable.fromIndex !== null &&
                        folderSortable.toIndex > folderSortable.fromIndex;
                      return (
                        <li
                          key={entry.folder.id}
                          ref={(el) =>
                            folderSortable.setItemRef(entry.folder.id, el)
                          }
                          data-session-folder={entry.folder.id}
                          className={`relative ${
                            expanded || beforeUngrouped ? "mb-1.5" : ""
                          } ${draggingFolder ? "opacity-40" : ""}`}
                        >
                          {showFolderDropStart ? (
                            <div className="pointer-events-none absolute inset-x-1 top-0 z-20 h-0.5 rounded-full bg-accent" />
                          ) : null}
                          {showFolderDropEnd ? (
                            <div className="pointer-events-none absolute inset-x-1 bottom-0 z-20 h-0.5 rounded-full bg-accent" />
                          ) : null}
                          <div
                            className={`overflow-hidden rounded-md ${
                              shellFill ? "" : "bg-content/5"
                            }`}
                            style={
                              shellFill ? { background: shellFill } : undefined
                            }
                          >
                            {renamingFolderId === entry.folder.id ? (
                              <FolderRenameRow
                                folder={entry.folder}
                                memberCount={entry.sessions.length}
                                dropTarget={isSessionDrop(
                                  "folder",
                                  entry.folder.id,
                                )}
                                onCommit={(name) => {
                                  commitSessionFolders(
                                    renameFolder(
                                      sessionFolders,
                                      entry.folder.id,
                                      name,
                                    ),
                                  );
                                  setRenamingFolderId(null);
                                }}
                                onCancel={() => setRenamingFolderId(null)}
                              />
                            ) : (
                              <FolderRow
                                folder={entry.folder}
                                sessions={entry.sessions}
                                expanded={expanded}
                                dropTarget={isSessionDrop(
                                  "folder",
                                  entry.folder.id,
                                )}
                                canReorder={visibleFolderIds.length > 1}
                                busy={entry.sessions.some((session) =>
                                  busySessionIds.has(session.id),
                                )}
                                done={entry.sessions.some((session) =>
                                  unseenFinishedIds.has(session.id),
                                )}
                                needsApproval={entry.sessions.some((session) =>
                                  approvalSessionIds.has(session.id),
                                )}
                                onPointerDown={(event) =>
                                  folderSortable.onItemPointerDown(
                                    entry.folder.id,
                                    event,
                                  )
                                }
                                onToggle={() => {
                                  if (folderSortable.consumeClick()) return;
                                  if (searchNarrowed) return;
                                  commitSessionFolders(
                                    setFolderCollapsed(
                                      sessionFolders,
                                      entry.folder.id,
                                      !entry.folder.collapsed,
                                    ),
                                  );
                                }}
                                onContextMenu={(event) =>
                                  onFolderContextMenu(entry.folder.id, event)
                                }
                                onRename={() =>
                                  setRenamingFolderId(entry.folder.id)
                                }
                              />
                            )}
                            {expanded ? (
                              <>
                                <ul className="flex flex-col gap-px p-1">
                                  {entry.sessions.map((session) => (
                                    <li key={session.id}>
                                      {renderSessionCard(session, true)}
                                    </li>
                                  ))}
                                </ul>
                                {onNew ? (
                                  <div className="border-t border-content/10 p-1">
                                    <button
                                      type="button"
                                      data-no-drag
                                      data-tauri-drag-region="false"
                                      title="New session"
                                      aria-label="New session"
                                      onClick={() =>
                                        onNewInFolder(entry.folder.id)
                                      }
                                      className="relative flex w-full items-center gap-1 rounded-md border border-transparent px-2.5 py-1.5 text-left text-content/45 hover:bg-content/10 hover:text-content"
                                    >
                                      <Plus
                                        className="size-3 shrink-0"
                                        strokeWidth={1.75}
                                      />
                                      <span className="text-[13px] font-semibold leading-snug">
                                        New session
                                      </span>
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={entry.session.id}>
                        {renderSessionCard(entry.session)}
                      </li>
                    );
                  })}
                  {hasMoreSessions ? (
                    <li
                      ref={loadMoreRef}
                      aria-hidden
                      className="h-px list-none"
                    />
                  ) : null}
                </ul>
              )}
            </div>
          )}
        </div>
        {tab === "changes" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SourceControl
              cwd={gitRoot}
              enabled={open}
              textHarness={textHarness}
              selectedPath={selectedDiffPath}
              selectedKind={selectedDiffKind}
              selectedSha={selectedCommitSha}
              onOpenFile={
                onOpenDiff ??
                ((path) => onOpenFile(path, undefined, { exact: true }))
              }
              onOpenAllChanges={onOpenAllChanges ?? (() => {})}
              onOpenCommit={onOpenCommit ?? (() => {})}
            />
          </div>
        ) : null}
        {showSidebarFooter ? (
          <>
            {liveAgents && liveAgents.length > 0 ? (
              <LiveAgentsPreview
                agents={liveAgents}
                activeSessionId={activeSessionId}
                onSelect={onSelectAgent}
                groupLabels={groupLabels}
                groupColors={groupColors}
                groupCustomColors={groupCustomColors}
                groupMascots={groupMascots}
              />
            ) : null}
            <SidebarUpdateFooter
              update={updateNotice}
              onOpenWhatsNew={onOpenWhatsNew}
              onDismissUpdate={onDismissUpdate}
            />
            <div className="flex shrink-0 flex-col gap-1 border-t border-content/10 p-2.5">
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label={`Settings (${MOD},)`}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-content/60 transition-colors hover:bg-content/6 hover:text-content"
              >
                <div className="flex items-center gap-2.5">
                  <Settings className="size-4.5 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="text-[13.5px] font-medium">Settings</span>
                </div>
                <kbd className="rounded border border-content/15 bg-content/5 px-1.5 py-0.5 font-mono text-[10px] text-content/40 shadow-xs">
                  {MOD},
                </kbd>
              </button>
            </div>
          </>
        ) : null}
      </>
    ) : null}
      {sessionMenu ? (
        <ExplorerMenu
          x={sessionMenu.x}
          y={sessionMenu.y}
          items={sessionMenuItems}
          ariaLabel={
            multipleMenuSessions
              ? `${menuSessionIds.length} selected session actions`
              : "Session actions"
          }
          onPick={onSessionMenuPick}
          onClose={closeSessionMenu}
        />
      ) : null}
      {folderMenu ? (
        <ExplorerMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={folderMenuItems}
          ariaLabel="Folder actions"
          width={260}
          header={
            <FolderColorSwatches
              colorIndex={menuFolder?.colorIndex}
              customColor={menuFolder?.customColor}
              onChange={onFolderColorChange}
              onCustomChange={onFolderCustomColorChange}
            />
          }
          onPick={onFolderMenuPick}
          onClose={() => setFolderMenu(null)}
        />
      ) : null}
      {filterMenu ? (
        <SessionFiltersMenu
          x={filterMenu.x}
          y={filterMenu.y}
          harnesses={sessionHarnesses}
          filters={sessionFilters}
          onChange={onSessionFiltersChange}
          onClose={() => setFilterMenu(null)}
        />
      ) : null}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={resize.width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        className={`absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
    </aside>
  );

  return (
    <div
      className={`flex h-full shrink-0 ${
        sidebarVisible ? "" : "hidden"
      }`}
    >
      {sidebarVisible ? sidebarContent : null}
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);
