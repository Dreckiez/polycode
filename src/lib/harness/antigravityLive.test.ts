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
  respondAntigravityApproval,
  sendAntigravityTurn,
  setAntigravityBinaryResolver,
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

describe("Antigravity live turn (ACP server mode)", () => {
  beforeEach(() => {
    setAntigravityBinaryResolver(async () => ({
      path: "/mock/agy_acp_server.exe",
    }));
  });

  afterEach(async () => {
    setAntigravityBinaryResolver(async () => ({ path: "/mock/agy" }));
    await forgetAntigravitySession("agy-acp-1");
  });

  const getWrites = (sessionId: string) =>
    transport.writes
      .filter((w) => w.sessionId === sessionId)
      .map((w) => JSON.parse(w.line));

  const waitForWrite = async (
    sessionId: string,
    predicate: (msg: Record<string, unknown>) => boolean,
  ) => {
    for (let i = 0; i < 50; i++) {
      const match = getWrites(sessionId).find(predicate);
      if (match) return match;
      await flush();
    }
    throw new Error(`Timeout waiting for write on ${sessionId}`);
  };

  it("performs ACP protocol handshake and streams turn deltas", async () => {
    const input = makeInput("agy-acp-1", "explain quantum physics");
    const turnPromise = sendAntigravityTurn(input);

    // 1. Client sends initialize
    const initReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "initialize",
    );
    expect(initReq).toBeDefined();
    expect(transport.spawns[0].path).toBe("/mock/agy_acp_server.exe");
    expect(transport.spawns[0].args).toEqual([]);

    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: initReq.id,
      result: { protocolVersion: 1 },
    });

    // 2. Client sends session/new
    const newReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/new",
    );
    expect(newReq).toBeDefined();

    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: newReq.id,
      result: {
        sessionId: "acp-session-123",
        configOptions: [
          { id: "model", category: "model", currentValue: "gemini-3.8-flash" },
          { id: "mode", category: "mode", currentValue: "default" },
        ],
      },
    });

    // 3. Client sets mode
    const modeReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/set_mode",
    );
    expect(modeReq.params).toEqual({
      sessionId: "acp-session-123",
      modeId: "default",
    });

    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: modeReq.id,
      result: {},
    });

    // 4. Client sends session/prompt
    const promptReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/prompt",
    );
    expect(promptReq.params).toEqual({
      sessionId: "acp-session-123",
      prompt: [{ type: "text", text: "explain quantum physics" }],
    });

    // Server streams updates
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "acp-session-123",
        update: {
          sessionUpdate: "agent_message_delta",
          delta: "Quantum physics is cool",
        },
      },
    });

    expect(events).toContainEqual({
      type: "message.delta",
      text: "Quantum physics is cool",
    });

    // Server finishes prompt
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: promptReq.id,
      result: { stopReason: "end_turn" },
    });

    await turnPromise;

    expect(events).toContainEqual({ type: "message.completed" });
    expect(events).toContainEqual({ type: "reasoning.completed" });
  });

  it("handles interactive permission approval in supervised mode", async () => {
    const input = makeInput("agy-acp-1", "touch new_file.txt");
    const turnPromise = sendAntigravityTurn(input);

    const initReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "initialize",
    );
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: initReq.id,
      result: { protocolVersion: 1 },
    });

    const newReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/new",
    );
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: newReq.id,
      result: {
        sessionId: "acp-session-123",
        configOptions: [
          { id: "model", category: "model", currentValue: "gemini-3.8-flash" },
        ],
      },
    });

    const modeReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/set_mode",
    );
    emitLine("agy-acp-1", { jsonrpc: "2.0", id: modeReq.id, result: {} });

    const promptReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/prompt",
    );

    // Server requests permission for a command
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: 42,
      method: "session/request_permission",
      params: {
        sessionId: "acp-session-123",
        toolCall: {
          toolCallId: "call-1",
          name: "terminal",
          rawInput: { command: "touch new_file.txt" },
        },
        options: [
          { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject_once", name: "Reject", kind: "reject_once" },
        ],
      },
    });

    await flush();

    const approval = events.find((e) => e.type === "approval.requested") as Extract<
      HarnessEvent,
      { type: "approval.requested" }
    >;
    expect(approval).toBeDefined();
    expect(approval.requestId).toBe(42);

    // User approves the request
    respondAntigravityApproval("agy-acp-1", 42, "allow");

    const permResp = await waitForWrite(
      "agy-acp-1",
      (m) => m.id === 42 && m.result != null,
    );
    expect(permResp.result).toEqual({
      outcome: { outcome: "selected", optionId: "allow_once" },
    });

    // Complete prompt
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: promptReq.id,
      result: {},
    });

    await turnPromise;
  });

  it("auto-approves in full-access mode", async () => {
    const input: SendTurnInput = {
      ...makeInput("agy-acp-1", "do anything"),
      runtimeMode: "full-access",
    };
    const turnPromise = sendAntigravityTurn(input);

    const initReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "initialize",
    );
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: initReq.id,
      result: { protocolVersion: 1 },
    });

    const newReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/new",
    );
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: newReq.id,
      result: {
        sessionId: "acp-session-123",
        configOptions: [
          { id: "model", category: "model", currentValue: "gemini-3.8-flash" },
        ],
      },
    });

    const modeReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/set_mode",
    );
    expect(modeReq.params).toEqual({
      sessionId: "acp-session-123",
      modeId: "yolo",
    });
    emitLine("agy-acp-1", { jsonrpc: "2.0", id: modeReq.id, result: {} });

    const promptReq = await waitForWrite(
      "agy-acp-1",
      (m) => m.method === "session/prompt",
    );

    // Server requests permission
    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: 99,
      method: "session/request_permission",
      params: {
        sessionId: "acp-session-123",
        toolCall: {
          toolCallId: "call-2",
          name: "terminal",
          rawInput: { command: "rm -rf temp" },
        },
        options: [
          { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject_once", name: "Reject", kind: "reject_once" },
        ],
      },
    });

    // In full-access mode, client auto-approves immediately without approval.requested event
    const permResp = await waitForWrite(
      "agy-acp-1",
      (m) => m.id === 99 && m.result != null,
    );
    expect(permResp.result).toEqual({
      outcome: { outcome: "selected", optionId: "allow_once" },
    });

    expect(events.filter((e) => e.type === "approval.requested")).toHaveLength(0);

    emitLine("agy-acp-1", {
      jsonrpc: "2.0",
      id: promptReq.id,
      result: {},
    });

    await turnPromise;
  });
});
