import { promptBlocks, type PromptContentBlock } from "../attachments";
import type { Attachment, RuntimeMode, ToolPreview } from "../session";
import { attachmentPathText } from "../attachments";
import { normalizeTaskListStatus } from "../taskList";
import type { ApprovalDecision, HarnessEvent } from "./types";
import {
  composeToolTitle,
  extractSkillName,
  extractToolPreview,
} from "./preview";
import { acpAgentInfo } from "./acpSubagents";

export function isAntigravityAcpBinary(path: string): boolean {
  const norm = path.toLowerCase().replace(/\\/g, "/");
  return norm.includes("agy_acp_server");
}

/* ========================================================================= */
/*                          ACP Protocol Helpers                             */
/* ========================================================================= */

export type AntigravityModeId = "default" | "auto_edit" | "yolo";

export type AntigravityPermissionRequest = {
  title: string;
  kind?: string;
  callId?: string;
  preview?: ToolPreview;
  optionIds: string[];
  optionKinds: Record<string, string>;
};

export type SessionConfigOption = {
  id: string;
  category?: string;
  type?: string;
  currentValue?: string | boolean;
};

export function antigravityPromptBlocks(
  text: string,
  attachments: Attachment[] = [],
): PromptContentBlock[] {
  return promptBlocks(text, attachments);
}

/** The raw .par or .exe locates sibling resources relative to its process directory. */
export function antigravitySpawnCwd(binary: string, fallback: string): string {
  const separator = Math.max(binary.lastIndexOf("/"), binary.lastIndexOf("\\"));
  return separator >= 0 ? binary.slice(0, separator + 1) : fallback;
}

export function antigravityModeId(
  runtimeMode: RuntimeMode,
  planning = false,
): AntigravityModeId {
  if (planning) return "default";
  if (runtimeMode === "full-access") return "yolo";
  if (runtimeMode === "auto-accept-edits") return "auto_edit";
  return "default";
}

export function autoPermissionOption(
  runtimeMode: RuntimeMode,
  kind: string | undefined,
  optionIds: string[],
  optionKinds: Record<string, string> = {},
): string | null {
  if (
    runtimeMode !== "full-access" &&
    !(runtimeMode === "auto-accept-edits" && kind === "edit")
  ) {
    return null;
  }
  return permissionOptionId("allow", optionIds, optionKinds);
}

export function permissionOptionId(
  decision: ApprovalDecision,
  optionIds: string[],
  optionKinds: Record<string, string> = {},
): string | null {
  const kinds =
    decision === "allow"
      ? ["allow_once", "allow_always"]
      : ["reject_once", "reject_always"];
  for (const kind of kinds) {
    const id = optionIds.find((id) => optionKinds[id] === kind);
    if (id) return id;
  }
  return pickOption(
    optionIds,
    decision === "allow"
      ? ["allow-once", "allow_once", "allow-always", "allow_always", "allow"]
      : [
          "reject-once",
          "reject_once",
          "reject-always",
          "reject_always",
          "reject",
          "deny",
        ],
  );
}

export function permissionRequestFromAcp(
  params: unknown,
): AntigravityPermissionRequest {
  const rec = asRecord(params);
  const subject = asRecord(rec?.subject);
  const tool =
    asRecord(rec?.toolCall) ??
    asRecord(rec?.tool_call) ??
    asRecord(subject?.toolCall) ??
    asRecord(subject) ??
    rec ??
    {};
  const command = stringField(subject ?? {}, "command");
  const options = Array.isArray(rec?.options) ? rec.options : [];
  const optionIds = options
    .map((option) =>
      typeof option === "string"
        ? option
        : stringField(asRecord(option) ?? {}, "optionId") ??
          stringField(asRecord(option) ?? {}, "id"),
    )
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const optionKinds: Record<string, string> = {};
  for (const option of options) {
    const optRec = asRecord(option);
    const id = stringField(optRec ?? {}, "optionId") ?? stringField(optRec ?? {}, "id");
    const kind = stringField(optRec ?? {}, "kind");
    if (id && kind) optionKinds[id] = kind;
  }

  const callId =
    stringField(tool, "toolCallId") ??
    stringField(tool, "tool_call_id") ??
    stringField(rec ?? {}, "toolCallId") ??
    stringField(rec ?? {}, "tool_call_id");
  const toolUpdate = command
    ? {
        ...tool,
        name: stringField(tool, "name") ?? "terminal",
        rawInput: { command },
      }
    : tool;
  const preview = extractToolPreview(toolUpdate, tool);
  const kind =
    preview?.kind ?? stringField(tool, "kind") ?? stringField(subject ?? {}, "kind");
  const title =
    stringField(rec ?? {}, "title") ??
    (command
      ? `Run ${command.slice(0, 48)}`
      : composeToolTitle({
          kind,
          path: preview?.path,
          query: preview?.query,
          title: stringField(tool, "title") ?? stringField(tool, "name"),
        }));
  return {
    title,
    kind,
    callId,
    preview,
    optionIds,
    optionKinds,
  };
}

export function eventsFromAcpUpdate(params: unknown): HarnessEvent[] {
  const envelope = asRecord(params);
  const update = asRecord(envelope?.update) ?? envelope;
  if (!update) return [];
  const type =
    stringField(update, "sessionUpdate") ??
    stringField(update, "session_update") ??
    stringField(update, "type");
  const events: HarnessEvent[] = [];

  if (type === "agent_message_delta") {
    const text = textFromContent(update.delta ?? update.content ?? update.text);
    if (text) events.push({ type: "message.delta", text });
  } else if (type === "agent_thought_delta") {
    const text = textFromContent(update.delta ?? update.content ?? update.text);
    if (text) events.push({ type: "reasoning.delta", text });
  } else if (type === "agent_message") {
    const text = textFromContent(update.content ?? update.text);
    if (text) events.push({ type: "message.delta", text });
  } else if (type === "agent_thought") {
    const text = textFromContent(update.content ?? update.text);
    if (text) events.push({ type: "reasoning.delta", text });
  } else if (type === "plan") {
    const plan = planEvent(update);
    if (plan) events.push(plan);
  } else if (type === "tool_call" || type === "tool_call_update") {
    const tool = asRecord(update.toolCall) ?? asRecord(update.tool_call) ?? update;
    const callId =
      stringField(tool, "toolCallId") ??
      stringField(tool, "tool_call_id") ??
      stringField(update, "toolCallId") ??
      stringField(update, "tool_call_id") ??
      "tool";
    const status =
      stringField(tool, "status") ??
      stringField(update, "status") ??
      (type === "tool_call" ? "pending" : "completed");
    const preview = extractToolPreview(update, tool);
    const detail = toolDetail(update, tool);
    const skill = extractSkillName(update, tool);
    const kind =
      (skill ? "skill" : undefined) ??
      preview?.kind ??
      stringField(tool, "kind") ??
      stringField(update, "kind");
    const title =
      stringField(update, "title") ??
      composeToolTitle({
        kind,
        path: preview?.path,
        query: preview?.query,
        title: stringField(tool, "title") ?? stringField(tool, "name"),
      });
    const agent = acpAgentInfo(update, tool, kind, title);
    events.push({
      type: type === "tool_call" ? "tool.started" : "tool.updated",
      callId,
      title: agent?.title ?? title,
      kind: agent?.kind ?? kind,
      status,
      ...(detail ? { detail } : {}),
      ...(preview ? { preview } : {}),
    });
  }

  for (const usage of usageFromUpdate(update)) events.push(usage);
  return events;
}

export function readConfigOptions(options: unknown): SessionConfigOption[] {
  if (!Array.isArray(options)) return [];
  return options.flatMap((option) => {
    const rec = asRecord(option);
    const id = stringField(rec ?? {}, "id") ?? stringField(rec ?? {}, "configId");
    if (!id) return [];
    return [
      {
        id,
        category: stringField(rec ?? {}, "category"),
        type: stringField(rec ?? {}, "type"),
        currentValue:
          typeof rec?.currentValue === "string" ||
          typeof rec?.currentValue === "boolean"
            ? rec.currentValue
            : undefined,
      },
    ];
  });
}

export function extractModelConfigId(options: SessionConfigOption[]): string {
  const isSelectable = (option: SessionConfigOption) => option.type !== "boolean";
  const exact = options.find((option) => option.id === "model" && isSelectable(option));
  if (exact) return exact.id;
  const model = options.find(
    (option) =>
      option.category === "model" && option.id !== "provider" && isSelectable(option),
  );
  return model?.id ?? "model";
}

export function resolveSettingConfigId(
  options: SessionConfigOption[],
  settingId: string,
): string | undefined {
  const needle = settingId.trim().toLowerCase();
  const exact = options.find((option) => option.id.toLowerCase() === needle);
  if (exact) return exact.id;
  if (needle === "effort" || needle === "reasoning") {
    return options.find(
      (option) =>
        option.id === "effort" ||
        option.id === "reasoning" ||
        option.category === "thought_level",
    )?.id;
  }
  if (needle === "fast" || needle === "fastmode" || needle === "fast_mode") {
    return options.find(
      (option) =>
        option.id === "fast" ||
        option.id === "fast_mode" ||
        option.id.toLowerCase().includes("fast"),
    )?.id;
  }
  return undefined;
}

export function sessionIdFromResult(result: unknown): string | undefined {
  const rec = asRecord(result);
  const id = rec?.sessionId ?? rec?.session_id ?? rec?.id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function usageFromUpdate(update: Record<string, unknown>): HarnessEvent[] {
  const usage =
    asRecord(update.usage) ??
    asRecord(update.tokenUsage) ??
    asRecord(update.token_usage) ??
    (hasUsageFields(update) ? update : null);
  if (!usage) return [];
  const used =
    numberField(usage, "used") ??
    numberField(usage, "usedTokens") ??
    numberField(usage, "used_tokens") ??
    sumNumbers(usage, [
      "inputTokens",
      "outputTokens",
      "input_tokens",
      "output_tokens",
    ]);
  const window =
    numberField(usage, "window") ??
    numberField(usage, "size") ??
    numberField(usage, "contextWindow") ??
    numberField(usage, "context_window") ??
    numberField(usage, "maxTokens") ??
    numberField(usage, "max_tokens");
  const events: HarnessEvent[] = [];
  if (used != null || window != null) {
    events.push({
      type: "context",
      ...(used != null ? { used } : {}),
      ...(window != null ? { window } : {}),
    });
  }
  return events;
}

function hasUsageFields(rec: Record<string, unknown>): boolean {
  return [
    "used",
    "usedTokens",
    "used_tokens",
    "inputTokens",
    "input_tokens",
    "outputTokens",
    "output_tokens",
    "cacheReadTokens",
    "cache_read_input_tokens",
    "cacheWriteTokens",
    "cache_creation_input_tokens",
    "window",
    "size",
    "contextWindow",
    "context_window",
    "maxTokens",
    "max_tokens",
  ].some((key) => numberField(rec, key) != null);
}

function planEvent(update: Record<string, unknown>): HarnessEvent | null {
  const entries = update.entries ?? update.plan;
  if (Array.isArray(entries)) {
    const items = entries.flatMap((item) => {
      const rec = asRecord(item);
      if (!rec) return [];
      const content = String(rec.content ?? rec.text ?? rec.title ?? "").trim();
      if (!content) return [];
      return [
        {
          text: content,
          status: normalizeTaskListStatus(rec.status),
        },
      ];
    });
    return { type: "tasks.updated", items };
  }
  if (typeof update.text === "string" && update.text.trim()) {
    return { type: "plan", text: update.text };
  }
  return null;
}

function toolDetail(
  update: Record<string, unknown>,
  tool: Record<string, unknown>,
): string | undefined {
  const content =
    textFromContent(update.content, "\n") || textFromContent(tool.content, "\n");
  if (content.trim()) return cap(content);
  const output = update.rawOutput ?? tool.rawOutput;
  if (typeof output === "string" && output.trim()) return cap(output);
  const outputText = textFromContent(output);
  return outputText.trim() ? cap(outputText) : undefined;
}

function cap(value: string, max = 8_000): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

function pickOption(optionIds: string[], preferred: string[]): string | null {
  for (const id of preferred) {
    if (optionIds.includes(id)) return id;
  }
  return null;
}

function textFromContent(content: unknown, separator = ""): string {
  if (typeof content === "string") return content;
  const rec = asRecord(content);
  if (rec && typeof rec.text === "string") return rec.text;
  if (rec && rec.content != null) return textFromContent(rec.content, separator);
  if (Array.isArray(content)) {
    return content
      .map((item) => textFromContent(item, separator))
      .filter(Boolean)
      .join(separator);
  }
  return "";
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function stringField(
  rec: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = rec[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberField(
  rec: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = rec[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sumNumbers(
  rec: Record<string, unknown>,
  keys: string[],
): number | undefined {
  let total = 0;
  let found = false;
  for (const key of keys) {
    const value = numberField(rec, key);
    if (value == null) continue;
    total += value;
    found = true;
  }
  return found ? total : undefined;
}

/* ========================================================================= */
/*                          CLI Protocol Helpers                             */
/* ========================================================================= */

export type AgyInitEvent = {
  event: "init";
  conversation_id: string;
  init?: {
    cwd?: string;
    tools?: string[];
    permission_mode?: string;
  };
};

export type AgyUsage = {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
};

export type AgyToolInfo = {
  name: string;
  parameters?: Record<string, unknown>;
  output?: string;
};

export type AgyStepUpdate = {
  conversation_id: string;
  step_index: number;
  state: "ACTIVE" | "DONE";
  step_type: "user_input" | "agent_response" | "tool" | "thinking" | "reasoning";
  text_delta?: string;
  tool_name?: string;
  tool_info?: AgyToolInfo;
  duration_seconds?: number;
  usage?: AgyUsage;
};

export type AgyStepUpdateEvent = {
  event: "step_update";
  step_update: AgyStepUpdate;
};

export type AgyResult = {
  conversation_id: string;
  status: "SUCCESS" | "ERROR" | string;
  response?: string;
  duration_seconds?: number;
  num_turns?: number;
  usage?: AgyUsage;
};

export type AgyResultEvent = {
  event: "result";
  result: AgyResult;
};

export type AgyEvent =
  | AgyInitEvent
  | AgyStepUpdateEvent
  | AgyResultEvent
  | { event: string; [key: string]: unknown };

export function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function buildAgySpawnArgs(input: {
  model?: string;
  effort?: string;
  resume?: string;
  mode?: string;
  cwd?: string;
}): string[] {
  const args = [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
  ];
  if (input.cwd && input.cwd.trim() && input.cwd !== "~") {
    args.push("--add-dir", input.cwd);
  }
  if (input.resume) {
    args.push("--conversation", input.resume);
  }
  let effort = input.effort;
  if (input.model) {
    let native = input.model.startsWith("antigravity:")
      ? input.model.slice("antigravity:".length)
      : input.model;

    const match = native.match(/^(.*)-(low|medium|high)$/);
    if (match) {
      if (effort) {
        native = match[1];
      }
    }
    if (native) args.push("--model", native);
  }
  if (effort) {
    args.push("--effort", effort);
  }
  if (input.mode) {
    args.push("--mode", input.mode);
  }
  args.push("-p=");
  return args;
}

export function buildAgyUserMessage(input: {
  text: string;
  attachments?: Attachment[];
}): Record<string, unknown> {
  const parts: string[] = [];
  const text = input.text.trim();
  if (text) parts.push(text);
  for (const attachment of input.attachments ?? []) {
    try {
      parts.push(attachmentPathText(attachment));
    } catch {
      // ignore
    }
  }
  const prompt = parts.join("\n\n");
  return {
    event: "user",
    message: {
      content: [{ type: "text", text: prompt }],
    },
  };
}

export function toolKindFromName(name: string): string {
  const lower = (name || "").toLowerCase();
  if (
    lower.includes("command") ||
    lower.includes("terminal") ||
    lower.includes("shell") ||
    lower.includes("bash") ||
    lower.includes("exec")
  ) {
    return "execute";
  }
  if (
    lower.includes("write") ||
    lower.includes("edit") ||
    lower.includes("replace") ||
    lower.includes("patch")
  ) {
    return "edit";
  }
  if (
    lower.includes("view") ||
    lower.includes("read") ||
    lower.includes("cat")
  ) {
    return "read";
  }
  if (
    lower.includes("search") ||
    lower.includes("find") ||
    lower.includes("grep") ||
    lower.includes("list")
  ) {
    return "search";
  }
  if (lower.includes("subagent") || lower.includes("agent")) {
    return "agent";
  }
  return name;
}

export function toolTitle(
  name: string,
  params?: Record<string, unknown>,
): string {
  if (params?.toolSummary && typeof params.toolSummary === "string") {
    return params.toolSummary;
  }
  if (params?.toolAction && typeof params.toolAction === "string") {
    return params.toolAction;
  }
  if (name === "run_command" && typeof params?.command === "string") {
    return `Run: ${params.command.slice(0, 80)}`;
  }
  if (name === "run_command" && typeof params?.CommandLine === "string") {
    return `Run: ${params.CommandLine.slice(0, 80)}`;
  }
  if (
    (name === "view_file" || name === "replace_file_content" || name === "write_to_file") &&
    (typeof params?.AbsolutePath === "string" || typeof params?.TargetFile === "string")
  ) {
    const path = (params.AbsolutePath || params.TargetFile) as string;
    const file = path.split(/[/\\]/).pop() || path;
    const verb = name === "view_file" ? "Read" : "Edit";
    return `${verb} ${file}`;
  }
  if (name === "grep_search" && typeof params?.Query === "string") {
    return `Grep: ${params.Query}`;
  }
  if (name === "find_by_name" && typeof params?.Pattern === "string") {
    return `Find: ${params.Pattern}`;
  }
  if (name === "list_dir" && typeof params?.DirectoryPath === "string") {
    return `List: ${params.DirectoryPath}`;
  }
  return name;
}

export function previewFromTool(
  name: string,
  params?: Record<string, unknown>,
  output?: string,
): ToolPreview | undefined {
  const p = params ?? {};
  const kind = toolKindFromName(name);
  const normalizedParams: Record<string, unknown> = { ...p };

  if (p.CommandLine && !p.command) {
    normalizedParams.command = p.CommandLine;
  }
  if (p.AbsolutePath && !p.path) {
    normalizedParams.path = p.AbsolutePath;
  }
  if (p.TargetFile && !p.path) {
    normalizedParams.path = p.TargetFile;
  }
  if (p.Query && !p.query) {
    normalizedParams.query = p.Query;
  }
  if (p.Pattern && !p.query) {
    normalizedParams.query = p.Pattern;
  }
  if (p.DirectoryPath && !p.path) {
    normalizedParams.path = p.DirectoryPath;
  }

  return extractToolPreview(
    {
      title: toolTitle(name, p),
      name,
      kind,
      input: normalizedParams,
      rawInput: normalizedParams,
      content: output,
    },
    {
      title: toolTitle(name, p),
      name,
      kind,
      rawInput: normalizedParams,
    },
  );
}
