// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceTab } from "../lib/layout";
import type { ProjectTerminalDock } from "../lib/projectTerminal";
import type { Session } from "../lib/session";
import {
  type ProjectTerminalDeps,
  useProjectTerminal,
} from "./useProjectTerminal";

const ptyMocks = vi.hoisted(() => ({
  killPty: vi.fn().mockResolvedValue(undefined),
}));

const closeMocks = vi.hoisted(() => ({
  confirmCloseTerminal: vi.fn().mockResolvedValue(true),
  confirmCloseTerminals: vi.fn().mockResolvedValue(true),
}));

const harnessMocks = vi.hoisted(() => ({
  forgetHarnessSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/pty", () => ({
  killPty: ptyMocks.killPty,
}));

vi.mock("../lib/terminalClose", () => ({
  confirmCloseTerminal: closeMocks.confirmCloseTerminal,
  confirmCloseTerminals: closeMocks.confirmCloseTerminals,
}));

vi.mock("../lib/harness", () => ({
  forgetHarnessSession: harnessMocks.forgetHarnessSession,
}));

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useProjectTerminal>;

let projectCwdRef: { current: string };
let projectTerminalsRef: { current: ProjectTerminalDock[] };
let sessionsRef: { current: Session[] };
let tabsRef: { current: WorkspaceTab[] };
let activeTabIdRef: { current: string };
let lastPersisted: { current: Map<string, string> };

let setProjectTerminals: ReturnType<typeof vi.fn>;
let setProjectTerminalFocused: ReturnType<typeof vi.fn>;
let setComposerFocused: ReturnType<typeof vi.fn>;
let setActiveTabId: ReturnType<typeof vi.fn>;
let setTabs: ReturnType<typeof vi.fn>;
let setSessions: ReturnType<typeof vi.fn>;
let appendTab: ReturnType<typeof vi.fn>;
let looksLikeProject: ReturnType<typeof vi.fn>;

function makeSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    title: "Session " + id,
    harness: "codex",
    cwd: "/path/to/project",
    blocks: [],
    busy: false,
    ...overrides,
  } as Session;
}

function makeTab(id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return {
    kind: "session",
    id,
    layout: { type: "leaf", id: "pane-" + id },
    focusedId: "pane-" + id,
    editorPanes: [],
    terminalPanes: [],
    ...overrides,
  } as WorkspaceTab;
}

function Harness({ deps }: { deps: ProjectTerminalDeps }) {
  api = useProjectTerminal(deps);
  return null;
}

async function mount(opts: {
  projectCwd?: string;
  projectTerminals?: ProjectTerminalDock[];
  sessions?: Session[];
  tabs?: WorkspaceTab[];
  activeTab?: WorkspaceTab | null;
  active?: Session;
  looksLike?: boolean;
} = {}) {
  const cwd = opts.projectCwd ?? "/path/to/project";
  projectCwdRef = { current: cwd };
  projectTerminalsRef = { current: opts.projectTerminals ?? [] };
  sessionsRef = { current: opts.sessions ?? [] };
  tabsRef = { current: opts.tabs ?? [] };
  activeTabIdRef = { current: opts.activeTab?.id ?? opts.tabs?.[0]?.id ?? "" };
  lastPersisted = { current: new Map() };

  setProjectTerminals = vi.fn(
    (updater: ProjectTerminalDock[] | ((prev: ProjectTerminalDock[]) => ProjectTerminalDock[])) => {
      projectTerminalsRef.current =
        typeof updater === "function"
          ? updater(projectTerminalsRef.current)
          : updater;
    },
  );
  setProjectTerminalFocused = vi.fn();
  setComposerFocused = vi.fn();
  setActiveTabId = vi.fn((id: string | ((prev: string) => string)) => {
    activeTabIdRef.current = typeof id === "function" ? id(activeTabIdRef.current) : id;
  });
  setTabs = vi.fn(
    (updater: WorkspaceTab[] | ((prev: WorkspaceTab[]) => WorkspaceTab[])) => {
      tabsRef.current =
        typeof updater === "function" ? updater(tabsRef.current) : updater;
    },
  );
  setSessions = vi.fn(
    (updater: Session[] | ((prev: Session[]) => Session[])) => {
      sessionsRef.current =
        typeof updater === "function" ? updater(sessionsRef.current) : updater;
    },
  );
  appendTab = vi.fn((tab: WorkspaceTab) => {
    tabsRef.current = [...tabsRef.current, tab];
  });
  looksLikeProject = vi.fn(() => opts.looksLike ?? true);

  const deps: ProjectTerminalDeps = {
    active: opts.active,
    activeTab: opts.activeTab ?? null,
    projectCwd: cwd,
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
  };

  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(Harness, { deps }),
      ),
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("useProjectTerminal", () => {
  describe("openProjectTerminal & focusProjectTerminal", () => {
    it("returns false if path does not look like a project", async () => {
      await mount({ looksLike: false });

      let result: boolean | undefined;
      act(() => {
        result = api.openProjectTerminal("/path/to/invalid");
      });

      expect(result).toBe(false);
      expect(setProjectTerminals).not.toHaveBeenCalled();
    });

    it("creates a new dock if none exists for project", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });

      let result: boolean | undefined;
      act(() => {
        result = api.openProjectTerminal("/path/to/project");
      });

      expect(result).toBe(true);
      expect(setProjectTerminals).toHaveBeenCalled();
      expect(projectTerminalsRef.current.length).toBe(1);
      expect(projectTerminalsRef.current[0]?.open).toBe(true);
      expect(setProjectTerminalFocused).toHaveBeenCalledWith(true);
      expect(setComposerFocused).toHaveBeenCalledWith(false);
    });

    it("adds a terminal file to existing dock if one exists", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });

      act(() => {
        api.openProjectTerminal("/path/to/project");
      });
      const initialCount = projectTerminalsRef.current[0]?.pane.files.length ?? 0;

      act(() => {
        api.openProjectTerminal("/path/to/project");
      });

      expect(projectTerminalsRef.current.length).toBe(1);
      expect(projectTerminalsRef.current[0]?.pane.files.length).toBe(initialCount + 1);
    });
  });

  describe("onOpenTerminal", () => {
    it("opens in project dock when path looks like a project", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });

      act(() => {
        api.onOpenTerminal("/path/to/project");
      });

      expect(projectTerminalsRef.current.length).toBe(1);
      expect(appendTab).not.toHaveBeenCalled();
    });

    it("creates workspace tab when asWorkspaceTab is true", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: false });

      act(() => {
        api.onOpenTerminal("/path/to/project", true);
      });

      expect(appendTab).toHaveBeenCalled();
      expect(setActiveTabId).toHaveBeenCalled();
      expect(setComposerFocused).toHaveBeenCalledWith(false);
    });

    it("opens terminal tab in activeTab when not workspace tab and not project dock", async () => {
      const tab = makeTab("tab1");
      await mount({
        projectCwd: "/path/to/project",
        looksLike: false,
        activeTab: tab,
        tabs: [tab],
      });

      act(() => {
        api.onOpenTerminal("/path/to/project", false);
      });

      expect(setTabs).toHaveBeenCalled();
      expect(setComposerFocused).toHaveBeenCalledWith(false);
    });
  });

  describe("onShowProjectTerminal & onToggleProjectTerminal", () => {
    it("shows existing dock if it has files and opens it if closed", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });

      act(() => {
        api.openProjectTerminal("/path/to/project");
        api.onHideProjectTerminal();
      });
      expect(projectTerminalsRef.current[0]?.open).toBe(false);

      act(() => {
        api.onShowProjectTerminal();
      });

      expect(projectTerminalsRef.current[0]?.open).toBe(true);
      expect(setProjectTerminalFocused).toHaveBeenCalledWith(true);
    });

    it("toggles dock open and closed via onToggleProjectTerminal", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });

      // First toggle creates and opens it
      act(() => {
        api.onToggleProjectTerminal();
      });
      expect(projectTerminalsRef.current[0]?.open).toBe(true);
      expect(setProjectTerminalFocused).toHaveBeenCalledWith(true);

      // Second toggle closes it
      act(() => {
        api.onToggleProjectTerminal();
      });
      expect(projectTerminalsRef.current[0]?.open).toBe(false);
      expect(setProjectTerminalFocused).toHaveBeenCalledWith(false);
    });
  });

  describe("dock layout callbacks (side, size, select, reorder)", () => {
    it("changes side and size", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });
      act(() => {
        api.openProjectTerminal("/path/to/project");
      });

      act(() => {
        api.onProjectTerminalSide("right");
      });
      expect(projectTerminalsRef.current[0]?.side).toBe("right");

      act(() => {
        api.onProjectTerminalSize(400);
      });
      expect(projectTerminalsRef.current[0]?.size).toBe(400);
    });

    it("selects terminal and focuses dock", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });
      act(() => {
        api.openProjectTerminal("/path/to/project");
        api.openProjectTerminal("/path/to/project");
      });

      const firstFileId = projectTerminalsRef.current[0]?.pane.files[0]?.id ?? "";
      expect(firstFileId).toBeTruthy();

      act(() => {
        api.onSelectProjectTerminal(firstFileId);
      });

      expect(projectTerminalsRef.current[0]?.pane.activeFileId).toBe(firstFileId);
      expect(setProjectTerminalFocused).toHaveBeenCalledWith(true);
    });

    it("reorders dock terminals", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });
      act(() => {
        api.openProjectTerminal("/path/to/project");
        api.openProjectTerminal("/path/to/project");
      });

      const files = projectTerminalsRef.current[0]?.pane.files ?? [];
      const reversedIds = [files[1]?.id ?? "", files[0]?.id ?? ""];

      act(() => {
        api.onReorderProjectTerminals(reversedIds);
      });

      const currentFiles = projectTerminalsRef.current[0]?.pane.files ?? [];
      expect(currentFiles.map((f) => f.id)).toEqual(reversedIds);
    });
  });

  describe("closing terminals", () => {
    it("closes single terminal after confirmation and removes empty dock", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });
      act(() => {
        api.openProjectTerminal("/path/to/project");
      });

      const fileId = projectTerminalsRef.current[0]?.pane.files[0]?.id ?? "";
      expect(fileId).toBeTruthy();

      await act(async () => {
        api.onCloseProjectTerminal(fileId);
      });

      expect(closeMocks.confirmCloseTerminal).toHaveBeenCalled();
      expect(ptyMocks.killPty).toHaveBeenCalledWith(fileId);
      expect(projectTerminalsRef.current.length).toBe(0);
    });

    it("closes terminal when multiple exist, keeping others", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });
      act(() => {
        api.openProjectTerminal("/path/to/project");
        api.openProjectTerminal("/path/to/project");
      });

      const files = projectTerminalsRef.current[0]?.pane.files ?? [];
      expect(files.length).toBe(2);
      const closeFileId = files[0]?.id ?? "";

      await act(async () => {
        api.onCloseProjectTerminal(closeFileId);
      });

      expect(projectTerminalsRef.current.length).toBe(1);
      expect(projectTerminalsRef.current[0]?.pane.files.length).toBe(1);
      expect(projectTerminalsRef.current[0]?.pane.files[0]?.id).not.toBe(closeFileId);
    });

    it("closes other terminals after confirmation", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });
      act(() => {
        api.openProjectTerminal("/path/to/project");
        api.openProjectTerminal("/path/to/project");
        api.openProjectTerminal("/path/to/project");
      });

      const files = projectTerminalsRef.current[0]?.pane.files ?? [];
      expect(files.length).toBe(3);
      const keepFileId = files[1]?.id ?? "";

      await act(async () => {
        api.onCloseOtherProjectTerminals(keepFileId);
      });

      expect(closeMocks.confirmCloseTerminals).toHaveBeenCalled();
      expect(ptyMocks.killPty).toHaveBeenCalledTimes(2);
      expect(projectTerminalsRef.current[0]?.pane.files.length).toBe(1);
      expect(projectTerminalsRef.current[0]?.pane.files[0]?.id).toBe(keepFileId);
    });
  });

  describe("onTerminalMetaChange", () => {
    it("patches terminal meta in both dock and tabs", async () => {
      const tab = makeTab("tab1");
      await mount({ projectCwd: "/path/to/project", looksLike: true, tabs: [tab] });

      act(() => {
        api.openProjectTerminal("/path/to/project");
      });

      const fileId = projectTerminalsRef.current[0]?.pane.files[0]?.id ?? "";

      act(() => {
        api.onTerminalMetaChange(fileId, { title: "Custom Terminal" });
      });

      expect(setProjectTerminals).toHaveBeenCalled();
      expect(setTabs).toHaveBeenCalled();
      expect(projectTerminalsRef.current[0]?.pane.files[0]?.path).toBe("Custom Terminal");
    });
  });

  describe("onToggleRunningTerminal", () => {
    it("toggles dock terminal open/closed if file is in dock", async () => {
      await mount({ projectCwd: "/path/to/project", looksLike: true });
      act(() => {
        api.openProjectTerminal("/path/to/project");
      });

      const fileId = projectTerminalsRef.current[0]?.pane.files[0]?.id ?? "";
      expect(projectTerminalsRef.current[0]?.open).toBe(true);

      // Dock open -> closes it
      act(() => {
        api.onToggleRunningTerminal(fileId);
      });
      expect(projectTerminalsRef.current[0]?.open).toBe(false);

      // Dock closed -> opens it
      act(() => {
        api.onToggleRunningTerminal(fileId);
      });
      expect(projectTerminalsRef.current[0]?.open).toBe(true);
    });
  });
});
