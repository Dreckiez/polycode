import type { Attachment, RuntimeMode } from "../session";
import { attachmentPathText } from "../attachments";
import type { ApprovalDecision, HarnessEvent } from "./types";

/** Claude Code versions that first ship Opus 5 / Fable 5 / Opus 4.8 / 4.7. */
export const MINIMUM_CLAUDE_OPUS_5_VERSION = "2.1.219";
export const MINIMUM_CLAUDE_FABLE_5_VERSION = "2.1.169";
export const MINIMUM_CLAUDE_OPUS_4_8_VERSION = "2.1.154";
export const MINIMUM_CLAUDE_OPUS_4_7_VERSION = "2.1.111";

export const CLAUDE_SETTING_SOURCES = "user,project,local";

export const SUPPORTED_CLAUDE_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ClaudePermissionMode =
  "default" | "plan" | "acceptEdits" | "auto" | "bypassPermissions";

export type ClaudeControlRequest = {
  requestId: string;
  subtype: string;
  toolName?: string;
  input?: Record<string, unknown>;
  toolUseId?: string;
};

export type ClaudeMappedLine = {
  events: HarnessEvent[];
  sessionId?: string;
  control?: ClaudeControlRequest;
  cancelRequestId?: string;
  turnCompleted?: {
    status: "completed" | "failed" | "interrupted" | "cancelled";
    error?: string;
  };
};

export type ClaudeCliSettings = {
  alwaysThinkingEnabled?: boolean;
  fastMode?: boolean;
  ultracode?: boolean;
  disableAllHooks?: boolean;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function stringField(
  rec: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!rec) return undefined;
  const value = rec[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function parseClaudeVersion(output: string): string | null {
  const match = output.match(/\d+\.\d+\.\d+/);
  return match?.[0] ?? null;
}

export function compareSemver(left: string, right: string): number {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function runtimeModeToPermission(
  mode: RuntimeMode,
): ClaudePermissionMode | undefined {
  switch (mode) {
    case "auto-accept-edits":
      return "acceptEdits";
    case "auto":
      return "auto";
    case "full-access":
      return "bypassPermissions";
    default:
      return undefined;
  }
}

/** Older model ids that reject `xhigh` and want `max` instead. */
const LEGACY_XHIGH_AS_MAX = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-opus-4-5",
  "claude-haiku-4-5",
  "claude-opus-4-1",
  "claude-opus-4-0",
  "claude-sonnet-4-0",
  "claude-sonnet-4-5",
]);

/**
 * Normalize a resolved Claude effort for `--effort`.
 * `ultracode` pairs with `xhigh`; `ultrathink` is a prompt prefix, not a CLI effort.
 */
export function normalizeClaudeCliEffort(
  effort: string | null | undefined,
  model: string | null | undefined,
): string | undefined {
  if (!effort || effort === "ultrathink") return undefined;
  if (effort === "ultracode") return "xhigh";
  if (effort === "xhigh" && model && LEGACY_XHIGH_AS_MAX.has(model)) {
    return "max";
  }
  if (effort === "max" && model === "claude-sonnet-4-6") return "high";
  return effort;
}

export function isClaudeUltracodeEffort(
  effort: string | null | undefined,
): boolean {
  return effort === "ultracode";
}

export function applyClaudePromptEffortPrefix(
  text: string,
  effort: string | null | undefined,
): string {
  if (effort !== "ultrathink") return text;
  if (!text) return "Ultrathink:";
  return `Ultrathink:\n${text}`;
}

export function resolveClaudeApiModelId(
  model: string,
  context?: string | null,
): string {
  if (context === "1m") return `${model}[1m]`;
  return model;
}

export function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export function buildClaudeUserMessage(input: {
  text: string;
  attachments?: Attachment[];
  effort?: string | null;
}): Record<string, unknown> {
  const text = applyClaudePromptEffortPrefix(input.text.trim(), input.effort);
  const content: Array<Record<string, unknown>> = [];
  if (text) content.push({ type: "text", text });
  for (const attachment of input.attachments ?? []) {
    content.push(
      imageContentBlock(attachment) ?? {
        type: "text",
        text: attachmentPathText(attachment),
      },
    );
  }
  return {
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content,
    },
  };
}

function imageContentBlock(
  attachment: Attachment,
): Record<string, unknown> | null {
  if (attachment.kind !== "image" || !attachment.data) return null;
  const mime = normalizeImageMime(attachment.mimeType);
  if (!SUPPORTED_CLAUDE_IMAGE_MIME_TYPES.has(mime)) return null;
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mime,
      data: attachment.data,
    },
  };
}

function normalizeImageMime(mime: string): string {
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

export function buildClaudeSpawnArgs(input: {
  model?: string;
  effort?: string;
  permissionMode?: ClaudePermissionMode;
  resume?: string;
  sessionId?: string;
  settings?: ClaudeCliSettings;
  includePartialMessages?: boolean;
  maxTurns?: number;
  isolated?: boolean;
}): string[] {
  const args = [
    "--output-format",
    "stream-json",
    "--verbose",
    "--input-format",
    "stream-json",
  ];
  if (!input.isolated) {
    args.push("--permission-prompt-tool", "stdio");
  }
  if (input.includePartialMessages !== false) {
    args.push("--include-partial-messages");
  }
  // Isolated spawns are MonoCode's own helper calls (titles, summaries); the
  // user's hooks have no business firing there. Interactive sessions inherit
  // whatever the caller decided so `~/.claude` hooks keep working.
  const settings: ClaudeCliSettings = {
    ...input.settings,
    ...(input.isolated ? { disableAllHooks: true } : {}),
  };
  if (input.isolated) {
    args.push("--no-session-persistence");
    args.push("--strict-mcp-config");
    args.push("--mcp-config", JSON.stringify({ mcpServers: {} }));
    args.push("--settings", JSON.stringify(settings));
  } else {
    args.push(`--setting-sources=${CLAUDE_SETTING_SOURCES}`);
    args.push("--settings", JSON.stringify(settings));
  }
  if (input.model) args.push("--model", input.model);
  if (input.effort) args.push("--effort", input.effort);
  if (input.permissionMode) {
    args.push("--permission-mode", input.permissionMode);
  }
  if (input.permissionMode === "bypassPermissions") {
    args.push("--allow-dangerously-skip-permissions");
  }
  if (input.resume) args.push("--resume", input.resume);
  if (input.sessionId) args.push("--session-id", input.sessionId);
  if (input.maxTurns) args.push("--max-turns", String(input.maxTurns));
  return args;
}

export function buildControlRequest(
  requestId: string,
  request: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "control_request",
    request_id: requestId,
    request,
  };
}

export function buildControlResponse(
  requestId: string,
  response: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response,
    },
  };
}

export type ClaudeControlResponse = {
  requestId: string;
  ok: boolean;
  payload: Record<string, unknown> | null;
  error?: string;
};

export function parseControlResponse(
  rec: Record<string, unknown>,
): ClaudeControlResponse | null {
  if (stringField(rec, "type") !== "control_response") return null;
  const nested = asRecord(rec.response);
  const requestId =
    stringField(nested, "request_id") ?? stringField(rec, "request_id") ?? "";
  if (!requestId) return null;
  const subtype = stringField(nested, "subtype") ?? "";
  if (subtype === "error") {
    return {
      requestId,
      ok: false,
      payload: null,
      error: stringField(nested, "error") ?? "control request failed",
    };
  }
  if (subtype && subtype !== "success") return null;
  return {
    requestId,
    ok: true,
    payload: asRecord(nested?.response) ?? {},
  };
}

/** Rows from a `list_models` control response, or null if this line is something else. */
export function listModelsFromControlResponse(
  rec: Record<string, unknown>,
  requestId: string,
): unknown[] | null {
  const parsed = parseControlResponse(rec);
  if (!parsed || parsed.requestId !== requestId) return null;
  if (!parsed.ok) return [];
  return Array.isArray(parsed.payload?.models) ? parsed.payload.models : [];
}

export function isClaudeInitMessage(rec: Record<string, unknown>): boolean {
  const type = stringField(rec, "type");
  const subtype = stringField(rec, "subtype");
  return type === "system" && (subtype === "init" || subtype === "initialized");
}

export function toClaudePermissionResult(
  decision: ApprovalDecision,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (decision === "allow") {
    return { behavior: "allow", updatedInput: input };
  }
  return {
    behavior: "deny",
    message: "User declined tool execution.",
  };
}

export function parseControlRequest(
  rec: Record<string, unknown>,
): ClaudeControlRequest | null {
  const type = stringField(rec, "type");
  if (type !== "control_request" && type !== "sdk_control_request") {
    return null;
  }
  const nested = asRecord(rec.request);
  const requestId =
    stringField(rec, "request_id") ?? stringField(nested, "request_id") ?? "";
  const subtype =
    stringField(nested, "subtype") ?? stringField(rec, "subtype") ?? "";
  if (!requestId || !subtype) return null;
  const input =
    asRecord(nested?.input) ??
    asRecord(nested?.tool_input) ??
    asRecord(rec.input) ??
    {};
  return {
    requestId,
    subtype,
    toolName: stringField(nested, "tool_name") ?? stringField(rec, "tool_name"),
    input,
    toolUseId:
      stringField(nested, "tool_use_id") ??
      stringField(nested, "toolUseID") ??
      stringField(rec, "tool_use_id"),
  };
}

export function parseControlCancelId(
  rec: Record<string, unknown>,
): string | undefined {
  if (stringField(rec, "type") !== "control_cancel_request") return undefined;
  return (
    stringField(rec, "request_id") ??
    stringField(asRecord(rec.request), "request_id")
  );
}

export function sessionIdFromMessage(
  rec: Record<string, unknown>,
): string | undefined {
  const type = stringField(rec, "type");
  const subtype = stringField(rec, "subtype");
  if (type === "system" && subtype?.startsWith("hook_")) return undefined;
  // Subagents can carry their own session id. Rebinding the parent to it
  // would drop resume for the conversation the user is actually in.
  const parent = rec.parent_tool_use_id;
  if (typeof parent === "string" && parent.length > 0) return undefined;
  return stringField(rec, "session_id");
}

/**
 * Claude Code pings `system/status` for every request lifecycle step
 * ("requesting", "responding", …). Codex and opencode only emit status text for
 * notable events — retries, warnings, compaction — so drop the lifecycle chatter
 * here and keep the transcript comparable across harnesses.
 */
export const LIFECYCLE_STATUSES = new Set([
  "requesting",
  "request",
  "responding",
  "response",
  "streaming",
  "thinking",
  "working",
  "running",
  "pending",
  "queued",
  "waiting",
  "in_progress",
  "tool_use",
  "idle",
  "done",
  "completed",
  "status",
  "compact",
]);

export function tryParseJsonRecord(
  value: string,
): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(value)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function claudeSettingsKey(input: {
  model: string;
  effort?: string;
  fast?: string;
  thinking?: string;
  context?: string;
  runtimeMode: RuntimeMode;
  hooks?: boolean;
}): string {
  return [
    input.model,
    input.effort ?? "",
    input.fast ?? "",
    input.thinking ?? "",
    input.context ?? "",
    input.runtimeMode,
    input.hooks === false ? "nohooks" : "hooks",
  ].join("|");
}

export function numberField(
  rec: Record<string, unknown> | null | undefined,
  key: string,
): number {
  const value = rec?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}