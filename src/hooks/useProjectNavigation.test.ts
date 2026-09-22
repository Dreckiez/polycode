// @vitest-environment happy-dom
import { act, createElement, StrictMode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceTab } from "../lib/layout";
import type { ProjectReturnDecision } from "../lib/projectReturn";
import type { RecentProject } from "../lib/recents";
import type { Session } from "../lib/session";
import {
  type ProjectNavigationDeps,
  useProjectNavigation,
} from "./useProjectNavigation";

const mocks = vi.hoisted(() => ({
  archiveProject: vi.fn(),
  forgetProject: vi.fn(),
  rememberProject: vi.fn(),
  newSession: vi.fn(),
  newDefaultSession: vi.fn(),
  newTab: vi.fn(),
  planProjectReturn: vi.fn(),
  keepSessionChanges: vi.fn(),
  notifyReviewChanged: vi.fn(),
  projectName: vi.fn(),
  removeTabFromGroup: vi.fn(),
  tabGroupProject: vi.fn(),
  filterTabsForProject: vi.fn(),
  sessionChildHarnesses: vi.fn(),
  cancelHarnessTurn: vi.fn(),
  forgetHarnessSession: vi.fn(),
  removeProjectData: vi.fn(),
}));

vi.mock("../lib/recents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/recents")>();
  return {
    ...actual,
    archiveProject: mocks.archiveProject,
    forgetProject: mocks.forgetProject,
    rememberProject: mocks.rememberProject,
  };
});
vi.mock("../lib/session", () => ({
  newSession: mocks.newSession,
  newDefaultSession: mocks.newDefaultSession,
}));
vi.mock("../lib/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/layout")>();
  return { ...actual, newTab: mocks.newTab };
});
vi.mock("../lib/projectReturn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/projectReturn")>();
  return { ...actual, planProjectReturn: mocks.planProjectReturn };
});
vi.mock("../lib/checkpoint", () => ({
  keepSessionChanges: mocks.keepSessionChanges,
  notifyReviewChanged: mocks.notifyReviewChanged,
}));
vi.mock("../lib/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/paths")>();
  return { ...actual, projectName: mocks.projectName };
});
vi.mock("../lib/tabGroups", () => ({
  removeTabFromGroup: mocks.removeTabFromGroup,
  tabGroupProject: mocks.tabGroupProject,
}));
vi.mock("../lib/workspaceTabGroups", () => ({
  filterTabsForProject: mocks.filterTabsForProject,
}));
vi.mock("../lib/handoff", () => ({
  sessionChildHarnesses: mocks.sessionChildHarnesses,
}));
vi.mock("../lib/harness", () => ({
  cancelHarnessTurn: mocks.cancelHarnessTurn,
  forgetHarnessSession: mocks.forgetHarnessSession,
}));
vi.mock("../lib/projectData", () => ({
  removeProjectData: mocks.removeProjectData,
}));

const recents = {
  archiveProject: vi.mocked(mocks.archiveProject),
  forgetProject: vi.mocked(mocks.forgetProject),
  rememberProject: vi.mocked(mocks.rememberProject),
};
const sessionLib = {
  newSession: vi.mocked(mocks.newSession),
  newDefaultSession: vi.mocked(mocks.newDefaultSession),
};
const layout = {
  newTab: vi.mocked(mocks.newTab),
};
const projectReturn = {
  planProjectReturn: vi.mocked(mocks.planProjectReturn),
};
const checkpoint = {
  keepSessionChanges: vi.mocked(mocks.keepSessionChanges),
  notifyReviewChanged: vi.mocked(mocks.notifyReviewChanged),
};
const paths = {
  projectName: vi.mocked(mocks.projectName),
};
const tabGroups = {
  removeTabFromGroup: vi.mocked(mocks.removeTabFromGroup),
  tabGroupProject: vi.mocked(mocks.tabGroupProject),
};
const workspaceTabGroups = {
  filterTabsForProject: vi.mocked(mocks.filterTabsForProject),
};
const handoff = {
  sessionChildHarnesses: vi.mocked(mocks.sessionChildHarnesses),
};
const harness = {
  cancelHarnessTurn: vi.mocked(mocks.cancelHarnessTurn),
  forgetHarnessSession: vi.mocked(mocks.forgetHarnessSession),
};
const projectData = {
  removeProjectData: vi.mocked(mocks.removeProjectData),
};

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useProjectNavigation>;
let sessionSerial: number;
let tabSerial: number;

let sessionsRef: RefObject<Session[]>;
let tabsRef: RefObject<WorkspaceTab[]>;
let activeTabIdRef: RefObject<string>;
let projectCwdRef: RefObject<string>;
let dirtyFilesRef: RefObject<Set<string>>;

let appendTab: ReturnType<typeof vi.fn>;
let activateTab: ReturnType<typeof vi.fn>;
let readProjectReturnMemory: ReturnType<typeof vi.fn>;
let persistSession: ReturnType<typeof vi.fn>;
let projectOfTab: ReturnType<typeof vi.fn>;
let setProjectCwd: ReturnType<typeof vi.fn>;
let setRecents: ReturnType<typeof vi.fn>;
let setSessions: ReturnType<typeof vi.fn>;
let setTabs: ReturnType<typeof vi.fn>;
let setActiveTabId: ReturnType<typeof vi.fn>;
let setComposerFocused: ReturnType<typeof vi.fn>;
let setSearchViewOpen: ReturnType<typeof vi.fn>;
let setNotesViewOpen: ReturnType<typeof vi.fn>;
let setDirtyFiles: ReturnType<typeof vi.fn>;
let setProjectTerminals: ReturnType<typeof vi.fn>;

function ProjectNavigationHarness({ deps }: { deps: ProjectNavigationDeps }) {
  api = useProjectNavigation(deps);
  return null;
}

async function mount(opts: {
  sessions?: Session[];
  tabs?: WorkspaceTab[];
  activeTabId?: string;
  projectCwd?: string;
  dirty?: Set<string>;
}) {
  sessionsRef = { current: opts.sessions ?? [] };
  tabsRef = { current: opts.tabs ?? [] };
  activeTabIdRef = { current: opts.activeTabId ?? "" };
  projectCwdRef = { current: opts.projectCwd ?? "/repo" };
  dirtyFilesRef = { current: opts.dirty ?? new Set() };
  appendTab = vi.fn((tab: WorkspaceTab) => {
    tabsRef.current = [...tabsRef.current, tab];
  });
  activateTab = vi.fn();
  readProjectReturnMemory = vi.fn(() => new Map<string, string>());
  persistSession = vi.fn();
  projectOfTab = vi.fn(() => undefined);
  setProjectCwd = vi.fn();
  setRecents = vi.fn();
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
  setProjectTerminals = vi.fn();
  const deps: ProjectNavigationDeps = {
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    turnGen: { current: new Map<string, number>() },
    lastPersisted: { current: new Map<string, string>() },
    pendingPersist: { current: new Map<string, Session>() },
    activeTabId: activeTabIdRef.current,
    appendTab,
    activateTab,
    readProjectReturnMemory,
    persistSession,
    projectOfTab,
    setProjectCwd,
    setRecents,
    setSessions,
    setTabs,
    setActiveTabId,
    setComposerFocused,
    setSearchViewOpen,
    setNotesViewOpen,
    setDirtyFiles,
    setProjectTerminals,
  } satisfies ProjectNavigationDeps;
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(ProjectNavigationHarness, { deps }),
      ),
    ),
  );
}

function session(
  id: string,
  cwd = "~",
  blocks: Session["blocks"] = [],
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

function recent(path: string): RecentProject {
  return { path, openedAt: 1 };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionSerial = 0;
  tabSerial = 0;
  recents.archiveProject.mockReset();
  recents.forgetProject.mockReset();
  recents.rememberProject.mockReset().mockReturnValue([]);
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
  projectReturn.planProjectReturn
    .mockReset()
    .mockReturnValue({ action: "create" } as ProjectReturnDecision);
  checkpoint.keepSessionChanges
    .mockReset()
    .mockResolvedValue({} as never);
  checkpoint.notifyReviewChanged.mockReset();
  paths.projectName.mockReset().mockReturnValue("mock-project");
  tabGroups.removeTabFromGroup
    .mockReset()
    .mockImplementation((prev: WorkspaceTab[], id: string) =>
      prev.filter((tab) => tab.id !== id),
    );
  tabGroups.tabGroupProject.mockReset().mockReturnValue(null);
  workspaceTabGroups.filterTabsForProject.mockReset().mockReturnValue([]);
  handoff.sessionChildHarnesses.mockReset().mockReturnValue([]);
  harness.cancelHarnessTurn.mockReset().mockResolvedValue(undefined);
  harness.forgetHarnessSession.mockReset().mockResolvedValue(undefined);
  projectData.removeProjectData.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useProjectNavigation", () => {
  it("onCwdChange updates projectCwd state", async () => {
    const s1 = session("s1", "~");
    const tabA = sessionTab("tab-a", "s1");
    await mount({ sessions: [s1], tabs: [tabA], activeTabId: "tab-a" });

    await act(async () => {
      api.onCwdChange("s1", "/repo");
    });

    expect(setProjectCwd).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(recents.rememberProject).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(sessionsRef.current).toHaveLength(1);
    expect(sessionsRef.current[0]?.cwd).toBe("/repo");
    expect(checkpoint.notifyReviewChanged).toHaveBeenCalledExactlyOnceWith("s1");
    expect(tabsRef.current.map((tab) => tab.id)).toEqual(["tab-a"]);
  });

  it("onCwdChange with the same cwd is a no-op for session history", async () => {
    const s1 = session("s1", "/repo");
    const tabA = sessionTab("tab-a", "s1");
    await mount({ sessions: [s1], tabs: [tabA], activeTabId: "tab-a" });

    await act(async () => {
      api.onCwdChange("s1", "/repo");
    });

    expect(checkpoint.keepSessionChanges).not.toHaveBeenCalled();
    expect(sessionLib.newSession).not.toHaveBeenCalled();
    expect(appendTab).not.toHaveBeenCalled();
    expect(setActiveTabId).not.toHaveBeenCalled();
    expect(setComposerFocused).not.toHaveBeenCalled();
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1"]);
    expect(sessionsRef.current[0]?.cwd).toBe("/repo");
    expect(recents.rememberProject).toHaveBeenCalledExactlyOnceWith("/repo");
  });

  it("onCwdChange on a project with recent history merges a fresh session into the sessions store", async () => {
    const s1 = session("s1", "/old-proj", [
      { id: "u1", role: "user", text: "hello" },
    ]);
    const tabA = sessionTab("tab-a", "s1");
    await mount({ sessions: [s1], tabs: [tabA], activeTabId: "tab-a" });

    await act(async () => {
      api.onCwdChange("s1", "/new-proj");
    });

    expect(setProjectCwd).toHaveBeenCalledExactlyOnceWith("/new-proj");
    expect(recents.rememberProject).toHaveBeenCalledExactlyOnceWith("/new-proj");
    const created = sessionLib.newSession.mock.results[0]?.value as Session;
    expect(sessionLib.newSession).toHaveBeenCalledExactlyOnceWith(
      "claude",
      "/new-proj",
      "mock-model",
      "supervised",
      {},
    );
    expect(created.cwd).toBe("/new-proj");
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1", created.id]);
    const tab = layout.newTab.mock.results[0]?.value as WorkspaceTab;
    expect(appendTab).toHaveBeenCalledExactlyOnceWith(tab, "/new-proj");
    expect(setActiveTabId).toHaveBeenCalledExactlyOnceWith(tab.id);
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(true);
    expect(checkpoint.keepSessionChanges).not.toHaveBeenCalled();
    expect(tabsRef.current.map((entry) => entry.id)).toEqual(["tab-a", tab.id]);
    expect(tabsRef.current[1]?.focusedId).toBe(created.id);
  });

  it("onCwdChange on a blank bound session keeps the old project's changes", async () => {
    const s1 = session("s1", "/old-proj");
    const tabA = sessionTab("tab-a", "s1");
    await mount({ sessions: [s1], tabs: [tabA], activeTabId: "tab-a" });

    await act(async () => {
      api.onCwdChange("s1", "/new-proj");
    });

    expect(checkpoint.keepSessionChanges).toHaveBeenCalledExactlyOnceWith(
      "s1",
      "/old-proj",
    );
    expect(sessionLib.newSession).not.toHaveBeenCalled();
    expect(appendTab).not.toHaveBeenCalled();
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1"]);
    expect(sessionsRef.current[0]?.cwd).toBe("/new-proj");
  });

  it("onCwdChange when the project has no history leaves sessions untouched", async () => {
    const s1 = session("s1", "~");
    const tabA = sessionTab("tab-a", "s1");
    await mount({ sessions: [s1], tabs: [tabA], activeTabId: "tab-a" });

    await act(async () => {
      api.onCwdChange("s1", "/repo");
    });

    expect(checkpoint.keepSessionChanges).not.toHaveBeenCalled();
    expect(sessionLib.newSession).not.toHaveBeenCalled();
    expect(appendTab).not.toHaveBeenCalled();
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1"]);
    expect(sessionsRef.current[0]?.cwd).toBe("/repo");
  });

  it("onSelectProject with a real project sets the selected project and adds a tab for its files", async () => {
    const s1 = session("s1", "/repo");
    const tabA = sessionTab("tab-a", "s1");
    await mount({ sessions: [s1], tabs: [tabA], activeTabId: "tab-a" });

    await act(async () => {
      api.onSelectProject("/alpha");
    });

    expect(setSearchViewOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(setNotesViewOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(projectReturn.planProjectReturn).toHaveBeenCalled();
    const planCall = projectReturn.planProjectReturn.mock.calls[0]?.[0];
    expect(planCall?.projectPath).toBe("/alpha");
    expect(setProjectCwd).toHaveBeenCalledWith("/alpha");
    expect(recents.rememberProject).toHaveBeenCalledExactlyOnceWith("/alpha");
    const created = sessionLib.newSession.mock.results[0]?.value as Session;
    expect(sessionLib.newSession).toHaveBeenCalledExactlyOnceWith(
      "claude",
      "/alpha",
      "mock-model",
      "supervised",
      {},
    );
    expect(sessionsRef.current.some((entry) => entry.id === created.id)).toBe(
      true,
    );
    const tab = layout.newTab.mock.results[0]?.value as WorkspaceTab;
    expect(appendTab).toHaveBeenCalledExactlyOnceWith(tab, "/alpha");
    expect(setActiveTabId).toHaveBeenCalledExactlyOnceWith(tab.id);
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(true);
    expect(tabsRef.current.some((entry) => entry.id === tab.id)).toBe(true);
    expect(tabsRef.current.find((entry) => entry.id === tab.id)?.focusedId).toBe(
      created.id,
    );
  });

  it("onSelectProject updates projectCwd to the project's cwd when kept", async () => {
    const s1 = session("s1", "/repo");
    const tabA = sessionTab("tab-a", "s1");
    projectReturn.planProjectReturn.mockReturnValue({
      action: "keep",
    } as ProjectReturnDecision);
    await mount({ sessions: [s1], tabs: [tabA], activeTabId: "tab-a" });

    await act(async () => {
      api.onSelectProject("/beta");
    });

    expect(setProjectCwd).toHaveBeenCalledExactlyOnceWith("/beta");
    expect(recents.rememberProject).toHaveBeenCalledExactlyOnceWith("/beta");
    expect(setSearchViewOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(setNotesViewOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(sessionLib.newSession).not.toHaveBeenCalled();
    expect(appendTab).not.toHaveBeenCalled();
    expect(setSessions).not.toHaveBeenCalled();
  });

  it("onRemoveProject removes the project from recents via forgetProject", async () => {
    const s1 = session("s1", "/repo");
    const s2 = session("s2", "/other");
    const tabOther = sessionTab("tab-other", "s2");
    recents.forgetProject.mockReturnValue([recent("/other")]);
    await mount({
      sessions: [s1, s2],
      tabs: [tabOther],
      activeTabId: "tab-other",
      projectCwd: "/other",
    });

    await act(async () => {
      api.onRemoveProject("/repo", { purgeData: true });
    });

    expect(recents.forgetProject).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(projectData.removeProjectData).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(setRecents).toHaveBeenCalledExactlyOnceWith([recent("/other")]);
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s2"]);
    expect(tabsRef.current.map((tab) => tab.id)).toEqual(["tab-other"]);
    expect(setProjectCwd).not.toHaveBeenCalled();
  });

  it("onRemoveProject archives the project via archiveProject and persists its sessions", async () => {
    const s1 = session("s1", "/repo");
    const s2 = session("s2", "/other");
    const tabOther = sessionTab("tab-other", "s2");
    recents.archiveProject.mockReturnValue([recent("/other")]);
    await mount({
      sessions: [s1, s2],
      tabs: [tabOther],
      activeTabId: "tab-other",
      projectCwd: "/other",
    });

    await act(async () => {
      api.onRemoveProject("/repo", { purgeData: false });
    });

    expect(recents.archiveProject).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(projectData.removeProjectData).not.toHaveBeenCalled();
    expect(persistSession).toHaveBeenCalledExactlyOnceWith(s1);
    expect(setRecents).toHaveBeenCalledExactlyOnceWith([recent("/other")]);
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s2"]);
  });

  it("onRemoveProject of the current project switches to another recent project", async () => {
    const s1 = session("s1", "/repo");
    projectReturn.planProjectReturn.mockReturnValue({
      action: "keep",
    } as ProjectReturnDecision);
    recents.forgetProject.mockReturnValue([recent("/other")]);
    await mount({
      sessions: [s1],
      tabs: [],
      activeTabId: "",
      projectCwd: "/repo",
    });

    await act(async () => {
      api.onRemoveProject("/repo", { purgeData: true });
    });

    expect(recents.forgetProject).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(setRecents).toHaveBeenCalledWith([recent("/other")]);
    expect(setSearchViewOpen).toHaveBeenCalledExactlyOnceWith(false);
    expect(setProjectCwd).toHaveBeenCalledWith("/other");
    expect(recents.rememberProject).toHaveBeenCalledExactlyOnceWith("/other");
    expect(sessionLib.newDefaultSession).toHaveBeenCalled();
    const fallbackTab = layout.newTab.mock.results[0]?.value as WorkspaceTab;
    expect(setActiveTabId).toHaveBeenCalledWith(fallbackTab.id);
    expect(setComposerFocused).not.toHaveBeenCalled();
  });
});