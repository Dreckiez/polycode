import { afterEach, describe, expect, it } from "vitest";
import {
  appendLiveText,
  liveTextByBlock,
  resetChatStore,
  useChatStore,
} from "./chatStore";

const entry = { sessionId: "session-1", blockId: "message-1" };

afterEach(resetChatStore);

describe("appendLiveText", () => {
  it("does not append a completed response snapshot that was already streamed", () => {
    appendLiveText(entry, "ABC... the end");
    appendLiveText(entry, "ABC... the end");

    expect(liveTextByBlock(useChatStore.getState(), entry)).toBe(
      "ABC... the end",
    );
  });

  it("accepts an extended response snapshot without repeating its prefix", () => {
    appendLiveText(entry, "ABC");
    appendLiveText(entry, "ABC... the end");

    expect(liveTextByBlock(useChatStore.getState(), entry)).toBe(
      "ABC... the end",
    );
  });
});
