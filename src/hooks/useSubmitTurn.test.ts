// @vitest-environment happy-dom
import { act, createElement, StrictMode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  displayAttachments,
  prepareAttachments,
} from "../lib/attachments";
import {
  lastAssistantTextInTurn,
  userTurnCards,
  withPlanStatus,
} from "../lib/appSession";
import {
  beginSessionTurn,
  flushSessionCheckpoint,
  notifyReviewChanged,
} from "../lib/checkpoint";
import { notifyGitChanged } from "../lib/fs";
import {
  appendPreparingHandoff,
  buildDeterministicHandoff,
  chooseHandoffBrief,
  completeHandoff,
  consumeHandoff,
  handoffTurnCard,
  isPreparingHandoff,
  pendingHandoff,
  shouldAskOutgoingAgent,
  userMessagesAfterHandoff,
  wrapHandoffPrompt,
} from "../lib/handoff";
import { requestOutgoingHandoff } from "../lib/handoffTurn";
import {
  appendSteerUser,
  appendUser,
  canSteerHarness,
  cancelHarnessTurn,
  forgetHarnessSession,
  generateHarnessTitle,
  isLiveHarness,
  promoteLastAssistantToPlan,
  sendHarnessTurn,
  steerHarnessTurn,
  stopHarnessSession,
  stopStreaming,
} from "../lib/harness";
import { CONTINUE_PROMPT } from "../lib/inFlight";
import {
  dequeueQueuedMessage,
  queuedMessageForSubmit,
} from "../lib/messageQueue";
import { saveRecentModelChoice } from "../lib/models";
import { composeNoteMessage } from "../lib/notes";
import { notifySession } from "../lib/notifications";
import { isProviderFailureText, planTurnPrompt } from "../lib/plan";
import { preparePrompt } from "../lib/promptPreparation";
import { selectedProviderAccountId } from "../lib/providerAccounts";
import {
  canReplaceSessionTitle,
  formatSessionTitle,
  type PendingHarnessSwitch,
  sessionWorkCwd,
  titleFromPrompt,
  type Session,
} from "../lib/session";
import { resolveLinkedWorkItem } from "../lib/sessionWorkItem";
import { loadFollowUpBehavior } from "../lib/settings";
import { isNativeCommandPrompt } from "../lib/skills";
import { playCue } from "../lib/sounds";
import { SECOND_OPINION_TITLE } from "../lib/secondOpinion";
import { type SubmitTurnDeps, useSubmitTurn } from "./useSubmitTurn";

const lib = vi.hoisted(() => ({
  sendHarnessTurn: vi.fn(),
  steerHarnessTurn: vi.fn(),
  cancelHarnessTurn: vi.fn(),
  forgetHarnessSession: vi.fn(),
  generateHarnessTitle: vi.fn(),
  isLiveHarness: vi.fn(),
  canSteerHarness: vi.fn(),
  stopHarnessSession: vi.fn(),
  stopStreaming: vi.fn(),
  appendUser: vi.fn(),
  appendSteerUser: vi.fn(),
  promoteLastAssistantToPlan: vi.fn(),
  displayAttachments: vi.fn(),
  prepareAttachments: vi.fn(),
  userTurnCards: vi.fn(),
  trackSessionEdits: vi.fn(),
  nudgeWorkspace: vi.fn(),
  nudgeOpenEditors: vi.fn(),
  lastAssistantTextInTurn: vi.fn(),
  withPlanBuildTarget: vi.fn(),
  withPlanStatus: vi.fn(),
  appendPreparingHandoff: vi.fn(),
  buildDeterministicHandoff: vi.fn(),
  chooseHandoffBrief: vi.fn(),
  completeHandoff: vi.fn(),
  consumeHandoff: vi.fn(),
  handoffTurnCard: vi.fn(),
  isPreparingHandoff: vi.fn(),
  pendingHandoff: vi.fn(),
  shouldAskOutgoingAgent: vi.fn(),
  userMessagesAfterHandoff: vi.fn(),
  wrapHandoffPrompt: vi.fn(),
  beginSessionTurn: vi.fn(),
  flushSessionCheckpoint: vi.fn(),
  notifyReviewChanged: vi.fn(),
  canReplaceSessionTitle: vi.fn(),
  formatSessionTitle: vi.fn(),
  sessionWorkCwd: vi.fn(),
  titleFromPrompt: vi.fn(),
  isProviderFailureText: vi.fn(),
  planTurnPrompt: vi.fn(),
  composeNoteMessage: vi.fn(),
  isNativeCommandPrompt: vi.fn(),
  loadFollowUpBehavior: vi.fn(),
  selectedProviderAccountId: vi.fn(),
  saveRecentModelChoice: vi.fn(),
  preparePrompt: vi.fn(),
  dequeueQueuedMessage: vi.fn(),
  queuedMessageForSubmit: vi.fn(),
  requestOutgoingHandoff: vi.fn(),
  resolveLinkedWorkItem: vi.fn(),
  notifySession: vi.fn(),
  playCue: vi.fn(),
  notifyGitChanged: vi.fn(),
  nudgeWatchedFiles: vi.fn(),
}));

vi.mock("../lib/attachments", () => ({
  displayAttachments: lib.displayAttachments,
  prepareAttachments: lib.prepareAttachments,
}));
vi.mock("../lib/appSession", () => ({
  userTurnCards: lib.userTurnCards,
  trackSessionEdits: lib.trackSessionEdits,
  nudgeWorkspace: lib.nudgeWorkspace,
  nudgeOpenEditors: lib.nudgeOpenEditors,
  lastAssistantTextInTurn: lib.lastAssistantTextInTurn,
  withPlanBuildTarget: lib.withPlanBuildTarget,
  withPlanStatus: lib.withPlanStatus,
}));
vi.mock("../lib/harness", () => ({
  appendUser: lib.appendUser,
  appendSteerUser: lib.appendSteerUser,
  canSteerHarness: lib.canSteerHarness,
  cancelHarnessTurn: lib.cancelHarnessTurn,
  forgetHarnessSession: lib.forgetHarnessSession,
  generateHarnessTitle: lib.generateHarnessTitle,
  isLiveHarness: lib.isLiveHarness,
  promoteLastAssistantToPlan: lib.promoteLastAssistantToPlan,
  sendHarnessTurn: lib.sendHarnessTurn,
  steerHarnessTurn: lib.steerHarnessTurn,
  stopHarnessSession: lib.stopHarnessSession,
  stopStreaming: lib.stopStreaming,
}));
vi.mock("../lib/handoff", () => ({
  appendPreparingHandoff: lib.appendPreparingHandoff,
  buildDeterministicHandoff: lib.buildDeterministicHandoff,
  chooseHandoffBrief: lib.chooseHandoffBrief,
  completeHandoff: lib.completeHandoff,
  consumeHandoff: lib.consumeHandoff,
  handoffTurnCard: lib.handoffTurnCard,
  isPreparingHandoff: lib.isPreparingHandoff,
  pendingHandoff: lib.pendingHandoff,
  shouldAskOutgoingAgent: lib.shouldAskOutgoingAgent,
  userMessagesAfterHandoff: lib.userMessagesAfterHandoff,
  wrapHandoffPrompt: lib.wrapHandoffPrompt,
}));
vi.mock("../lib/checkpoint", () => ({
  beginSessionTurn: lib.beginSessionTurn,
  flushSessionCheckpoint: lib.flushSessionCheckpoint,
  notifyReviewChanged: lib.notifyReviewChanged,
}));
vi.mock("../lib/session", () => ({
  canReplaceSessionTitle: lib.canReplaceSessionTitle,
  formatSessionTitle: lib.formatSessionTitle,
  HARNESS_LABEL: { claude: "claude", codex: "codex" },
  sessionWorkCwd: lib.sessionWorkCwd,
  titleFromPrompt: lib.titleFromPrompt,
}));
vi.mock("../lib/plan", () => ({
  buildPlanPrompt: vi.fn(),
  isProviderFailureText: lib.isProviderFailureText,
  planTurnPrompt: lib.planTurnPrompt,
}));
vi.mock("../lib/secondOpinion", () => ({
  SECOND_OPINION_TITLE: "Second opinion",
}));
vi.mock("../lib/notes", () => ({ composeNoteMessage: lib.composeNoteMessage }));
vi.mock("../lib/skills", () => ({
  isNativeCommandPrompt: lib.isNativeCommandPrompt,
}));
vi.mock("../lib/settings", () => ({
  loadFollowUpBehavior: lib.loadFollowUpBehavior,
}));
vi.mock("../lib/providerAccounts", () => ({
  selectedProviderAccountId: lib.selectedProviderAccountId,
}));
vi.mock("../lib/models", () => ({
  saveRecentModelChoice: lib.saveRecentModelChoice,
}));
vi.mock("../lib/promptPreparation", () => ({
  preparePrompt: lib.preparePrompt,
}));
vi.mock("../lib/messageQueue", () => ({
  dequeueQueuedMessage: lib.dequeueQueuedMessage,
  queuedMessageForSubmit: lib.queuedMessageForSubmit,
}));
vi.mock("../lib/handoffTurn", () => ({
  requestOutgoingHandoff: lib.requestOutgoingHandoff,
}));
vi.mock("../lib/sessionWorkItem", () => ({
  resolveLinkedWorkItem: lib.resolveLinkedWorkItem,
}));
vi.mock("../lib/inFlight", () => ({ CONTINUE_PROMPT: "[continue]" }));
vi.mock("../lib/notifications", () => ({
  notifySession: lib.notifySession,
}));
vi.mock("../lib/sounds", () => ({ playCue: lib.playCue }));
vi.mock("../lib/fs", () => ({ notifyGitChanged: lib.notifyGitChanged }));
vi.mock("../lib/fileWatch", () => ({
  nudgeWatchedFiles: lib.nudgeWatchedFiles,
}));

const h = {
  sendHarnessTurn: vi.mocked(sendHarnessTurn),
  steerHarnessTurn: vi.mocked(steerHarnessTurn),
  forgetHarnessSession: vi.mocked(forgetHarnessSession),
  generateHarnessTitle: vi.mocked(generateHarnessTitle),
  cancelHarnessTurn: vi.mocked(cancelHarnessTurn),
  appendUser: vi.mocked(appendUser),
  appendSteerUser: vi.mocked(appendSteerUser),
  canReplaceSessionTitle: vi.mocked(canReplaceSessionTitle),
  formatSessionTitle: vi.mocked(formatSessionTitle),
  sessionWorkCwd: vi.mocked(sessionWorkCwd),
  titleFromPrompt: vi.mocked(titleFromPrompt),
  composeNoteMessage: vi.mocked(composeNoteMessage),
  prepareAttachments: vi.mocked(prepareAttachments),
  preparePrompt: vi.mocked(preparePrompt),
  planTurnPrompt: vi.mocked(planTurnPrompt),
  displayAttachments: vi.mocked(displayAttachments),
  isNativeCommandPrompt: vi.mocked(isNativeCommandPrompt),
  loadFollowUpBehavior: vi.mocked(loadFollowUpBehavior),
  selectedProviderAccountId: vi.mocked(selectedProviderAccountId),
  pendingHandoff: vi.mocked(pendingHandoff),
  shouldAskOutgoingAgent: vi.mocked(shouldAskOutgoingAgent),
  buildDeterministicHandoff: vi.mocked(buildDeterministicHandoff),
  chooseHandoffBrief: vi.mocked(chooseHandoffBrief),
  wrapHandoffPrompt: vi.mocked(wrapHandoffPrompt),
  isPreparingHandoff: vi.mocked(isPreparingHandoff),
  isLiveHarness: vi.mocked(isLiveHarness),
  canSteerHarness: vi.mocked(canSteerHarness),
  userTurnCards: vi.mocked(userTurnCards),
  notifySession: vi.mocked(notifySession),
};

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useSubmitTurn>;

let sessionsRef: RefObject<Session[]>;
let turnGen: RefObject<Map<string, number>>;
let removingSessionIds: RefObject<Set<string>>;
let activeSessionIdRef: RefObject<string | undefined>;
let setSessions: ReturnType<typeof vi.fn>;
let enqueueHarnessEvent: ReturnType<typeof vi.fn>;
let flushHarnessEvents: ReturnType<typeof vi.fn>;
let flushSessionLiveText: ReturnType<typeof vi.fn>;

function SubmitTurnHarness({ deps }: { deps: SubmitTurnDeps }) {
  api = useSubmitTurn(deps);
  return null;
}

function session(
  id: string,
  opts: {
    busy?: boolean;
    blocks?: Session["blocks"];
    title?: string;
    harness?: string;
    cwd?: string;
    providerAccountId?: string;
    pendingSwitch?: PendingHarnessSwitch;
  } = {},
): Session {
  return {
    id,
    harness: opts.harness ?? "claude",
    model: "mock-model",
    modelSettings: {},
    runtimeMode: "supervised",
    title: opts.title ?? `title-${id}`,
    cwd: opts.cwd ?? "/repo",
    busy: opts.busy,
    blocks: opts.blocks ?? [],
    ...(opts.providerAccountId ? { providerAccountId: opts.providerAccountId } : {}),
    ...(opts.pendingSwitch ? { pendingSwitch: opts.pendingSwitch } : {}),
  };
}

async function mount(initial: Session[]) {
  sessionsRef = { current: initial };
  turnGen = { current: new Map() };
  removingSessionIds = { current: new Set() };
  activeSessionIdRef = { current: initial[0]?.id };
  enqueueHarnessEvent = vi.fn();
  flushHarnessEvents = vi.fn();
  flushSessionLiveText = vi.fn((_sessionId: string, s: Session) => s);
  setSessions = vi.fn(
    (updater: Session[] | ((prev: Session[]) => Session[])) => {
      sessionsRef.current =
        typeof updater === "function" ? updater(sessionsRef.current) : updater;
    },
  );
  const deps: SubmitTurnDeps = {
    activeSessionIdRef,
    enqueueHarnessEvent,
    flushHarnessEvents,
    flushSessionLiveText,
    removingSessionIds,
    sessionsRef,
    setSessions,
    turnGen,
  };
  await act(async () =>
    root.render(
      createElement(StrictMode, null, createElement(SubmitTurnHarness, { deps })),
    ),
  );
}

function seedDefaults() {
  h.composeNoteMessage.mockImplementation((_card, text: string) => text);
  h.displayAttachments.mockImplementation((files) => files);
  h.prepareAttachments.mockResolvedValue("prepared");
  h.preparePrompt.mockResolvedValue("prepared-prompt");
  h.planTurnPrompt.mockImplementation((prompt: string) => `plan:${prompt}`);
  h.sessionWorkCwd.mockImplementation((s: Session) => s.cwd);
  h.titleFromPrompt.mockReturnValue("gen-title");
  h.formatSessionTitle.mockImplementation(
    (_harness, title: string) => `formatted:${title}`,
  );
  h.isNativeCommandPrompt.mockReturnValue(false);
  h.isLiveHarness.mockReturnValue(true);
  h.canSteerHarness.mockReturnValue(true);
  h.pendingHandoff.mockReturnValue(null);
  h.isPreparingHandoff.mockReturnValue(false);
  h.shouldAskOutgoingAgent.mockReturnValue(false);
  h.buildDeterministicHandoff.mockReturnValue("deterministic-brief");
  h.chooseHandoffBrief.mockImplementation((_agent, deterministic) => deterministic);
  h.wrapHandoffPrompt.mockImplementation(
    (_brief, from: string, text: string, _earlier: string[]) =>
      `[${from}->]${text}`,
  );
  h.userTurnCards.mockImplementation((noteCard?: unknown) =>
    noteCard ? {} : undefined,
  );
  h.appendUser.mockImplementation((s: Session) => s);
  h.appendSteerUser.mockImplementation((s: Session) => s);
  lib.stopStreaming.mockImplementation((s: Session) => s);
  lib.appendPreparingHandoff.mockImplementation((s: Session) => s);
  lib.completeHandoff.mockImplementation((s: Session) => s);
  lib.consumeHandoff.mockImplementation((s: Session) => s);
  lib.dequeueQueuedMessage.mockImplementation((s: Session) => s);
  h.canReplaceSessionTitle.mockReturnValue(false);
  h.generateHarnessTitle.mockResolvedValue({ title: "Auto Title" });
  h.selectedProviderAccountId.mockReturnValue("acct-1");
  h.loadFollowUpBehavior.mockReturnValue("queue");
  h.sendHarnessTurn.mockResolvedValue(undefined);
  h.steerHarnessTurn.mockResolvedValue(undefined);
  h.forgetHarnessSession.mockResolvedValue(undefined);
  h.cancelHarnessTurn.mockResolvedValue(undefined);
  h.notifySession.mockResolvedValue(false);
  lib.promoteLastAssistantToPlan.mockImplementation((s: Session) => s);
  lib.withPlanStatus.mockImplementation((s: Session) => s);
  lib.withPlanBuildTarget.mockImplementation((s: Session) => s);
  lib.lastAssistantTextInTurn.mockReturnValue("");
  lib.isProviderFailureText.mockReturnValue(false);
  lib.beginSessionTurn.mockResolvedValue(undefined);
  lib.flushSessionCheckpoint.mockResolvedValue(undefined);
  lib.stopHarnessSession.mockResolvedValue(undefined);
  lib.resolveLinkedWorkItem.mockResolvedValue(null);
  lib.saveRecentModelChoice.mockReturnValue(undefined);
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const fn of Object.values(lib)) fn.mockReset();
  seedDefaults();
  await Promise.resolve();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useSubmitTurn", () => {
  it("onSubmit with a new session dispatches the turn through sendHarnessTurn with the real run args", async () => {
    await mount([session("s1", { title: "" })]);

    await act(async () => {
      api.onSubmit("s1", "help too");
    });

    expect(h.sendHarnessTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        harness: "claude",
        sessionId: "s1",
        cwd: "/repo",
        model: "mock-model",
        modelSettings: {},
        providerAccountId: "acct-1",
        runtimeMode: "supervised",
        intent: "default",
        text: "prepared-prompt",
        attachments: "prepared",
        onEvent: expect.any(Function),
      }),
    );
    expect(h.appendUser).toHaveBeenCalledTimes(1);
    expect(h.steerHarnessTurn).not.toHaveBeenCalled();
    expect(lib.saveRecentModelChoice).toHaveBeenCalledWith(
      "claude",
      "mock-model",
    );
  });

  it("onSubmit with a follow-up on a busy steerable session routes through steerHarnessTurn instead of sendHarnessTurn", async () => {
    await mount([
      session("s1", {
        busy: true,
        blocks: [{ id: "b1", role: "assistant", text: "hi" }],
      }),
    ]);

    await act(async () => {
      api.onSubmit("s1", "and then?", [], { followUpBehavior: "steer" });
    });

    expect(h.steerHarnessTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        harness: "claude",
        sessionId: "s1",
        cwd: "/repo",
        model: "mock-model",
        modelSettings: {},
        text: "prepared-prompt",
        attachments: "prepared",
      }),
    );
    expect(h.sendHarnessTurn).not.toHaveBeenCalled();
    expect(h.appendSteerUser).toHaveBeenCalledTimes(1);
  });

  it("onSubmit on a busy session whose harness cannot steer reports a status event and never dispatches", async () => {
    h.canSteerHarness.mockReturnValue(false);
    await mount([
      session("s1", {
        busy: true,
        blocks: [{ id: "b1", role: "assistant", text: "hi" }],
      }),
    ]);

    await act(async () => {
      api.onSubmit("s1", "and then?", [], { followUpBehavior: "steer" });
    });

    expect(h.steerHarnessTurn).not.toHaveBeenCalled();
    expect(h.sendHarnessTurn).not.toHaveBeenCalled();
    expect(h.appendUser).not.toHaveBeenCalled();
    expect(enqueueHarnessEvent).toHaveBeenCalledExactlyOnceWith(
      "s1",
      expect.objectContaining({ type: "status" }),
    );
    expect(flushHarnessEvents).toHaveBeenCalledTimes(1);
  });

  it("onSubmit with a pending switch forgets the outgoing harness before sending", async () => {
    await mount([
      session("s1", {
        busy: true,
        pendingSwitch: {
          from: "codex",
          fromModel: "codex-model",
          fromSettings: {},
          fromProviderSessionId: undefined,
          fromProviderAccountId: undefined,
        },
      }),
    ]);

    await act(async () => {
      api.onSubmit("s1", "hand me off");
    });

    expect(h.forgetHarnessSession).toHaveBeenCalledExactlyOnceWith("codex", "s1");
    expect(h.sendHarnessTurn).toHaveBeenCalledTimes(1);
    expect(h.forgetHarnessSession.mock.invocationCallOrder[0]!).toBeLessThan(
      h.sendHarnessTurn.mock.invocationCallOrder[0]!,
    );
    expect(h.sendHarnessTurn).toHaveBeenCalledWith(
      expect.objectContaining({ text: "[codex->]prepared-prompt" }),
    );
  });

  it("onSubmit triggers app-level title generation when the session has no title yet", async () => {
    h.canReplaceSessionTitle.mockReturnValue(true);
    await mount([session("s1", { title: "" })]);

    await act(async () => {
      api.onSubmit("s1", "name me");
    });

    expect(h.generateHarnessTitle).toHaveBeenCalledExactlyOnceWith(
      "claude",
      expect.objectContaining({
        sessionId: "s1",
        cwd: "/repo",
        message: "name me",
        providerAccountId: "acct-1",
      }),
    );
    expect(sessionsRef.current[0].title).toBe("formatted:Auto Title");
  });

  it("onSubmit with intent plan threads the plan intent through to the run helper options", async () => {
    await mount([session("s1")]);

    await act(async () => {
      api.onSubmit("s1", "draw up a plan", [], { intent: "plan" });
    });

    expect(h.sendHarnessTurn).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "plan", text: "plan:prepared-prompt" }),
    );
    expect(h.sendHarnessTurn).toHaveBeenCalledTimes(1);
  });

  it("onSubmit appends the user turn to the session store before dispatching", async () => {
    await mount([session("s1")]);

    await act(async () => {
      api.onSubmit("s1", "hello world");
    });

    expect(h.appendUser).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "s1" }),
      "hello world",
      [],
      undefined,
    );
    expect(h.sendHarnessTurn).toHaveBeenCalledTimes(1);
  });
});