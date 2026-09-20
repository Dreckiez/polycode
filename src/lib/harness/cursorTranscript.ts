import {
  isTaskListToolName,
  taskListFromToolInput,
} from "../taskList";
import {
  agentToolTitle,
  composeToolTitle,
  extractSearchQuery,
  extractShellCommand,
  extractSkillName,
  extractToolPreview,
  isAgentTool,
  isAgentToolName,
  isWeakToolTitle,
} from "./preview";
import type { HarnessEvent } from "./types";
import {
  asRecord,
  numberField,
  stringField,
  textFromContent,
  type PendingToolEnrichment,
} from "./cursor";

export type CursorLiveState = {
  onEvent: (event: HarnessEvent) => void;
  promptActive: boolean;
  agentTools: Map<string, string>;
  backgroundAgentTools: Set<string>;
  taskListTools: Set<string>;
  toolStatuses: Map<string, string>;
  pendingToolEnrichments: Map<string, PendingToolEnrichment>;
  enrichedTools: Set<string>;
  queueEnrichment: (callId: string, kind?: string) => void;
};

export function mapCursorTodoUpdate(
  params: unknown,
  state: CursorLiveState,
): void {
  const rec = asRecord(params);
  const callId = rec
    ? (stringField(rec, "toolCallId") ?? stringField(rec, "tool_call_id"))
    : undefined;
  if (callId) {
    state.taskListTools.add(callId);
    state.onEvent({ type: "tool.updated", callId, kind: "tasks" });
  }
  const items = taskListFromToolInput("updateTodos", params);
  if (!items) return;
  state.onEvent({
    type: "tasks.updated",
    items,
    ...(rec?.merge === true ? { merge: true } : {}),
  });
}

export function mapCursorTask(params: unknown, state: CursorLiveState): void {
  const task = asRecord(params);
  if (!task || !state.promptActive) return;
  const callId =
    stringField(task, "toolCallId") ?? stringField(task, "tool_call_id");
  if (!callId || !state.agentTools.has(callId)) return;

  const agentId = stringField(task, "agentId") ?? stringField(task, "agent_id");
  const durationMs =
    numberField(task, "durationMs") ?? numberField(task, "duration_ms");
  const background =
    state.backgroundAgentTools.has(callId) ||
    (!!agentId && durationMs === undefined);
  if (!background) return;

  const title =
    stringField(task, "description") ??
    state.agentTools.get(callId) ??
    "Subagent";
  state.agentTools.set(callId, title);
  state.backgroundAgentTools.add(callId);
  state.toolStatuses.set(callId, "in_progress");
  state.onEvent({
    type: "tool.updated",
    callId,
    title,
    kind: "agent",
    status: "in_progress",
    detail: cursorSubagentDetail(task),
  });
}

export function mapCursorSessionUpdate(
  params: unknown,
  state: CursorLiveState,
): void {
  const rec = asRecord(params);
  const update = asRecord(rec?.update) ?? rec;
  if (!update) return;
  const kind = String(
    update.sessionUpdate ?? update.session_update ?? update.type ?? "",
  );

  if (kind === "agent_message_chunk" || kind === "agent_message") {
    // Whole-message arrays contain distinct content blocks; chunks are exact deltas.
    const text = textFromContent(
      update.content ?? update.text,
      kind === "agent_message" ? "\n" : "",
    );
    if (text) state.onEvent({ type: "message.delta", text });
    return;
  }
  if (kind === "agent_thought_chunk" || kind === "agent_thought") {
    const text = textFromContent(
      update.content ?? update.text,
      kind === "agent_thought" ? "\n" : "",
    );
    if (text) state.onEvent({ type: "reasoning.delta", text });
    return;
  }
  if (
    kind === "tool_call" ||
    kind === "tool_call_update" ||
    kind === "tool_call_content_chunk"
  ) {
    const tool =
      asRecord(update.toolCall) ?? asRecord(update.tool_call) ?? update;
    const callId = String(
      tool.toolCallId ??
        tool.tool_call_id ??
        update.toolCallId ??
        update.tool_call_id ??
        "",
    );
    if (!callId) return;
    const reportedKind =
      coerceMaybeString(update, "kind") ?? coerceMaybeString(tool, "kind");
    const status =
      coerceMaybeString(update, "status") ?? coerceMaybeString(tool, "status");
    const rawTitle = toolLabel(update, tool);
    const rawInput =
      update.rawInput ??
      tool.rawInput ??
      update.raw_input ??
      tool.raw_input ??
      update.input ??
      tool.input;
    const agent =
      state.agentTools.has(callId) ||
      isAgentTool(reportedKind, rawTitle) ||
      isCursorAgentInput(rawInput);
    const taskList =
      state.taskListTools.has(callId) ||
      isCursorTaskListInput(rawInput, rawTitle);
    if (taskList) state.taskListTools.add(callId);
    const toolKind = agent ? "agent" : taskList ? "tasks" : reportedKind;
    const detail = toolDetail(update, tool);
    const preview = extractToolPreview(update, tool);
    const title = agent
      ? cursorAgentTitle(rawInput, rawTitle, state.agentTools.get(callId))
      : composeToolTitle({
          kind: toolKind,
          title: rawTitle,
          command: extractShellCommand(
            update.rawInput,
            tool.rawInput,
            update.raw_input,
            tool.raw_input,
            update.input,
            tool.input,
          ),
          skill: extractSkillName(
            update.rawInput,
            tool.rawInput,
            update.raw_input,
            tool.raw_input,
            update.input,
            tool.input,
          ),
          path: preview?.path,
          query: preview?.query ?? extractSearchQuery(rawInput),
          previewKind: preview?.kind,
        }) || rawTitle;
    if (agent && title) state.agentTools.set(callId, title);
    const background =
      agent &&
      status === "completed" &&
      cursorToolOutputIsBackground(update, tool);
    if (background) state.backgroundAgentTools.add(callId);
    const displayedStatus = background ? "in_progress" : status;
    if (displayedStatus) state.toolStatuses.set(callId, displayedStatus);
    state.onEvent({
      type: "tool.updated",
      callId,
      title,
      kind: toolKind,
      status: displayedStatus,
      detail,
      preview,
    });
    if (needsCursorToolEnrichment(toolKind, title, preview)) {
      state.queueEnrichment(callId, toolKind);
    } else if (state.pendingToolEnrichments.has(callId)) {
      state.pendingToolEnrichments.delete(callId);
      state.enrichedTools.add(callId);
    }
  }
}

function isCursorAgentInput(value: unknown): boolean {
  const input = asRecord(value);
  if (!input) return false;
  const name =
    stringField(input, "_toolName") ??
    stringField(input, "toolName") ??
    stringField(input, "tool_name") ??
    stringField(input, "name");
  return !!name && isAgentToolName(name);
}

function isCursorTaskListInput(
  value: unknown,
  title: string | undefined,
): boolean {
  const input = asRecord(value);
  const name = input
    ? (stringField(input, "_toolName") ??
      stringField(input, "toolName") ??
      stringField(input, "tool_name") ??
      stringField(input, "name"))
    : undefined;
  const normalized = name?.replace(/[\s_-]+/g, "").toLowerCase();
  return (
    (!!normalized && isTaskListToolName(normalized)) ||
    /^update todos\b/i.test(title ?? "")
  );
}

function cursorAgentTitle(
  rawInput: unknown,
  rawTitle: string | undefined,
  existing: string | undefined,
): string {
  const input = asRecord(rawInput);
  if (input) return agentToolTitle(input, existing ?? rawTitle ?? "Subagent");
  if (existing) return existing;
  const stripped = rawTitle
    ?.replace(/^(?:agent|task|subagent)\b[\s:·-]*/i, "")
    .trim();
  return stripped || "Subagent";
}

function cursorToolOutputIsBackground(
  update: Record<string, unknown>,
  tool: Record<string, unknown>,
): boolean {
  for (const value of [
    update.rawOutput,
    tool.rawOutput,
    update.raw_output,
    tool.raw_output,
  ]) {
    const output = asRecord(value);
    if (output?.isBackground === true || output?.is_background === true) {
      return true;
    }
  }
  return false;
}

function cursorSubagentDetail(
  task: Record<string, unknown>,
): string | undefined {
  const type = task.subagentType ?? task.subagent_type;
  if (typeof type === "string" && type && type !== "unspecified") {
    return `${type.replace(/[_-]+/g, " ")} subagent`;
  }
  const custom = asRecord(type)?.custom;
  if (typeof custom === "string" && custom.trim()) {
    return `${custom.trim().replace(/[_-]+/g, " ")} subagent`;
  }
  return undefined;
}

export function needsCursorToolEnrichment(
  kind: string | undefined,
  title: string | undefined,
  preview: ReturnType<typeof extractToolPreview>,
): boolean {
  const key = (kind ?? "").toLowerCase();
  if (
    key === "execute" ||
    key === "think" ||
    key === "fetch" ||
    key === "skill"
  )
    return false;
  if (preview?.path || preview?.query) return false;
  if (key === "read" || key === "search" || key === "edit" || key === "write") {
    return true;
  }
  return !title || isWeakToolTitle(title);
}

export function toolLabel(
  update: Record<string, unknown>,
  tool: Record<string, unknown>,
): string | undefined {
  const kind = stringField(update, "kind") ?? stringField(tool, "kind");
  const named =
    humanField(update, "title") ??
    humanField(tool, "title") ??
    humanField(update, "name") ??
    humanField(tool, "name") ??
    humanField(update, "toolName") ??
    humanField(tool, "toolName") ??
    humanField(update, "tool_name") ??
    humanField(tool, "tool_name") ??
    metaLabel(update._meta ?? tool._meta);
  const fromInput = inputLabel(
    update.rawInput ??
      tool.rawInput ??
      update.raw_input ??
      tool.raw_input ??
      update.input ??
      tool.input,
  );
  const fromLocation =
    locationLabel(update.locations ?? tool.locations) ??
    contentPath(update.content ?? tool.content);

  if (named && !isWeakName(named)) return named;
  if (fromInput) return fromInput;
  if (fromLocation) return fromLocation;
  if (named) return named;
  return kindTitle(kind);
}

function toolDetail(
  update: Record<string, unknown>,
  tool: Record<string, unknown>,
): string | undefined {
  const content =
    textFromContent(update.content, "\n") ||
    textFromContent(tool.content, "\n");
  if (content.trim()) return capToolDetail(content);
  const output = update.rawOutput ?? tool.rawOutput;
  if (typeof output === "string" && output.trim()) return capToolDetail(output);
  const outputText = textFromContent(output);
  if (outputText.trim()) return capToolDetail(outputText);
  return inputLabel(
    update.rawInput ?? tool.rawInput ?? update.input ?? tool.input,
  );
}

const MAX_TOOL_DETAIL_CHARS = 8_000;

function capToolDetail(value: string): string {
  const text = value.trim();
  if (text.length <= MAX_TOOL_DETAIL_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_DETAIL_CHARS)}\n…`;
}

function inputLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    if (looksLikeCallId(text)) return undefined;
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return inputLabel(JSON.parse(text));
      } catch {
        return text;
      }
    }
    return text;
  }
  const raw = asRecord(value);
  if (!raw) return undefined;

  const command = stringField(raw, "command");
  if (command) return command;

  const from = stringField(raw, "old_path") ?? stringField(raw, "from");
  const to =
    stringField(raw, "new_path") ??
    stringField(raw, "to") ??
    stringField(raw, "destination");
  if (from && to) return `${shortPath(from)} → ${shortPath(to)}`;

  const path =
    stringField(raw, "path") ??
    stringField(raw, "filePath") ??
    stringField(raw, "file_path") ??
    stringField(raw, "targetFile") ??
    stringField(raw, "target_file") ??
    stringField(raw, "relative_workspace_path") ??
    stringField(raw, "uri") ??
    stringField(raw, "url");
  if (path) return shortPath(path);

  const query =
    stringField(raw, "query") ??
    stringField(raw, "pattern") ??
    stringField(raw, "glob") ??
    stringField(raw, "glob_pattern") ??
    stringField(raw, "globPattern") ??
    stringField(raw, "search_term") ??
    stringField(raw, "searchTerm");
  const name = humanField(raw, "name") ?? humanField(raw, "toolName");
  if (name && query) return `${name} ${query}`;
  if (query) return query;

  const nested = inputLabel(
    raw.arguments ?? raw.args ?? raw.input ?? raw.params,
  );
  if (name && nested) return `${name} ${nested}`;
  if (nested) return nested;
  if (name) return name;
  return firstStringArg(raw);
}

function firstStringArg(raw: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(raw)) {
    if (
      key === "name" ||
      key === "toolName" ||
      key === "kind" ||
      key === "type"
    ) {
      continue;
    }
    if (typeof value === "string" && value.trim() && !looksLikeCallId(value)) {
      const text = value.trim();
      if (text.length <= 200) return text;
    }
  }
  return undefined;
}

function contentPath(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    const rec = asRecord(content);
    const path = rec && stringField(rec, "path");
    return path ? shortPath(path) : undefined;
  }
  for (const item of content) {
    const rec = asRecord(item);
    const path =
      rec && (stringField(rec, "path") ?? contentPath(rec.content ?? rec.diff));
    if (path) return path;
  }
  return undefined;
}

function locationLabel(locations: unknown): string | undefined {
  if (!Array.isArray(locations)) return undefined;
  for (const item of locations) {
    const rec = asRecord(item);
    const path =
      rec &&
      (stringField(rec, "path") ??
        stringField(rec, "uri") ??
        stringField(rec, "file"));
    if (path) return shortPath(path);
  }
  return undefined;
}

function metaLabel(meta: unknown): string | undefined {
  const rec = asRecord(meta);
  if (!rec) return undefined;
  return (
    humanField(rec, "toolName") ??
    humanField(rec, "name") ??
    humanField(rec, "displayName")
  );
}

function humanField(
  rec: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = stringField(rec, key);
  if (!value || looksLikeCallId(value)) return undefined;
  return value;
}

function kindTitle(kind: string | undefined): string | undefined {
  if (!kind?.trim()) return undefined;
  const key = kind.trim().toLowerCase();
  switch (key) {
    case "read":
      return "Read";
    case "edit":
      return "Edit";
    case "delete":
      return "Delete";
    case "move":
      return "Move";
    case "search":
      return "Find";
    case "execute":
    case "shell":
    case "bash":
      return "Shell";
    case "skill":
      return "Skill";
    case "think":
      return "Think";
    case "fetch":
      return "Fetch";
    case "other":
      return undefined;
    default:
      return key.replace(/^_/, "").replace(/[_-]+/g, " ");
  }
}

function isWeakName(value: string): boolean {
  return isWeakToolTitle(value);
}

function looksLikeCallId(value: string): boolean {
  const text = value.trim();
  return (
    /^(call[-_]?|tool[-_])[a-z0-9_-]+$/i.test(text) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
  );
}

function shortPath(path: string): string {
  if (/\s/.test(path)) return path;
  const parts = path.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 2) return parts.join("/") || path;
  return parts.slice(-2).join("/");
}

function coerceMaybeString(
  rec: Record<string, unknown>,
  key: string,
): string | undefined {
  return stringField(rec, key);
}