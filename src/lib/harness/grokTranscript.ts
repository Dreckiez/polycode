import { normalizeTaskListStatus } from "../taskList";
import {
  composeToolTitle,
  extractShellCommand,
  extractSkillName,
  extractToolPreview,
} from "./preview";
import type { HarnessEvent } from "./types";
import {
  VARIANT_KIND,
  asRecord,
  cap,
  grokToolFields,
  mergePreview,
  numberField,
  stringField,
  sumNumbers,
  textFromContent,
  toolLabel,
} from "./grokProtocol";

export function planFromExitPlan(params: unknown): string {
  const rec = asRecord(params);
  const nested = asRecord(rec?.input);
  const text =
    rec?.planContent ??
    rec?.plan ??
    rec?.content ??
    nested?.plan ??
    nested?.planContent;
  return typeof text === "string" ? text.trim() : "";
}

export function eventsFromAcpUpdate(params: unknown): HarnessEvent[] {
  const rec = asRecord(params);
  const update = asRecord(rec?.update) ?? rec;
  if (!update) return [];
  const kind = String(
    update.sessionUpdate ?? update.session_update ?? update.type ?? "",
  );

  if (kind === "agent_message_chunk" || kind === "agent_message") {
    const text = textFromContent(
      update.content ?? update.text,
      kind === "agent_message" ? "\n" : "",
    );
    return text ? [{ type: "message.delta", text }] : [];
  }

  if (kind === "agent_thought_chunk" || kind === "agent_thought") {
    const text = textFromContent(
      update.content ?? update.text,
      kind === "agent_thought" ? "\n" : "",
    );
    return text ? [{ type: "reasoning.delta", text }] : [];
  }

  if (kind === "tool_call_delta_chunk") {
    const callId =
      stringField(update, "toolCallId") ??
      stringField(update, "tool_call_id") ??
      "";
    if (!callId) return [];
    const name = stringField(update, "name") ?? stringField(update, "title");
    return [
      {
        type: "tool.updated",
        callId,
        title: name ? humanizeToolName(name) : undefined,
        kind: kindFromName(name),
        status: "pending",
      },
    ];
  }

  if (
    kind === "tool_call" ||
    kind === "tool_call_update" ||
    kind === "tool_call_content_chunk"
  ) {
    const tool =
      asRecord(update.toolCall) ?? asRecord(update.tool_call) ?? update;
    const grok = grokToolFields(update, tool);
    const callId =
      grok.callId ??
      String(
        tool.toolCallId ??
          tool.tool_call_id ??
          update.toolCallId ??
          update.tool_call_id ??
          "",
      );
    if (!callId) return [];
    const toolKind =
      grok.kind ?? stringField(update, "kind") ?? stringField(tool, "kind");
    const status = stringField(update, "status") ?? stringField(tool, "status");
    const preview = mergePreview(
      extractToolPreview(update, tool),
      grok.path,
      grok.query,
      toolKind,
    );
    const title =
      composeToolTitle({
        kind: toolKind,
        title: grok.title ?? toolLabel(update) ?? toolLabel(tool),
        command:
          grok.command ??
          extractShellCommand(
            update.rawInput,
            tool.rawInput,
            update.raw_input,
            tool.raw_input,
            update.input,
            tool.input,
            grok.input,
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
        query: preview?.query ?? grok.query,
        previewKind: preview?.kind,
      }) ||
      grok.title ||
      toolLabel(update) ||
      toolLabel(tool);
    return [
      {
        type: "tool.updated",
        callId,
        title,
        kind: toolKind,
        status,
        detail: cap(toolDetail(update, tool) ?? "") || undefined,
        preview,
      },
    ];
  }

  if (kind === "plan" || kind === "current_plan") {
    const event = planEvent(update);
    return event ? [event] : [];
  }

  if (kind === "session_summary_generated") {
    return [];
  }

  const usage = usageFromUpdate(update);
  return usage ? [usage] : [];
}

function usageFromUpdate(update: Record<string, unknown>): HarnessEvent | null {
  const usage =
    asRecord(update.usage) ??
    asRecord(update.tokenUsage) ??
    asRecord(update.token_usage) ??
    (hasUsageFields(update) ? update : null);
  if (!usage) return null;
  const used =
    numberField(usage, "totalTokens") ??
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
    numberField(usage, "contextWindow") ??
    numberField(usage, "context_window") ??
    numberField(usage, "maxTokens");
  if (used == null && window == null) return null;
  return {
    type: "context",
    used: used ?? undefined,
    window: window ?? undefined,
  };
}

function hasUsageFields(rec: Record<string, unknown>): boolean {
  return (
    numberField(rec, "used") != null ||
    numberField(rec, "totalTokens") != null ||
    numberField(rec, "inputTokens") != null
  );
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
    textFromContent(update.content, "\n") ||
    textFromContent(tool.content, "\n");
  if (content.trim()) return cap(content);
  const output = update.rawOutput ?? tool.rawOutput;
  if (typeof output === "string" && output.trim()) return cap(output);
  const outputText = textFromContent(output);
  if (outputText.trim()) return cap(outputText);
  const concise = stringField(asRecord(output) ?? {}, "content_concise");
  return concise ? cap(concise) : undefined;
}

function kindFromName(name?: string): string | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return VARIANT_KIND[key];
}

function humanizeToolName(name: string): string {
  const cleaned = name.replace(/[_-]+/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase()) : name;
}