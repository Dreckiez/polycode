// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SessionSummary,
} from "../lib/sessionStore";
import type { WorkspaceTab } from "../lib/layout";
import type { HarnessId, Session } from "../lib/session";
import {
  removeSessionFromWorkspace,
  type SessionWorkspaceRemoval,
} from "../lib/sessionWorkspaceLifecycle";
import type { WorkspaceTabCloseScope } from "../lib/workspaceTabGroups";
import {
  type SessionLifecycleDeps,
  useSessionLifecycle,
} from "./useSessionLifecycle";

const mocks = vi.hoisted(() => ({
  message: vi.fn(),
  ask: vi.fn(),
  open: vi.fn(),
  confirm: vi.fn(),
  newSession: vi.fn(),
  newDefaultSession: vi.fn(),
  sessionDisplayTitle: vi.fn(),
  sessionWorkCwd: vi.fn(),
  newTab: vi.fn(),
  restoreSessionCheckout: vi.fn(),
  bindHarnessSession: vi.fn(),
  forgetHarnessSession: vi.fn(),
  isLiveHarness: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  persistFingerprint: vi.fn(),
  setSessionArchived: vi.fn(),
  setSessionPinned: vi.fn(),
  shouldPersistSession: vi.fn(),
  upsertSession: vi.fn(),
  flushSessionCheckpoint: vi.fn(),
  runSessionRemoval: vi.fn(),
  filesInWorkspaceTabs: vi.fn(),
  confirmDiscardUnsaved: vi.fn(),
  confirmCloseTerminals: vi.fn(),
  mergeHistorySummary: vi.fn(),
  mergeProjectHistorySummary: vi.fn(),
  summaryFromSession: vi.fn(),
  sessionChildHarnesses: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  message: mocks.message,
  ask: mocks.ask,
  open: mocks.open,
  confirm: mocks.confirm,
}));
vi.mock("../lib/session", () => ({
  newSession: mocks.newSession,
  newDefaultSession: mocks.newDefaultSession,
  sessionDisplayTitle: mocks.sessionDisplayTitle,
  sessionWorkCwd: mocks.sessionWorkCwd,
}));
vi.mock("../lib/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/layout")>();
  return { ...actual, newTab: mocks.newTab };
});
vi.mock("../lib/fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/fs")>();
  return { ...actual, restoreSessionCheckout: mocks.restoreSessionCheckout };
});
vi.mock("../lib/harness", () => ({
  bindHarnessSession: mocks.bindHarnessSession,
  forgetHarnessSession: mocks.forgetHarnessSession,
  isLiveHarness: mocks.isLiveHarness,
}));
vi.mock("../lib/sessionStore", () => ({
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
  persistFingerprint: mocks.persistFingerprint,
  setSessionArchived: mocks.setSessionArchived,
  setSessionPinned: mocks.setSessionPinned,
  shouldPersistSession: mocks.shouldPersistSession,
  upsertSession: mocks.upsertSession,
}));
vi.mock("../lib/checkpoint", () => ({
  flushSessionCheckpoint: mocks.flushSessionCheckpoint,
}));
vi.mock("../lib/sessionRemoval", () => ({
  runSessionRemoval: mocks.runSessionRemoval,
}));
vi.mock("../lib/appTabs", () => ({
  filesInWorkspaceTabs: mocks.filesInWorkspaceTabs,
}));
vi.mock("../lib/appConfirm", () => ({
  confirmDiscardUnsaved: mocks.confirmDiscardUnsaved,
}));
vi.mock("../lib/terminalClose", () => ({
  confirmCloseTerminals: mocks.confirmCloseTerminals,
}));
vi.mock("../lib/sessionHistory", () => ({
  mergeHistorySummary: mocks.mergeHistorySummary,
  mergeProjectHistorySummary: mocks.mergeProjectHistorySummary,
  summaryFromSession: mocks.summaryFromSession,
}));
vi.mock("../lib/handoff", () => ({
  sessionChildHarnesses: mocks.sessionChildHarnesses,
}));

const dialog = {
  message: vi.mocked(mocks.message),
};
const sessionLib = {
  newSession: vi.mocked(mocks.newSession),
  newDefaultSession: vi.mocked(mocks.newDefaultSession),
  sessionDisplayTitle: vi.mocked(mocks.sessionDisplayTitle),
  sessionWorkCwd: vi.mocked(mocks.sessionWorkCwd),
};
const layout = {
  newTab: vi.mocked(mocks.newTab),
};
const fs = {
  restoreSessionCheckout: vi.mocked(mocks.restoreSessionCheckout),
};
const harness = {
  bindHarnessSession: vi.mocked(mocks.bindHarnessSession),
  forgetHarnessSession: vi.mocked(mocks.forgetHarnessSession),
  isLiveHarness: vi.mocked(mocks.isLiveHarness),
};
const store = {
  deleteSession: vi.mocked(mocks.deleteSession),
  getSession: vi.mocked(mocks.getSession),
  persistFingerprint: vi.mocked(mocks.persistFingerprint),
  setSessionArchived: vi.mocked(mocks.setSessionArchived),
  setSessionPinned: vi.mocked(mocks.setSessionPinned),
  shouldPersistSession: vi.mocked(mocks.shouldPersistSession),
  upsertSession: vi.mocked(mocks.upsertSession),
};
const checkpoint = {
  flushSessionCheckpoint: vi.mocked(mocks.flushSessionCheckpoint),
};
const sessionRemoval = {
  runSessionRemoval: vi.mocked(mocks.runSessionRemoval),
};
const appTabs = {
  filesInWorkspaceTabs: vi.mocked(mocks.filesInWorkspaceTabs),
};
const appConfirm = {
  confirmDiscardUnsaved: vi.mocked(mocks.confirmDiscardUnsaved),
};
const terminalClose = {
  confirmCloseTerminals: vi.mocked(mocks.confirmCloseTerminals),
};
const history = {
  mergeHistorySummary: vi.mocked(mocks.mergeHistorySummary),
  mergeProjectHistorySummary: vi.mocked(mocks.mergeProjectHistorySummary),
  summaryFromSession: vi.mocked(mocks.summaryFromSession),
};
const handoff = {
  sessionChildHarnesses: vi.mocked(mocks.sessionChildHarnesses),
};

type RemovalOptions = {
  sessionId: string;
  scope: WorkspaceTabCloseScope;
  readWorkspace: () => {
    tabs: WorkspaceTab[];
    sessions: Session[];
    activeTabId: string;
    dirtyFiles: ReadonlySet<string>;
  };
  createReplacement: (seed: Session | undefined) => Session;
  confirmClose: (tabs: WorkspaceTab[]) => Promise<boolean>;
  stop: () => Promise<void>;
  updateSession: (session: Session) => void;
  persist: (session: Session | undefined) => Promise<void>;
  commit: (removal: SessionWorkspaceRemoval) => void;
};

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useSessionLifecycle>;
let sessionSerial: number;
let tabSerial: number;
let confirmSpy: ReturnType<typeof vi.spyOn>;

let sessionsRef: { current: Session[] };
let tabsRef: { current: WorkspaceTab[] };
let historyRef: { current: SessionSummary[] };
let activeTabIdRef: { current: string };
let dirtyFilesRef: { current: Set<string> };
let lastPersistedRef: { current: Map<string, string> };
let pendingPersistRef: { current: Map<string, Session> };
let removingSessionIdsRef: { current: Set<string> };

let appendTab: ReturnType<typeof vi.fn>;
let focusOpenSession: ReturnType<typeof vi.fn>;
let replaceBlankPaneWithSession: ReturnType<typeof vi.fn>;
let refreshHistory: ReturnType<typeof vi.fn>;
let stopSessionForRemoval: ReturnType<typeof vi.fn>;
let activateTab: ReturnType<typeof vi.fn>;
let setSessions: ReturnType<typeof vi.fn>;
let setTabs: ReturnType<typeof vi.fn>;
let setActiveTabId: ReturnType<typeof vi.fn>;
let setComposerFocused: ReturnType<typeof vi.fn>;
let setSearchViewOpen: ReturnType<typeof vi.fn>;
let setNotesViewOpen: ReturnType<typeof vi.fn>;
let setDirtyFiles: ReturnType<typeof vi.fn>;
let setHistory: ReturnType<typeof vi.fn>;

function SessionLifecycleHarness({ deps }: { deps: SessionLifecycleDeps }) {
  api = useSessionLifecycle(deps);
  return null;
}

async function mount(opts: {
  sessions?: Session[];
  tabs?: WorkspaceTab[];
  history?: SessionSummary[];
  activeTabId?: string;
  active?: Session | undefined;
  sessionDefaults?: Session | undefined;
  projectCwd?: string;
  sidebarCwd?: string;
  tabCloseScope?: WorkspaceTabCloseScope;
}) {
  sessionsRef = { current: opts.sessions ?? [] };
  tabsRef = { current: opts.tabs ?? [] };
  historyRef = { current: opts.history ?? [] };
  activeTabIdRef = { current: opts.activeTabId ?? "" };
  dirtyFilesRef = { current: new Set<string>() };
  lastPersistedRef = { current: new Map<string, string>() };
  pendingPersistRef = { current: new Map<string, Session>() };
  removingSessionIdsRef = { current: new Set<string>() };
  appendTab = vi.fn((tab: WorkspaceTab) => {
    tabsRef.current = [...tabsRef.current, tab];
  });
  focusOpenSession = vi.fn((sessionId: string) =>
    tabsRef.current.some((tab) => tab.focusedId === sessionId),
  );
  replaceBlankPaneWithSession = vi.fn(() => false);
  refreshHistory = vi.fn(async () => undefined);
  stopSessionForRemoval = vi.fn(async () => undefined);
  activateTab = vi.fn();
  setSessions = vi.fn(
    (updater: Session[] | ((prev: Session[]) => Session[])) => {
      sessionsRef.current =
        typeof updater === "function" ? updater(sessionsRef.current) : updater;
    },
  );
  setTabs = vi.fn(
    (updater: WorkspaceTab[] | ((prev: WorkspaceTab[]) => WorkspaceTab[])) => {
      tabsRef.current =
        typeof updater === "function" ? updater(tabsRef.current) : updater;
    },
  );
  setActiveTabId = vi.fn();
  setComposerFocused = vi.fn();
  setSearchViewOpen = vi.fn();
  setNotesViewOpen = vi.fn();
  setDirtyFiles = vi.fn(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      dirtyFilesRef.current =
        typeof updater === "function" ? updater(dirtyFilesRef.current) : updater;
    },
  );
  setHistory = vi.fn(
    (
      updater: SessionSummary[] | ((prev: SessionSummary[]) => SessionSummary[]),
    ) => {
      historyRef.current =
        typeof updater === "function" ? updater(historyRef.current) : updater;
    },
  );
  const deps: SessionLifecycleDeps = {
    active: opts.active,
    sessionDefaults: opts.sessionDefaults,
    projectCwd: opts.projectCwd ?? "/repo",
    sidebarCwd: opts.sidebarCwd ?? "/repo",
    history: historyRef.current,
    appendTab,
    focusOpenSession,
    replaceBlankPaneWithSession,
    refreshHistory,
    stopSessionForRemoval,
    activateTab,
    tabCloseScope: opts.tabCloseScope ?? "workspace",
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    dirtyFilesRef,
    lastPersisted: lastPersistedRef,
    pendingPersist: pendingPersistRef,
    removingSessionIds: removingSessionIdsRef,
    setSessions,
    setTabs,
    setActiveTabId,
    setComposerFocused,
    setSearchViewOpen,
    setNotesViewOpen,
    setDirtyFiles,
    setHistory,
  } satisfies SessionLifecycleDeps;
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(SessionLifecycleHarness, { deps }),
      ),
    ),
  );
}

function session(
  id: string,
  cwd = "~",
  blocks: Session["blocks"] = [],
  extra: Partial<Session> = {},
): Session {
  return {
    id,
    harness: "claude",
    model: "mock-model",
    modelSettings: {},
    runtimeMode: "supervised",
    title: id,
    cwd,
    blocks,
    ...extra,
  };
}

function sessionTab(id: string, sessionId: string): WorkspaceTab {
  return {
    kind: "session",
    id,
    layout: { type: "leaf", id: sessionId },
    focusedId: sessionId,
    editorPanes: [],
    terminalPanes: [],
  };
}

function summary(
  id: string,
  cwd = "~",
  extra: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id,
    cwd,
    harness: "claude",
    model: "mock-model",
    runtimeMode: "supervised",
    title: id,
    createdAt: 1,
    updatedAt: 2,
    ...extra,
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionSerial = 0;
  tabSerial = 0;
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  dialog.message.mockReset();
  sessionLib.newSession.mockReset().mockImplementation(
    (
      harness?: Session["harness"],
      cwd?: string,
      model?: string,
      runtimeMode?: Session["runtimeMode"],
      modelSettings?: Record<string, string>,
    ): Session => ({
      id: `session-${++sessionSerial}`,
      harness: harness ?? "claude",
      model: model ?? "mock-model",
      modelSettings: modelSettings ?? {},
      runtimeMode: runtimeMode ?? "supervised",
      title: `mock-${sessionSerial}`,
      cwd: cwd ?? "~",
      blocks: [],
    }),
  );
  sessionLib.newDefaultSession.mockReset().mockImplementation(
    (
      cwd?: string,
      runtimeMode?: Session["runtimeMode"],
    ): Session => ({
      id: `session-${++sessionSerial}`,
      harness: "claude",
      model: "mock-model",
      modelSettings: {},
      runtimeMode: runtimeMode ?? "supervised",
      title: `mock-${sessionSerial}`,
      cwd: cwd ?? "~",
      blocks: [],
    }),
  );
  sessionLib.sessionDisplayTitle.mockReset().mockImplementation(
    (title: string) => title,
  );
  sessionLib.sessionWorkCwd
    .mockReset()
    .mockImplementation(
      (s: { cwd: string; worktreeCwd?: string }) => s.worktreeCwd ?? s.cwd,
    );
  layout.newTab.mockReset().mockImplementation(
    (sessionId: string): WorkspaceTab => ({
      kind: "session",
      id: `tab-${++tabSerial}`,
      layout: { type: "leaf", id: sessionId },
      focusedId: sessionId,
      editorPanes: [],
      terminalPanes: [],
    }),
  );
  fs.restoreSessionCheckout.mockReset().mockImplementation(
    <T,>(s: T) => s,
  );
  harness.bindHarnessSession.mockReset().mockResolvedValue(undefined);
  harness.forgetHarnessSession.mockReset().mockResolvedValue(undefined);
  harness.isLiveHarness.mockReset().mockReturnValue(true);
  store.deleteSession.mockReset().mockResolvedValue(undefined);
  store.getSession.mockReset().mockResolvedValue(null);
  store.persistFingerprint
    .mockReset()
    .mockImplementation((s: Session) => `fp-${s.id}`);
  store.setSessionArchived.mockReset().mockResolvedValue(undefined);
  store.setSessionPinned.mockReset().mockResolvedValue(undefined);
  store.shouldPersistSession.mockReset().mockReturnValue(true);
  store.upsertSession.mockReset().mockImplementation(
    async (s: Session): Promise<SessionSummary> => ({
      id: s.id,
      cwd: s.cwd,
      harness: s.harness,
      model: s.model,
      runtimeMode: s.runtimeMode,
      title: s.title,
      createdAt: 1,
      updatedAt: 2,
    }),
  );
  checkpoint.flushSessionCheckpoint.mockReset().mockResolvedValue(undefined);
  sessionRemoval.runSessionRemoval
    .mockReset()
    .mockImplementation(async (options: RemovalOptions) => {
      const initial = options.readWorkspace();
      const plan = removeSessionFromWorkspace({
        ...initial,
        sessionId: options.sessionId,
        scope: options.scope,
        createReplacement: options.createReplacement,
      });
      if (!(await options.confirmClose(plan.closedTabs))) return false;
      await options.stop();
      const stopped = options
        .readWorkspace()
        .sessions.find((entry) => entry.id === options.sessionId);
      if (stopped) options.updateSession(stopped);
      await options.persist(stopped);
      const current = options.readWorkspace();
      const removal = removeSessionFromWorkspace({
        ...current,
        sessionId: options.sessionId,
        scope: options.scope,
        createReplacement: options.createReplacement,
      });
      options.commit(removal);
      return true;
    });
  appTabs.filesInWorkspaceTabs.mockReset().mockReturnValue([]);
  appConfirm.confirmDiscardUnsaved.mockReset().mockResolvedValue(true);
  terminalClose.confirmCloseTerminals.mockReset().mockResolvedValue(true);
  history.mergeHistorySummary.mockReset().mockImplementation(
    (current: SessionSummary[], entry: SessionSummary) => {
      const next = { ...entry, ...current.find((e) => e.id === entry.id) };
      return [next, ...current.filter((e) => e.id !== entry.id)];
    },
  );
  history.mergeProjectHistorySummary.mockReset().mockImplementation(
    (current: SessionSummary[], entry: SessionSummary) => [
      entry,
      ...current.filter((e) => e.id !== entry.id),
    ],
  );
  history.summaryFromSession.mockReset().mockImplementation(
    (s: Session): SessionSummary => ({
      id: s.id,
      cwd: s.cwd,
      harness: s.harness,
      model: s.model,
      runtimeMode: s.runtimeMode,
      title: s.title,
      providerSessionId: s.providerSessionId,
      createdAt: 0,
      updatedAt: Date.now(),
    }),
  );
  handoff.sessionChildHarnesses.mockReset().mockReturnValue(["claude"]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  confirmSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("useSessionLifecycle", () => {
  it("onNew with no sessions creates a new session in the sessions store", async () => {
    await mount({ projectCwd: "/repo" });

    let createdId: string;
    await act(async () => {
      createdId = api.onNew();
    });

    expect(setSearchViewOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(setNotesViewOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(sessionLib.newDefaultSession).toHaveBeenCalledExactlyOnceWith(
      "/repo",
      undefined,
    );
    expect(sessionsRef.current).toHaveLength(1);
    expect(sessionsRef.current[0]?.id).toBe("session-1");
    const tab = layout.newTab.mock.results[0]?.value as WorkspaceTab;
    expect(appendTab).toHaveBeenCalledExactlyOnceWith(tab, "/repo");
    expect(setActiveTabId).toHaveBeenCalledExactlyOnceWith(tab.id);
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(true);
    expect(createdId!).toBe("session-1");
  });

  it("onNew increments the session counter / uses the next sequence for the new session", async () => {
    await mount({ projectCwd: "/repo" });

    let firstId: string;
    let secondId: string;
    await act(async () => {
      firstId = api.onNew();
    });
    await act(async () => {
      secondId = api.onNew();
    });

    expect(sessionLib.newDefaultSession).toHaveBeenCalledTimes(2);
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual([
      "session-1",
      "session-2",
    ]);
    expect(firstId!).toBe("session-1");
    expect(secondId!).toBe("session-2");
  });

  it("ensureOpenSession opens a session that isn't currently in a tab", async () => {
    const s1 = session("s1", "/repo", [], {
      providerSessionId: "prov-1",
      providerAccountId: "acct-1",
    });
    store.getSession.mockResolvedValue(s1);
    await mount({});

    let opened: Session | null | undefined;
    await act(async () => {
      opened = await api.ensureOpenSession("s1");
    });

    expect(store.getSession).toHaveBeenCalledExactlyOnceWith("s1");
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1"]);
    expect(setSessions).toHaveBeenCalled();
    expect(harness.bindHarnessSession).toHaveBeenCalledExactlyOnceWith(
      "claude",
      "s1",
      "prov-1",
      "/repo",
      "acct-1",
    );
    expect(lastPersistedRef.current.get("s1")).toBe("fp-s1");
    expect(opened).toBe(s1);
  });

  it("ensureOpenSession reuses an already-open tab for the same session (no duplicate)", async () => {
    const s1 = session("s1", "/repo");
    await mount({ sessions: [s1] });

    let opened: Session | null | undefined;
    await act(async () => {
      opened = await api.ensureOpenSession("s1");
    });

    expect(store.getSession).not.toHaveBeenCalled();
    expect(opened).toBe(s1);
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1"]);
    expect(setSessions).not.toHaveBeenCalled();
  });

  it("onSelectHistorySession: selecting a history session opens it as the active tab", async () => {
    const s1 = session("s1", "/repo");
    store.getSession.mockResolvedValue(s1);
    await mount({ history: [summary("s1", "/repo")] });

    await act(async () => {
      await api.onSelectHistorySession("s1");
    });

    expect(store.getSession).toHaveBeenCalledExactlyOnceWith("s1");
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1"]);
    const tab = layout.newTab.mock.results[0]?.value as WorkspaceTab;
    expect(appendTab).toHaveBeenCalledExactlyOnceWith(tab, "/repo");
    expect(setActiveTabId).toHaveBeenCalledExactlyOnceWith(tab.id);
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("onRemoveHistorySession: removing a history session removes it from the store and is persisted", async () => {
    const s1 = session("s1", "/repo", [
      { id: "u1", role: "user", text: "hello" },
    ]);
    const tabA = sessionTab("tab-a", "s1");
    await mount({
      sessions: [s1],
      tabs: [tabA],
      activeTabId: "tab-a",
      history: [summary("s1", "/repo")],
      sidebarCwd: "/repo",
    });

    let removed: boolean;
    await act(async () => {
      removed = await api.onRemoveHistorySession("s1", "delete");
    });

    expect(removed!).toBe(true);
    expect(store.deleteSession).toHaveBeenCalledExactlyOnceWith("s1");
    expect(harness.forgetHarnessSession).toHaveBeenCalledExactlyOnceWith(
      "claude",
      "s1",
    );
    expect(refreshHistory).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(historyRef.current.some((entry) => entry.id === "s1")).toBe(false);
    expect(sessionsRef.current.some((entry) => entry.id === "s1")).toBe(false);
    expect(tabsRef.current.some((tab) => tab.id === "tab-a")).toBe(true);
  });

  it("onRemoveHistorySession: archiving a history session sets its archived flag and persists", async () => {
    const s1 = session("s1", "/repo", [
      { id: "u1", role: "user", text: "hello" },
    ]);
    const tabA = sessionTab("tab-a", "s1");
    await mount({
      sessions: [s1],
      tabs: [tabA],
      activeTabId: "tab-a",
      history: [],
    });

    let archived: boolean;
    await act(async () => {
      archived = await api.onRemoveHistorySession("s1", "archive");
    });

    expect(archived!).toBe(true);
    expect(checkpoint.flushSessionCheckpoint).toHaveBeenCalledExactlyOnceWith(
      "s1",
    );
    expect(store.upsertSession).toHaveBeenCalledExactlyOnceWith(s1);
    expect(store.setSessionArchived).toHaveBeenCalledExactlyOnceWith("s1", true);
    expect(historyRef.current[0]?.id).toBe("s1");
    expect(historyRef.current[0]?.archived).toBe(true);
    expect(sessionsRef.current.some((entry) => entry.id === "s1")).toBe(false);
  });

  it("onArchiveHistorySession: archiving a history session sets its archived flag and persists", async () => {
    const s1 = session("s1", "/repo");
    const tabA = sessionTab("tab-a", "s1");
    await mount({
      sessions: [s1],
      tabs: [tabA],
      activeTabId: "tab-a",
      history: [],
    });

    let archived: boolean | undefined;
    await act(async () => {
      archived = await api.onArchiveHistorySession("s1", true);
    });

    expect(archived).toBe(true);
    expect(store.setSessionArchived).toHaveBeenCalledExactlyOnceWith("s1", true);
    expect(historyRef.current[0]?.id).toBe("s1");
    expect(historyRef.current[0]?.archived).toBe(true);
  });

  it("onPinHistorySession: pinning a history session sets its pinned flag and persists", async () => {
    const s1 = session("s1", "/repo", [
      { id: "u1", role: "user", text: "hello" },
    ]);
    await mount({ sessions: [s1], history: [summary("s1", "/repo")] });

    await act(async () => {
      await api.onPinHistorySession("s1", true);
    });

    expect(store.upsertSession).toHaveBeenCalledExactlyOnceWith(s1);
    expect(store.setSessionPinned).toHaveBeenCalledExactlyOnceWith("s1", true);
    expect(historyRef.current[0]?.id).toBe("s1");
    expect(historyRef.current[0]?.pinned).toBe(true);
  });

  it("onRemoveHistorySession on the currently-active session activates a neighbouring session instead", async () => {
    const s1 = session("s1", "/repo");
    const s2 = session("s2", "/repo");
    const tabA = sessionTab("tab-a", "s1");
    const tabB = sessionTab("tab-b", "s2");
    await mount({
      sessions: [s1, s2],
      tabs: [tabA, tabB],
      activeTabId: "tab-a",
    });

    let removed: boolean;
    await act(async () => {
      removed = await api.onRemoveHistorySession("s1", "delete");
    });

    expect(removed!).toBe(true);
    expect(activateTab).toHaveBeenCalledExactlyOnceWith("tab-b");
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s2"]);
    expect(tabsRef.current.map((tab) => tab.id)).toEqual(["tab-b"]);
  });

  it("onArchiveHistorySession with auto-archive does not throw and still persists", async () => {
    const s1 = summary("s1", "/repo");
    await mount({ history: [s1] });

    let archived: boolean;
    await act(async () => {
      archived = await api.onArchiveHistorySession("s1", true);
    });

    expect(archived).toBe(true);
    expect(store.setSessionArchived).toHaveBeenCalledExactlyOnceWith("s1", true);
    expect(historyRef.current[0]?.id).toBe("s1");
    expect(historyRef.current[0]?.archived).toBe(true);
    expect(harness.forgetHarnessSession).toHaveBeenCalledExactlyOnceWith(
      "claude",
      "s1",
    );
    expect(dialog.message).not.toHaveBeenCalled();
  });
});