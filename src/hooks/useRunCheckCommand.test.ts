// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTINUE_PROMPT } from "../lib/inFlight";
import type { QueuedMessage, Session } from "../lib/session";
import {
  type RunCheckCommandDeps,
  useRunCheckCommand,
} from "./useRunCheckCommand";

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useRunCheckCommand>;

let sessionsRef: { current: Session[] };
let queueDispatchingRef: { current: Set<string> };
let onSubmit: ReturnType<typeof vi.fn>;
let setSessions: ReturnType<typeof vi.fn>;

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

function makeQueuedMessage(id: string, text: string, overrides: Partial<QueuedMessage> = {}): QueuedMessage {
  return {
    id,
    text,
    attachments: [],
    ...overrides,
  } as QueuedMessage;
}

function Harness({ deps }: { deps: RunCheckCommandDeps }) {
  api = useRunCheckCommand(deps);
  return null;
}

async function mount(opts: { sessions?: Session[] } = {}) {
  const currentSessions = opts.sessions ?? [];
  sessionsRef = { current: currentSessions };
  queueDispatchingRef = { current: new Set<string>() };
  onSubmit = vi.fn();
  setSessions = vi.fn((updater: Session[] | ((prev: Session[]) => Session[])) => {
    sessionsRef.current =
      typeof updater === "function" ? updater(sessionsRef.current) : updater;
  });

  const deps: RunCheckCommandDeps = {
    sessions: currentSessions,
    sessionsRef,
    setSessions,
    queueDispatchingRef,
    onSubmit,
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
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useRunCheckCommand", () => {
  describe("auto-dispatch effect", () => {
    it("dispatches the head of the queue when session is idle and valid", async () => {
      const msg1 = makeQueuedMessage("q1", "First message");
      const msg2 = makeQueuedMessage("q2", "Second message");
      const session = makeSession("s1", { queuedMessages: [msg1, msg2], busy: false });

      await mount({ sessions: [session] });

      expect(queueDispatchingRef.current.has("s1")).toBe(true);
      expect(onSubmit).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(queueDispatchingRef.current.has("s1")).toBe(false);
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith("s1", "First message", [], {
        queuedMessageId: "q1",
        noteCard: undefined,
        handoffCard: undefined,
        intent: undefined,
      });
    });

    it("does not dispatch when session is busy", async () => {
      const msg1 = makeQueuedMessage("q1", "First message");
      const session = makeSession("s1", { queuedMessages: [msg1], busy: true });

      await mount({ sessions: [session] });

      expect(queueDispatchingRef.current.has("s1")).toBe(false);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not dispatch when session is paused", async () => {
      const msg1 = makeQueuedMessage("q1", "First message");
      const session = makeSession("s1", {
        queuedMessages: [msg1],
        busy: false,
        queueStatus: "paused",
      });

      await mount({ sessions: [session] });

      expect(queueDispatchingRef.current.has("s1")).toBe(false);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("transitions queueStatus from resuming to active without immediate dispatch", async () => {
      const msg1 = makeQueuedMessage("q1", "First message");
      const session = makeSession("s1", {
        queuedMessages: [msg1],
        busy: false,
        queueStatus: "resuming",
      });

      await mount({ sessions: [session] });

      expect(setSessions).toHaveBeenCalled();
      const updated = sessionsRef.current.find((s) => s.id === "s1");
      expect(updated?.queueStatus).toBe("active");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not dispatch when head is currently being edited", async () => {
      const msg1 = makeQueuedMessage("q1", "First message");
      const session = makeSession("s1", {
        queuedMessages: [msg1],
        busy: false,
        editingQueuedMessageId: "q1",
      });

      await mount({ sessions: [session] });

      expect(queueDispatchingRef.current.has("s1")).toBe(false);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("cleans up timers and dispatching ref on unmount", async () => {
      const msg1 = makeQueuedMessage("q1", "First message");
      const session = makeSession("s1", { queuedMessages: [msg1], busy: false });

      await mount({ sessions: [session] });
      expect(queueDispatchingRef.current.has("s1")).toBe(true);

      act(() => {
        root.unmount();
      });

      expect(queueDispatchingRef.current.has("s1")).toBe(false);

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("onDeleteQueuedMessage", () => {
    it("removes the queued message from the session", async () => {
      const msg1 = makeQueuedMessage("q1", "First");
      const msg2 = makeQueuedMessage("q2", "Second");
      const session = makeSession("s1", {
        queuedMessages: [msg1, msg2],
        busy: true, // keep busy so auto-dispatch doesn't interfere
      });

      await mount({ sessions: [session] });

      act(() => {
        api.onDeleteQueuedMessage("s1", "q1");
      });

      expect(setSessions).toHaveBeenCalled();
      const updated = sessionsRef.current.find((s) => s.id === "s1");
      expect(updated?.queuedMessages).toEqual([msg2]);
    });
  });

  describe("onQueuedMessageEditingChange", () => {
    it("sets editingQueuedMessageId on the session", async () => {
      const session = makeSession("s1", { busy: true });
      await mount({ sessions: [session] });

      act(() => {
        api.onQueuedMessageEditingChange("s1", "q1");
      });

      const updated = sessionsRef.current.find((s) => s.id === "s1");
      expect(updated?.editingQueuedMessageId).toBe("q1");

      act(() => {
        api.onQueuedMessageEditingChange("s1", undefined);
      });

      const cleared = sessionsRef.current.find((s) => s.id === "s1");
      expect(cleared?.editingQueuedMessageId).toBeUndefined();
    });
  });

  describe("onEditQueuedMessage", () => {
    it("updates text and clears editingQueuedMessageId", async () => {
      const msg1 = makeQueuedMessage("q1", "Original text");
      const session = makeSession("s1", {
        queuedMessages: [msg1],
        editingQueuedMessageId: "q1",
        busy: true,
      });

      await mount({ sessions: [session] });

      act(() => {
        api.onEditQueuedMessage("s1", "q1", "Updated text");
      });

      const updated = sessionsRef.current.find((s) => s.id === "s1");
      expect(updated?.queuedMessages?.[0]?.text).toBe("Updated text");
      expect(updated?.editingQueuedMessageId).toBeUndefined();
    });
  });

  describe("onSteerQueuedMessage", () => {
    it("submits the message immediately as steer", async () => {
      const msg1 = makeQueuedMessage("q1", "Steer text");
      const session = makeSession("s1", {
        queuedMessages: [msg1],
        busy: true,
      });

      await mount({ sessions: [session] });

      act(() => {
        api.onSteerQueuedMessage("s1", "q1");
      });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith("s1", "Steer text", [], {
        followUpBehavior: "steer",
        queuedMessageId: "q1",
        noteCard: undefined,
        handoffCard: undefined,
      });
    });

    it("ignores steer when message id is not found", async () => {
      const session = makeSession("s1", { queuedMessages: [], busy: true });
      await mount({ sessions: [session] });

      act(() => {
        api.onSteerQueuedMessage("s1", "non-existent");
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("onResumeQueue", () => {
    it("resumes paused session with queued messages by submitting CONTINUE_PROMPT", async () => {
      const msg1 = makeQueuedMessage("q1", "Pending");
      const session = makeSession("s1", {
        queuedMessages: [msg1],
        queueStatus: "paused",
        busy: false,
      });

      await mount({ sessions: [session] });

      act(() => {
        api.onResumeQueue("s1");
      });

      const updated = sessionsRef.current.find((s) => s.id === "s1");
      expect(updated?.queueStatus).toBe("resuming");

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith("s1", CONTINUE_PROMPT, [], {
        followUpBehavior: "steer",
      });
    });

    it("does nothing if session is not paused or has no queued messages or is busy", async () => {
      const session1 = makeSession("s1", {
        queuedMessages: [],
        queueStatus: "paused",
        busy: false,
      });
      const session2 = makeSession("s2", {
        queuedMessages: [makeQueuedMessage("q1", "text")],
        queueStatus: "active",
        busy: false,
      });
      const session3 = makeSession("s3", {
        queuedMessages: [makeQueuedMessage("q1", "text")],
        queueStatus: "paused",
        busy: true,
      });

      await mount({ sessions: [session1, session2, session3] });

      act(() => {
        api.onResumeQueue("s1");
        api.onResumeQueue("s2");
        api.onResumeQueue("s3");
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
