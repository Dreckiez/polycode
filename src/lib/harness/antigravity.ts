import type { RuntimeMode } from "../session";
import {
  killChild,
  resolveAntigravityBinary,
  spawnChild,
  unwatchChild,
  watchChild,
  writeChild,
} from "./child";
import {
  buildAgySpawnArgs,
  buildAgyUserMessage,
  parseJsonLine,
  previewFromTool,
  toolKindFromName,
  toolTitle,
} from "./antigravityProtocol";
import type {
  ApprovalDecision,
  HarnessEvent,
  HarnessSessionInput,
  SendTurnInput,
  SteerTurnInput,
} from "./types";

type Live = {
  sessionId: string;
  cwd: string;
  conversationId?: string;
  model: string;
  modelSettings?: Record<string, string>;
  runtimeMode: RuntimeMode;
  planning: boolean;
  onEvent: (event: HarnessEvent) => void;
  toolsByIndex: Map<
    number,
    { id: string; name: string; params?: Record<string, unknown> }
  >;
  activeTurn: boolean;
  cancelled: boolean;
  muteUpdates: boolean;
  turns: Promise<void>;
  turnDone: (() => void) | null;
  turnFailed: ((error: Error) => void) | null;
};

type Resume = {
  conversationId: string;
  cwd: string;
};

const liveByThread = new Map<string, Live>();
const resumeByThread = new Map<string, Resume>();
const cancelledThreads = new Set<string>();

let binaryResolver = resolveAntigravityBinary;

export function setAntigravityBinaryResolver(
  fn: () => Promise<{ path: string }>,
): void {
  binaryResolver = fn;
}

export async function sendAntigravityTurn(input: SendTurnInput): Promise<void> {
  if (cancelledThreads.has(input.sessionId)) {
    cancelledThreads.delete(input.sessionId);
    return;
  }

  const live = await ensureLive(input);
  live.turns = live.turns
    .then(() => runTurn(live, input))
    .catch((error: unknown) => {
      if (!live.cancelled && !live.muteUpdates) {
        live.onEvent({
          type: "session.error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    });

  return live.turns;
}

export async function steerAntigravityTurn(
  input: SteerTurnInput,
): Promise<void> {
  const live = liveByThread.get(input.sessionId);
  if (!live) return;

  const msg = buildAgyUserMessage({
    text: input.text,
    attachments: input.attachments,
  });

  await writeChild(input.sessionId, JSON.stringify(msg) + "\n");
}

export async function cancelAntigravityTurn(sessionId: string): Promise<void> {
  const live = liveByThread.get(sessionId);
  if (!live) {
    cancelledThreads.add(sessionId);
    return;
  }

  live.cancelled = true;
  live.muteUpdates = true;
  live.activeTurn = false;
  live.turnDone?.();
  live.turnDone = null;
  live.turnFailed = null;

  live.onEvent({ type: "message.completed" });
  live.onEvent({ type: "reasoning.completed" });

  // Terminate the child process to interrupt the running turn.
  // The conversationId is already preserved in resumeByThread so the next prompt resumes seamlessly.
  await stopAntigravitySession(sessionId);
}

export async function stopAntigravitySession(sessionId: string): Promise<void> {
  cancelledThreads.delete(sessionId);
  const live = liveByThread.get(sessionId);
  liveByThread.delete(sessionId);

  if (live) {
    live.muteUpdates = true;
    live.activeTurn = false;
    live.turnDone?.();
    live.turnDone = null;
    live.turnFailed = null;
  }

  unwatchChild(sessionId);
  await killChild(sessionId).catch(() => undefined);
}

export async function forgetAntigravitySession(
  sessionId: string,
): Promise<void> {
  resumeByThread.delete(sessionId);
  await stopAntigravitySession(sessionId);
}

export function bindAntigravitySession(
  threadId: string,
  providerSessionId: string,
  cwd: string,
): void {
  const conversationId = providerSessionId.trim();
  if (!threadId || !conversationId || !cwd.trim()) return;
  resumeByThread.set(threadId, { conversationId, cwd });
}

export function respondAntigravityApproval(
  _sessionId: string,
  _requestId: number,
  _decision: ApprovalDecision,
): void {
  // Tool permissions are auto-approved via --dangerously-skip-permissions.
}

async function ensureLive(input: HarnessSessionInput): Promise<Live> {
  const planning = input.intent === "plan";
  const existing = liveByThread.get(input.sessionId);

  if (
    existing &&
    existing.cwd === input.cwd &&
    existing.model === input.model &&
    existing.planning === planning
  ) {
    existing.onEvent = input.onEvent;
    existing.runtimeMode = input.runtimeMode;
    return existing;
  }

  if (existing) {
    if (existing.cwd !== input.cwd) {
      resumeByThread.delete(input.sessionId);
    }
    await stopAntigravitySession(input.sessionId);
  }

  const resume = resumeByThread.get(input.sessionId);
  if (resume && resume.cwd !== input.cwd) {
    resumeByThread.delete(input.sessionId);
  }

  const { path } = await binaryResolver();
  const liveRef: { current: Live | null } = { current: null };

  const live: Live = {
    sessionId: input.sessionId,
    cwd: input.cwd,
    conversationId: resume?.conversationId,
    model: input.model,
    modelSettings: input.modelSettings,
    runtimeMode: input.runtimeMode,
    planning,
    onEvent: input.onEvent,
    toolsByIndex: new Map(),
    activeTurn: false,
    cancelled: false,
    muteUpdates: false,
    turns: Promise.resolve(),
    turnDone: null,
    turnFailed: null,
  };
  liveRef.current = live;

  watchChild(
    input.sessionId,
    (line) => {
      const current = liveRef.current;
      if (!current) return;
      handleLine(input.sessionId, current, line);
    },
    (code) => {
      liveByThread.delete(input.sessionId);
      const current = liveRef.current;
      if (!current?.muteUpdates) {
        (current?.onEvent ?? input.onEvent)({ type: "session.ended", code });
      }
      current?.turnFailed?.(new Error("Antigravity CLI exited"));
      if (current) {
        current.turnDone = null;
        current.turnFailed = null;
      }
    },
  );

  const spawnArgs = buildAgySpawnArgs({
    model: input.model,
    effort: input.modelSettings?.effort,
    resume: resume?.conversationId,
    mode: planning ? "plan" : undefined,
  });

  await spawnChild(input.sessionId, path, spawnArgs, input.cwd);

  liveByThread.set(input.sessionId, live);
  return live;
}

async function runTurn(live: Live, input: SendTurnInput): Promise<void> {
  live.onEvent = input.onEvent;
  live.runtimeMode = input.runtimeMode;
  live.activeTurn = true;
  live.cancelled = false;
  live.muteUpdates = false;

  const turnPromise = new Promise<void>((resolve, reject) => {
    live.turnDone = resolve;
    live.turnFailed = reject;
  });

  const message = buildAgyUserMessage({
    text: input.text,
    attachments: input.attachments,
  });

  await writeChild(input.sessionId, JSON.stringify(message) + "\n");
  await turnPromise;
}

function handleLine(sessionId: string, live: Live, line: string): void {
  const rec = parseJsonLine(line);
  if (!rec) return;

  const eventType = rec.event;

  if (eventType === "init") {
    const convId =
      typeof rec.conversation_id === "string" ? rec.conversation_id : "";
    if (convId) {
      live.conversationId = convId;
      resumeByThread.set(sessionId, {
        conversationId: convId,
        cwd: live.cwd,
      });
      if (!live.muteUpdates) {
        live.onEvent({
          type: "session.providerBound",
          providerSessionId: convId,
        });
      }
    }
    if (!live.muteUpdates) {
      live.onEvent({ type: "session.started" });
    }
    return;
  }

  if (eventType === "step_update") {
    const su = rec.step_update as Record<string, unknown> | undefined;
    if (!su || live.muteUpdates) return;

    const stepIndex = typeof su.step_index === "number" ? su.step_index : 0;
    const state = su.state;
    const stepType = su.step_type;

    if (stepType === "agent_response") {
      const textDelta = typeof su.text_delta === "string" ? su.text_delta : "";
      if (textDelta) {
        live.onEvent({ type: "message.delta", text: textDelta });
      }
      if (state === "DONE") {
        live.onEvent({ type: "message.completed" });
      }
    } else if (stepType === "tool") {
      const toolName =
        typeof su.tool_name === "string" ? su.tool_name : "tool";
      const toolInfo = su.tool_info as Record<string, unknown> | undefined;
      const params = toolInfo?.parameters as Record<string, unknown> | undefined;
      const output =
        typeof toolInfo?.output === "string" ? toolInfo.output : undefined;
      const callId = `agy-tool-${stepIndex}`;

      if (state === "ACTIVE") {
        live.toolsByIndex.set(stepIndex, {
          id: callId,
          name: toolName,
          params,
        });
        live.onEvent({
          type: "tool.started",
          callId,
          title: toolTitle(toolName, params),
          kind: toolKindFromName(toolName),
          preview: previewFromTool(toolName, params),
        });
      } else if (state === "DONE") {
        const stored = live.toolsByIndex.get(stepIndex);
        const effectiveParams = params ?? stored?.params;
        live.onEvent({
          type: "tool.updated",
          callId,
          title: toolTitle(toolName, effectiveParams),
          kind: toolKindFromName(toolName),
          status: "completed",
          detail: output ? output.slice(0, 500) : undefined,
          preview: previewFromTool(toolName, effectiveParams, output),
        });
      }
    }

    if (su.usage && typeof su.usage === "object") {
      const usage = su.usage as Record<string, number>;
      if (usage.input_tokens != null) {
        live.onEvent({
          type: "context",
          used: usage.input_tokens,
          window: 1_000_000,
        });
      }
    }
    return;
  }

  if (eventType === "result") {
    const res = rec.result as Record<string, unknown> | undefined;
    if (res && !live.muteUpdates) {
      if (res.status === "ERROR") {
        const err =
          typeof res.response === "string"
            ? res.response
            : "Antigravity turn failed";
        live.onEvent({ type: "session.error", message: err });
      }
      if (res.usage && typeof res.usage === "object") {
        const usage = res.usage as Record<string, number>;
        if (usage.input_tokens != null) {
          live.onEvent({
            type: "context",
            used: usage.input_tokens,
            window: 1_000_000,
          });
        }
      }
    }

    live.activeTurn = false;
    live.turnDone?.();
    live.turnDone = null;
    live.turnFailed = null;
  }
}
