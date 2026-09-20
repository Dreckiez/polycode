import type {
  Attachment,
  RuntimeMode,
  TurnIntent,
} from "../session";
import {
  attachmentPath,
  attachmentPathText,
  isVisionImage,
  normalizeImageMime,
} from "../attachments";

/** Codex approval / sandbox settings for thread/start and turn/start. */
export type CodexThreadConfig = {
  approvalPolicy: "untrusted" | "on-request" | "never";
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  approvalsReviewer: "user" | "auto_review";
  sandboxPolicy:
    | { type: "readOnly" }
    | { type: "workspaceWrite" }
    | { type: "dangerFullAccess" };
};

export function runtimeModeToCodexConfig(mode: RuntimeMode): CodexThreadConfig {
  switch (mode) {
    case "supervised":
      return {
        approvalPolicy: "untrusted",
        sandbox: "read-only",
        approvalsReviewer: "user",
        sandboxPolicy: { type: "readOnly" },
      };
    case "auto-accept-edits":
      return {
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        approvalsReviewer: "user",
        sandboxPolicy: { type: "workspaceWrite" },
      };
    case "auto":
      return {
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        approvalsReviewer: "auto_review",
        sandboxPolicy: { type: "workspaceWrite" },
      };
    case "full-access":
      return {
        // Explicit escalations still need an approval round-trip. "never"
        // rejects them before the client's full-access handler can allow them.
        approvalPolicy: "on-request",
        sandbox: "danger-full-access",
        approvalsReviewer: "user",
        sandboxPolicy: { type: "dangerFullAccess" },
      };
  }
}

export function buildThreadStartParams(input: {
  cwd: string;
  runtimeMode: RuntimeMode;
  model?: string;
  serviceTier?: string;
}): Record<string, unknown> {
  const config = runtimeModeToCodexConfig(input.runtimeMode);
  return {
    cwd: input.cwd,
    approvalPolicy: config.approvalPolicy,
    sandbox: config.sandbox,
    approvalsReviewer: config.approvalsReviewer,
    ...(input.model ? { model: input.model } : {}),
    ...(input.serviceTier && input.serviceTier !== "default"
      ? { serviceTier: input.serviceTier }
      : {}),
  };
}

export function buildTurnSteerParams(input: {
  threadId: string;
  expectedTurnId: string;
  prompt?: string;
  attachments?: Attachment[];
}): Record<string, unknown> {
  return {
    threadId: input.threadId,
    expectedTurnId: input.expectedTurnId,
    input: codexInput(input.prompt, input.attachments),
  };
}

export function buildTurnStartParams(input: {
  threadId: string;
  runtimeMode: RuntimeMode;
  prompt?: string;
  attachments?: Attachment[];
  model?: string;
  effort?: string;
  serviceTier?: string;
  intent?: TurnIntent;
}): Record<string, unknown> {
  const runtimeConfig = runtimeModeToCodexConfig(input.runtimeMode);
  const config: CodexThreadConfig =
    input.intent === "plan"
      ? {
          approvalPolicy: "never",
          sandbox: "read-only",
          approvalsReviewer: runtimeConfig.approvalsReviewer,
          sandboxPolicy: { type: "readOnly" },
        }
      : runtimeConfig;
  return {
    threadId: input.threadId,
    input: codexInput(input.prompt, input.attachments),
    approvalPolicy: config.approvalPolicy,
    approvalsReviewer: config.approvalsReviewer,
    sandboxPolicy: config.sandboxPolicy,
    collaborationMode: {
      mode: input.intent === "plan" ? "plan" : "default",
      settings: {
        model: input.model ?? null,
        reasoning_effort: input.effort ?? null,
        developer_instructions: null,
      },
    },
    ...(input.model ? { model: input.model } : {}),
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.serviceTier && input.serviceTier !== "default"
      ? { serviceTier: input.serviceTier }
      : {}),
  };
}

/** App-server accepts image inputs, but documents need a path in text. */
function codexInput(
  prompt: string | undefined,
  attachments: Attachment[] = [],
): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];
  if (prompt) input.push({ type: "text", text: prompt });
  for (const file of attachments) {
    if (isVisionImage(file.mimeType)) {
      input.push(
        file.data
          ? {
              type: "image",
              url: `data:${normalizeImageMime(file.mimeType)};base64,${file.data}`,
            }
          : { type: "localImage", path: attachmentPath(file) },
      );
    } else {
      input.push({ type: "text", text: attachmentPathText(file) });
    }
  }
  return input;
}

export function isRecoverableThreadResumeError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  if (!message.includes("thread")) return false;
  return [
    "not found",
    "unknown thread",
    "no such thread",
    "does not exist",
    "missing thread",
    "thread id",
  ].some((snippet) => message.includes(snippet));
}

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

export type CodexApprovalKind = "command" | "file-change" | "permissions";

export type CodexApprovalDecisionWire =
  "accept" | "acceptForSession" | "decline" | "cancel";

export function toCodexApprovalDecision(
  decision: "allow" | "deny",
  kind: CodexApprovalKind,
): CodexApprovalDecisionWire {
  if (decision === "deny") return "decline";
  // Prefer one-shot accept; session-scoped grants can be added later.
  void kind;
  return "accept";
}