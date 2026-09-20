import { beforeEach, describe, expect, it } from "vitest";
import {
  appendLiveText,
  clearSessionLiveText,
  liveTextByBlock,
  resetChatStore,
  useChatStore,
  type LiveTextEntry,
} from "./chatStore";

describe("live streaming-text store", () => {
  beforeEach(resetChatStore);
  it("appends a token delta into the live leaf for a session/block", () => {
    const entry: LiveTextEntry = { sessionId: "s1", blockId: "b1" };
    appendLiveText(entry, "Hel");
    appendLiveText(entry, "lo");
    expect(liveTextByBlock(useChatStore.getState(), entry)).toBe("Hello");
  });

  it("grows only the targeted leaf — sibling blocks and other sessions stay still", () => {
    appendLiveText({ sessionId: "s1", blockId: "b1" }, "One");
    appendLiveText({ sessionId: "s1", blockId: "b2" }, "Two");
    appendLiveText({ sessionId: "s2", blockId: "b1" }, "Other");

    expect(useChatStore.getState().liveText).toEqual({
      s1: { b1: "One", b2: "Two" },
      s2: { b1: "Other" },
    });
  });

  it("reselecting a live leaf keeps its streaming identity (isolation bubble)", () => {
    appendLiveText({ sessionId: "s1", blockId: "radio" }, "Press");
    appendLiveText({ sessionId: "s1", blockId: "radio" }, " to");

    // A late subscriber that only just started listening must see the full
    // accumulated live text, not just the latest delta.
    const late = liveTextByBlock(useChatStore.getState(), {
      sessionId: "s1",
      blockId: "radio",
    });
    expect(late).toBe("Press to");

    // And the sibling block that is *not* streaming stays absent.
    expect(
      liveTextByBlock(useChatStore.getState(), {
        sessionId: "s1",
        blockId: "sibling",
      }),
    ).toBeUndefined();
  });

  it("clearSessionLiveText drops only one session's live map", () => {
    appendLiveText({ sessionId: "s1", blockId: "b1" }, "hello");
    appendLiveText({ sessionId: "s2", blockId: "b1" }, "world");
    clearSessionLiveText("s1");
    expect(useChatStore.getState().liveText.s1).toBeUndefined();
    expect(useChatStore.getState().liveText.s2).toEqual({ b1: "world" });
  });

  // Keep the initial empty-state assertion in the same suite so the module is
  // self-contained even when run standalone.
  it("starts empty", () => {
    expect(useChatStore.getState().liveText).toEqual({});
  });
});
