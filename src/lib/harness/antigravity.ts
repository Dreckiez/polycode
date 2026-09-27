import type { RuntimeMode } from "../session";
import { sameProjectPath } from "../recents";
import {
  killChild,
  resolveAntigravityBinary,
  spawnChild,
  unwatchChild,
  watchChild,
  writeChild,
} from "./child";
import {
  antigravityModeId,
  antigravityPromptBlocks,
  antigravitySpawnCwd,
  autoPermissionOption,
  buildAgySpawnArgs,
  buildAgyUserMessage,
  eventsFromAcpUpdate,
  extractModelConfigId,
  isAntigravityAcpBinary,
  parseJsonLine,
  permissionOptionId,
  permissionRequestFromAcp,
  previewFromTool,
  readConfigOptions,
  resolveSettingConfigId,
  sessionIdFromResult,
  toolKindFromName,
  toolTitle,
  type SessionConfigOption,
} from "./antigravityProtocol";
import { AcpClient, type AcpHandlers } from "./acp";
import { nativeModelId } from "../models";
import type {
  ApprovalDecision,
  HarnessEvent,
  HarnessSessionInput,
  SendTurnInput,
  SteerTurnInput,
} from "./types";

type SessionSetupResult = {
  sessionId?: string;
  session_id?: string;
  id?: string;
  configOptions?: unknown;
};

type LiveAcp = {
  kind: "acp";
  sessionId: string;
  acp: AcpClient;
  acpSessionId: string;
  cwd: string;
  model: string;
  modelSettings?: Record<string, string>;
  modelConfigId: string;
  configOptions: SessionConfigOption[];
  muteUpdates: boolean;
  cancelled: boolean;
  runtimeMode: RuntimeMode;
  planning: boolean;
  onEvent: (event: HarnessEvent) => void;
  approvals: Map<number, (decision: ApprovalDecision) => void>;
  turns: Promise<void>;
};

type LiveCli = {
  kind: "cli";
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

type Live = LiveAcp | LiveCli;

type Resume = {
  conversationId: string;
  cwd: string;
};

const INIT_TIMEOUT_MS = 45_000;
const SESSION_TIMEOUT_MS = 45_000;
const CONTROL_TIMEOUT_MS = 15_000;
const PROMPT_TIMEOUT_MS = 30 * 60_000;

const CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
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

  let live: Live;
  try {
    live = await ensureLive(input);
  } catch (error) {
    cancelledThreads.delete(input.sessionId);
    throw error;
  }
  if (cancelledThreads.delete(input.sessionId)) return;

  live.onEvent = input.onEvent;
  live.runtimeMode = input.runtimeMode;
  live.planning = input.intent === "plan";

  if (live.kind === "acp") {
    live.turns = live.turns
      .catch(() => undefined)
      .then(async () => {
        live.cancelled = false;
        live.muteUpdates = false;
        try {
          await applyModelSelection(live, input);
          if (live.cancelled) return;
          await applyRuntimeMode(
            live,
            input.runtimeMode,
            input.intent === "plan",
          );
          if (live.cancelled) return;
          await promptAcp(live, input);
        } catch (error) {
          if (live.cancelled) return;
          throw error;
        }
      });
    try {
      await live.turns;
    } catch (error) {
      if (liveByThread.get(input.sessionId) === live) {
        await stopAntigravitySession(input.sessionId);
      }
      throw error;
    }
  } else {
    live.turns = live.turns
      .then(() => runCliTurn(live, input))
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
}

export async function steerAntigravityTurn(
  input: SteerTurnInput,
): Promise<void> {
  const live = liveByThread.get(input.sessionId);
  if (!live) return;

  if (live.kind === "acp") {
    const blocks = antigravityPromptBlocks(input.text, input.attachments);
    if (blocks.length === 0) return;
    const params = {
      sessionId: live.acpSessionId,
      prompt: blocks,
    };
    try {
      await live.acp.notify("session/steer", params);
    } catch {
      await live.acp.notify("_session/steer", params).catch(() => undefined);
    }
  } else {
    const msg = buildAgyUserMessage({
      text: input.text,
      attachments: input.attachments,
    });
    await writeChild(input.sessionId, JSON.stringify(msg) + "\n");
  }
}

export async function cancelAntigravityTurn(sessionId: string): Promise<void> {
  const live = liveByThread.get(sessionId);
  if (!live) {
    cancelledThreads.add(sessionId);
    return;
  }

  if (live.kind === "acp") {
    live.cancelled = true;
    live.muteUpdates = true;
    for (const [, resolve] of live.approvals) {
      resolve("deny");
    }
    live.approvals.clear();
    await live.acp
      .notify("session/cancel", { sessionId: live.acpSessionId })
      .catch(() => undefined);
    live.acp.rejectPending(new Error("cancelled"));
    live.onEvent({ type: "message.completed" });
    live.onEvent({ type: "reasoning.completed" });
  } else {
    live.cancelled = true;
    live.muteUpdates = true;
    live.activeTurn = false;
    live.turnDone?.();
    live.turnDone = null;
    live.turnFailed = null;

    live.onEvent({ type: "message.completed" });
    live.onEvent({ type: "reasoning.completed" });

    await stopAntigravitySession(sessionId);
  }
}

export async function stopAntigravitySession(sessionId: string): Promise<void> {
  cancelledThreads.delete(sessionId);
  const live = liveByThread.get(sessionId);
  liveByThread.delete(sessionId);

  if (live) {
    live.muteUpdates = true;
    if (live.kind === "acp") {
      for (const [, resolve] of live.approvals) {
        resolve("deny");
      }
      live.approvals.clear();
      live.acp.close();
    } else {
      live.activeTurn = false;
      live.turnDone?.();
      live.turnDone = null;
      live.turnFailed = null;
    }
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
  sessionId: string,
  requestId: number,
  decision: ApprovalDecision,
): void {
  const live = liveByThread.get(sessionId);
  if (live?.kind === "acp") {
    live.approvals.get(requestId)?.(decision);
  }
}

async function ensureLive(input: HarnessSessionInput): Promise<Live> {
  const planning = input.intent === "plan";
  const existing = liveByThread.get(input.sessionId);

  const currentEffort =
    input.modelSettings?.effort ??
    input.modelSettings?.reasoningEffort ??
    input.modelSettings?.reasoning;

  const existingEffort =
    existing?.modelSettings?.effort ??
    existing?.modelSettings?.reasoningEffort ??
    existing?.modelSettings?.reasoning;

  if (
    existing &&
    sameProjectPath(existing.cwd, input.cwd) &&
    existing.model === input.model &&
    (existingEffort ?? "high") === (currentEffort ?? "high") &&
    existing.planning === planning
  ) {
    existing.onEvent = input.onEvent;
    existing.runtimeMode = input.runtimeMode;
    return existing;
  }

  if (existing) {
    if (!sameProjectPath(existing.cwd, input.cwd)) {
      resumeByThread.delete(input.sessionId);
    }
    await stopAntigravitySession(input.sessionId);
  }

  const resume = resumeByThread.get(input.sessionId);
  if (resume && !sameProjectPath(resume.cwd, input.cwd)) {
    resumeByThread.delete(input.sessionId);
  }

  const { path } = await binaryResolver();
  const isAcp = isAntigravityAcpBinary(path);

  if (isAcp) {
    return ensureLiveAcp(input, path, resume, planning, currentEffort);
  } else {
    return ensureLiveCli(input, path, resume, planning, currentEffort);
  }
}

async function ensureLiveAcp(
  input: HarnessSessionInput,
  path: string,
  resume: Resume | undefined,
  planning: boolean,
  _currentEffort?: string,
): Promise<LiveAcp> {
  const canLoad = resume != null && sameProjectPath(resume.cwd, input.cwd);
  const handlers: AcpHandlers = {};
  const acp = new AcpClient(input.sessionId, handlers);
  const liveRef: { current: LiveAcp | null } = { current: null };
  const muteGate = { current: false };

  handlers.onNotification = (method, params) => {
    if (muteGate.current) return;
    const live = liveRef.current;
    if (!live || live.muteUpdates) return;
    handleNotification(live, method, params);
  };
  handlers.onRequest = (id, method, params) => {
    const live = liveRef.current;
    if (!live) {
      void acp
        .respondError(id, {
          code: -32601,
          message: `Method not found: ${method}`,
        })
        .catch(() => undefined);
      return;
    }
    void handleRequest(live, id, method, params);
  };

  const emit = (event: HarnessEvent) => {
    (liveRef.current?.onEvent ?? input.onEvent)(event);
  };

  watchChild(
    input.sessionId,
    (line) => acp.pushLine(line),
    (code) => {
      acp.close(new Error("Antigravity ACP server exited"));
      liveByThread.delete(input.sessionId);
      emit({ type: "session.ended", code });
    },
    (line) => {
      console.debug("[polycode] antigravity stderr", line);
    },
  );

  const spawnCwd = antigravitySpawnCwd(path, input.cwd);
  await spawnChild(input.sessionId, path, [], spawnCwd);

  try {
    await acp.request(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: CLIENT_CAPABILITIES,
        clientInfo: { name: "polycode", version: "0.1.0" },
      },
      INIT_TIMEOUT_MS,
    );

    let setup: SessionSetupResult | undefined;
    let acpSessionId: string | undefined;
    let didLoad = false;

    if (canLoad && resume) {
      try {
        setup = await acp.request<SessionSetupResult>(
          "session/resume",
          { sessionId: resume.conversationId },
          SESSION_TIMEOUT_MS,
        );
        acpSessionId = sessionIdFromResult(setup) ?? resume.conversationId;
        didLoad = true;
      } catch {
        muteGate.current = true;
        try {
          setup = await acp.request<SessionSetupResult>(
            "session/load",
            {
              sessionId: resume.conversationId,
              cwd: input.cwd,
              mcpServers: [],
            },
            SESSION_TIMEOUT_MS,
          );
          acpSessionId = sessionIdFromResult(setup) ?? resume.conversationId;
          didLoad = true;
        } catch {
          setup = undefined;
          acpSessionId = undefined;
          didLoad = false;
        } finally {
          muteGate.current = false;
        }
      }
    }

    if (!acpSessionId) {
      setup = await acp.request<SessionSetupResult>(
        "session/new",
        { cwd: input.cwd, mcpServers: [] },
        SESSION_TIMEOUT_MS,
      );
      acpSessionId = sessionIdFromResult(setup);
    }
    if (!acpSessionId) {
      throw new Error("Antigravity ACP server did not return a session id");
    }

    const configOptions = readConfigOptions(setup?.configOptions);
    const live: LiveAcp = {
      kind: "acp",
      sessionId: input.sessionId,
      acp,
      acpSessionId,
      cwd: input.cwd,
      model: input.model,
      modelSettings: input.modelSettings,
      modelConfigId: extractModelConfigId(configOptions),
      configOptions,
      muteUpdates: didLoad,
      cancelled: false,
      runtimeMode: input.runtimeMode,
      planning,
      onEvent: input.onEvent,
      approvals: new Map(),
      turns: Promise.resolve(),
    };
    liveRef.current = live;
    liveByThread.set(input.sessionId, live);
    resumeByThread.set(input.sessionId, {
      conversationId: acpSessionId,
      cwd: input.cwd,
    });
    live.onEvent({
      type: "session.providerBound",
      providerSessionId: acpSessionId,
    });
    live.onEvent({ type: "session.started" });
    return live;
  } catch (error) {
    acp.close(error instanceof Error ? error : new Error(String(error)));
    await stopAntigravitySession(input.sessionId);
    throw error;
  }
}

async function ensureLiveCli(
  input: HarnessSessionInput,
  path: string,
  resume: Resume | undefined,
  planning: boolean,
  currentEffort?: string,
): Promise<LiveCli> {
  const liveRef: { current: LiveCli | null } = { current: null };

  const live: LiveCli = {
    kind: "cli",
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
    effort: currentEffort,
    resume: resume?.conversationId,
    mode: planning ? "plan" : undefined,
    cwd: input.cwd,
  });

  await spawnChild(input.sessionId, path, spawnArgs, input.cwd);

  liveByThread.set(input.sessionId, live);
  return live;
}

async function runCliTurn(live: LiveCli, input: SendTurnInput): Promise<void> {
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

async function applyModelSelection(
  live: LiveAcp,
  input: SendTurnInput,
): Promise<void> {
  let base = nativeModelId(input.model);
  let effort =
    input.modelSettings?.effort ??
    input.modelSettings?.reasoningEffort ??
    input.modelSettings?.reasoning;
  const match = base.match(/^(.*?)-(low|medium|high)$/);
  if (match) {
    base = match[1];
    if (!effort) effort = match[2];
  }

  const modelConfigId =
    live.modelConfigId === "provider" ? "model" : live.modelConfigId;

  await setConfigOption(live, modelConfigId, base).catch((error: unknown) => {
    ignoreUnsupportedControl("set_config_option", error);
  });
  if (modelConfigId !== "model") {
    await setConfigOption(live, "model", base).catch((error: unknown) => {
      ignoreUnsupportedControl("set_config_option", error);
    });
  }

  if (effort) {
    const effortConfigId = resolveSettingConfigId(live.configOptions, "effort");
    if (effortConfigId) {
      await setConfigOption(live, effortConfigId, effort).catch(
        (error: unknown) => {
          ignoreUnsupportedControl("set_config_option", error);
        },
      );
    }
  }

  const settings = input.modelSettings ?? {};
  for (const [settingId, value] of Object.entries(settings)) {
    if (
      settingId === "effort" ||
      settingId === "reasoningEffort" ||
      settingId === "reasoning"
    ) {
      continue;
    }
    const configId = resolveSettingConfigId(live.configOptions, settingId);
    if (!configId || configId === "provider") continue;
    await setConfigOption(live, configId, value).catch((error: unknown) => {
      ignoreUnsupportedControl("set_config_option", error);
    });
  }
}

async function applyRuntimeMode(
  live: LiveAcp,
  runtimeMode: RuntimeMode,
  planning = false,
): Promise<void> {
  await live.acp
    .request(
      "session/set_mode",
      {
        sessionId: live.acpSessionId,
        modeId: antigravityModeId(runtimeMode, planning),
      },
      CONTROL_TIMEOUT_MS,
    )
    .catch((error: unknown) => {
      ignoreUnsupportedControl("set_mode", error);
    });
}

async function setConfigOption(
  live: LiveAcp,
  configId: string,
  value: string | boolean,
): Promise<void> {
  const encoded = String(value);
  const current = live.configOptions.find((option) => option.id === configId);
  if (current && String(current.currentValue ?? "") === encoded) return;

  const result = await live.acp.request<SessionSetupResult>(
    "session/set_config_option",
    {
      sessionId: live.acpSessionId,
      configId,
      value: encoded,
    },
    CONTROL_TIMEOUT_MS,
  );
  if (result?.configOptions) {
    live.configOptions = readConfigOptions(result.configOptions);
    live.modelConfigId = extractModelConfigId(live.configOptions);
  }
}

async function promptAcp(live: LiveAcp, input: SendTurnInput): Promise<void> {
  try {
    const blocks = antigravityPromptBlocks(input.text, input.attachments);
    if (blocks.length === 0) return;
    await live.acp.request(
      "session/prompt",
      {
        sessionId: live.acpSessionId,
        prompt: blocks,
      },
      PROMPT_TIMEOUT_MS,
    );
    if (live.cancelled) return;
    live.onEvent({ type: "message.completed" });
    live.onEvent({ type: "reasoning.completed" });
  } catch (error) {
    if (live.cancelled) return;
    const detail = error instanceof Error ? error.message : String(error);
    live.onEvent({
      type: "session.error",
      message: detail,
    });
    throw error;
  }
}

function ignoreUnsupportedControl(method: string, error: unknown): void {
  console.debug(`[polycode] antigravity ${method} failed`, error);
  const detail = error instanceof Error ? error.message : String(error);
  if (/timed out|not running|exited|closed|pipe/i.test(detail)) throw error;
}

function handleNotification(live: LiveAcp, method: string, params: unknown) {
  if (method !== "session/update") return;
  for (const event of eventsFromAcpUpdate(params)) {
    live.onEvent(event);
  }
}

async function handleRequest(
  live: LiveAcp,
  id: number,
  method: string,
  params: unknown,
) {
  if (method === "session/request_permission") {
    await handlePermission(live, id, params);
    return;
  }
  await live.acp
    .respondError(id, {
      code: -32601,
      message: `Method not found: ${method}`,
    })
    .catch(() => undefined);
}

async function handlePermission(live: LiveAcp, id: number, params: unknown) {
  const request = permissionRequestFromAcp(params);
  if (request.callId) {
    live.onEvent({
      type: "tool.updated",
      callId: request.callId,
      title: request.title,
      kind: request.kind,
      preview: request.preview,
    });
  }

  if (live.planning) {
    const readOnly = request.kind === "read" || request.kind === "search";
    const optionId = permissionOptionId(
      readOnly ? "allow" : "deny",
      request.optionIds,
      request.optionKinds,
    );
    await live.acp.respond(id, {
      outcome: {
        outcome: "selected",
        optionId: optionId ?? (readOnly ? "allow-once" : "reject-once"),
      },
    });
    return;
  }

  const auto = autoPermissionOption(
    live.runtimeMode,
    request.kind,
    request.optionIds,
    request.optionKinds,
  );
  if (auto) {
    await live.acp.respond(id, {
      outcome: { outcome: "selected", optionId: auto },
    });
    return;
  }

  live.onEvent({
    type: "approval.requested",
    requestId: id,
    title: request.title,
    kind: request.kind,
    callId: request.callId,
    preview: request.preview,
  });

  const decision = await new Promise<ApprovalDecision>((resolve) => {
    live.approvals.set(id, resolve);
  });
  live.approvals.delete(id);
  live.onEvent({ type: "approval.resolved", requestId: id, decision });

  const optionId = permissionOptionId(
    decision,
    request.optionIds,
    request.optionKinds,
  );
  await live.acp.respond(id, {
    outcome: {
      outcome: "selected",
      optionId: optionId ?? (decision === "allow" ? "allow-once" : "reject-once"),
    },
  });
}

function handleLine(sessionId: string, live: LiveCli, line: string): void {
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
