import type { Attachment, ToolPreview } from "../session";
import { attachmentPathText } from "../attachments";
import { extractToolPreview } from "./preview";

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
}): string[] {
  const args = [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
  ];
  if (input.resume) {
    args.push("--conversation", input.resume);
  }
  if (input.model) {
    // If model starts with "antigravity:", strip it
    const native = input.model.startsWith("antigravity:")
      ? input.model.slice("antigravity:".length)
      : input.model;
    if (native) args.push("--model", native);
  }
  if (input.effort) {
    args.push("--effort", input.effort);
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
  if (lower.includes("view") || lower.includes("read") || lower.includes("cat")) {
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
