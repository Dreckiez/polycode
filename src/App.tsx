import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Sidebar } from "./chrome/Sidebar";
import { ApprovalToasts } from "./chrome/ApprovalToasts";
import { WhatsNewDialog } from "./chrome/WhatsNewDialog";
import { TitleBar, type Tab as TitleTab } from "./chrome/TitleBar";
import { MenuBar } from "./chrome/MenuBar";
import { FilePicker } from "./chrome/FilePicker";
import { UsageFooter } from "./chrome/UsageFooter";
import { ProviderSignInDialog } from "./chrome/ProviderSignInDialog";
import { useProjectBranches } from "./hooks/useProjectBranches";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useProjectTerminal } from "./hooks/useProjectTerminal";
import { useTabClose } from "./hooks/useTabClose";
import { useProjectOfTab } from "./hooks/useProjectOfTab";
import { useSubmitTurn } from "./hooks/useSubmitTurn";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useHarnessEventQueue } from "./hooks/useHarnessEventQueue";
import { useSessionStreaming } from "./hooks/useSessionStreaming";
import { useOpenSettings } from "./hooks/useOpenSettings";
import { usePaneManagement } from "./hooks/usePaneManagement";
import { useDismissUpdate } from "./hooks/useDismissUpdate";
import { useSessionLifecycle } from "./hooks/useSessionLifecycle";
import { useProjectNavigation } from "./hooks/useProjectNavigation";
import { useTabLayout } from "./hooks/useTabLayout";
import { useTabIteration } from "./hooks/useTabIteration";
import { usePlaceSessionOnPane } from "./hooks/usePlaceSessionOnPane";
import { useMultiSession } from "./hooks/useMultiSession";
import { useModelSettings } from "./hooks/useModelSettings";
import { useRunCheckCommand } from "./hooks/useRunCheckCommand";
import { useFileTracking } from "./hooks/useFileTracking";
import {
  loadProjectRailOpen,
  loadSidebarTabOrder,
  saveProjectRailOpen,
  type SidebarTabId,
} from "./lib/appearance";
import { HAS_NATIVE_GLASS, IS_MAC } from "./lib/platform";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  UI_SCALE_DEFAULT,
  zoomInUiScale,
  zoomOutUiScale,
} from "./lib/uiScale";
import { runUpdateFlow } from "./lib/updater";
import {
  notifyGitChanged,
  pickFolder,
  type GitFileDiffKind,
  type GitHistoryCommit,
} from "./lib/fs";
import { prefetchProjectFiles } from "./lib/fileIndex";
import {
  findSurfacePane,
  focusedFileTab,
  isolateTerminalPanes,
  isFilesystemTab,
  leafIds,
  neighborLeafId,
  newPlanTab,
  newTab,
  openChangesTab,
  openCommitTab,
  openEditorTab,
  replaceLeafId,
  setSplitRatio,
  surfacePanes,
  withSurfacePanes,
  type FilePaneTab,
  type FocusDir,
  type WorkspaceTab,
} from "./lib/layout";
import { releaseNotesForVersion } from "./lib/releaseNotes";
import { orderByIds } from "./lib/reorder";
import {
  applyDockGridStyle,
  findProjectTerminal,
  type ProjectTerminalDock as ProjectTerminal,
} from "./lib/projectTerminal";
import { type WindowTransferPayload } from "./lib/windowTransfer";
import { listRunningTerminals } from "./lib/terminalTab";
import {
  cancelHarnessTurn,
  forgetHarnessSession,
  isLiveHarness,
  probeHarnessAvailability,
  refreshHarnessCatalogs,
  registerBuiltinHarnesses,
  respondHarnessApproval,
  respondHarnessQuestion,
  keepHarnessQuestionOpen,
  startHarnessBridge,
  stopStreaming,
  pickTextHarness,
  type ApprovalDecision,
  type UserQuestionReply,
} from "./lib/harness";
import { getAndClearSessionLiveText } from "./lib/chatStore";
import {
  buildDeterministicHandoff,
  completeHandoff,
  isPreparingHandoff,
  sessionChildHarnesses,
} from "./lib/handoff";
import { notifyReviewChanged } from "./lib/checkpoint";
import { nudgeWatchedFiles } from "./lib/fileWatch";
import { type EditorNavigationTarget } from "./lib/search";
import {
  mergeModelSettings,
  resolveModel,
  saveLastModelSettings,
} from "./lib/models";
import { planTitle } from "./lib/plan";
import { projectName } from "./lib/paths";
import {
  lastProjectPath,
  loadRecents,
  looksLikeProject,
  normalizeProjectPath,
  projectRailItems,
  rememberProject,
  sameProjectPath,
} from "./lib/recents";
import {
  filterTabsForProject,
  planWorkspaceTabClose,
  workspaceTabCwd,
  focusedWorkspaceTabCwd,
} from "./lib/workspaceTabGroups";
import { DEFAULT_PROVIDER_ACCOUNT_ID } from "./lib/providerAccounts";
import {
  supportsHarnessLogin,
  latestTurnNeedsHarnessLogin,
} from "./lib/harness/auth";
import {
  formatSessionTitle,
  sessionNeedsInput,
  newDefaultSession,
  sessionWorkCwd,
  type HarnessId,
  type PlanBuildTarget,
  type Session,
} from "./lib/session";

import {
  getSession,
  persistFingerprint,
  replaceInFlightSessions,
  saveWorkspaceSnapshot,
  upsertSession,
  type SessionSummary,
} from "./lib/sessionStore";
import { syncDockBadge } from "./lib/dockBadge";
import { liveAgentsFromSessions } from "./lib/liveAgents";
import { hiddenApprovalNotices } from "./lib/approvalToast";
import { useSessionReminders } from "./hooks/useSessionReminders";
import { ReminderNotices } from "./chrome/ReminderNotices";
import { nextUnseenFinishedSessions } from "./lib/sessionDone";
import {
  loadNotificationsEnabled,
  probeNotificationPermission,
  setWindowFocused,
} from "./lib/notifications";
import { useInputNotifications } from "./hooks/useInputNotifications";
import { archiveFocusedSession } from "./lib/archiveShortcut";
import {
  adjacentItemId,
  deferUnhandledEscape,
  focusedBusyAgentSessionId,
  shouldStopFocusedTurnOnEscape,
} from "./lib/tabKeys";
import {
  canTabVisitBack,
  canTabVisitForward,
  emptyTabVisitHistory,
  pruneTabVisitHistory,
  recordTabVisit,
  type TabVisitHistory,
} from "./lib/tabVisitHistory";
import { warmNativeSkills } from "./lib/skills";
import { nativeSkillContextForSession } from "./lib/sessionSkills";
import {
  loadSessionFolders,
  placeSessionInFolder,
  saveSessionFolders,
  type SessionFolderTarget,
} from "./lib/sessionFolders";
import {
  ADD_NOTE_TO_CHAT_EVENT,
  type NoteComposerCard,
} from "./lib/notes";
import { PaneTree } from "./surfaces/PaneTree";
import { ProjectTerminalDock } from "./surfaces/ProjectTerminalDock";
import { SearchView } from "./surfaces/SearchView";
import { SettingsView } from "./surfaces/SettingsView";
import { NotesView } from "./surfaces/NotesView";
import {
  loadLiveAgentsEnabled,
  loadNotesEnabled,
  loadSettingsSection,
  saveSettingsSection,
  subscribeLiveAgentsEnabled,
  subscribeNotesEnabled,
  type SettingsSectionId,
} from "./lib/settings";
import { openFindInActiveEditor } from "./surfaces/editorSearch";

import {
  historyWithLiveSessions,
  summaryFromSession,
} from "./lib/sessionHistory";
import {
  CONTINUE_PROMPT,
  canAutoContinue,
  inFlightRefs,
  inFlightSnapshotKey,
  shouldWriteInFlightSnapshot,
} from "./lib/inFlight";
import {
  isBlankSession,
  reconcileProjectReturn,
  type ProjectReturnMemory,
} from "./lib/projectReturn";
import {
  collectWorkspaceSnapshot,
  workspaceSnapshotKey,
} from "./lib/workspaceSnapshot";
import type { InstalledUpdate } from "./lib/updateNotice";
import {
  bindResumedSessions,
  closeBusyWindow,
  hasInFlightSessions,
  hideCurrentWindow,
  closeCurrentWindow,
  isAppQuitting,
  persistLiveTranscripts,
  persistQuitState,
  reapWindowRuntime,
  setQuitWorkspace,
  type ResumedWorkspace,
} from "./lib/appLifecycle";

import {
  openSessionIds,
  providerSignInRequestKey,
  selectedChangeKind,
  selectedChangePath,
  selectedCommitSha,
  titleTabsEqual,
  toTitleTab,
} from "./lib/appTabs";
import {
  nudgeWorkspace,
  sameSettings,
  setsEqual,
} from "./lib/appSession";

// Register capabilities before composer hooks choose their discovery strategy.
registerBuiltinHarnesses();

export default function App({
  windowTransfer = null,
  resumed = null,
  installedUpdate = null,
  history: bootHistory = [],
  historyCwd: bootHistoryCwd = null,
}: {
  windowTransfer?: WindowTransferPayload | null;
  resumed?: ResumedWorkspace | null;
  installedUpdate?: InstalledUpdate | null;
  history?: SessionSummary[];
  historyCwd?: string | null;
}) {
  const [projectCwd, setProjectCwd] = useState(
    () =>
      windowTransfer?.projectCwd ??
      resumed?.projectCwd ??
      lastProjectPath() ??
      "~",
  );
  const [recents, setRecents] = useState(() =>
    resumed?.projectCwd && looksLikeProject(resumed.projectCwd)
      ? rememberProject(resumed.projectCwd)
      : loadRecents(),
  );
  const [seed] = useState(() => {
    const cwd = lastProjectPath() ?? "~";
    const session = newDefaultSession(cwd);
    const tab = newTab(session.id);
    return { session, tab };
  });
  const [sessions, setSessions] = useState<Session[]>(
    () => windowTransfer?.sessions ?? resumed?.sessions ?? [seed.session],
  );
  const [tabs, setTabs] = useState<WorkspaceTab[]>(
    () => windowTransfer?.tabs ?? resumed?.tabs ?? [seed.tab],
  );
  const [projectTerminals, setProjectTerminals] = useState<ProjectTerminal[]>(
    () =>
      windowTransfer?.projectTerminals ??
      (resumed?.projectTerminals ?? []).map((dock) => ({
        ...dock,
        open: false,
      })),
  );
  const [projectTerminalFocused, setProjectTerminalFocused] = useState(false);
  const [activeTabId, setActiveTabId] = useState(
    () => windowTransfer?.activeTabId ?? resumed?.activeTabId ?? seed.tab.id,
  );
  const [composerFocused, setComposerFocused] = useState(() => {
    if (windowTransfer) return true;
    if (!resumed) return false;
    const tab =
      resumed.tabs.find((entry) => entry.id === resumed.activeTabId) ??
      resumed.tabs[0];
    return (
      !!tab && resumed.sessions.some((session) => session.id === tab.focusedId)
    );
  });
  /** Tab id -> project name, kept in sync with the rendered title tabs. */
  const tabProjectsRef = useRef(new Map<string, string>());
  const { projectOfTab } = useProjectOfTab({ tabProjectsRef });
  const [projectRailOpen, setProjectRailOpen] = useState(loadProjectRailOpen);
  const tabCloseScope = "project" as const;
  const currentProjectDock = findProjectTerminal(projectTerminals, projectCwd);
  const dockVisible = !!currentProjectDock?.open;
  const [sidebarTab, setSidebarTab] = useState<SidebarTabId>(
    () => loadSidebarTabOrder()[0] ?? "sessions",
  );
  const [filesSearchOpen, setFilesSearchOpen] = useState(false);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [searchViewOpen, setSearchViewOpen] = useState(false);
  const [searchViewFocusToken, setSearchViewFocusToken] = useState(0);

  const [notesViewOpen, setNotesViewOpen] = useState(false);
  const notesEnabled = useSyncExternalStore(
    subscribeNotesEnabled,
    loadNotesEnabled,
    () => true,
  );
  const liveAgentsEnabled = useSyncExternalStore(
    subscribeLiveAgentsEnabled,
    loadLiveAgentsEnabled,
    () => true,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateNotice, setUpdateNotice] = useState(installedUpdate);
  const [whatsNewVersion, setWhatsNewVersion] = useState<string | null>(null);
  const [providerSignInRequest, setProviderSignInRequest] = useState<{
    key: string;
    sessionId: string;
    harness: HarnessId;
  } | null>(null);
  const seenProviderSignInRequestsRef = useRef<Set<string> | null>(null);
  const seenProviderSignInRequests =
    seenProviderSignInRequestsRef.current ??
    (seenProviderSignInRequestsRef.current = new Set(
      sessions.flatMap((session) => {
        if (
          !supportsHarnessLogin(session.harness) ||
          !latestTurnNeedsHarnessLogin(session.blocks)
        ) {
          return [];
        }
        return [providerSignInRequestKey(session)];
      }),
    ));
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>(loadSettingsSection);
  const [editorNavigation, setEditorNavigation] =
    useState<EditorNavigationTarget | null>(null);
  const editorNavigationToken = useRef(0);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(
    () => new Set(windowTransfer?.dirtyFileIds ?? []),
  );
  // Not carried across a window transfer the way dirty state is: the editor
  // re-lints whatever it mounts, so the counts rebuild themselves.
  const [fileErrorCounts, setFileErrorCounts] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [history, setHistory] = useState<SessionSummary[]>(() => bootHistory);
  /**
   * Projects whose rows are already in `history`. This has to be state, not a
   * ref: `sidebarCwd` is derived during render, so the frame that first shows
   * a new project must already know the listing has not arrived yet.
   */
  const [loadedProjects, setLoadedProjects] = useState<ReadonlySet<string>>(
    () =>
      bootHistoryCwd
        ? new Set([normalizeProjectPath(bootHistoryCwd)])
        : new Set(),
  );
  const loadedProjectsRef = useRef(loadedProjects);
  loadedProjectsRef.current = loadedProjects;
  /** Project whose listing failed, so the error cannot leak to another one. */
  const [historyErrorCwd, setHistoryErrorCwd] = useState<string | null>(null);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const queueDispatchingRef = useRef(new Set<string>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const dirtyFilesRef = useRef(dirtyFiles);
  dirtyFilesRef.current = dirtyFiles;
  const projectTerminalsRef = useRef(projectTerminals);
  projectTerminalsRef.current = projectTerminals;
  const projectTerminalFocusedRef = useRef(projectTerminalFocused);
  projectTerminalFocusedRef.current = projectTerminalFocused;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const projectCwdRef = useRef(projectCwd);
  projectCwdRef.current = projectCwd;
  const searchViewOpenRef = useRef(searchViewOpen);
  searchViewOpenRef.current = searchViewOpen;

  const notesViewOpenRef = useRef(notesViewOpen);
  notesViewOpenRef.current = notesViewOpen;
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;
  const sessionNavigationIdsRef = useRef<readonly string[]>([]);
  const filePickerOpenRef = useRef(filePickerOpen);
  filePickerOpenRef.current = filePickerOpen;
  const whatsNewVersionRef = useRef(whatsNewVersion);
  whatsNewVersionRef.current = whatsNewVersion;

  useEffect(() => {
    if (!notesEnabled) setNotesViewOpen(false);
  }, [notesEnabled]);

  const projectReturnRef = useRef<ProjectReturnMemory>(
    resumed?.projectReturnMemory ?? new Map(),
  );
  const readProjectReturnMemory = useCallback(() => {
    projectReturnRef.current = reconcileProjectReturn({
      memory: projectReturnRef.current,
      tabs: tabsRef.current,
      sessions: sessionsRef.current,
      activeTabId: activeTabIdRef.current,
    });
    return projectReturnRef.current;
  }, []);
  useEffect(() => {
    readProjectReturnMemory();
  }, [activeTabId, tabs, sessions, readProjectReturnMemory]);

  const tabVisitRef = useRef(emptyTabVisitHistory(activeTabId));
  const tabVisitFromHistoryRef = useRef(false);
  const [tabVisitNav, setTabVisitNav] = useState({
    canBack: false,
    canForward: false,
  });
  const turnGen = useRef(new Map<string, number>());
  const lastPersisted = useRef(new Map<string, string>());
  const lastBoundProvider = useRef(new Map<string, string>());
  const lastPersistedUserBlock = useRef(new Map<string, string>());
  const inFlightSyncKey = useRef<string | null>(null);
  const sawInFlight = useRef(false);
  const workspaceSyncKey = useRef<string | null>(null);
  const observedSessions = useRef(new Map<string, Session>());
  const pendingPersist = useRef(new Map<string, Session>());
  const removingSessionIds = useRef(new Set<string>());
  // Tokens arrive many times per frame; apply them once so React/markdown aren't
  // recomputed for every delta.
  const { enqueueHarnessEvent, flushHarnessEvents } = useHarnessEventQueue({
    sessionsRef,
    setSessions,
  });
  const skipForgetSessionIds = useRef(new Set<string>());
  const importedSessionsApplied = useRef(false);

  const stopSessionForRemoval = useCallback(
    async (sessionId: string): Promise<Session | undefined> => {
      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!open?.busy) return open;

      turnGen.current.set(sessionId, (turnGen.current.get(sessionId) ?? 0) + 1);
      flushHarnessEvents();
      await Promise.all(
        sessionChildHarnesses(open).map((harness) =>
          cancelHarnessTurn(harness, sessionId).catch(() => undefined),
        ),
      );
      flushHarnessEvents();
      return sessionsRef.current.find((session) => session.id === sessionId);
    },
    [flushHarnessEvents],
  );

  const { flushSessionLiveText } = useSessionStreaming({
    getAndClearSessionLiveText,
  });

  useEffect(() => {
    if (resumed?.sessions.length) bindResumedSessions(resumed.sessions);
    const stopBridge = startHarnessBridge();
    const reap = () => {
      if (isAppQuitting()) return;
      void persistQuitState(
        sessionsRef.current,
        tabsRef.current,
        activeTabIdRef.current,
        projectCwdRef.current,
        readProjectReturnMemory(),
        "unload",
        projectTerminalsRef.current,
      ).finally(() => {
        void reapWindowRuntime(
          sessionsRef.current,
          tabsRef.current,
          projectTerminalsRef.current,
        );
      });
    };
    window.addEventListener("pagehide", reap);
    window.addEventListener("beforeunload", reap);
    return () => {
      window.removeEventListener("pagehide", reap);
      window.removeEventListener("beforeunload", reap);
      stopBridge();
    };
  }, [resumed, readProjectReturnMemory]);

  useEffect(() => {
    void probeHarnessAvailability();
    // Only the harnesses already in this window. Probing every installed CLI
    // at boot left unused agents (especially Pi) running in the background.
    const harnesses = [
      ...new Set(sessionsRef.current.map((session) => session.harness)),
    ];
    void refreshHarnessCatalogs(harnesses).then(() => {
      setSessions((prev) =>
        prev.map((session) => {
          if (!isLiveHarness(session.harness)) return session;
          const resolved = resolveModel(session.harness, session.model);
          const modelSettings = mergeModelSettings(
            resolved,
            session.modelSettings,
          );
          if (
            resolved.id === session.model &&
            sameSettings(modelSettings, session.modelSettings)
          ) {
            return session;
          }
          return { ...session, model: resolved.id, modelSettings };
        }),
      );
    });
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const active =
    sessions.find((session) => session.id === activeTab?.focusedId) ??
    sessions.find(
      (session) => activeTab && leafIds(activeTab.layout).includes(session.id),
    );
  const sessionDefaults = active ?? sessions[0];
  const activeSkillContext = active
    ? nativeSkillContextForSession(active)
    : null;
  const activeSkillCwd = activeSkillContext?.cwd;

  useEffect(() => {
    if (!activeSkillContext || !activeSkillCwd) return;
    warmNativeSkills(activeSkillContext);
  }, [activeSkillCwd, active?.id, active?.harness]);

  const sidebarCwd =
    active?.cwd ??
    (activeTab ? focusedFileTab(activeTab)?.cwd : undefined) ??
    projectCwd;
  const sidebarCwdRef = useRef(sidebarCwd);
  sidebarCwdRef.current = sidebarCwd;
  const sidebarCwdKey =
    sidebarCwd && sidebarCwd !== "~" ? normalizeProjectPath(sidebarCwd) : null;
  const historyFailed =
    sidebarCwdKey != null && historyErrorCwd === sidebarCwdKey;
  // True from the very first frame that shows a project we have never listed,
  // so the sidebar can stay blank instead of flashing "No sessions yet".
  const historyPending =
    sidebarCwdKey != null &&
    !loadedProjects.has(sidebarCwdKey) &&
    !historyFailed;
  const gitCwd = active ? sessionWorkCwd(active) : sidebarCwd;
  const gitCwdRef = useRef(gitCwd);
  gitCwdRef.current = gitCwd;
  const projectBranches = useProjectBranches(
    sidebarCwd,
    Boolean(sidebarCwd) && sidebarCwd !== "~",
  );

  const nextBusySessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (session.busy) ids.add(session.id);
    }
    return ids;
  }, [sessions]);
  const busySessionIdsRef = useRef(nextBusySessionIds);
  if (!setsEqual(busySessionIdsRef.current, nextBusySessionIds)) {
    busySessionIdsRef.current = nextBusySessionIds;
  }
  const busySessionIds = busySessionIdsRef.current;

  const currentHarness = active?.harness ?? sessionDefaults?.harness;
  const usageProviders = useMemo(() => {
    if (
      currentHarness === "claude" ||
      currentHarness === "codex" ||
      currentHarness === "opencode" ||
      currentHarness === "antigravity"
    ) {
      return [currentHarness];
    }
    return [];
  }, [currentHarness]);
  const usageSession = useMemo(() => {
    const s = active ?? sessionDefaults;
    if (!s) return undefined;
    return {
      id: "id" in s ? s.id : undefined,
      harness: s.harness,
      model: s.model,
      authRequired: active ? latestTurnNeedsHarnessLogin(active.blocks) : false,
      providerAccountId:
        active?.providerAccountId ??
        (active?.blocks.some((block) => block.role === "user")
          ? DEFAULT_PROVIDER_ACCOUNT_ID
          : undefined),
    };
  }, [
    active?.id,
    active?.harness,
    active?.model,
    active?.blocks,
    active?.providerAccountId,
    sessionDefaults?.harness,
    sessionDefaults?.model,
  ]);
  const activeProviderSignInRequest = useMemo(() => {
    if (
      !active ||
      !supportsHarnessLogin(active.harness) ||
      !latestTurnNeedsHarnessLogin(active.blocks)
    ) {
      return null;
    }
    return {
      key: providerSignInRequestKey(active),
      sessionId: active.id,
      harness: active.harness,
    };
  }, [active]);
  useEffect(() => {
    if (!activeProviderSignInRequest) return;
    if (seenProviderSignInRequests.has(activeProviderSignInRequest.key)) {
      return;
    }
    seenProviderSignInRequests.add(activeProviderSignInRequest.key);
    setProviderSignInRequest(activeProviderSignInRequest);
  }, [activeProviderSignInRequest, seenProviderSignInRequests]);
  useEffect(() => {
    if (
      providerSignInRequest &&
      active?.id !== providerSignInRequest.sessionId
    ) {
      setProviderSignInRequest(null);
    }
  }, [active?.id, providerSignInRequest]);
  const runningTerminals = useMemo(() => {
    const files: FilePaneTab[] = [];
    const dock = findProjectTerminal(projectTerminals, projectCwd);
    if (dock) files.push(...dock.pane.files);
    for (const tab of tabs) {
      for (const pane of tab.terminalPanes ?? []) {
        files.push(...pane.files);
      }
    }
    return listRunningTerminals(files);
  }, [projectCwd, projectTerminals, tabs]);
  const runningTerminalOpen = useMemo(() => {
    const ids = new Set(runningTerminals.map((terminal) => terminal.id));
    if (
      currentProjectDock?.open &&
      currentProjectDock.pane.files.some((file) => ids.has(file.id))
    ) {
      return true;
    }
    const focused = activeTab ? focusedFileTab(activeTab) : undefined;
    return !!focused && ids.has(focused.id);
  }, [activeTab, currentProjectDock, runningTerminals]);

  const nextApprovalSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (sessionNeedsInput(session)) ids.add(session.id);
    }
    return ids;
  }, [sessions]);
  const approvalSessionIdsRef = useRef(nextApprovalSessionIds);
  if (!setsEqual(approvalSessionIdsRef.current, nextApprovalSessionIds)) {
    approvalSessionIdsRef.current = nextApprovalSessionIds;
  }
  const approvalSessionIds = approvalSessionIdsRef.current;

  const activeSessionId = active?.id;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  useInputNotifications(sessions, activeSessionId);

  // Cache the OS decision so a turn ending later can skip a denied banner.
  useEffect(() => {
    if (loadNotificationsEnabled()) void probeNotificationPermission();
  }, []);
  const busyForDoneRef = useRef(busySessionIds);
  const focusedForDoneRef = useRef(activeSessionId);
  const unseenFinishedRef = useRef<Set<string>>(new Set());
  if (
    busyForDoneRef.current !== busySessionIds ||
    focusedForDoneRef.current !== activeSessionId
  ) {
    unseenFinishedRef.current = nextUnseenFinishedSessions({
      previousBusyIds: busyForDoneRef.current,
      busyIds: busySessionIds,
      previousUnseenIds: unseenFinishedRef.current,
      focusedSessionId: activeSessionId,
    });
    busyForDoneRef.current = busySessionIds;
    focusedForDoneRef.current = activeSessionId;
  }
  const unseenFinishedIds = unseenFinishedRef.current;

  const liveAgents = useMemo(
    () =>
      liveAgentsEnabled
        ? liveAgentsFromSessions(sessions, unseenFinishedIds)
        : [],
    [liveAgentsEnabled, sessions, unseenFinishedIds],
  );

  const hiddenApprovalToasts = useMemo(
    () => hiddenApprovalNotices(sessions, activeTabId, tabs, composerFocused),
    [sessions, activeTabId, tabs, composerFocused],
  );
  const [reminderNoticesHeight, setReminderNoticesHeight] = useState(0);

  useEffect(() => {
    syncDockBadge(sessions);
  }, [sessions]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        setWindowFocused(focused);
        if (focused) {
          flushHarnessEvents();
          syncDockBadge(sessionsRef.current);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [flushHarnessEvents]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) flushHarnessEvents();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [flushHarnessEvents]);

  useEffect(() => {
    let unlistenClose: (() => void) | undefined;
    const releaseQuit = setQuitWorkspace(
      () => sessionsRef.current,
      () => tabsRef.current,
      () => activeTabIdRef.current,
      () => projectCwdRef.current,
      () => projectTerminalsRef.current,
      readProjectReturnMemory,
      flushHarnessEvents,
    );
    void getCurrentWindow()
      .onCloseRequested((event) => {
        // Listening here makes close our job. Letting the default path run
        // calls JS `window.destroy`, which Tauri denies without a permission.
        event.preventDefault();
        if (hasInFlightSessions(sessionsRef.current)) {
          flushHarnessEvents();
          if (!IS_MAC) {
            void closeBusyWindow();
            return;
          }
          void persistLiveTranscripts(sessionsRef.current);
          void hideCurrentWindow();
          return;
        }
        void persistQuitState(
          sessionsRef.current,
          tabsRef.current,
          activeTabIdRef.current,
          projectCwdRef.current,
          readProjectReturnMemory(),
          "unload",
          projectTerminalsRef.current,
        ).finally(() => {
          void closeCurrentWindow();
        });
      })
      .then((fn) => {
        unlistenClose = fn;
      });
    return () => {
      releaseQuit();
      unlistenClose?.();
    };
  }, [flushHarnessEvents, readProjectReturnMemory]);

  const { refreshHistory, persistSession } = useSessionPersistence({
    importedSessionsApplied,
    lastBoundProvider,
    lastPersisted,
    lastPersistedUserBlock,
    loadedProjectsRef,
    observedSessions,
    pendingPersist,
    removingSessionIds,
    resumed,
    setHistory,
    setHistoryErrorCwd,
    setLoadedProjects,
    sessions,
    sidebarCwd,
    sidebarCwdRef,
    tabsRef,
    windowTransfer,
  });

  useEffect(() => {
    prefetchProjectFiles(sidebarCwd);
  }, [sidebarCwd]);

  useEffect(() => {
    const refs = inFlightRefs(sessions, tabs);
    if (refs.length > 0) sawInFlight.current = true;
    const key = inFlightSnapshotKey(refs);
    if (
      !shouldWriteInFlightSnapshot(
        key,
        refs,
        inFlightSyncKey.current,
        sawInFlight.current,
      )
    ) {
      return;
    }
    inFlightSyncKey.current = key;
    void replaceInFlightSessions(refs).catch(() => undefined);
  }, [sessions, tabs]);

  useEffect(() => {
    if (windowTransfer) return;
    const snapshot = collectWorkspaceSnapshot(
      tabs,
      sessions,
      activeTabId,
      projectCwd,
      reconcileProjectReturn({
        memory: projectReturnRef.current,
        tabs,
        sessions,
        activeTabId,
      }),
      projectTerminals,
    );
    const key = workspaceSnapshotKey(snapshot);
    if (workspaceSyncKey.current === key) return;
    workspaceSyncKey.current = key;
    const timer = window.setTimeout(() => {
      void saveWorkspaceSnapshot(snapshot).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    tabs,
    sessions,
    activeTabId,
    projectCwd,
    projectTerminals,
    windowTransfer,
  ]);

  useEffect(() => {
    if (lastProjectPath()) return;
    void invoke<string>("default_cwd")
      .then((cwd) => {
        if (!looksLikeProject(cwd)) return;
        setProjectCwd(cwd);
        setRecents((prev) => (prev.length > 0 ? prev : rememberProject(cwd)));
        setSessions((prev) =>
          prev.map((s) => (s.cwd === "~" ? { ...s, cwd } : s)),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        const isolated = isolateTerminalPanes(tab);
        if (isolated !== tab) changed = true;
        return isolated;
      });
      return changed ? next : prev;
    });
  }, [tabs]);

  // Tabs are views. Hidden idle sessions drop their child. A visible session
  // keeps its child for a few minutes after a turn so follow-ups stay instant,
  // then parks it and resumes on the next prompt.
  useEffect(() => {
    const visibleIds = openSessionIds(tabs);

    const keepUnseen = liveAgentsEnabled;
    const idleDetached = sessions.filter(
      (session) =>
        !visibleIds.has(session.id) &&
        !session.busy &&
        !(keepUnseen && unseenFinishedRef.current.has(session.id)),
    );
    if (idleDetached.length === 0) return;
    for (const session of idleDetached) {
      if (skipForgetSessionIds.current.has(session.id)) continue;
      persistSession(session);
      for (const harness of sessionChildHarnesses(session)) {
        void forgetHarnessSession(harness, session.id);
      }
    }
    setSessions((prev) =>
      prev.filter(
        (session) =>
          visibleIds.has(session.id) ||
          session.busy ||
          (keepUnseen && unseenFinishedRef.current.has(session.id)) ||
          skipForgetSessionIds.current.has(session.id),
      ),
    );
  }, [sessions, tabs, persistSession, liveAgentsEnabled]);

  const activateTab = useCallback((id: string, paneId?: string) => {
    const tab = tabsRef.current.find((entry) => entry.id === id);
    const nextFocusedId =
      tab && paneId &&
      (leafIds(tab.layout).includes(paneId) ||
        tab.editorPanes.some((entry) => entry.id === paneId) ||
        (tab.terminalPanes ?? []).some((entry) => entry.id === paneId))
        ? paneId
        : tab?.focusedId;

    setActiveTabId(id);
    if (tab && nextFocusedId && nextFocusedId !== tab.focusedId) {
      setTabs((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? { ...entry, focusedId: nextFocusedId, diffFocused: false }
            : entry,
        ),
      );
    }

    if (tab) {
      const focusedTab = nextFocusedId
        ? { ...tab, focusedId: nextFocusedId }
        : tab;
      const cwd = focusedWorkspaceTabCwd(focusedTab, sessionsRef.current);
      if (cwd && looksLikeProject(cwd)) {
        const normalized = normalizeProjectPath(cwd);
        if (!sameProjectPath(normalized, projectCwdRef.current)) {
          setProjectCwd(normalized);
          setRecents(rememberProject(normalized));
        }
      }
    }
    setComposerFocused(
      !!nextFocusedId &&
        sessionsRef.current.some((session) => session.id === nextFocusedId),
    );
  }, []);

  const commitTabVisit = useCallback((history: TabVisitHistory) => {
    tabVisitRef.current = history;
    const canBack = canTabVisitBack(history);
    const canForward = canTabVisitForward(history);
    setTabVisitNav((prev) =>
      prev.canBack === canBack && prev.canForward === canForward
        ? prev
        : { canBack, canForward },
    );
  }, []);

  useEffect(() => {
    const openIds = new Set(tabs.map((tab) => tab.id));
    let next = pruneTabVisitHistory(tabVisitRef.current, openIds, activeTabId);
    if (tabVisitFromHistoryRef.current) {
      tabVisitFromHistoryRef.current = false;
    } else if (next.current !== activeTabId) {
      next = recordTabVisit(next, activeTabId);
    }
    commitTabVisit(pruneTabVisitHistory(next, openIds, activeTabId));
  }, [activeTabId, commitTabVisit, tabs]);

  const { appendTab, onSelectProviderAccount } = useTabIteration({
    active,
    activeTabIdRef,
    projectOfTab,
    setActiveTabId,
    setComposerFocused,
    setSessions,
    setTabs,
  });

  const onOpenWhatsNew = useCallback((version: string) => {
    const document = releaseNotesForVersion(version);
    if (!document) {
      void message(
        "Release notes for this version are not available in this build.",
        { title: "MonoCode" },
      );
      return;
    }
    setWhatsNewVersion(document.source.version);
  }, []);

  const onAddNoteToChat = useCallback(
    (card: NoteComposerCard) => {
      if (!card.id) return;
      setSearchViewOpen(false);
      setNotesViewOpen(false);
      setSidebarTab("sessions");
      const cwd =
        (card.sourceCwd && looksLikeProject(card.sourceCwd)
          ? card.sourceCwd
          : undefined) ||
        active?.cwd ||
        sessionDefaults?.cwd ||
        projectCwd;
      const title = card.title.trim();
      const session = {
        ...newDefaultSession(cwd, sessionDefaults?.runtimeMode),
        ...(title ? { title } : {}),
        noteCard: card,
      };
      const tab = newTab(session.id);
      setSessions((prev) => [...prev, session]);
      appendTab(tab, cwd);
      setActiveTabId(tab.id);
      setComposerFocused(true);
    },
    [
      active?.cwd,
      appendTab,
      sessionDefaults?.cwd,
      sessionDefaults?.runtimeMode,
      projectCwd,
    ],
  );

  useEffect(() => {
    const onAdd = (event: Event) => {
      const card = (event as CustomEvent<NoteComposerCard>).detail;
      if (!card?.id) return;
      onAddNoteToChat(card);
    };
    window.addEventListener(ADD_NOTE_TO_CHAT_EVENT, onAdd);
    return () => window.removeEventListener(ADD_NOTE_TO_CHAT_EVENT, onAdd);
  }, [onAddNoteToChat]);

  const onNoteCardDismiss = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId && session.noteCard
          ? { ...session, noteCard: undefined }
          : session,
      ),
    );
  }, []);

  const onHandoffCardDismiss = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId && session.handoffCard
          ? { ...session, handoffCard: undefined }
          : session,
      ),
    );
  }, []);

  const projectTerminal = useProjectTerminal({
    active,
    activeTab,
    projectCwd,
    projectCwdRef,
    projectTerminalsRef,
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    lastPersisted,
    setProjectTerminals,
    setProjectTerminalFocused,
    setComposerFocused,
    setActiveTabId,
    setTabs,
    setSessions,
    appendTab,
    looksLikeProject,
  });

  const {
    onCloseTab,
    onCloseTabs,
    onCloseFile,
    onCloseOtherFiles,
    onClearTabSession,
  } = useTabClose({
    activeTabId,
    activeTabIdRef,
    activateTab,
    dirtyFilesRef,
    persistSession,
    projectCwd,
    refreshHistory,
    sessionsRef,
    setComposerFocused,
    setDirtyFiles,
    setSessions,
    setTabs,
    sidebarCwd,
    tabCloseScope,
    tabs,
    tabsRef,
  });

  const {
    onSplit,
    onCloseOtherTabs,
    onClosePane,
    onFocusPane,
  } = usePaneManagement({
    activeTab,
    activeTabId,
    activeTabIdRef,
    tabsRef,
    sessionsRef,
    projectCwd,
    sidebarCwd,
    tabCloseScope,
    sessionDefaults,
    setTabs,
    setSessions,
    setComposerFocused,
    setProjectTerminalFocused,
    onCloseTab,
    onCloseTabs,
    onCloseFile,
    onClearTabSession,
    persistSession,
    refreshHistory,
  });

  const onCloseTitleTab = useCallback(
    (id: string) => {
      const closePlan = planWorkspaceTabClose({
        tabs: tabsRef.current,
        sessions: sessionsRef.current,
        closingTabId: id,
        scope: tabCloseScope,
      });
      if (closePlan.action === "keep" && id === activeTabIdRef.current) {
        onClosePane();
        return;
      }
      onCloseTab(id);
    },
    [onClosePane, onCloseTab, tabCloseScope],
  );

  const deckProjectTabs = useMemo(() => {
    // A projectless session belongs to no project, so it stands on its own
    // rather than trailing the last project's tabs.
    const active = tabs.find((tab) => tab.id === activeTabId);
    if (active && !workspaceTabCwd(active, sessions)) return [active];
    return filterTabsForProject(tabs, sessions, projectCwd);
  }, [activeTabId, tabs, sessions, projectCwd]);

  const {
    onNext,
    onPrev,
    onVisitBack,
    onVisitForward,
    onOpenDiff,
    onReorderTabs,
    onMovePane,
  } = useTabLayout({
    deckProjectTabs,
    activeTabId,
    activeTabIdRef,
    tabsRef,
    tabVisitRef,
    tabVisitFromHistoryRef,
    gitCwdRef,
    sidebarCwdRef,
    activateTab,
    commitTabVisit,
    projectOfTab,
    setTabs,
    setSidebarTab,
    setComposerFocused,
  });

  const onActivate = useCallback(
    (slot: number) => {
      const tab =
        slot < 0
          ? deckProjectTabs[deckProjectTabs.length - 1]
          : deckProjectTabs[slot];
      if (tab) activateTab(tab.id);
    },
    [activateTab, deckProjectTabs],
  );

  const onOpenWorkingTreeDiff = useCallback(
    (path: string, kind?: GitFileDiffKind) => onOpenDiff(path, undefined, kind),
    [onOpenDiff],
  );

  /** Stack every working-tree change in one review, whatever the diff-view setting. */
  const onOpenAllChanges = useCallback(() => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId
          ? openChangesTab(tab, sidebarCwdRef.current)
          : tab,
      ),
    );
    setComposerFocused(false);
  }, [activeTabId]);

  const onOpenCommit = useCallback(
    (commit: GitHistoryCommit) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId
            ? openCommitTab(tab, sidebarCwdRef.current, {
                sha: commit.sha,
                shortSha: commit.shortSha,
                subject: commit.subject,
              })
            : tab,
        ),
      );
      setComposerFocused(false);
    },
    [activeTabId],
  );

  const onShowSourceControl = useCallback(() => {
    setSidebarTab("changes");
  }, []);

  const onToggleChanges = useCallback(() => {
    onShowSourceControl();
  }, [onShowSourceControl]);

  const onReorderFiles = useCallback((paneId: string, ids: string[]) => {
    setTabs((prev) =>
      prev.map((tab) => {
        const found = findSurfacePane(tab, paneId);
        if (!found) return tab;
        return withSurfacePanes(
          tab,
          found.kind,
          surfacePanes(tab, found.kind).map((pane) =>
            pane.id === paneId
              ? { ...pane, files: orderByIds(pane.files, ids) }
              : pane,
          ),
        );
      }),
    );
  }, []);

  const focusOpenSession = useCallback((sessionId: string) => {
    const tab = tabsRef.current.find((entry) =>
      leafIds(entry.layout).includes(sessionId),
    );
    if (!tab) return false;
    setActiveTabId(tab.id);
    setTabs((prev) =>
      prev.map((entry) =>
        entry.id === tab.id ? { ...entry, focusedId: sessionId } : entry,
      ),
    );
    setComposerFocused(true);
    return true;
  }, []);

  const replaceBlankPaneWithSession = useCallback((session: Session) => {
    const tab =
      tabsRef.current.find((entry) => entry.id === activeTabIdRef.current) ??
      tabsRef.current[0];
    if (!tab) return false;

    const paneId = isBlankSession(
      sessionsRef.current.find((entry) => entry.id === tab.focusedId),
    )
      ? tab.focusedId
      : leafIds(tab.layout).find((id) =>
          isBlankSession(sessionsRef.current.find((entry) => entry.id === id)),
        );
    if (!paneId || paneId === session.id) return false;

    lastPersisted.current.delete(paneId);
    {
      const blank = sessionsRef.current.find((entry) => entry.id === paneId);
      if (blank) void forgetHarnessSession(blank.harness, paneId);
    }
    setSessions((prev) => {
      const next = prev.filter((entry) => entry.id !== paneId);
      return next.some((entry) => entry.id === session.id)
        ? next
        : [...next, session];
    });
    setTabs((prev) =>
      prev.map((entry) =>
        entry.id === tab.id
          ? {
              ...entry,
              layout: replaceLeafId(entry.layout, paneId, session.id),
              focusedId: session.id,
            }
          : entry,
      ),
    );
    setActiveTabId(tab.id);
    setComposerFocused(true);
    return true;
  }, []);

  const {
    onNew,
    ensureOpenSession,
    onSelectHistorySession,
    onRemoveHistorySession,
    onArchiveHistorySession,
    onPinHistorySession,
  } = useSessionLifecycle({
    active,
    sessionDefaults,
    projectCwd,
    sidebarCwd,
    history,
    appendTab,
    focusOpenSession,
    replaceBlankPaneWithSession,
    refreshHistory,
    stopSessionForRemoval,
    activateTab,
    tabCloseScope,
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    dirtyFilesRef,
    lastPersisted,
    pendingPersist,
    removingSessionIds,
    setSessions,
    setTabs,
    setActiveTabId,
    setComposerFocused,
    setSearchViewOpen,
    setNotesViewOpen,
    setDirtyFiles,
    setHistory,
  });

  const openReminderSession = useCallback(
    async (sessionId: string) => {
      const session = await ensureOpenSession(sessionId);
      if (!session)
        throw new Error("This conversation is no longer available.");
      setSearchViewOpen(false);
      setNotesViewOpen(false);
      setSettingsOpen(false);
      setFilePickerOpen(false);
      setSidebarTab("sessions");
      setProjectCwd(session.cwd);
      setRecents(rememberProject(session.cwd));
      await onSelectHistorySession(sessionId);
    },
    [ensureOpenSession, onSelectHistorySession],
  );

  const ensureReminderSessionsSaved = useCallback(
    async (ids: readonly string[]) => {
      for (const id of ids) {
        const session = sessionsRef.current.find(
          (session) => session.id === id,
        );
        if (session && !(await upsertSession(session))) {
          throw new Error(
            "Send a message in this conversation before setting a reminder.",
          );
        }
      }
    },
    [],
  );

  const sessionReminders = useSessionReminders(
    openReminderSession,
    ensureReminderSessionsSaved,
    sessions.map((session) => session.id),
  );

  const { onPlaceSessionOnPane } = usePlaceSessionOnPane({
    ensureOpenSession,
    lastPersisted,
    projectCwdRef,
    sessionsRef,
    setActiveTabId,
    setComposerFocused,
    setProjectTerminalFocused,
    setSessions,
    setTabs,
    tabCloseScope,
    tabsRef,
  });

  const onRenameHistorySession = useCallback(
    async (sessionId: string, displayTitle: string) => {
      const trimmed = displayTitle.trim();
      if (!trimmed) return;

      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (open) {
        const title = formatSessionTitle(open.harness, trimmed);
        const updated = { ...open, title };
        setSessions((prev) =>
          prev.map((session) => (session.id === sessionId ? updated : session)),
        );
        persistSession(updated);
      } else {
        const restored = await getSession(sessionId).catch(() => null);
        if (!restored) {
          void refreshHistory(sidebarCwd);
          return;
        }
        const updated = {
          ...restored,
          title: formatSessionTitle(restored.harness, trimmed),
        };
        await upsertSession(updated).catch(() => undefined);
        lastPersisted.current.set(sessionId, persistFingerprint(updated));
      }
      void refreshHistory(sidebarCwd);
    },
    [persistSession, refreshHistory, sidebarCwd],
  );

  const onArchiveFocusedSession = useCallback(
    (event: KeyboardEvent) => {
      archiveFocusedSession(
        event,
        {
          activeTabId: activeTabIdRef.current,
          tabs: tabsRef.current,
          sessions: sessionsRef.current,
          projectTerminalFocused: projectTerminalFocusedRef.current,
          surfaceOpen: Boolean(
            searchViewOpenRef.current ||
            notesViewOpenRef.current ||
            settingsOpenRef.current ||
            filePickerOpenRef.current ||
            whatsNewVersionRef.current,
          ),
        },
        (sessionId) => {
          void onArchiveHistorySession(sessionId, true);
        },
      );
    },
    [onArchiveHistorySession],
  );

  const onArchiveHistorySessions = useCallback(
    async (sessionIds: readonly string[], archived: boolean) => {
      for (const sessionId of sessionIds) {
        if (!(await onArchiveHistorySession(sessionId, archived))) break;
      }
    },
    [onArchiveHistorySession],
  );

  const onPinHistorySessions = useCallback(
    async (sessionIds: readonly string[], pinned: boolean) => {
      await Promise.all(
        sessionIds.map((sessionId) => onPinHistorySession(sessionId, pinned)),
      );
    },
    [onPinHistorySession],
  );

  const onDeleteHistorySession = useCallback(
    (sessionId: string) => onRemoveHistorySession(sessionId, "delete"),
    [onRemoveHistorySession],
  );

  const onDeleteHistorySessions = useCallback(
    async (sessionIds: readonly string[]) => {
      if (sessionIds.length === 0) return;
      if (
        !window.confirm(
          `Delete ${sessionIds.length} selected conversations? This can’t be undone.`,
        )
      )
        return;
      for (const sessionId of sessionIds) {
        if (!(await onRemoveHistorySession(sessionId, "delete", true))) break;
      }
    },
    [onRemoveHistorySession],
  );

  const onFocusDir = useCallback(
    (dir: FocusDir) => {
      if (!activeTab) return;
      const next = neighborLeafId(activeTab.layout, activeTab.focusedId, dir);
      if (next) onFocusPane(next);
    },
    [activeTab, onFocusPane],
  );

  const onRatio = useCallback(
    (tabId: string, splitId: string, index: number, ratio: number) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, layout: setSplitRatio(t.layout, splitId, index, ratio) }
            : t,
        ),
      );
    },
    [],
  );

  const { onCwdChange, onSelectProject, onRemoveProject } =
    useProjectNavigation({
      activeTabId,
      activeTabIdRef,
      appendTab,
      activateTab,
      lastPersisted,
      pendingPersist,
      persistSession,
      projectCwdRef,
      projectOfTab,
      readProjectReturnMemory,
      sessionsRef,
      setActiveTabId,
      setComposerFocused,
      setDirtyFiles,
      setNotesViewOpen,
      setProjectCwd,
      setProjectTerminals,
      setRecents,
      setSearchViewOpen,
      setSessions,
      setTabs,
      tabsRef,
      turnGen,
    });

  const onBranchChange = useCallback(
    (sessionId: string) => {
      notifyGitChanged();
      const current = sessionsRef.current.find((s) => s.id === sessionId);
      if (!current || (!current.branch && !current.worktreeCwd)) return;
      if (current.worktreeCwd && current.providerSessionId) {
        void forgetHarnessSession(current.harness, sessionId);
      }
      const next = {
        ...current,
        branch: undefined,
        worktreeCwd: undefined,
        ...(current.worktreeCwd ? { providerSessionId: undefined } : {}),
      };
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? next : s)));
      persistSession(next);
      notifyReviewChanged(sessionId);
    },
    [persistSession],
  );

  const pickProject = useCallback(async () => {
    const path = await pickFolder();
    if (path) onSelectProject(path);
  }, [onSelectProject]);

  const onPlaceSessionInFolder = useCallback(
    (sessionId: string, target: SessionFolderTarget) => {
      const source = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!source || !looksLikeProject(source.cwd)) return;
      const folders = loadSessionFolders(source.cwd);
      if (
        target.kind === "existing" &&
        !folders.some((folder) => folder.id === target.folderId)
      ) {
        return;
      }
      saveSessionFolders(
        source.cwd,
        placeSessionInFolder(folders, sessionId, target),
      );
    },
    [],
  );

  const onRestoreProject = useCallback(
    (path: string) => {
      setRecents(rememberProject(path));
      onSelectProject(path);
    },
    [onSelectProject],
  );

  const { onFileMoved, onFileDeleted, onOpenFile, onFileDirtyChange } =
    useFileTracking({
      activeTabId,
      tabsRef,
      gitCwdRef,
      sidebarCwdRef,
      editorNavigationToken,
      setTabs,
      setDirtyFiles,
      setEditorNavigation,
      setComposerFocused,
    });

  const onOpenPlan = useCallback(
    (sessionId: string, blockId: string) => {
      const tab = tabsRef.current.find((entry) => entry.id === activeTabId);
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      const block = session?.blocks.find((entry) => entry.id === blockId);
      if (!tab || !session || !block) return;
      const file = newPlanTab(
        session.id,
        block.id,
        planTitle(block.text),
        session.cwd,
      );
      setTabs((prev) =>
        prev.map((entry) =>
          entry.id === tab.id ? openEditorTab(entry, file) : entry,
        ),
      );
      setComposerFocused(false);
    },
    [activeTabId],
  );

  /** The editor reports 0 as it unmounts, so closed tabs drop out on their own. */
  const onFileErrorCountChange = useCallback(
    (fileId: string, count: number) => {
      setFileErrorCounts((prev) => {
        if ((prev.get(fileId) ?? 0) === count) return prev;
        const next = new Map(prev);
        if (count > 0) next.set(fileId, count);
        else next.delete(fileId);
        return next;
      });
    },
    [],
  );

  const onSelectFileSurface = useCallback((paneId: string, fileId: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        const found = findSurfacePane(tab, paneId);
        if (!found) return tab;
        return withSurfacePanes(
          { ...tab, focusedId: paneId },
          found.kind,
          surfacePanes(tab, found.kind).map((pane) =>
            pane.id === paneId ? { ...pane, activeFileId: fileId } : pane,
          ),
        );
      }),
    );
    setComposerFocused(false);
  }, []);

  const { onModelChange, onModelSettingsChange, onRuntimeModeChange } =
    useModelSettings({ sessionsRef, setSessions });

  const { onSubmit } = useSubmitTurn({
    activeSessionIdRef,
    enqueueHarnessEvent,
    flushHarnessEvents,
    flushSessionLiveText,
    removingSessionIds,
    sessionsRef,
    setSessions,
    turnGen,
  });

  const onUpdatePlan = useCallback(
    (sessionId: string, blockId: string, text: string) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId || session.busy) return session;
          return {
            ...session,
            blocks: session.blocks.map((block) => {
              if (
                block.id !== blockId ||
                block.role !== "plan" ||
                block.plan?.status === "streaming" ||
                block.plan?.status === "building" ||
                block.plan?.status === "built"
              ) {
                return block;
              }
              const originalText = block.plan?.originalText ?? block.text;
              return {
                ...block,
                text,
                plan: {
                  ...(block.plan ?? { status: "ready" as const }),
                  status: "ready" as const,
                  originalText,
                  edited: text !== originalText,
                },
              };
            }),
          };
        }),
      );
    },
    [],
  );

  const onBuildPlan = useCallback(
    (sessionId: string, blockId: string, target?: PlanBuildTarget) => {
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      const block = session?.blocks.find((entry) => entry.id === blockId);
      if (
        !session ||
        session.busy ||
        block?.role !== "plan" ||
        !block.text.trim() ||
        block.plan?.status === "streaming" ||
        block.plan?.status === "building" ||
        block.plan?.status === "built"
      ) {
        return;
      }
      if (target && session.modelSettings) {
        saveLastModelSettings(session.modelSettings, "fill");
      }
      onSubmit(sessionId, "Build approved plan", [], {
        intent: "build",
        planBlockId: blockId,
        buildTarget: target,
      });
    },
    [onSubmit],
  );

  const {
    onDeleteQueuedMessage,
    onQueuedMessageEditingChange,
    onEditQueuedMessage,
    onSteerQueuedMessage,
    onResumeQueue,
  } = useRunCheckCommand({
    queueDispatchingRef,
    sessions,
    sessionsRef,
    setSessions,
    onSubmit,
  });

  const { onSecondOpinion, onHandoff, onCompactContext } = useMultiSession({
    activeTabIdRef,
    appendTab,
    enqueueHarnessEvent,
    flushHarnessEvents,
    onSubmit,
    sessionsRef,
    setActiveTabId,
    setComposerFocused,
    setProjectTerminalFocused,
    setSessions,
    setTabs,
    tabsRef,
    turnGen,
  });

  const autoContinueKey = sessions
    .filter(
      (session) => canAutoContinue(session) && isLiveHarness(session.harness),
    )
    .map((session) => session.id)
    .join("\n");

  useEffect(() => {
    if (!autoContinueKey) return;
    const ids = autoContinueKey.split("\n");
    // Delay past React StrictMode's dev remount so Continue is not claimed
    // against a discarded tree (sessionStorage also survives Vite reloads).
    const timer = window.setTimeout(() => {
      for (const id of ids) {
        const session = sessionsRef.current.find((entry) => entry.id === id);
        if (
          !session ||
          !canAutoContinue(session) ||
          !isLiveHarness(session.harness)
        ) {
          continue;
        }
        onSubmit(id, CONTINUE_PROMPT);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoContinueKey, onSubmit]);

  const onStop = useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      turnGen.current.set(sessionId, (turnGen.current.get(sessionId) ?? 0) + 1);
      flushHarnessEvents();
      if (session) {
        for (const id of sessionChildHarnesses(session)) {
          void cancelHarnessTurn(id, sessionId);
        }
      }
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const withLiveText = flushSessionLiveText(s.id, s);
          const stopped = stopStreaming(withLiveText);
          const completed = isPreparingHandoff(stopped)
            ? completeHandoff(stopped, buildDeterministicHandoff(stopped))
            : stopped;
          return completed.queuedMessages?.length
            ? { ...completed, queueStatus: "paused" }
            : completed;
        }),
      );
      if (session) {
        notifyReviewChanged(sessionId);
        nudgeWorkspace(sessionWorkCwd(session));
        notifyGitChanged();
        nudgeWatchedFiles();
        window.setTimeout(() => nudgeWatchedFiles(), 150);
      } else {
        notifyReviewChanged(sessionId);
      }
    },
    [flushHarnessEvents],
  );

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const inTerminal = Boolean(target?.closest(".monocode-terminal"));
      const activeTabId = activeTabIdRef.current;
      const sessionId = focusedBusyAgentSessionId(
        activeTabId,
        tabsRef.current,
        sessionsRef.current,
        projectTerminalFocusedRef.current,
      );
      if (
        !sessionId ||
        !shouldStopFocusedTurnOnEscape(event, {
          inTerminal,
          focusedSessionBusy: true,
        })
      ) {
        return;
      }

      // Other surfaces (drag/reorder included) can claim Escape later in the
      // same keydown dispatch. Defer the destructive stop until every handler
      // has had a chance to preventDefault, then verify focus did not move.
      deferUnhandledEscape(event, () => {
        const stillFocusedSessionId = focusedBusyAgentSessionId(
          activeTabIdRef.current,
          tabsRef.current,
          sessionsRef.current,
          projectTerminalFocusedRef.current,
        );
        if (
          activeTabIdRef.current !== activeTabId ||
          stillFocusedSessionId !== sessionId
        ) {
          return;
        }
        onStop(sessionId);
      });
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onStop]);

  const onApproval = useCallback(
    (sessionId: string, requestId: number, decision: ApprovalDecision) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session) return;
      respondHarnessApproval(session.harness, sessionId, requestId, decision);
    },
    [],
  );

  const onQuestionReply = useCallback(
    (sessionId: string, requestId: number, reply: UserQuestionReply) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session) return;
      respondHarnessQuestion(session.harness, sessionId, requestId, reply);
    },
    [],
  );

  const onQuestionInteraction = useCallback(
    (sessionId: string, requestId: number) => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (session) keepHarnessQuestionOpen(session.harness, sessionId, requestId);
    },
    [],
  );

  const onOpenApprovalSession = useCallback(
    (sessionId: string) => {
      if (!focusOpenSession(sessionId)) {
        void onSelectHistorySession(sessionId);
      }
    },
    [focusOpenSession, onSelectHistorySession],
  );

  const onSelectLiveAgent = useCallback(
    (sessionId: string) => {
      setSearchViewOpen(false);
      setNotesViewOpen(false);
      onOpenApprovalSession(sessionId);
    },
    [onOpenApprovalSession],
  );

  const nextTitleTabs: TitleTab[] = deckProjectTabs.map((tab) =>
    toTitleTab(tab, sessions, dirtyFiles),
  );
  tabProjectsRef.current = new Map(
    nextTitleTabs.map((tab) => [tab.id, tab.project]),
  );
  const titleTabsRef = useRef(nextTitleTabs);
  if (!titleTabsEqual(titleTabsRef.current, nextTitleTabs)) {
    titleTabsRef.current = nextTitleTabs;
  }
  const titleTabs = titleTabsRef.current;

  // `history` now spans every visited project; consumers that expect the
  // current project only get this slice.
  const projectHistory = useMemo(
    () => history.filter((entry) => sameProjectPath(entry.cwd, sidebarCwd)),
    [history, sidebarCwd],
  );

  const sidebarHistory = useMemo(
    () =>
      historyWithLiveSessions(history, sessions, sidebarCwd, {
        ...(projectBranches?.current
          ? { branch: projectBranches.current }
          : {}),
        ...(sidebarCwd && sidebarCwd !== "~"
          ? { repo: projectName(sidebarCwd) }
          : {}),
      }),
    [history, projectBranches, sessions, sidebarCwd],
  );
  const openProjectSessions = useMemo(
    () =>
      sessions
        .filter((session) => sameProjectPath(session.cwd, sidebarCwd))
        .map((session) =>
          summaryFromSession(session, {
            ...(projectBranches?.current
              ? { branch: projectBranches.current }
              : {}),
            ...(sidebarCwd && sidebarCwd !== "~"
              ? { repo: projectName(sidebarCwd) }
              : {}),
          }),
        ),
    [projectBranches, sessions, sidebarCwd],
  );

  const onToggleSidebar = useCallback(() => {
    setProjectRailOpen((open) => {
      const next = !open;
      saveProjectRailOpen(next);
      return next;
    });
  }, []);

  const onToggleProjectRail = useCallback(() => {
    setProjectRailOpen((open) => {
      const next = !open;
      saveProjectRailOpen(next);
      return next;
    });
  }, []);

  const onGoToFile = useCallback(() => {
    setSearchViewOpen(false);
    setNotesViewOpen(false);
    setFilePickerOpen(true);
  }, []);

  const onFindInProject = useCallback(() => {
    setSearchViewOpen(false);
    setNotesViewOpen(false);
    setSidebarTab("files");
    setFilesSearchOpen(true);
    setSearchFocusToken((token) => token + 1);
  }, []);

  const onOpenSearch = useCallback(() => {
    setFilePickerOpen(false);
    setSettingsOpen(false);
    setNotesViewOpen(false);
    setSearchViewOpen(true);
    setSearchViewFocusToken((token) => token + 1);
  }, []);

  const onLeaveSearch = useCallback(() => {
    setSearchViewOpen(false);
  }, []);

  const onOpenNotes = useCallback(() => {
    if (!loadNotesEnabled()) return;
    setFilePickerOpen(false);
    setSettingsOpen(false);
    setSearchViewOpen(false);
    setNotesViewOpen(true);
  }, []);

  const onLeaveNotes = useCallback(() => {
    setNotesViewOpen(false);
  }, []);

  const { onOpenSettings, openSettings } = useOpenSettings({
    setFilePickerOpen,
    setSearchViewOpen,
    setNotesViewOpen,
    setSettingsSection,
    setSettingsOpen,
  });

  const onCloseSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const onSelectSettingsSection = useCallback((section: SettingsSectionId) => {
    setSettingsSection(section);
    saveSettingsSection(section);
  }, []);

  const onOpenArchivedSession = useCallback(
    (sessionId: string) => {
      setSettingsOpen(false);
      void onSelectHistorySession(sessionId);
    },
    [onSelectHistorySession],
  );

  const onRailBack = useCallback(() => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    if (searchViewOpen) {
      setSearchViewOpen(false);
      return;
    }
    if (notesViewOpen) {
      setNotesViewOpen(false);
      return;
    }
    onVisitBack();
  }, [onVisitBack, searchViewOpen, settingsOpen, notesViewOpen]);

  const onRailForward = useCallback(() => {
    setSearchViewOpen(false);
    setSettingsOpen(false);
    setNotesViewOpen(false);
    onVisitForward();
  }, [onVisitForward]);

  useEffect(() => {
    if (!dockVisible) setProjectTerminalFocused(false);
  }, [dockVisible]);

  const openFilePaths = useMemo(() => {
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const tab of tabs) {
      for (const pane of tab.editorPanes) {
        for (const file of pane.files) {
          if (!isFilesystemTab(file) || seen.has(file.path)) continue;
          seen.add(file.path);
          paths.push(file.path);
        }
      }
    }
    return paths;
  }, [tabs]);

  useEffect(() => {
    void invoke("set_traffic_lights_visible", { visible: true }).catch(
      () => {},
    );
  }, []);

  const onSessionNavigationOrder = useCallback((ids: readonly string[]) => {
    sessionNavigationIdsRef.current = ids;
  }, []);

  const onNavigateSessionList = useCallback(
    (delta: number) => {
      const activeWorkspace = tabsRef.current.find(
        (entry) => entry.id === activeTabIdRef.current,
      );
      if (!activeWorkspace || activeWorkspace.diffFocused) return;
      const current = sessionsRef.current.find(
        (session) => session.id === activeWorkspace.focusedId,
      );
      if (!current) return;

      const next = adjacentItemId(
        sessionNavigationIdsRef.current,
        current.id,
        delta,
      );
      if (!next || next === current.id) return;
      void onSelectHistorySession(next);
    },
    [onSelectHistorySession],
  );

  const onNavigateProjectList = useCallback(
    (delta: number) => {
      const current = normalizeProjectPath(projectCwdRef.current);
      const ids = projectRailItems(loadRecents(), current).map(
        (project) => project.path,
      );
      const next = adjacentItemId(ids, current, delta);
      if (!next || sameProjectPath(next, current)) return;
      onSelectProject(next);
    },
    [onSelectProject],
  );

  const actions = useRef({
    onNew,
    onArchiveFocusedSession,
    onCloseOtherTabs,
    onClosePane,
    onNext,
    onPrev,
    onVisitBack,
    onVisitForward,
    onActivate,
    onSplit,
    onFocusDir,
    onToggleSidebar,
    onGoToFile,
    onFindInProject,
    onOpenSearch,
    onOpenNotes,
    pickProject,
    onNewTerminal: projectTerminal.onNewTerminal,
    onNewTerminalTab: projectTerminal.onNewTerminalTab,
    onToggleProjectTerminal: projectTerminal.onToggleProjectTerminal,
    onNavigateSessionList,
    onNavigateProjectList,
    openSettings,
    onOpenApprovalSession,
  });
  actions.current = {
    onNew,
    onArchiveFocusedSession,
    onCloseOtherTabs,
    onClosePane,
    onNext,
    onPrev,
    onVisitBack,
    onVisitForward,
    onActivate,
    onSplit,
    onFocusDir,
    onToggleSidebar,
    onGoToFile,
    onFindInProject,
    onOpenSearch,
    onOpenNotes,
    pickProject,
    onNewTerminal: projectTerminal.onNewTerminal,
    onNewTerminalTab: projectTerminal.onNewTerminalTab,
    onToggleProjectTerminal: projectTerminal.onToggleProjectTerminal,
    onNavigateSessionList,
    onNavigateProjectList,
    openSettings,
    onOpenApprovalSession,
  };

  useKeyboardShortcuts(actions, {
    searchViewOpen: searchViewOpenRef.current,
    notesViewOpen: notesViewOpenRef.current,
    settingsOpen: settingsOpenRef.current,
    filePickerOpen: filePickerOpenRef.current,
    whatsNewVersion: whatsNewVersionRef.current,
    sessions: sessionsRef.current.map((s) => ({ id: s.id })),
    runUpdateFlow,
    openFindInActiveEditor,
    getCurrentWindow,
    loadUiScale,
    saveUiScale,
    applyUiScale,
    uiScaleDefault: UI_SCALE_DEFAULT,
    zoomInUiScale,
    zoomOutUiScale,
  });

  const dockGridRef = useRef<HTMLDivElement>(null);
  const dockDragSize = useRef<number | null>(null);
  const paintDockSize = useCallback((size: number) => {
    const dock = findProjectTerminal(
      projectTerminalsRef.current,
      projectCwdRef.current,
    );
    const el = dockGridRef.current;
    if (!dock || !el) return;
    dockDragSize.current = size;
    applyDockGridStyle(el, dock.side, size);
  }, []);
  const commitDockSize = useCallback(
    (size: number) => {
      dockDragSize.current = null;
      projectTerminal.onProjectTerminalSize(size);
    },
    [projectTerminal.onProjectTerminalSize],
  );
  useLayoutEffect(() => {
    if (dockDragSize.current != null) return;
    const el = dockGridRef.current;
    if (!el) return;
    applyDockGridStyle(
      el,
      dockVisible && currentProjectDock ? currentProjectDock.side : null,
      currentProjectDock?.size ?? 0,
    );
  }, [currentProjectDock, dockVisible]);

  const busyProjectPaths = useMemo(
    () =>
      sessions.flatMap((session) =>
        session.busy && session.cwd ? [session.cwd] : [],
      ),
    [sessions],
  );
  const { onDismissUpdate } = useDismissUpdate({ setUpdateNotice });

  const sessionPaneProps = {
    recents,
    hideProjectPicker: true,
    onFocus: onFocusPane,
    onClose: onClosePane,
    onCwdChange,
    onBranchChange,
    onModelChange,
    onModelSettingsChange,
    onRuntimeModeChange,
    onSubmit,
    onStop,
    onCompactContext,
    onPlaceSessionInFolder,
    onDeleteQueuedMessage,
    onEditQueuedMessage,
    onQueuedMessageEditingChange,
    onSteerQueuedMessage,
    onResumeQueue,
    onNoteCardDismiss,
    onHandoffCardDismiss,
    onApproval,
    onQuestionReply,
    onQuestionInteraction,
    onOpenFile,
    onOpenDiff,
    onOpenPlan,
    onBuildPlan,
    onSecondOpinion,
    onHandoff,
    onNewTerminal: projectTerminal.onNewTerminalInSession,
  };

  return (
    <div
      className={`flex h-full text-content ${
        HAS_NATIVE_GLASS ? "bg-background-base/40" : "bg-background-base"
      }`}
    >
      <Sidebar
        cwd={sidebarCwd}
        gitCwd={gitCwd}
        open
        tab={sidebarTab}
        onTabChange={setSidebarTab}
        filesSearchOpen={filesSearchOpen}
        onFilesSearchOpenChange={setFilesSearchOpen}
        onOpenFilesSearch={onFindInProject}
        searchFocusToken={searchFocusToken}
        sessions={sidebarHistory}
        busySessionIds={busySessionIds}
        approvalSessionIds={approvalSessionIds}
        activeSessionId={active?.id}
        status={historyFailed ? "error" : "idle"}
        pending={historyPending}
        onSelectSession={onSelectHistorySession}
        onSessionNavigationOrder={onSessionNavigationOrder}
        onPlaceSessionOnPane={onPlaceSessionOnPane}
        onRenameSession={onRenameHistorySession}
        onArchiveSession={onArchiveHistorySession}
        onArchiveSessions={onArchiveHistorySessions}
        onPinSession={onPinHistorySession}
        onPinSessions={onPinHistorySessions}
        reminders={sessionReminders.reminders}
        onSetReminders={sessionReminders.schedule}
        onCancelReminders={sessionReminders.cancel}
        onDeleteSession={onDeleteHistorySession}
        onDeleteSessions={onDeleteHistorySessions}
        onOpenFile={onOpenFile}
        onOpenTerminal={projectTerminal.onOpenTerminal}
        onFileMoved={onFileMoved}
        onFileDeleted={onFileDeleted}
        canGoBack={
          tabVisitNav.canBack ||
          searchViewOpen ||
          settingsOpen ||
          notesViewOpen
        }
        canGoForward={tabVisitNav.canForward}
        onGoBack={onRailBack}
        onGoForward={onRailForward}
        onOpenDiff={onOpenWorkingTreeDiff}
        onOpenAllChanges={onOpenAllChanges}
        onOpenCommit={onOpenCommit}
        onShowSourceControl={onToggleChanges}
        selectedDiffPath={
          activeTab ? selectedChangePath(activeTab, gitCwd) : undefined
        }
        selectedDiffKind={activeTab ? selectedChangeKind(activeTab) : undefined}
        selectedCommitSha={activeTab ? selectedCommitSha(activeTab) : undefined}
        textHarness={pickTextHarness(active?.harness)}
        recents={recents}
        busyProjectPaths={busyProjectPaths}
        liveAgents={liveAgents}
        onSelectAgent={onSelectLiveAgent}
        onSelectProject={onSelectProject}
        onOpenProject={pickProject}
        onRemoveProject={onRemoveProject}
        onNew={onNew}
        openSessions={openProjectSessions}
        onNewTerminal={projectTerminal.onNewTerminal}
        onSearch={onOpenSearch}
        onOpenNotes={notesEnabled ? onOpenNotes : undefined}
        onGoToFile={onGoToFile}
        searchActive={searchViewOpen}
        notesActive={notesViewOpen}
        notesEnabled={notesEnabled}
        projectRailOpen={projectRailOpen}
        onToggleProjectRail={onToggleProjectRail}
        unseenFinishedIds={unseenFinishedIds}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection}
        onOpenSettings={onOpenSettings}
        onSelectSettingsSection={onSelectSettingsSection}
        onCloseSettings={onCloseSettings}
        updateNotice={updateNotice}
        onOpenWhatsNew={onOpenWhatsNew}
        onDismissUpdate={onDismissUpdate}
      />

      <div className="body-glass flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={
            searchViewOpen || settingsOpen || notesViewOpen
              ? "hidden"
              : "flex min-h-0 min-w-0 flex-1 flex-col"
          }
          aria-hidden={
            searchViewOpen || settingsOpen || notesViewOpen
          }
          inert={
            searchViewOpen ||
            settingsOpen ||
            notesViewOpen ||
            undefined
          }
        >
          {!IS_MAC ? (
            <MenuBar
              onNew={onNew}
              onNewTerminal={projectTerminal.onNewTerminal}
              onToggleTerminal={projectTerminal.onToggleProjectTerminal}
              onGoToFile={onGoToFile}
              onToggleSidebar={onToggleSidebar}
              onShowSourceControl={onToggleChanges}
              onCloseCurrentTab={
                activeTabId ? () => onCloseTab(activeTabId) : undefined
              }
              onCloseOtherTabs={onCloseOtherTabs}
              onPickProject={pickProject}
              onFindInProject={onFindInProject}
              onSearch={onOpenSearch}
              onOpenNotes={notesEnabled ? onOpenNotes : undefined}
              onZoomIn={() => {
                const next = saveUiScale(zoomInUiScale(loadUiScale()));
                void applyUiScale(next);
              }}
              onZoomOut={() => {
                const next = saveUiScale(zoomOutUiScale(loadUiScale()));
                void applyUiScale(next);
              }}
              onZoomReset={() => {
                saveUiScale(UI_SCALE_DEFAULT);
                void applyUiScale(UI_SCALE_DEFAULT);
              }}
            />
          ) : null}
          <TitleBar
            tabs={titleTabs}
            activeId={activeTabId}
            cwd={sidebarCwd}
            projectRailOpen={projectRailOpen}
            onToggleSidebar={onToggleSidebar}
            onSelect={activateTab}
            onNew={onNew}
            onNewTerminal={projectTerminal.onNewTerminal}
            onShowTerminal={projectTerminal.onShowProjectTerminal}
            projectTerminalActive={
              !!currentProjectDock && currentProjectDock.pane.files.length > 0
            }
            onOpenSettings={onOpenSettings}
            onOpenNotes={notesEnabled ? onOpenNotes : undefined}
            onClose={onCloseTitleTab}
            onCloseMany={onCloseTabs}
            onReorder={onReorderTabs}
            onGoToFile={onGoToFile}
            recents={recents}
            onSelectProject={onSelectProject}
          />

          <main className="relative min-h-0 min-w-0 flex-1">
            <div
              ref={dockGridRef}
              className="absolute inset-0 grid h-full min-h-0 min-w-0"
            >
              {projectTerminals.map((dock) => {
                const show =
                  dock.open && sameProjectPath(dock.projectPath, projectCwd);
                return (
                  <div
                    key={dock.projectPath}
                    className={
                      show
                        ? "h-full min-h-0 min-w-0 w-full overflow-hidden"
                        : "hidden"
                    }
                    style={show ? { gridArea: "dock" } : undefined}
                    aria-hidden={!show}
                  >
                    <ProjectTerminalDock
                      dock={dock}
                      focused={show && projectTerminalFocused}
                      onFocus={projectTerminal.focusProjectTerminal}
                      onHide={projectTerminal.onHideProjectTerminal}
                      onSideChange={projectTerminal.onProjectTerminalSide}
                      onSizePaint={paintDockSize}
                      onSizeCommit={commitDockSize}
                      onAddTerminal={() =>
                        projectTerminal.onOpenTerminal(active?.cwd ?? projectCwd)
                      }
                      onSelectTerminal={projectTerminal.onSelectProjectTerminal}
                      onCloseTerminal={projectTerminal.onCloseProjectTerminal}
                      onCloseOtherTerminals={
                        projectTerminal.onCloseOtherProjectTerminals
                      }
                      onReorderTerminals={projectTerminal.onReorderProjectTerminals}
                      onTerminalMetaChange={projectTerminal.onTerminalMetaChange}
                    />
                  </div>
                );
              })}
              <div
                className="relative flex min-h-0 min-w-0 flex-row"
                style={{ gridArea: "main" }}
              >
                <div className="relative min-h-0 min-w-0 flex-1">
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      aria-hidden={tab.id !== activeTabId}
                      className={
                        tab.id === activeTabId
                          ? "absolute inset-0 flex h-full min-h-0 flex-col"
                          : "hidden"
                      }
                    >
                      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                        <PaneTree
                          {...sessionPaneProps}
                          visible={tab.id === activeTabId}
                          layout={tab.layout}
                          sessions={sessions}
                          editorPanes={
                            tab.terminalPanes && tab.terminalPanes.length > 0
                              ? [...tab.editorPanes, ...tab.terminalPanes]
                              : tab.editorPanes
                          }
                          dirtyFileIds={dirtyFiles}
                          fileErrorCounts={fileErrorCounts}
                          focusedId={
                            tab.id === activeTabId &&
                            !tab.diffFocused &&
                            !projectTerminalFocused
                              ? tab.focusedId
                              : ""
                          }
                          addToChatSessionId={
                            tab.id === activeTabId ? active?.id : undefined
                          }
                          composerFocused={
                            composerFocused && !projectTerminalFocused
                          }
                          onSelectFile={onSelectFileSurface}
                          onCloseFile={onCloseFile}
                          onCloseOtherFiles={onCloseOtherFiles}
                          onReorderFiles={onReorderFiles}
                          onFileDirtyChange={onFileDirtyChange}
                          onFileErrorCountChange={onFileErrorCountChange}
                          onRatio={(splitId, index, ratio) =>
                            onRatio(tab.id, splitId, index, ratio)
                          }
                          editorNavigation={editorNavigation}
                          onUpdatePlan={onUpdatePlan}
                          onMovePane={onMovePane}
                          onTerminalMetaChange={projectTerminal.onTerminalMetaChange}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
        {searchViewOpen ? (
          <SearchView
            open
            cwd={sidebarCwd}
            recents={recents}
            history={projectHistory}
            sessions={sessions}
            focusToken={searchViewFocusToken}
            besideRail={projectRailOpen}
            onClose={onLeaveSearch}
            onToggleSidebar={onToggleSidebar}
            onOpenFile={onOpenFile}
            onOpenSession={onSelectHistorySession}
            onOpenProject={onSelectProject}
          />
        ) : null}
        {notesViewOpen ? (
          <NotesView
            besideRail={projectRailOpen}
            cwd={projectCwd}
            onClose={onLeaveNotes}
            onToggleSidebar={onToggleSidebar}
          />
        ) : null}
        {settingsOpen ? (
          <SettingsView
            section={settingsSection}
            cwd={sidebarCwd}
            sessions={sidebarHistory}
            besideRail
            onClose={onCloseSettings}
            onOpenSession={onOpenArchivedSession}
            onArchiveSession={onArchiveHistorySession}
            onDeleteSession={onDeleteHistorySession}
            onRestoreProject={onRestoreProject}
            onDeleteProject={(path) =>
              onRemoveProject(path, { purgeData: true })
            }
            onOpenWhatsNew={onOpenWhatsNew}
          />
        ) : null}
        {searchViewOpen ||
        notesViewOpen ||
        settingsOpen ? null : (
          <UsageFooter
            providers={usageProviders}
            session={usageSession}
            project={active?.cwd ?? projectCwd}
            onSelectAccount={onSelectProviderAccount}
            terminals={runningTerminals}
            terminalOpen={runningTerminalOpen}
            onToggleTerminal={projectTerminal.onToggleRunningTerminal}
            onShowTerminal={projectTerminal.onToggleProjectTerminal}
            onNewTerminal={projectTerminal.onNewTerminal}
            projectTerminalActive={!!currentProjectDock?.open}
          />
        )}
      </div>

      {filePickerOpen ? (
        <FilePicker
          open
          cwd={gitCwd}
          openPaths={openFilePaths}
          onOpenFile={onOpenFile}
          onClose={() => setFilePickerOpen(false)}
        />
      ) : null}

      <ApprovalToasts
        notices={hiddenApprovalToasts}
        topOffset={12 + (reminderNoticesHeight ? reminderNoticesHeight + 8 : 0)}
        onFocusSession={onOpenApprovalSession}
        onApproval={onApproval}
      />
      <ReminderNotices
        reminders={sessionReminders.due}
        error={sessionReminders.error}
        onOpen={sessionReminders.open}
        onSnooze={sessionReminders.schedule}
        onDismiss={sessionReminders.cancel}
        onRetry={sessionReminders.refresh}
        onOpenSettings={() => openSettings()}
        onHeightChange={setReminderNoticesHeight}
      />
      {whatsNewVersion ? (
        <WhatsNewDialog
          version={whatsNewVersion}
          onClose={() => setWhatsNewVersion(null)}
        />
      ) : null}
      {providerSignInRequest ? (
        <ProviderSignInDialog
          key={providerSignInRequest.key}
          harness={providerSignInRequest.harness}
          onClose={() => setProviderSignInRequest(null)}
        />
      ) : null}
    </div>
  );
}
