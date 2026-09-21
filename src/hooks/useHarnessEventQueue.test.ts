// @vitest-environment happy-dom
import { act, createElement, StrictMode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleHarnessFlush } from "../lib/appFlush";
import {
  appendLiveText,
  clearBlockLiveText,
  liveTextByBlock,
  resetChatStore,
  setLiveText,
  useChatStore,
} from "../lib/chatStore";
import { syncDockBadge } from "../lib/dockBadge";
import type { Session } from "../lib/session";
import {
  useHarnessEventQueue,
  type HarnessEventQueueDeps,
} from "./useHarnessEventQueue";

const chat = vi.hoisted(() => {
  const liveText: Record<string, Record<string, string>> = {};
  const commit = (patch: { liveText?: Record<string, Record<string, string>> }) => {
    if (!patch.liveText) return;
    for (const key of Object.keys(liveText)) {
      if (!(key in patch.liveText)) delete liveText[key];
    }
    for (const [key, value] of Object.entries(patch.liveText)) {
      liveText[key] = value;
    }
  };
  const getState = () => ({ liveText });
  const setState = (updater: unknown) => {
    if (typeof updater === "function") commit(updater(getState()));
    else commit(updater as { liveText?: Record<string, Record<string, string>> });
  };
  const appendLiveText = vi.fn(
    (entry: { sessionId: string; blockId: string }, delta: string) => {
      if (!delta) return;
      const session = liveText[entry.sessionId] ?? {};
      commit({
        liveText: {
          ...liveText,
          [entry.sessionId]: {
            ...session,
            [entry.blockId]: (session[entry.blockId] ?? "") + delta,
          },
        },
      });
    },
  );
  const setLiveText = vi.fn(
    (entry: { sessionId: string; blockId: string }, text: string) => {
      const session = liveText[entry.sessionId] ?? {};
      commit({
        liveText: {
          ...liveText,
          [entry.sessionId]: { ...session, [entry.blockId]: text },
        },
      });
    },
  );
  const clearBlockLiveText = vi.fn(
    (entry: { sessionId: string; blockId: string }) => {
      const session = liveText[entry.sessionId];
      if (!session || !(entry.blockId in session)) return;
      const nextSession = { ...session };
      delete nextSession[entry.blockId];
      const next = { ...liveText, [entry.sessionId]: nextSession };
      if (Object.keys(nextSession).length === 0) delete next[entry.sessionId];
      commit({ liveText: next });
    },
  );
  const liveTextByBlock = vi.fn(
    (
      state: { liveText: Record<string, Record<string, string>> },
      entry: { sessionId: string; blockId: string },
    ) => state.liveText[entry.sessionId]?.[entry.blockId],
  );
  const resetChatStore = vi.fn(() => {
    for (const key of Object.keys(liveText)) delete liveText[key];
  });
  const clearSessionLiveText = vi.fn((sessionId: string) => {
    if (sessionId in liveText) {
      const next = { ...liveText };
      delete next[sessionId];
      commit({ liveText: next });
    }
  });
  const getAndClearSessionLiveText = vi.fn((sessionId: string) => {
    const session = liveText[sessionId] ?? {};
    if (sessionId in liveText) {
      const next = { ...liveText };
      delete next[sessionId];
      commit({ liveText: next });
    }
    return session;
  });
  return {
    getState,
    setState,
    appendLiveText,
    setLiveText,
    clearBlockLiveText,
    liveTextByBlock,
    resetChatStore,
    clearSessionLiveText,
    getAndClearSessionLiveText,
  };
});

const harness = vi.hoisted(() => {
  const join = (existing: string, incoming: string): string => {
    if (!incoming) return existing;
    if (!existing) return incoming;
    if (incoming === existing) {
      return incoming.length <= 1 ? existing + incoming : existing;
    }
    if (incoming.length > existing.length && incoming.startsWith(existing)) {
      return incoming;
    }
    return existing + incoming;
  };
  const patchStream = (
    session: Session,
    role: "assistant" | "reasoning",
    text: string,
  ): Session => {
    const last = session.blocks[session.blocks.length - 1];
    if (last?.role === role) {
      return {
        ...session,
        blocks: session.blocks.map((block) =>
          block === last
            ? { ...block, text: join(block.text, text), streaming: true }
            : block,
        ),
      };
    }
    return {
      ...session,
      blocks: [...session.blocks, { id: crypto.randomUUID(), role, text, streaming: true }],
    };
  };
  const sealStream = (session: Session, role: "assistant" | "reasoning"): Session => ({
    ...session,
    blocks: session.blocks.map((block) =>
      block.role === role && block.streaming ? { ...block, streaming: false } : block,
    ),
  });
  const applyHarnessEvent = vi.fn(
    (session: Session, event: { type: string; text?: string }): Session => {
      switch (event.type) {
        case "message.delta":
          return patchStream(session, "assistant", event.text ?? "");
        case "reasoning.delta":
          return patchStream(session, "reasoning", event.text ?? "");
        case "message.completed":
          return sealStream(session, "assistant");
        case "reasoning.completed":
          return sealStream(session, "reasoning");
        default:
          return session;
      }
    },
  );
  return { applyHarnessEvent };
});

vi.mock("../lib/chatStore", () => ({
  useChatStore: { getState: chat.getState, setState: chat.setState },
  appendLiveText: chat.appendLiveText,
  setLiveText: chat.setLiveText,
  clearBlockLiveText: chat.clearBlockLiveText,
  liveTextByBlock: chat.liveTextByBlock,
  resetChatStore: chat.resetChatStore,
  clearSessionLiveText: chat.clearSessionLiveText,
  getAndClearSessionLiveText: chat.getAndClearSessionLiveText,
}));
vi.mock("../lib/appFlush", () => ({
  scheduleHarnessFlush: vi.fn(() => ({ kind: "timeout", id: 0 })),
  cancelScheduledFlush: vi.fn(),
}));
vi.mock("../lib/dockBadge", () => ({ syncDockBadge: vi.fn() }));
vi.mock("../lib/harness", () => ({
  applyHarnessEvent: harness.applyHarnessEvent,
}));

const storeMocks = {
  appendLiveText: vi.mocked(appendLiveText),
  setLiveText: vi.mocked(setLiveText),
  clearBlockLiveText: vi.mocked(clearBlockLiveText),
};
const flushMocks = {
  scheduleHarnessFlush: vi.mocked(scheduleHarnessFlush),
  syncDockBadge: vi.mocked(syncDockBadge),
};

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useHarnessEventQueue>;

function Harness({ sessionsRef, setSessions }: HarnessEventQueueDeps) {
  api = useHarnessEventQueue({ sessionsRef, setSessions });
  return null;
}

function sessionWith(
  id: string,
  blockId: string,
  text: string,
  streaming: boolean,
): Session {
  return {
    id,
    harness: "codex",
    model: "gpt-4o",
    modelSettings: {},
    runtimeMode: "supervised",
    title: id,
    cwd: "/repo",
    blocks: [{ id: blockId, role: "assistant", text, streaming }],
  };
}

function seedLiveText(map: Record<string, Record<string, string>>) {
  useChatStore.setState({ liveText: map });
}

async function mount(sessions: Session[]) {
  const sessionsRef = { current: sessions } as RefObject<Session[]>;
  const setSessions = vi.fn();
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(Harness, { sessionsRef, setSessions }),
      ),
    ),
  );
  return { sessionsRef, setSessions };
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  resetChatStore();
  storeMocks.appendLiveText.mockClear();
  storeMocks.setLiveText.mockClear();
  storeMocks.clearBlockLiveText.mockClear();
  liveTextByBlock.mockClear();
  flushMocks.scheduleHarnessFlush.mockClear();
  flushMocks.syncDockBadge.mockClear();
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

describe("useHarnessEventQueue", () => {
  it("routes a message.delta for an open streaming block into the live-text store", async () => {
    const { setSessions } = await mount([sessionWith("A", "b1", "Hello", true)]);
    seedLiveText({ A: { b1: "Hello" } });

    await act(async () => {
      api.enqueueHarnessEvent("A", { type: "message.delta", text: " world" });
    });

    expect(storeMocks.appendLiveText).toHaveBeenCalledTimes(1);
    expect(storeMocks.appendLiveText).toHaveBeenCalledWith(
      { sessionId: "A", blockId: "b1" },
      " world",
    );
    expect(
      liveTextByBlock(useChatStore.getState(), { sessionId: "A", blockId: "b1" }),
    ).toBe("Hello world");
    expect(storeMocks.setLiveText).not.toHaveBeenCalled();
    expect(flushMocks.scheduleHarnessFlush).not.toHaveBeenCalled();
    expect(setSessions).not.toHaveBeenCalled();
  });

  it("seeds the first delta with the canonical block text", async () => {
    await mount([sessionWith("A", "b1", "Hello", true)]);

    await act(async () => {
      api.enqueueHarnessEvent("A", { type: "message.delta", text: " world" });
    });

    expect(storeMocks.setLiveText).toHaveBeenCalledExactlyOnceWith(
      { sessionId: "A", blockId: "b1" },
      "Hello world",
    );
    expect(storeMocks.appendLiveText).not.toHaveBeenCalled();
    expect(
      liveTextByBlock(useChatStore.getState(), { sessionId: "A", blockId: "b1" }),
    ).toBe("Hello world");
  });

  it("appends directly when the streaming block has no canonical text yet", async () => {
    await mount([sessionWith("A", "b1", "", true)]);

    await act(async () => {
      api.enqueueHarnessEvent("A", { type: "message.delta", text: "Hi" });
    });

    expect(storeMocks.appendLiveText).toHaveBeenCalledExactlyOnceWith(
      { sessionId: "A", blockId: "b1" },
      "Hi",
    );
    expect(storeMocks.setLiveText).not.toHaveBeenCalled();
  });

  it("on message.completed, enqueues the accumulated text and clears that block's store entry", async () => {
    const { setSessions } = await mount([sessionWith("A", "b1", "Hello", true)]);
    seedLiveText({ A: { b1: "Hello world" } });

    await act(async () => {
      api.enqueueHarnessEvent("A", { type: "message.completed" });
    });

    expect(storeMocks.clearBlockLiveText).toHaveBeenCalledExactlyOnceWith({
      sessionId: "A",
      blockId: "b1",
    });
    expect(flushMocks.scheduleHarnessFlush).toHaveBeenCalledTimes(1);
    expect(
      liveTextByBlock(useChatStore.getState(), { sessionId: "A", blockId: "b1" }),
    ).toBeUndefined();
    expect(setSessions).not.toHaveBeenCalled();
  });

  it("flushHarnessEvents merges accumulated live text into canonical and leaves the store cleared", async () => {
    const { sessionsRef, setSessions } = await mount([
      sessionWith("A", "b1", "Hello", true),
    ]);
    seedLiveText({ A: { b1: "Hello world" } });

    await act(async () => {
      api.enqueueHarnessEvent("A", { type: "message.completed" });
    });
    await act(async () => {
      api.flushHarnessEvents();
    });

    expect(setSessions).toHaveBeenCalledTimes(1);
    const next = setSessions.mock.calls[0][0] as Session[];
    expect(next).toHaveLength(1);
    expect(next[0].blocks[0].text).toBe("Hello world");
    expect(next[0].blocks[0].streaming).toBe(false);
    expect(sessionsRef.current[0].blocks[0].text).toBe("Hello world");
    expect(
      liveTextByBlock(useChatStore.getState(), { sessionId: "A", blockId: "b1" }),
    ).toBeUndefined();
  });

  it("does not append or clear live text when the session has none", async () => {
    const { setSessions } = await mount([sessionWith("A", "b1", "Hello", true)]);

    await act(async () => {
      api.enqueueHarnessEvent("A", { type: "message.completed" });
    });

    expect(storeMocks.appendLiveText).not.toHaveBeenCalled();
    expect(storeMocks.setLiveText).not.toHaveBeenCalled();
    expect(storeMocks.clearBlockLiveText).not.toHaveBeenCalled();

    await act(async () => {
      api.flushHarnessEvents();
    });

    expect(setSessions).toHaveBeenCalledTimes(1);
    expect((setSessions.mock.calls[0][0] as Session[])[0].blocks[0].streaming).toBe(
      false,
    );
  });

  it("flushHarnessEvents with an empty queue is a no-op", async () => {
    const { setSessions } = await mount([sessionWith("A", "b1", "Hello", true)]);

    await act(async () => {
      api.flushHarnessEvents();
    });

    expect(setSessions).not.toHaveBeenCalled();
    expect(flushMocks.syncDockBadge).not.toHaveBeenCalled();
    expect(storeMocks.appendLiveText).not.toHaveBeenCalled();
    expect(storeMocks.setLiveText).not.toHaveBeenCalled();
    expect(storeMocks.clearBlockLiveText).not.toHaveBeenCalled();
  });

  it("keeps separate sessions' live text isolated", async () => {
    const { sessionsRef, setSessions } = await mount([
      sessionWith("A", "b1", "Hello", true),
      sessionWith("B", "b2", "Another", true),
    ]);
    seedLiveText({ A: { b1: "Hello" }, B: { b2: "Another" } });

    await act(async () => {
      api.enqueueHarnessEvent("A", { type: "message.delta", text: " world" });
    });
    expect(storeMocks.appendLiveText).toHaveBeenCalledTimes(1);
    expect(storeMocks.appendLiveText).toHaveBeenCalledWith(
      { sessionId: "A", blockId: "b1" },
      " world",
    );

    await act(async () => {
      api.enqueueHarnessEvent("B", { type: "message.delta", text: " answer" });
    });
    expect(storeMocks.appendLiveText).toHaveBeenCalledWith(
      { sessionId: "B", blockId: "b2" },
      " answer",
    );

    await act(async () => {
      api.enqueueHarnessEvent("A", { type: "message.completed" });
    });
    expect(storeMocks.clearBlockLiveText).toHaveBeenCalledTimes(1);
    expect(storeMocks.clearBlockLiveText).toHaveBeenCalledWith({
      sessionId: "A",
      blockId: "b1",
    });

    await act(async () => {
      api.flushHarnessEvents();
    });

    const mergedA = sessionsRef.current.find((s) => s.id === "A")!;
    const mergedB = sessionsRef.current.find((s) => s.id === "B")!;
    expect(mergedA.blocks[0].text).toBe("Hello world");
    expect(mergedA.blocks[0].streaming).toBe(false);
    expect(mergedB.blocks[0].text).toBe("Another");
    expect(mergedB.blocks[0].streaming).toBe(true);
    expect(
      liveTextByBlock(useChatStore.getState(), { sessionId: "B", blockId: "b2" }),
    ).toBe("Another answer");
    expect(
      liveTextByBlock(useChatStore.getState(), { sessionId: "A", blockId: "b1" }),
    ).toBeUndefined();
    expect(setSessions).toHaveBeenCalledTimes(1);
  });
});