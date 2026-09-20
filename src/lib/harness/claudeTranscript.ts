import type { TaskListItem, ToolPreview } from "../session";
import { isTaskListToolName, taskListFromToolInput } from "../taskList";
import {
  questionPromptTitle,
  questionsFromUnknown,
  selectedAnswerLabels,
  type UserQuestionReply,
} from "../userQuestion";
import {
  extractToolPreview,
  isAgentToolName,
  titleFromToolInput,
} from "./preview";
import { streamTextDelta } from "./streamText";
import {
  asRecord,
  LIFECYCLE_STATUSES,
  numberField,
  stringField,
} from "./claudeProtocol";

export function statusTextFromSystem(
  rec: Record<string, unknown>,
): string | undefined {
  if (stringField(rec, "type") !== "system") return undefined;
  const subtype = stringField(rec, "subtype") ?? "";
  const compact = subtype.startsWith("compact");
  if (subtype !== "status" && !compact) return undefined;
  // Prose lives in `message`; `status` carries the bare lifecycle token.
  const text = (stringField(rec, "message") ?? "").trim();
  const notable =
    text && !LIFECYCLE_STATUSES.has(text.toLowerCase().replace(/[\s.…]+$/, ""));
  if (notable) return text;
  // Compaction is worth one row even when the CLI sends no prose with it.
  return compact ? "Compacted context" : undefined;
}

export function turnStatusFromResult(rec: Record<string, unknown>): {
  status: "completed" | "failed" | "interrupted" | "cancelled";
  error?: string;
} {
  const subtype = stringField(rec, "subtype") ?? "";
  if (subtype === "success") return { status: "completed" };
  const errors = Array.isArray(rec.errors)
    ? rec.errors.filter((item): item is string => typeof item === "string")
    : [];
  const joined = errors.join(" ").toLowerCase();
  const terminal = stringField(rec, "terminal_reason") ?? "";
  if (
    terminal === "aborted_tools" ||
    terminal === "aborted_streaming" ||
    joined.includes("interrupt")
  ) {
    return { status: "interrupted" };
  }
  if (joined.includes("cancel")) return { status: "cancelled" };
  const error = errors.find((item) => !item.startsWith("[ede_diagnostic]"));
  return { status: "failed", error: error ?? "Claude turn failed." };
}

export function streamDeltaFromEvent(
  rec: Record<string, unknown>,
): { kind: "assistant" | "reasoning"; text: string } | null {
  const event = asRecord(rec.event);
  if (!event || stringField(event, "type") !== "content_block_delta") {
    return null;
  }
  const delta = asRecord(event.delta);
  const deltaType = stringField(delta, "type") ?? "";
  if (deltaType === "text_delta") {
    const text = streamTextDelta(delta?.text);
    return text ? { kind: "assistant", text } : null;
  }
  if (deltaType === "thinking_delta") {
    const text = streamTextDelta(delta?.thinking);
    return text ? { kind: "reasoning", text } : null;
  }
  return null;
}

export function toolStartFromEvent(rec: Record<string, unknown>): {
  index: number;
  id: string;
  name: string;
  input: Record<string, unknown>;
} | null {
  const event = asRecord(rec.event);
  if (!event || stringField(event, "type") !== "content_block_start") {
    return null;
  }
  const block = asRecord(event.content_block);
  if (!block) return null;
  const blockType = stringField(block, "type") ?? "";
  if (
    blockType !== "tool_use" &&
    blockType !== "server_tool_use" &&
    blockType !== "mcp_tool_use"
  ) {
    return null;
  }
  const id = stringField(block, "id");
  const name = stringField(block, "name");
  if (!id || !name) return null;
  const index = typeof event.index === "number" ? event.index : -1;
  return {
    index,
    id,
    name,
    input: asRecord(block.input) ?? {},
  };
}

export function inputJsonDeltaFromEvent(
  rec: Record<string, unknown>,
): { index: number; partial: string } | null {
  const event = asRecord(rec.event);
  if (!event || stringField(event, "type") !== "content_block_delta") {
    return null;
  }
  const delta = asRecord(event.delta);
  if (stringField(delta, "type") !== "input_json_delta") return null;
  const partial =
    typeof delta?.partial_json === "string" ? delta.partial_json : "";
  if (!partial) return null;
  const index = typeof event.index === "number" ? event.index : -1;
  return { index, partial };
}

export function isSubagentMessage(rec: Record<string, unknown>): boolean {
  const parent = rec.parent_tool_use_id;
  return typeof parent === "string" && parent.length > 0;
}

export function isAgentTaskType(taskType: string | undefined): boolean {
  const key = (taskType ?? "").toLowerCase();
  return key === "local_agent" || key === "remote_agent";
}

export type ClaudeAgentTaskStarted = {
  taskId: string;
  toolUseId?: string;
  description: string;
  taskType: string;
  backgrounded: boolean;
  ambient: boolean;
};

export function parseTaskStarted(
  rec: Record<string, unknown>,
): ClaudeAgentTaskStarted | null {
  if (
    stringField(rec, "type") !== "system" ||
    stringField(rec, "subtype") !== "task_started"
  ) {
    return null;
  }
  const taskId = stringField(rec, "task_id");
  if (!taskId) return null;
  return {
    taskId,
    toolUseId: stringField(rec, "tool_use_id"),
    description: stringField(rec, "description") ?? "Subagent",
    taskType: stringField(rec, "task_type") ?? "",
    backgrounded: rec.is_backgrounded === true,
    ambient: rec.ambient === true,
  };
}

export type ClaudeAgentTaskProgress = {
  taskId: string;
  toolUseId?: string;
  description: string;
  subagentType?: string;
  lastToolName?: string;
  summary?: string;
};

export function parseTaskProgress(
  rec: Record<string, unknown>,
): ClaudeAgentTaskProgress | null {
  if (
    stringField(rec, "type") !== "system" ||
    stringField(rec, "subtype") !== "task_progress"
  ) {
    return null;
  }
  const taskId = stringField(rec, "task_id");
  if (!taskId) return null;
  return {
    taskId,
    toolUseId: stringField(rec, "tool_use_id"),
    description: stringField(rec, "description") ?? "Subagent",
    subagentType: stringField(rec, "subagent_type"),
    lastToolName: stringField(rec, "last_tool_name"),
    summary: stringField(rec, "summary"),
  };
}

export type ClaudeAgentTaskUpdated = {
  taskId: string;
  status?: string;
  description?: string;
  error?: string;
  backgrounded?: boolean;
};

export function parseTaskUpdated(
  rec: Record<string, unknown>,
): ClaudeAgentTaskUpdated | null {
  if (
    stringField(rec, "type") !== "system" ||
    stringField(rec, "subtype") !== "task_updated"
  ) {
    return null;
  }
  const taskId = stringField(rec, "task_id");
  const patch = asRecord(rec.patch) ?? {};
  if (!taskId) return null;
  const backgrounded =
    patch.is_backgrounded === true
      ? true
      : patch.is_backgrounded === false
        ? false
        : undefined;
  return {
    taskId,
    status: stringField(patch, "status"),
    description: stringField(patch, "description"),
    error: stringField(patch, "error"),
    ...(backgrounded !== undefined ? { backgrounded } : {}),
  };
}

export type ClaudeAgentTaskNotification = {
  taskId: string;
  toolUseId?: string;
  status: string;
  summary: string;
  ambient: boolean;
};

export function parseTaskNotification(
  rec: Record<string, unknown>,
): ClaudeAgentTaskNotification | null {
  if (
    stringField(rec, "type") !== "system" ||
    stringField(rec, "subtype") !== "task_notification"
  ) {
    return null;
  }
  const taskId = stringField(rec, "task_id");
  if (!taskId) return null;
  return {
    taskId,
    toolUseId: stringField(rec, "tool_use_id"),
    status: stringField(rec, "status") ?? "completed",
    summary: stringField(rec, "summary") ?? "",
    ambient: rec.ambient === true,
  };
}

export type ClaudeBackgroundAgentTask = {
  taskId: string;
  taskType: string;
  description: string;
};

export function parseBackgroundAgentTasks(
  rec: Record<string, unknown>,
): ClaudeBackgroundAgentTask[] | null {
  if (
    stringField(rec, "type") !== "system" ||
    stringField(rec, "subtype") !== "background_tasks_changed"
  ) {
    return null;
  }
  const tasks = Array.isArray(rec.tasks) ? rec.tasks : [];
  return tasks.flatMap((item) => {
    const row = asRecord(item);
    if (!row || row.ambient === true) return [];
    const taskId = stringField(row, "task_id");
    const taskType = stringField(row, "task_type") ?? "";
    if (!taskId || !isAgentTaskType(taskType)) return [];
    return [
      {
        taskId,
        taskType,
        description: stringField(row, "description") ?? "Subagent",
      },
    ];
  });
}

export type ClaudeToolProgress = {
  toolUseId: string;
  parentToolUseId?: string;
  toolName?: string;
  subagentType?: string;
};

export function parseToolProgress(
  rec: Record<string, unknown>,
): ClaudeToolProgress | null {
  if (stringField(rec, "type") !== "tool_progress") return null;
  const toolUseId = stringField(rec, "tool_use_id");
  if (!toolUseId) return null;
  const parent = stringField(rec, "parent_tool_use_id");
  return {
    toolUseId,
    ...(parent ? { parentToolUseId: parent } : {}),
    toolName: stringField(rec, "tool_name"),
    subagentType: stringField(rec, "subagent_type"),
  };
}

export function isTerminalAgentTaskStatus(status: string | undefined): boolean {
  const key = (status ?? "").toLowerCase();
  return (
    key === "completed" ||
    key === "failed" ||
    key === "killed" ||
    key === "stopped"
  );
}

export function assistantTextBlocks(rec: Record<string, unknown>): string[] {
  const message = asRecord(rec.message);
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const row = asRecord(block);
    if (stringField(row, "type") !== "text") return [];
    const text = typeof row?.text === "string" ? row.text : "";
    return text ? [text] : [];
  });
}

export function assistantToolUses(rec: Record<string, unknown>): Array<{
  id: string;
  name: string;
  input: Record<string, unknown>;
}> {
  const message = asRecord(rec.message);
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const row = asRecord(block);
    if (!row || stringField(row, "type") !== "tool_use") return [];
    const id = stringField(row, "id");
    const name = stringField(row, "name");
    if (!id || !name) return [];
    return [{ id, name, input: asRecord(row.input) ?? {} }];
  });
}

export function toolResultsFromUserMessage(
  rec: Record<string, unknown>,
): Array<{
  toolUseId: string;
  isError: boolean;
  text: string;
}> {
  const message = asRecord(rec.message);
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const row = asRecord(block);
    if (!row || stringField(row, "type") !== "tool_result") return [];
    const toolUseId = stringField(row, "tool_use_id");
    if (!toolUseId) return [];
    const text = toolResultText(row.content);
    return [
      {
        toolUseId,
        isError: row.is_error === true,
        text,
      },
    ];
  });
}

function toolResultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((block) => {
      if (typeof block === "string") return [block];
      const row = asRecord(block);
      if (
        stringField(row, "type") === "text" &&
        typeof row?.text === "string"
      ) {
        return [row.text];
      }
      return [];
    })
    .join("");
}

export function extractExitPlanModePlan(value: unknown): string | undefined {
  const rec = asRecord(value);
  const plan = stringField(rec, "plan");
  return plan;
}

export function extractAskUserQuestionTitle(
  input: Record<string, unknown>,
): string {
  return questionPromptTitle(questionsFromUnknown(input)) || "Claude question";
}

export function askUserQuestionAllowInput(
  input: Record<string, unknown>,
  reply?: UserQuestionReply,
): Record<string, unknown> {
  const questions = questionsFromUnknown(input);
  const answers: Record<string, string> = {};
  if (reply?.kind === "answered") {
    for (const question of questions) {
      const labels = selectedAnswerLabels(question, reply);
      if (labels.length === 0) continue;
      answers[question.prompt] = question.multiSelect
        ? labels.join(", ")
        : (labels[0] ?? "");
    }
  }
  return { questions: input.questions, answers };
}

export function taskListFromTodos(
  input: Record<string, unknown>,
): TaskListItem[] | null {
  return taskListFromToolInput("TodoWrite", input);
}

export function isTodoTool(toolName: string): boolean {
  return isTaskListToolName(toolName);
}

export function toolKindFromName(toolName: string): string {
  const normalized = toolName.toLowerCase();
  if (isTodoTool(toolName)) return "tasks";
  if (
    normalized.includes("bash") ||
    normalized.includes("command") ||
    normalized.includes("shell") ||
    normalized.includes("terminal")
  ) {
    return "execute";
  }
  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("patch") ||
    normalized.includes("replace") ||
    normalized.includes("multiedit")
  ) {
    return "edit";
  }
  if (normalized === "read" || normalized.includes("read")) return "read";
  if (
    normalized.includes("grep") ||
    normalized.includes("glob") ||
    normalized.includes("search") ||
    normalized.includes("websearch")
  ) {
    return "search";
  }
  if (normalized === "skill" || normalized === "skills") return "skill";
  if (isAgentToolName(toolName)) return "agent";
  return toolName;
}

export function toolTitle(
  name: string,
  input: Record<string, unknown>,
): string {
  return titleFromToolInput(name, toolKindFromName(name), input);
}

export function previewFromTool(
  name: string,
  input: Record<string, unknown>,
  output?: string,
): ToolPreview | undefined {
  const kind = toolKindFromName(name);
  return extractToolPreview(
    {
      title: name,
      name,
      kind,
      input,
      rawInput: input,
      content: output,
    },
    {
      title: name,
      name,
      kind,
      rawInput: input,
    },
  );
}

export function summarizeToolRequest(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const command = stringField(input, "command") ?? stringField(input, "cmd");
  if (command) return `${toolName}: ${command.slice(0, 400)}`;
  const description = stringField(input, "description");
  if (description) return description;
  try {
    const serialized = JSON.stringify(input);
    if (serialized.length <= 400) return `${toolName}: ${serialized}`;
    return `${toolName}: ${serialized.slice(0, 397)}...`;
  } catch {
    return toolName;
  }
}

/**
 * Tokens occupying the window for one request.
 *
 * Cached reads still take up window space, so they count the same as fresh
 * input; output counts because it carries into the next request.
 */
function contextUsedFromUsage(usage: Record<string, unknown> | null): number {
  if (!usage) return 0;
  return (
    numberField(usage, "input_tokens") +
    numberField(usage, "cache_creation_input_tokens") +
    numberField(usage, "cache_read_input_tokens") +
    numberField(usage, "output_tokens")
  );
}

/**
 * Context level from an `assistant` message. Callers must skip subagent
 * messages — subagents run their own window and would make the reading jump.
 */
export function contextUsedFromAssistant(
  rec: Record<string, unknown>,
): number | undefined {
  const usage = asRecord(asRecord(rec.message)?.usage);
  if (!usage) return undefined;
  const used = contextUsedFromUsage(usage);
  return used > 0 ? used : undefined;
}

/**
 * Context level and window from a turn `result`.
 *
 * `usage` at the top level sums every iteration of the turn, so the last entry
 * of `usage.iterations` is what actually sits in the window. `modelUsage`
 * carries the window itself, which is why we let the CLI tell us rather than
 * keeping a model table in sync.
 */
export function contextFromResult(
  rec: Record<string, unknown>,
): { used?: number; window?: number } | undefined {
  const usage = asRecord(rec.usage);
  const iterations = Array.isArray(usage?.iterations) ? usage.iterations : [];
  const last = asRecord(iterations[iterations.length - 1]);
  const used = contextUsedFromUsage(last ?? usage);

  let window: number | undefined;
  const modelUsage = asRecord(rec.modelUsage);
  for (const entry of Object.values(modelUsage ?? {})) {
    const contextWindow = numberField(asRecord(entry), "contextWindow");
    if (contextWindow > 0) {
      window = Math.max(window ?? 0, contextWindow);
    }
  }

  if (!used && !window) return undefined;
  return { used: used > 0 ? used : undefined, window };
}