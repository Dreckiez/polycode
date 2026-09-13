import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessEvent, SendTurnInput } from "./types";

const transport = vi.hoisted(() => ({
  watchers: new Map<string, (line: string) => void>(),
  exitHandlers: new Map<string, (code: number | null) => void>(),
  writes: [] as Array<{ sessionId: string; line: string }>,
  spawns: [] as Array<{
    sessionId: string;
    path: string;
    args: string[];
    cwd: string;
  }>,
  spawnChild: vi.fn(),
  writeChild: vi.fn(),
  killChild: vi.fn(),
}));

vi.mock("./child", () => ({
  resolveAntigravityBinary: async () => ({ path: "/mock/agy" }),
  spawnChild: async (
    sessionId: string,
    path: string,
    args: string[],
    cwd: string,
  ) => {
    transport.spawns.push({ sessionId, path, args, cwd });
  },
  watchChild: (
    id: string,
    onLine: (line: string) => void,
    onExit: (code: number | null) => void,
  ) => {
    transport.watchers.set(id, onLine);
    transport.exitHandlers.set(id, onExit);
  },
  unwatchChild: (id: string) => {
    transport.watchers.delete(id);
    transport.exitHandlers.delete(id);
  },
  writeChild: async (sessionId: string, line: string) => {
    transport.writes.push({ sessionId, line });
  },
  killChild: async () => undefined,
}));

import {
  bindAntigravitySession,
  cancelAntigravityTurn,
  forgetAntigravitySession,
  sendAntigravityTurn,
  stopAntigravitySession,
} from "./antigravity";

function emitLine(sessionId: string, obj: Record<string, unknown>) {
  transport.watchers.get(sessionId)?.(JSON.stringify(obj));
}

let events: HarnessEvent[] = [];

function makeInput(sessionId = "agy-test-1", text = "hello"): SendTurnInput {
  return {
    sessionId,
    text,
    cwd: "/workspace",
    model: "antigravity:gemini-3.8-flash-high",
    runtimeMode: "supervised",
    onEvent: (event) => events.push(event),
  };
}

beforeEach(() => {
  events = [];
  transport.spawns = [];
  transport.writes = [];
  transport.watchers.clear();
  transport.exitHandlers.clear();
});

afterEach(async () => {
  await forgetAntigravitySession("agy-test-1");
  await forgetAntigravitySession("agy-test-2");
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("Antigravity live turn", () => {
  it("spawns agy and streams turn events end-to-end", async () => {
    const input = makeInput("agy-test-1", "calculate 2 + 2");
    const turnPromise = sendAntigravityTurn(input);
    await flush();

    expect(transport.spawns).toHaveLength(1);
    expect(transport.spawns[0].path).toBe("/mock/agy");
    expect(transport.spawns[0].args).toContain("--dangerously-skip-permissions");

    // Process sends init
    emitLine("agy-test-1", {
      event: "init",
      conversation_id: "conv-uuid-1",
      init: { cwd: "/workspace", tools: ["run_command", "view_file"] },
    });

    expect(events).toContainEqual({
      type: "session.providerBound",
      providerSessionId: "conv-uuid-1",
    });
    expect(events).toContainEqual({ type: "session.started" });

    // Step update: agent streaming text
    emitLine("agy-test-1", {
      event: "step_update",
      step_update: {
        conversation_id: "conv-uuid-1",
        step_index: 1,
        state: "ACTIVE",
        step_type: "agent_response",
        text_delta: "The answer is 4",
      },
    });

    expect(events).toContainEqual({
      type: "message.delta",
      text: "The answer is 4",
    });

    // Step update: agent completed message
    emitLine("agy-test-1", {
      event: "step_update",
      step_update: {
        conversation_id: "conv-uuid-1",
        step_index: 1,
        state: "DONE",
        step_type: "agent_response",
        usage: { input_tokens: 50, output_tokens: 10 },
      },
    });

    expect(events).toContainEqual({ type: "message.completed" });
    expect(events).toContainEqual({
      type: "context",
      used: 50,
      window: 1_000_000,
    });

    // Result finishes the turn
    emitLine("agy-test-1", {
      event: "result",
      result: {
        conversation_id: "conv-uuid-1",
        status: "SUCCESS",
        response: "The answer is 4",
      },
    });

    await turnPromise;
  });

  it("handles tool execution updates", async () => {
    const input = makeInput("agy-test-1", "run ls");
    const turnPromise = sendAntigravityTurn(input);
    await flush();

    emitLine("agy-test-1", {
      event: "init",
      conversation_id: "conv-tool-1",
    });

    emitLine("agy-test-1", {
      event: "step_update",
      step_update: {
        conversation_id: "conv-tool-1",
        step_index: 2,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "run_command",
        tool_info: {
          name: "run_command",
          parameters: { CommandLine: "ls -la", toolSummary: "List files" },
        },
      },
    });

    const started = events.find((e) => e.type === "tool.started") as Extract<
      HarnessEvent,
      { type: "tool.started" }
    >;
    expect(started).toBeDefined();
    expect(started.callId).toBe("agy-tool-2");
    expect(started.title).toBe("List files");
    expect(started.kind).toBe("execute");

    emitLine("agy-test-1", {
      event: "step_update",
      step_update: {
        conversation_id: "conv-tool-1",
        step_index: 2,
        state: "DONE",
        step_type: "tool",
        tool_name: "run_command",
        tool_info: {
          name: "run_command",
          parameters: { CommandLine: "ls -la", toolSummary: "List files" },
          output: "file1.txt\nfile2.txt",
        },
      },
    });

    const updated = events.find((e) => e.type === "tool.updated") as Extract<
      HarnessEvent,
      { type: "tool.updated" }
    >;
    expect(updated).toBeDefined();
    expect(updated.status).toBe("completed");
    expect(updated.detail).toBe("file1.txt\nfile2.txt");

    emitLine("agy-test-1", {
      event: "result",
      result: {
        conversation_id: "conv-tool-1",
        status: "SUCCESS",
      },
    });

    await turnPromise;
  });

  it("resumes bound session using stored conversationId", async () => {
    bindAntigravitySession("agy-test-2", "previous-conv-id", "/workspace");

    const input = makeInput("agy-test-2", "continue please");
    const turnPromise = sendAntigravityTurn(input);
    await flush();

    expect(transport.spawns).toHaveLength(1);
    expect(transport.spawns[0].args).toContain("--conversation");
    expect(
      transport.spawns[0].args[
        transport.spawns[0].args.indexOf("--conversation") + 1
      ],
    ).toBe("previous-conv-id");

    emitLine("agy-test-2", {
      event: "result",
      result: {
        conversation_id: "previous-conv-id",
        status: "SUCCESS",
      },
    });

    await turnPromise;
  });
});
