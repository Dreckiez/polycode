// @vitest-environment happy-dom
import { act, createElement, StrictMode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDiscardUnsaved } from "../lib/appConfirm";
import { isBlankWorkspaceTab } from "../lib/appTabs";
import { basename } from "../lib/fs";
import {
  leaf,
  leafIds,
  type EditorPane,
  type FilePaneTab,
  type WorkspaceTab,
} from "../lib/layout";
import { killPty } from "../lib/pty";
import { newSession } from "../lib/session";
import type { Session } from "../lib/session";
import {
  confirmCloseTerminal,
  confirmCloseTerminals,
} from "../lib/terminalClose";
import {
  planWorkspaceTabClose,
  type WorkspaceTabCloseScope,
} from "../lib/workspaceTabGroups";
import { type TabCloseDeps, useTabClose } from "./useTabClose";

const mocks = vi.hoisted(() => ({
  confirmDiscardUnsaved: vi.fn(),
  confirmCloseTerminal: vi.fn(),
  confirmCloseTerminals: vi.fn(),
  killPty: vi.fn(),
  planWorkspaceTabClose: vi.fn(),
  newSession: vi.fn(),
  basename: vi.fn(),
  isBlankWorkspaceTab: vi.fn(),
}));

vi.mock("../lib/appConfirm", () => ({
  confirmDiscardUnsaved: mocks.confirmDiscardUnsaved,
}));
vi.mock("../lib/terminalClose", () => ({
  confirmCloseTerminal: mocks.confirmCloseTerminal,
  confirmCloseTerminals: mocks.confirmCloseTerminals,
}));
vi.mock("../lib/pty", () => ({ killPty: mocks.killPty }));
vi.mock("../lib/workspaceTabGroups", () => ({
  planWorkspaceTabClose: mocks.planWorkspaceTabClose,
}));
vi.mock("../lib/session", () => ({ newSession: mocks.newSession }));
vi.mock("../lib/fs", () => ({ basename: mocks.basename }));
vi.mock("../lib/appTabs", () => ({
  isBlankWorkspaceTab: mocks.isBlankWorkspaceTab,
}));

const confirmer = {
  confirmDiscardUnsaved: vi.mocked(confirmDiscardUnsaved),
  confirmCloseTerminal: vi.mocked(confirmCloseTerminal),
  confirmCloseTerminals: vi.mocked(confirmCloseTerminals),
  killPty: vi.mocked(killPty),
  planWorkspaceTabClose: vi.mocked(planWorkspaceTabClose),
  newSession: vi.mocked(newSession),
  basename: vi.mocked(basename),
  isBlankWorkspaceTab: vi.mocked(isBlankWorkspaceTab),
};

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useTabClose>;
let serial: number;

let tabs: WorkspaceTab[];
let tabsRef: RefObject<WorkspaceTab[]>;
let sessionsRef: RefObject<Session[]>;
let dirtyFilesRef: RefObject<Set<string>>;
let activeTabIdRef: RefObject<string>;
let activateTab: ReturnType<typeof vi.fn>;
let persistSession: ReturnType<typeof vi.fn>;
let refreshHistory: ReturnType<typeof vi.fn>;
let setComposerFocused: ReturnType<typeof vi.fn>;
let setDirtyFiles: ReturnType<typeof vi.fn>;
let setSessions: ReturnType<typeof vi.fn>;
let setTabs: ReturnType<typeof vi.fn>;

function TabCloseHarness({ deps }: { deps: TabCloseDeps }) {
  api = useTabClose(deps);
  return null;
}

async function mount(opts: {
  tabs: WorkspaceTab[];
  sessions: Session[];
  activeTabId?: string;
  dirty?: Set<string>;
  scope?: WorkspaceTabCloseScope;
}) {
  tabs = opts.tabs;
  tabsRef = { current: tabs };
  sessionsRef = { current: opts.sessions };
  dirtyFilesRef = { current: opts.dirty ?? new Set() };
  activeTabIdRef = { current: opts.activeTabId ?? tabs[0]?.id ?? "" };
  activateTab = vi.fn();
  persistSession = vi.fn();
  refreshHistory = vi.fn();
  setComposerFocused = vi.fn();
  setDirtyFiles = vi.fn(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      dirtyFilesRef.current =
        typeof updater === "function" ? updater(dirtyFilesRef.current) : updater;
    },
  );
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
  const deps: TabCloseDeps = {
    activeTabId: activeTabIdRef.current,
    activeTabIdRef,
    activateTab,
    dirtyFilesRef,
    persistSession,
    projectCwd: "/repo",
    refreshHistory,
    sessionsRef,
    setComposerFocused,
    setDirtyFiles,
    setSessions,
    setTabs,
    sidebarCwd: "/repo",
    tabCloseScope: opts.scope ?? "workspace",
    tabs,
    tabsRef,
  };
  await act(async () =>
    root.render(
      createElement(StrictMode, null, createElement(TabCloseHarness, { deps })),
    ),
  );
}

function session(id: string, cwd = "/repo", blocks: Session["blocks"] = []): Session {
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

function editorPane(files: FilePaneTab[]): EditorPane {
  return {
    id: `pane-${files[0]?.id ?? "empty"}`,
    files,
    activeFileId: files[0]?.id ?? "",
  };
}

function fileTab(id: string): FilePaneTab {
  return { id, path: `/repo/${id}.ts`, cwd: "/repo" };
}

function terminalTab(id: string): FilePaneTab {
  return { id, path: `zsh /repo`, cwd: "/repo", terminal: true };
}

function sessionTab(id: string, sessionId: string): WorkspaceTab {
  return {
    kind: "session",
    id,
    layout: leaf(sessionId),
    focusedId: sessionId,
    editorPanes: [],
    terminalPanes: [],
  };
}

function fileSessionTab(id: string, sessionId: string, files: FilePaneTab[]): WorkspaceTab {
  return {
    kind: "session",
    id,
    layout: leaf(sessionId),
    focusedId: sessionId,
    editorPanes: [editorPane(files)],
    terminalPanes: [],
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  serial = 0;
  confirmer.confirmDiscardUnsaved.mockReset().mockResolvedValue(true);
  confirmer.confirmCloseTerminal.mockReset().mockResolvedValue(true);
  confirmer.confirmCloseTerminals.mockReset().mockResolvedValue(true);
  confirmer.killPty.mockReset().mockResolvedValue(undefined);
  confirmer.planWorkspaceTabClose.mockReset().mockReturnValue({ action: "keep" });
  confirmer.newSession.mockReset().mockImplementation(
    (harness?: string, cwd?: string, model?: string, runtimeMode?: string) => ({
      id: `fresh-${++serial}`,
      harness: (harness ?? "claude") as Session["harness"],
      model: model ?? "mock-model",
      modelSettings: {},
      runtimeMode: (runtimeMode ?? "supervised") as Session["runtimeMode"],
      title: "mock-title",
      cwd: cwd ?? "~",
      blocks: [],
    }),
  );
  confirmer.basename
    .mockReset()
    .mockImplementation((path: string) =>
      path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
    );
  confirmer.isBlankWorkspaceTab.mockReset().mockImplementation(
    (tab: WorkspaceTab, sessions: Session[]): boolean => {
      if (tab.editorPanes.some((pane) => pane.files.length > 0)) return false;
      if ((tab.terminalPanes ?? []).some((pane) => pane.files.length > 0))
        return false;
      const ids = leafIds(tab.layout);
      if (ids.length !== 1) return false;
      return sessions.find((entry) => entry.id === ids[0])?.blocks.length === 0;
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function resolveTabs(): WorkspaceTab[] {
  const last = confirmerSetterLast(setTabs);
  if (last === undefined) return tabsRef.current;
  return typeof last === "function" ? last(tabsRef.current) : last;
}

function confirmerSetterLast(mock: ReturnType<typeof vi.fn>): unknown {
  const call = mock.mock.calls.at(-1);
  return call?.[0];
}

describe("useTabClose", () => {
  it("onCloseTab removes a clean file tab and persists its gone sessions", async () => {
    const sessionA = session("session-tab-a");
    const sessionB = session("session-tab-b");
    const tabA = fileSessionTab("tab-a", "session-tab-a", [fileTab("file-a")]);
    const tabB = fileSessionTab("tab-b", "session-tab-b", [fileTab("file-b")]);
    await mount({
      tabs: [tabA, tabB],
      sessions: [sessionA, sessionB],
      activeTabId: "tab-a",
    });
    confirmer.planWorkspaceTabClose.mockReturnValue({
      action: "close",
      nextActiveTabId: "tab-a",
    });

    await act(async () => {
      api.onCloseTab("tab-b");
    });

    expect(confirmer.confirmDiscardUnsaved).not.toHaveBeenCalled();
    expect(confirmer.confirmCloseTerminals).not.toHaveBeenCalled();
    expect(setTabs).toHaveBeenCalledTimes(1);
    expect(resolveTabs().map((tab) => tab.id)).toEqual(["tab-a"]);
    expect(persistSession).toHaveBeenCalledExactlyOnceWith(sessionB);
    expect(refreshHistory).toHaveBeenCalledExactlyOnceWith("/repo");
  });

  it("onCloseTab asks before closing a dirty file tab and aborts when refused", async () => {
    const sessionA = session("session-tab-a");
    const sessionB = session("session-tab-b");
    const tabA = fileSessionTab("tab-a", "session-tab-a", [fileTab("file-a")]);
    const tabB = fileSessionTab("tab-b", "session-tab-b", [fileTab("file-b")]);
    await mount({
      tabs: [tabA, tabB],
      sessions: [sessionA, sessionB],
      dirty: new Set(["file-b"]),
      activeTabId: "tab-a",
    });
    confirmer.planWorkspaceTabClose.mockReturnValue({
      action: "close",
      nextActiveTabId: "tab-a",
    });

    await act(async () => {
      api.onCloseTab("tab-b");
    });
    expect(confirmer.confirmDiscardUnsaved).toHaveBeenCalledExactlyOnceWith(
      "Close this tab with unsaved files?",
    );
    expect(confirmer.confirmDiscardUnsaved).toHaveBeenCalledTimes(1);
    expect(resolveTabs().map((tab) => tab.id)).toEqual(["tab-a"]);

    confirmer.confirmDiscardUnsaved.mockResolvedValue(false);
    await mount({
      tabs: [tabA, tabB],
      sessions: [sessionA, sessionB],
      dirty: new Set(["file-b"]),
      activeTabId: "tab-a",
    });
    await act(async () => {
      api.onCloseTab("tab-b");
    });
    expect(confirmer.confirmDiscardUnsaved).toHaveBeenCalledTimes(2);
    expect(setTabs).not.toHaveBeenCalled();
    expect(resolveTabs().map((tab) => tab.id)).toEqual(["tab-a", "tab-b"]);
  });

  it("onCloseTab runs the terminal-close flow for a terminal tab", async () => {
    const sessionA = session("session-tab-a");
    const sessionT = session("session-tab-t");
    const tabA = sessionTab("tab-a", "session-tab-a");
    const term = terminalTab("term-1");
    const tabT = {
      ...sessionTab("tab-t", "session-tab-t"),
      terminalPanes: [editorPane([term])],
    } as WorkspaceTab;
    await mount({
      tabs: [tabA, tabT],
      sessions: [sessionA, sessionT],
      activeTabId: "tab-a",
    });
    confirmer.planWorkspaceTabClose.mockReturnValue({
      action: "close",
      nextActiveTabId: "tab-a",
    });

    await act(async () => {
      api.onCloseTab("tab-t");
    });

    expect(confirmer.confirmCloseTerminals).toHaveBeenCalledExactlyOnceWith([
      term,
    ]);
    expect(confirmer.killPty).toHaveBeenCalledExactlyOnceWith("term-1");
    expect(resolveTabs().map((tab) => tab.id)).toEqual(["tab-a"]);
  });

  it("onCloseTab skips the terminal confirm for pre-confirmed terminals", async () => {
    const sessionA = session("session-tab-a");
    const sessionT = session("session-tab-t");
    const term = terminalTab("term-1");
    const tabT = {
      ...sessionTab("tab-t", "session-tab-t"),
      terminalPanes: [editorPane([term])],
    } as WorkspaceTab;
    await mount({
      tabs: [sessionTab("tab-a", "session-tab-a"), tabT],
      sessions: [sessionA, sessionT],
      activeTabId: "tab-a",
    });
    confirmer.planWorkspaceTabClose.mockReturnValue({
      action: "close",
      nextActiveTabId: "tab-a",
    });

    await act(async () => {
      api.onCloseTab("tab-t", { confirmedTerminalIds: ["term-1"] });
    });

    expect(confirmer.confirmCloseTerminals).not.toHaveBeenCalled();
    expect(confirmer.killPty).toHaveBeenCalledExactlyOnceWith("term-1");
    expect(resolveTabs().map((tab) => tab.id)).toEqual(["tab-a"]);
  });

  it("onCloseFile removes a file pane and focuses its sibling pane", async () => {
    const paneA: EditorPane = {
      id: "pane-a",
      files: [fileTab("file-a")],
      activeFileId: "file-a",
    };
    const paneB: EditorPane = {
      id: "pane-b",
      files: [fileTab("file-b")],
      activeFileId: "file-b",
    };
    const tab: WorkspaceTab = {
      kind: "session",
      id: "tab-x",
      layout: {
        type: "split",
        id: "split-x",
        dir: "right",
        children: [leaf("pane-a"), leaf("pane-b")],
        sizes: [0.5, 0.5],
      },
      focusedId: "pane-a",
      editorPanes: [paneA, paneB],
      terminalPanes: [],
    };
    await mount({
      tabs: [tab],
      sessions: [],
      activeTabId: "tab-x",
    });

    await act(async () => {
      api.onCloseFile("pane-a", "file-a");
    });

    expect(confirmer.confirmDiscardUnsaved).not.toHaveBeenCalled();
    expect(confirmer.confirmCloseTerminal).not.toHaveBeenCalled();
    const next = resolveTabs();
    expect(next).toHaveLength(1);
    expect(next[0].layout).toEqual(leaf("pane-b"));
    expect(next[0].focusedId).toBe("pane-b");
    expect(next[0].editorPanes.map((pane) => pane.id)).toEqual(["pane-b"]);
    expect(next[0].editorPanes[0].activeFileId).toBe("file-b");
  });

  it("onCloseFile keeps the pane when other files remain", async () => {
    const pane: EditorPane = {
      id: "pane-a",
      files: [fileTab("file-a"), fileTab("file-b")],
      activeFileId: "file-a",
    };
    const tab: WorkspaceTab = {
      kind: "session",
      id: "tab-x",
      layout: leaf("pane-a"),
      focusedId: "pane-a",
      editorPanes: [pane],
      terminalPanes: [],
    };
    await mount({
      tabs: [tab],
      sessions: [],
      activeTabId: "tab-x",
    });

    await act(async () => {
      api.onCloseFile("pane-a", "file-a");
    });

    const next = resolveTabs();
    expect(next).toHaveLength(1);
    expect(next[0].layout).toEqual(leaf("pane-a"));
    expect(next[0].focusedId).toBe("pane-a");
    const nextPane = next[0].editorPanes[0]!;
    expect(nextPane.files.map((file) => file.id)).toEqual(["file-b"]);
    expect(nextPane.activeFileId).toBe("file-b");
  });

  it("onCloseFile removes the last pane and focuses a sibling session leaf", async () => {
    const sessionS = session("session-s");
    const paneA: EditorPane = {
      id: "pane-a",
      files: [fileTab("file-a")],
      activeFileId: "file-a",
    };
    const tab: WorkspaceTab = {
      kind: "session",
      id: "tab-x",
      layout: {
        type: "split",
        id: "split-x",
        dir: "right",
        children: [leaf("pane-a"), leaf("session-s")],
        sizes: [0.5, 0.5],
      },
      focusedId: "pane-a",
      editorPanes: [paneA],
      terminalPanes: [],
    };
    await mount({
      tabs: [tab],
      sessions: [sessionS],
      activeTabId: "tab-x",
    });

    await act(async () => {
      api.onCloseFile("pane-a", "file-a");
    });

    const next = resolveTabs();
    expect(next).toHaveLength(1);
    expect(next[0].layout).toEqual(leaf("session-s"));
    expect(next[0].focusedId).toBe("session-s");
    expect(next[0].editorPanes).toEqual([]);
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("onCloseTabs closes several tabs at once and keeps the fallback open", async () => {
    const sessionA = session("session-tab-a");
    const sessionB = session("session-tab-b");
    const sessionC = session("session-tab-c");
    const tabA = sessionTab("tab-a", "session-tab-a");
    const tabB = fileSessionTab("tab-b", "session-tab-b", [fileTab("file-b")]);
    const tabC = sessionTab("tab-c", "session-tab-c");
    await mount({
      tabs: [tabA, tabB, tabC],
      sessions: [sessionA, sessionB, sessionC],
      dirty: new Set(["file-b"]),
      activeTabId: "tab-b",
    });

    await act(async () => {
      api.onCloseTabs(["tab-b", "tab-c"], "tab-a");
    });

    expect(confirmer.confirmDiscardUnsaved).toHaveBeenCalledExactlyOnceWith(
      "Close these tabs with unsaved files?",
    );
    expect(resolveTabs().map((tab) => tab.id)).toEqual(["tab-a"]);
    expect(persistSession).toHaveBeenCalledWith(sessionB);
    expect(persistSession).toHaveBeenCalledWith(sessionC);
    expect(activateTab).toHaveBeenCalledExactlyOnceWith("tab-a");
    expect(refreshHistory).toHaveBeenCalledExactlyOnceWith("/repo");
  });

  it("onCloseTabs refuses to leave the window empty when no fallback survives", async () => {
    const sessionA = session("session-tab-a");
    const tabA = sessionTab("tab-a", "session-tab-a");
    await mount({
      tabs: [tabA],
      sessions: [sessionA],
      activeTabId: "tab-a",
    });

    await act(async () => {
      api.onCloseTabs(["tab-a"], "tab-a");
    });

    expect(setTabs).not.toHaveBeenCalled();
    expect(confirmer.confirmDiscardUnsaved).not.toHaveBeenCalled();
    expect(persistSession).not.toHaveBeenCalled();
  });

  it("closing the active window removes the whole window and activates a sibling", async () => {
    const sessionA = session("session-tab-a");
    const sessionB = session("session-b");
    const sessionB2 = session("session-b2");
    const tabA = sessionTab("tab-a", "session-tab-a");
    const tabB: WorkspaceTab = {
      ...sessionTab("tab-b", "session-b"),
      layout: {
        type: "split",
        id: "split-b",
        dir: "right",
        children: [leaf("session-b"), leaf("session-b2")],
        sizes: [0.5, 0.5],
      },
    };
    await mount({
      tabs: [tabA, tabB],
      sessions: [sessionA, sessionB, sessionB2],
      activeTabId: "tab-b",
    });
    confirmer.planWorkspaceTabClose.mockReturnValue({
      action: "close",
      nextActiveTabId: "tab-a",
    });

    await act(async () => {
      api.onCloseTab("tab-b");
    });

    expect(resolveTabs().map((tab) => tab.id)).toEqual(["tab-a"]);
    expect(persistSession).toHaveBeenCalledWith(sessionB);
    expect(persistSession).toHaveBeenCalledWith(sessionB2);
    expect(activateTab).toHaveBeenCalledExactlyOnceWith("tab-a");
  });

  it("closing a tab activates the correct adjacent tab from the close plan", async () => {
    const tabA = sessionTab("tab-a", "session-tab-a");
    const tabB = sessionTab("tab-b", "session-tab-b");
    const tabC = sessionTab("tab-c", "session-tab-c");
    await mount({
      tabs: [tabA, tabB, tabC],
      sessions: [
        session("session-tab-a"),
        session("session-tab-b"),
        session("session-tab-c"),
      ],
      activeTabId: "tab-b",
    });
    confirmer.planWorkspaceTabClose.mockReturnValue({
      action: "close",
      nextActiveTabId: "tab-a",
    });

    await act(async () => {
      api.onCloseTab("tab-b");
    });

    expect(activateTab).toHaveBeenCalledExactlyOnceWith("tab-a");
    expect(resolveTabs().map((tab) => tab.id)).toEqual(["tab-a", "tab-c"]);
  });

  it("onCloseTab does not activate when a kept plan has no successor", async () => {
    const tabA = sessionTab("tab-a", "session-tab-a");
    const tabB = sessionTab("tab-b", "session-tab-b");
    await mount({
      tabs: [tabA, tabB],
      sessions: [session("session-tab-a"), session("session-tab-b")],
      activeTabId: "tab-b",
    });
    confirmer.planWorkspaceTabClose.mockReturnValue({ action: "keep" });

    await act(async () => {
      api.onCloseTab("tab-b");
    });

    expect(setTabs).not.toHaveBeenCalled();
    expect(activateTab).not.toHaveBeenCalled();
  });

  it("onClearTabSession replaces the tab's session with a blank session", async () => {
    const oldSession = session("session-tab-a", "/repo", [
      { id: "u1", role: "user", text: "hello" },
    ]);
    const tabA = fileSessionTab("tab-a", "session-tab-a", [fileTab("file-a")]);
    await mount({
      tabs: [tabA],
      sessions: [oldSession],
      activeTabId: "tab-a",
    });

    await act(async () => {
      api.onClearTabSession("tab-a");
    });

    expect(confirmer.newSession).toHaveBeenCalledExactlyOnceWith(
      "claude",
      "/repo",
      "mock-model",
      "supervised",
      {},
    );
    expect(persistSession).toHaveBeenCalledExactlyOnceWith(oldSession);
    const next = resolveTabs();
    expect(next).toHaveLength(1);
    expect(next[0].layout).toEqual(leaf("fresh-1"));
    expect(next[0].focusedId).toBe("fresh-1");
    expect(next[0].editorPanes).toEqual([]);
    expect(next[0].terminalPanes).toEqual([]);
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(true);
    expect(refreshHistory).toHaveBeenCalledExactlyOnceWith("/repo");
    expect(sessionsRef.current.map((entry) => entry.id)).toEqual([
      "session-tab-a",
      "fresh-1",
    ]);
  });

  it("onClearTabSession leaves a blank tab alone", async () => {
    const blank = session("session-tab-a");
    const tabA = sessionTab("tab-a", "session-tab-a");
    await mount({
      tabs: [tabA],
      sessions: [blank],
      activeTabId: "tab-a",
    });

    await act(async () => {
      api.onClearTabSession("tab-a");
    });

    expect(confirmer.newSession).not.toHaveBeenCalled();
    expect(setTabs).not.toHaveBeenCalled();
    expect(persistSession).not.toHaveBeenCalled();
  });

  it("leaves tabs, sessions, dirty files, and activation refs consistent afterwards", async () => {
    const sessionA = session("session-tab-a");
    const sessionB = session("session-tab-b");
    const sessionT = session("session-tab-t");
    const term = terminalTab("term-1");
    const tabA = fileSessionTab("tab-a", "session-tab-a", [fileTab("file-a")]);
    const tabB = fileSessionTab("tab-b", "session-tab-b", [fileTab("file-b")]);
    const tabT = {
      ...sessionTab("tab-t", "session-tab-t"),
      terminalPanes: [editorPane([term])],
    } as WorkspaceTab;
    await mount({
      tabs: [tabA, tabB, tabT],
      sessions: [sessionA, sessionB, sessionT],
      dirty: new Set(["file-b"]),
      activeTabId: "tab-b",
    });
    confirmer.planWorkspaceTabClose.mockReturnValue({
      action: "close",
      nextActiveTabId: "tab-a",
    });

    await act(async () => {
      api.onCloseTab("tab-b");
    });
    await act(async () => {
      api.onCloseTab("tab-t");
    });

    const remaining = resolveTabs();
    expect(remaining.map((tab) => tab.id)).toEqual(["tab-a"]);
    const openSessionIds = new Set(
      remaining.flatMap((tab) => leafIds(tab.layout)),
    );
    for (const openId of openSessionIds) {
      expect(sessionsRef.current.some((entry) => entry.id === openId)).toBe(
        true,
      );
    }
    expect(dirtyFilesRef.current.has("file-b")).toBe(false);
    expect(
      tabsRef.current.some((tab) =>
        [...tab.editorPanes, ...(tab.terminalPanes ?? [])].some((pane) =>
          pane.files.some((file) => file.id === "term-1"),
        ),
      ),
    ).toBe(false);
    const activated: unknown = confirmerSetterLast(activateTab);
    expect(remaining.some((tab) => tab.id === activated)).toBe(true);
  });
});