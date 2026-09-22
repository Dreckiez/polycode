// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leafIds, type WorkspaceTab } from "../lib/layout";
import type { Block, HarnessId, SecondOpinionMeta, Session } from "../lib/session";
import type { HandoffComposerCard } from "../lib/handoff";
import {
  type MultiSessionDeps,
  useMultiSession,
} from "./useMultiSession";

const mocks = vi.hoisted(() => ({
  newSession: vi.fn(),
  formatSessionTitle: vi.fn(),
  sessionDisplayTitle: vi.fn(),
  sessionWorkCwd: vi.fn(),
  newTab: vi.fn(),
  buildSecondOpinionPrompt: vi.fn(),
  buildSecondOpinionCard: vi.fn(),
  harnessForTurn: vi.fn(),
  turnEditedFiles: vi.fn(),
  turnReport: vi.fn(),
  turnUserRequest: vi.fn(),
  buildDeterministicHandoff: vi.fn(),
  buildHandoffComposerCard: vi.fn(),
  sessionThroughTurn: vi.fn(),
  applyHarnessEvent: vi.fn(),
  canCompactHarnessContext: vi.fn(),
  compactHarnessContext: vi.fn(),
  syncDockBadge: vi.fn(),
  selectedProviderAccountId: vi.fn(),
}));

vi.mock("../lib/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/layout")>();
  return { ...actual, newTab: mocks.newTab };
});
vi.mock("../lib/session", () => ({
  HARNESS_TITLE: {
    claude: "Claude Code",
    codex: "Codex",
    grok: "Grok Build",
  },
  formatSessionTitle: mocks.formatSessionTitle,
  newSession: mocks.newSession,
  sessionDisplayTitle: mocks.sessionDisplayTitle,
  sessionWorkCwd: mocks.sessionWorkCwd,
}));
vi.mock("../lib/secondOpinion", () => ({
  SECOND_OPINION_TITLE: "Second opinion",
  buildSecondOpinionCard: mocks.buildSecondOpinionCard,
  buildSecondOpinionPrompt: mocks.buildSecondOpinionPrompt,
  harnessForTurn: mocks.harnessForTurn,
  turnEditedFiles: mocks.turnEditedFiles,
  turnReport: mocks.turnReport,
  turnUserRequest: mocks.turnUserRequest,
}));
vi.mock("../lib/handoff", () => ({
  HANDOFF_TITLE: "Handoff",
  buildDeterministicHandoff: mocks.buildDeterministicHandoff,
  buildHandoffComposerCard: mocks.buildHandoffComposerCard,
  sessionThroughTurn: mocks.sessionThroughTurn,
}));
vi.mock("../lib/harness", () => ({
  applyHarnessEvent: mocks.applyHarnessEvent,
  canCompactHarnessContext: mocks.canCompactHarnessContext,
  compactHarnessContext: mocks.compactHarnessContext,
}));
vi.mock("../lib/dockBadge", () => ({
  syncDockBadge: mocks.syncDockBadge,
}));
vi.mock("../lib/providerAccounts", () => ({
  selectedProviderAccountId: mocks.selectedProviderAccountId,
}));

const layout = {
  newTab: vi.mocked(mocks.newTab),
};
const sessionLib = {
  newSession: vi.mocked(mocks.newSession),
  formatSessionTitle: vi.mocked(mocks.formatSessionTitle),
  sessionDisplayTitle: vi.mocked(mocks.sessionDisplayTitle),
  sessionWorkCwd: vi.mocked(mocks.sessionWorkCwd),
};
const secondOpinion = {
  buildSecondOpinionPrompt: vi.mocked(mocks.buildSecondOpinionPrompt),
  buildSecondOpinionCard: vi.mocked(mocks.buildSecondOpinionCard),
  harnessForTurn: vi.mocked(mocks.harnessForTurn),
  turnEditedFiles: vi.mocked(mocks.turnEditedFiles),
  turnReport: vi.mocked(mocks.turnReport),
  turnUserRequest: vi.mocked(mocks.turnUserRequest),
};
const handoff = {
  buildDeterministicHandoff: vi.mocked(mocks.buildDeterministicHandoff),
  buildHandoffComposerCard: vi.mocked(mocks.buildHandoffComposerCard),
  sessionThroughTurn: vi.mocked(mocks.sessionThroughTurn),
};
const harness = {
  applyHarnessEvent: vi.mocked(mocks.applyHarnessEvent),
  canCompactHarnessContext: vi.mocked(mocks.canCompactHarnessContext),
  compactHarnessContext: vi.mocked(mocks.compactHarnessContext),
};
const dockBadge = {
  syncDockBadge: vi.mocked(mocks.syncDockBadge),
};
const providerAccounts = {
  selectedProviderAccountId: vi.mocked(mocks.selectedProviderAccountId),
};

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useMultiSession>;
let sessionSerial: number;
let tabSerial: number;

let sessionsRef: { current: Session[] };
let tabsRef: { current: WorkspaceTab[] };
let activeTabIdRef: { current: string };
let turnGenRef: { current: Map<string, number> };

let appendTab: ReturnType<typeof vi.fn>;
let onSubmit: ReturnType<typeof vi.fn>;
let enqueueHarnessEvent: ReturnType<typeof vi.fn>;
let flushHarnessEvents: ReturnType<typeof vi.fn>;
let setSessions: ReturnType<typeof vi.fn>;
let setTabs: ReturnType<typeof vi.fn>;
let setActiveTabId: ReturnType<typeof vi.fn>;
let setProjectTerminalFocused: ReturnType<typeof vi.fn>;
let setComposerFocused: ReturnType<typeof vi.fn>;

function MultiSessionHarness({ deps }: { deps: MultiSessionDeps }) {
  api = useMultiSession(deps);
  return null;
}

async function mount(opts: {
  sessions?: Session[];
  tabs?: WorkspaceTab[];
  activeTabId?: string;
}) {
  sessionsRef = { current: opts.sessions ?? [] };
  tabsRef = { current: opts.tabs ?? [] };
  activeTabIdRef = { current: opts.activeTabId ?? "" };
  turnGenRef = { current: new Map<string, number>() };
  appendTab = vi.fn((tab: WorkspaceTab, _cwd?: string) => {
    tabsRef.current = [...tabsRef.current, tab];
  });
  onSubmit = vi.fn();
  enqueueHarnessEvent = vi.fn();
  flushHarnessEvents = vi.fn();
  setSessions = vi.fn(
    (updater: Session[] | ((prev: Session[]) => Session[])) => {
      sessionsRef.current =
        typeof updater === "function" ? updater(sessionsRef.current) : updater;
    },
  );
  setTabs = vi.fn(
    (
      updater: WorkspaceTab[] | ((prev: WorkspaceTab[]) => WorkspaceTab[]),
    ) => {
      tabsRef.current =
        typeof updater === "function" ? updater(tabsRef.current) : updater;
    },
  );
  setActiveTabId = vi.fn();
  setProjectTerminalFocused = vi.fn();
  setComposerFocused = vi.fn();
  const deps: MultiSessionDeps = {
    activeTabIdRef,
    tabsRef,
    sessionsRef,
    turnGen: turnGenRef,
    appendTab,
    onSubmit,
    enqueueHarnessEvent,
    flushHarnessEvents,
    setSessions,
    setTabs,
    setActiveTabId,
    setProjectTerminalFocused,
    setComposerFocused,
  } satisfies MultiSessionDeps;
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(MultiSessionHarness, { deps }),
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

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionSerial = 0;
  tabSerial = 0;
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
  sessionLib.newSession.mockReset().mockImplementation(
    (
      harness: Session["harness"] = "claude",
      cwd = "~",
      model?: string,
      runtimeMode: Session["runtimeMode"] = "supervised",
      modelSettings: Record<string, string> = {},
    ): Session => ({
      id: `session-${++sessionSerial}`,
      harness,
      model: model ?? "mock-model",
      modelSettings,
      runtimeMode,
      title: `mock-${sessionSerial}`,
      cwd,
      blocks: [],
    }),
  );
  sessionLib.formatSessionTitle.mockReset().mockImplementation(
    (harness: HarnessId, title: string) => `${harness} · ${title}`,
  );
  sessionLib.sessionDisplayTitle
    .mockReset()
    .mockImplementation((title: string) => title);
  sessionLib.sessionWorkCwd
    .mockReset()
    .mockImplementation(
      (s: { cwd: string; worktreeCwd?: string }) =>
        s.worktreeCwd ?? s.cwd,
    );
  secondOpinion.buildSecondOpinionPrompt
    .mockReset()
    .mockReturnValue("second-opinion prompt");
  secondOpinion.buildSecondOpinionCard.mockReset().mockImplementation(
    (input: {
      from: HarnessId;
      to: HarnessId;
      userRequest: string;
      files: string[];
    }): SecondOpinionMeta => ({
      from: input.from,
      to: input.to,
      ...(input.userRequest ? { request: input.userRequest } : {}),
      ...(input.files.length > 0 ? { files: input.files.length } : {}),
    }),
  );
  secondOpinion.harnessForTurn
    .mockReset()
    .mockImplementation(
      (_blocks: Block[], _turn: Block[], fallback: HarnessId) => fallback,
    );
  secondOpinion.turnUserRequest.mockReset().mockReturnValue("user request");
  secondOpinion.turnReport.mockReset().mockReturnValue("report");
  secondOpinion.turnEditedFiles.mockReset().mockReturnValue(["file.ts"]);
  handoff.sessionThroughTurn
    .mockReset()
    .mockImplementation((source: Session) => source);
  handoff.buildDeterministicHandoff.mockReset().mockReturnValue("brief");
  handoff.buildHandoffComposerCard.mockReset().mockImplementation(
    (input: {
      from: HarnessId;
      to: HarnessId;
      brief: string;
      userRequest: string;
      files: string[];
    }): HandoffComposerCard => ({
      from: input.from,
      to: input.to,
      brief: input.brief,
      ...(input.userRequest ? { request: input.userRequest } : {}),
      ...(input.files.length > 0 ? { files: input.files.length } : {}),
    }),
  );
  harness.applyHarnessEvent
    .mockReset()
    .mockImplementation((current: Session) => current);
  harness.canCompactHarnessContext.mockReset().mockReturnValue(false);
  harness.compactHarnessContext.mockReset().mockResolvedValue(undefined);
  dockBadge.syncDockBadge.mockReset();
  providerAccounts.selectedProviderAccountId
    .mockReset()
    .mockReturnValue("default-acct");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useMultiSession", () => {
  it("openSessionBeside splits the source pane and activates the new session beside it", async () => {
    const s1 = session("s1", "/repo");
    const tabA = sessionTab("tab-a", "s1");
    await mount({
      sessions: [s1],
      tabs: [tabA],
      activeTabId: "tab-a",
    });

    const s2 = session("s2", "/repo");
    await act(async () => {
      api.openSessionBeside("s1", s2, "/repo", true);
    });

    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1", "s2"]);
    expect(setSessions).toHaveBeenCalledExactlyOnceWith([s1, s2]);
    const tab = tabsRef.current[0];
    expect(tab?.focusedId).toBe("s2");
    expect(tab?.layout.type === "split").toBe(true);
    const leaves = leafIds(tab!.layout);
    expect(leaves).toContain("s1");
    expect(leaves).toContain("s2");
    expect(setActiveTabId).not.toHaveBeenCalled();
    expect(setProjectTerminalFocused).toHaveBeenCalledExactlyOnceWith(false);
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("openSessionBeside falls back to a fresh blank tab when the source session has no pane", async () => {
    const s1 = session("s1", "/repo");
    const blankTab = sessionTab("tab-blank", "ghost");
    await mount({
      sessions: [s1],
      tabs: [blankTab],
      activeTabId: "tab-blank",
    });

    const s2 = session("s2", "/repo");
    await act(async () => {
      api.openSessionBeside("s1", s2, "/repo");
    });

    expect(sessionsRef.current.map((entry) => entry.id)).toEqual(["s1", "s2"]);
    const created = layout.newTab.mock.results.at(-1)?.value as WorkspaceTab;
    expect(created.focusedId).toBe("s2");
    expect(appendTab).toHaveBeenCalledExactlyOnceWith(created, "/repo");
    expect(setActiveTabId).toHaveBeenCalledExactlyOnceWith(created.id);
    expect(tabsRef.current.at(-1)?.id).toBe(created.id);
    expect(setProjectTerminalFocused).toHaveBeenCalledExactlyOnceWith(false);
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("onHandoff opens a handoff session with a composer card beside the current session", async () => {
    const turn: Block[] = [
      { id: "u1", role: "user", text: "hello" },
      { id: "a1", role: "assistant", text: "done" },
    ];
    const s1 = session("s1", "/repo", turn, { title: "hello" });
    const tabA = sessionTab("tab-a", "s1");
    await mount({
      sessions: [s1],
      tabs: [tabA],
      activeTabId: "tab-other",
    });

    await act(async () => {
      api.onHandoff("s1", "codex", turn, "model-x");
    });

    expect(handoff.sessionThroughTurn).toHaveBeenCalledExactlyOnceWith(s1, turn);
    expect(handoff.buildDeterministicHandoff).toHaveBeenCalledExactlyOnceWith(
      s1,
    );
    expect(sessionLib.sessionDisplayTitle).toHaveBeenCalledExactlyOnceWith(
      "hello",
      "claude",
    );
    expect(handoff.buildHandoffComposerCard).toHaveBeenCalledExactlyOnceWith({
      from: "claude",
      to: "codex",
      brief: "brief",
      userRequest: "user request",
      files: ["file.ts"],
    });
    expect(sessionLib.newSession).toHaveBeenCalledExactlyOnceWith(
      "codex",
      "/repo",
      "model-x",
      "supervised",
    );
    expect(sessionLib.formatSessionTitle).toHaveBeenCalledExactlyOnceWith(
      "codex",
      "hello",
    );
    const created = sessionsRef.current[1];
    expect(created?.id).toBe("session-1");
    expect(created?.handoffCard).toEqual({
      from: "claude",
      to: "codex",
      brief: "brief",
      request: "user request",
      files: 1,
    });
    const tab = tabsRef.current[0];
    expect(tab?.focusedId).toBe(created!.id);
    const leaves = leafIds(tab!.layout);
    expect(leaves).toContain("s1");
    expect(leaves).toContain(created!.id);
    expect(setActiveTabId).toHaveBeenCalledExactlyOnceWith("tab-a");
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(true);
    expect(setProjectTerminalFocused).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("onSecondOpinion opens a second-opinion session beside the source and submits its prompt", async () => {
    const turn: Block[] = [
      { id: "u1", role: "user", text: "hello" },
      { id: "a1", role: "assistant", text: "done" },
    ];
    const s1 = session("s1", "/repo", turn);
    const tabA = sessionTab("tab-a", "s1");
    await mount({
      sessions: [s1],
      tabs: [tabA],
      activeTabId: "tab-a",
    });

    await act(async () => {
      api.onSecondOpinion("s1", "codex", turn, "model-x");
    });

    expect(secondOpinion.buildSecondOpinionPrompt).toHaveBeenCalledExactlyOnceWith(
      {
        from: "claude",
        userRequest: "user request",
        report: "report",
        files: ["file.ts"],
      },
    );
    expect(sessionLib.newSession).toHaveBeenCalledExactlyOnceWith(
      "codex",
      "/repo",
      "model-x",
      "supervised",
    );
    expect(sessionLib.formatSessionTitle).toHaveBeenCalledExactlyOnceWith(
      "codex",
      "Second opinion",
    );
    const created = sessionsRef.current[1];
    expect(created?.id).toBe("session-1");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      created!.id,
      "second-opinion prompt",
      [],
      { secondOpinion: { from: "claude", to: "codex", request: "user request", files: 1 } },
    );
    const tab = tabsRef.current[0];
    expect(tab?.focusedId).toBe(created!.id);
    const leaves = leafIds(tab!.layout);
    expect(leaves).toContain("s1");
    expect(leaves).toContain(created!.id);
    expect(setActiveTabId).not.toHaveBeenCalled();
    expect(setComposerFocused).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("onHandoff with an unknown source session is a no-op", async () => {
    const turn: Block[] = [
      { id: "u1", role: "user", text: "hello" },
      { id: "a1", role: "assistant", text: "done" },
    ];
    const s1 = session("s1", "/repo");
    await mount({
      sessions: [s1],
      tabs: [sessionTab("tab-a", "s1")],
      activeTabId: "tab-a",
    });

    await act(async () => {
      api.onHandoff("missing", "codex", turn, "model-x");
    });

    expect(sessionLib.newSession).not.toHaveBeenCalled();
    expect(handoff.sessionThroughTurn).not.toHaveBeenCalled();
    expect(handoff.buildHandoffComposerCard).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(sessionsRef.current).toHaveLength(1);
    expect(setSessions).not.toHaveBeenCalled();
    expect(setTabs).not.toHaveBeenCalled();
  });

  it("onCompactContext compacts the current session's context through the real harness lib", async () => {
    const s1 = session("s1", "/repo");
    harness.canCompactHarnessContext.mockReturnValue(true);
    await mount({
      sessions: [s1],
      tabs: [sessionTab("tab-a", "s1")],
      activeTabId: "tab-a",
    });

    let compacted: boolean;
    await act(async () => {
      compacted = api.onCompactContext("s1");
    });
    await act(async () => {});

    expect(compacted!).toBe(true);
    expect(harness.canCompactHarnessContext).toHaveBeenCalledExactlyOnceWith(
      "claude",
    );
    expect(providerAccounts.selectedProviderAccountId).toHaveBeenCalledExactlyOnceWith(
      "claude",
      "/repo",
    );
    expect(harness.compactHarnessContext).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        harness: "claude",
        sessionId: "s1",
        cwd: "/repo",
        model: "mock-model",
        providerAccountId: "default-acct",
      }),
    );
    expect(harness.applyHarnessEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s1", busy: true }),
      { type: "status", text: "Compacting context…" },
    );
    expect(enqueueHarnessEvent).toHaveBeenCalledExactlyOnceWith("s1", {
      type: "status",
      text: "Compacted context",
    });
    expect(dockBadge.syncDockBadge).toHaveBeenCalled();
    expect(flushHarnessEvents).toHaveBeenCalledTimes(1);
    expect(turnGenRef.current.get("s1")).toBe(1);
    expect(sessionsRef.current[0]?.busy).toBe(false);
  });

  it("onCompactContext with an unsupported harness is a no-op that surfaces a status event", async () => {
    const s1 = session("s1", "/repo");
    harness.canCompactHarnessContext.mockReturnValue(false);
    await mount({
      sessions: [s1],
      tabs: [sessionTab("tab-a", "s1")],
      activeTabId: "tab-a",
    });

    let compacted: boolean;
    await act(async () => {
      compacted = api.onCompactContext("s1");
    });

    expect(compacted!).toBe(true);
    expect(harness.canCompactHarnessContext).toHaveBeenCalledExactlyOnceWith(
      "claude",
    );
    expect(harness.compactHarnessContext).not.toHaveBeenCalled();
    expect(harness.applyHarnessEvent).toHaveBeenCalledExactlyOnceWith(
      s1,
      {
        type: "status",
        text: "Claude Code does not support manual context compaction.",
      },
    );
    expect(dockBadge.syncDockBadge).toHaveBeenCalledExactlyOnceWith([s1]);
    expect(flushHarnessEvents).not.toHaveBeenCalled();
    expect(enqueueHarnessEvent).not.toHaveBeenCalled();
  });
});