import { memo, useLayoutEffect, useRef, useState } from "react";
import {
  HARNESS_TITLE,
  type Block,
  type HarnessId,
  type PlanBuildTarget,
} from "../lib/session";
import type { ApprovalDecision } from "../lib/harness";
import type { TranscriptLayout } from "../lib/appearance";
import { AttachmentChip } from "../chrome/AttachmentChip";
import { AlertCircle, Pencil, RotateCcw, Sparkles } from "../chrome/icons";
import { HarnessIcon } from "../chrome/HarnessIcon";
import { PROVIDER_SESSION_REMOVED_MESSAGE } from "../lib/handoff";
import { NoteMiniCard } from "../chrome/NoteMiniCard";
import { PlanPreview } from "../chrome/PlanPreview";
import { SecondOpinionCard } from "../chrome/SecondOpinionCard";
import { TaskListPreview } from "../chrome/TaskListPreview";
import { TerminalSpinner } from "../chrome/TerminalSpinner";
import { ToolCall } from "./TranscriptToolCall";
import { AgentMarkdown } from "./AgentMarkdown";
import { Shimmer } from "./Shimmer";
import { legacyTaskListFromText } from "../lib/taskList";
import { liveTextByBlock, useChatStore } from "../lib/chatStore";

function EditLastTurnButton({
  onEdit,
  editing = false,
}: {
  onEdit: () => void;
  editing?: boolean;
}) {
  const label = editing ? "Cancel edit" : "Edit and resend";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={editing}
      onClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
      className={`rounded-md p-1 transition-[background-color,color] duration-150 focus-visible:ring-1 focus-visible:ring-accent ${
        editing
          ? "edit-last-turn-button"
          : "text-content/40 hover:bg-content/8 hover:text-content/70"
      }`}
    >
      <Pencil className="size-3.5" strokeWidth={1.75} />
    </button>
  );
}

const TranscriptBlock = memo(function TranscriptBlock({
  block,
  layout,
  stickyIndex,
  underLine = false,
  cwd,
  onApproval,
  onOpenFile,
  onOpenDiff,
  onOpenPlan,
  onBuildPlan,
  planBusy,
  planHarness,
  planModel,
  sessionId,
  onRetry,
  onContinueWithContext,
  onEditLastTurn,
  editing,
}: {
  block: Block;
  layout: TranscriptLayout;
  stickyIndex: number;
  /** True when something already sits directly above this in the turn. */
  underLine?: boolean;
  cwd?: string;
  onApproval?: (requestId: number, decision: ApprovalDecision) => void;
  onOpenFile?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
  onOpenPlan?: (blockId: string) => void;
  onBuildPlan?: (blockId: string, target?: PlanBuildTarget) => void;
  planBusy?: boolean;
  planHarness?: HarnessId;
  planModel?: string;
  sessionId: string;
  onRetry?: () => void;
  onContinueWithContext?: () => void;
  onEditLastTurn?: () => void;
  editing?: boolean;
}) {
  // For streaming assistant/reasoning blocks, read text from the narrow chatStore selector
  // so only this block re-renders on token deltas.
  const isLiveRole = block.role === "assistant" || block.role === "reasoning";
  const liveText = (isLiveRole && block.streaming && sessionId)
    ? useChatStore((state) => liveTextByBlock(state, { sessionId, blockId: block.id }))
    : undefined;

  const displayText = liveText ?? block.text;
  const isStreaming = isLiveRole && block.streaming;

  if (block.role === "user") {
    return (
      <UserMessageBlock
        block={block}
        layout={layout}
        stickyIndex={stickyIndex}
        onEdit={onEditLastTurn}
        editing={editing}
      />
    );
  }

  if (block.role === "tool") {
    return (
      <ToolCall
        block={block}
        cwd={cwd}
        onApproval={onApproval}
        onOpenFile={onOpenFile}
        onOpenDiff={onOpenDiff}
      />
    );
  }

  if (block.role === "reasoning") {
    return null;
  }

  if (block.role === "tasks") {
    if (!block.taskList?.items.length) return null;
    return (
      <div className="px-4 py-1">
        <TaskListPreview
          items={block.taskList.items}
          explanation={block.taskList.explanation}
        />
      </div>
    );
  }

  if (block.role === "plan") {
    const legacyTasks = legacyTaskListFromText(block.text);
    if (legacyTasks) {
      return (
        <div className="px-4 py-1">
          <TaskListPreview items={legacyTasks} />
        </div>
      );
    }
    return (
      <div className="px-4 py-1">
        <PlanPreview
          text={block.text}
          streaming={block.streaming}
          busy={planBusy}
          plan={block.plan}
          harness={planHarness}
          model={planModel}
          onOpen={onOpenPlan ? () => onOpenPlan(block.id) : undefined}
          onBuild={
            onBuildPlan ? (target) => onBuildPlan(block.id, target) : undefined
          }
        />
      </div>
    );
  }

  if (block.role === "approval") {
    return (
      <ToolCall
        block={block}
        cwd={cwd}
        onApproval={onApproval}
        onOpenFile={onOpenFile}
        onOpenDiff={onOpenDiff}
      />
    );
  }

  if (block.role === "handoff") {
    return <HandoffDivider block={block} />;
  }

  if (block.role === "system" || block.notice === "error") {
    if (
      block.notice !== "interrupt" &&
      (block.notice === "error" || !isSystemStatus(block.text))
    ) {
      return (
        <GenerationErrorBanner
          text={block.text}
          onRetry={onRetry}
          onContinueWithContext={onContinueWithContext}
        />
      );
    }
    return (
      <div className="px-4 py-2 text-content/50">
        <pre className="min-w-0 whitespace-pre-wrap break-words font-sans text-xs">
          {block.text}
        </pre>
      </div>
    );
  }

  if (!displayText && isStreaming) return null;

  return (
    <div
      data-selectable-agent-response={isStreaming ? undefined : block.id}
      className={`min-w-0 px-4 pb-1 text-content ${underLine ? "pt-1" : "pt-3"}`}
    >
      <AgentMarkdown
        text={displayText}
        streaming={isStreaming}
        cwd={cwd}
        onOpenFile={onOpenFile}
      />
    </div>
  );
});

function isSystemStatus(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    lower.startsWith("retrying") ||
    lower.startsWith("compact") ||
    lower.startsWith("waiting")
  );
}

function GenerationErrorBanner({
  text,
  onRetry,
  onContinueWithContext,
}: {
  text: string;
  onRetry?: () => void;
  onContinueWithContext?: () => void;
}) {
  const isSessionLost = text === PROVIDER_SESSION_REMOVED_MESSAGE;

  return (
    <div className="px-4 py-2">
      <div
        role="alert"
        className="rounded-2xl border border-rose-500/20 bg-rose-950/30 px-4 py-3 text-rose-200"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <AlertCircle
              className="size-4.5 shrink-0 text-rose-400"
              strokeWidth={2}
            />
            <span className="font-medium text-sm text-rose-200">
              {isSessionLost
                ? "Provider session removed in CLI"
                : "Generation stopped"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isSessionLost && onContinueWithContext ? (
              <button
                type="button"
                onClick={onContinueWithContext}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-xs font-medium text-rose-100 transition-colors hover:bg-rose-500/30 hover:text-white"
              >
                <Sparkles className="size-3.5 text-rose-300" strokeWidth={2} />
                <span>Continue with Context</span>
              </button>
            ) : null}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-rose-400 transition-colors hover:text-rose-200"
              >
                <RotateCcw className="size-3.5" strokeWidth={2} />
                <span>Retry</span>
              </button>
            ) : null}
          </div>
        </div>
        {text ? (
          <p className="mt-1 pl-7 text-xs leading-relaxed text-rose-400/80 whitespace-pre-wrap break-words">
            {text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function UserMessageBlock({
  block,
  layout,
  stickyIndex,
  onEdit,
  editing = false,
}: {
  block: Block;
  layout: TranscriptLayout;
  stickyIndex: number;
  onEdit?: () => void;
  editing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [singleLine, setSingleLine] = useState(false);
  const textRef = useRef<HTMLPreElement>(null);
  const card = block.secondOpinion;
  const note = block.noteCard;
  const text = card && card.kind !== "handoff" ? "" : block.text;
  const chat = layout === "chat";
  const textOnly =
    Boolean(text) && !block.attachments?.length && !card && !note;

  // Only the chat layout rounds a single line; the document layout always uses
  // the square corners, so it never needs the measurement at all.
  const roundsSingleLine = chat && textOnly;

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || !text) {
      setOverflows(false);
      setSingleLine(false);
      return;
    }

    // Every user message carries one of these observers, so the callback runs
    // once per message whenever the transcript reflows. `getComputedStyle`
    // forces a style recalculation on each call and the line height only moves
    // with the font or the UI scale — never with a resize — so it is resolved
    // once here rather than on every delivery.
    let lineHeight = 0;
    const measure = () => {
      if (!expanded) {
        setOverflows(el.scrollHeight > el.clientHeight + 1);
      }
      if (!roundsSingleLine) {
        setSingleLine(false);
        return;
      }
      if (!lineHeight) {
        lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
      }
      setSingleLine(
        Number.isFinite(lineHeight) && el.scrollHeight <= lineHeight + 1,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, roundsSingleLine, expanded]);

  const toggle = () => {
    if (overflows) setExpanded((value) => !value);
  };

  return (
    <div
      data-prompt-anchor={block.id}
      data-editing-last-turn={editing ? "true" : undefined}
      className={`user-message-row group/usermsg ${
        chat ? "flex flex-col items-end pt-1.5 pr-4 pb-4 pl-14" : "p-1.5 pb-3"
      }`}
    >
      <div
        className={`min-w-0 bg-content/10 px-3 py-2 font-sans text-content ${
          editing ? "edit-last-turn-bubble" : ""
        } ${
          chat
            ? `w-fit max-w-xl ${singleLine ? "rounded-full" : "rounded-xl"}`
            : "rounded-lg border border-content/10"
        }`}
        style={{ zIndex: stickyIndex }}
        onClick={overflows ? toggle : undefined}
      >
        {block.attachments?.length ? (
          <div
            className={`flex flex-wrap gap-1.5 ${text || card || note ? "mb-2" : ""}`}
          >
            {block.attachments.map((file) => (
              <AttachmentChip key={file.id} attachment={file} />
            ))}
          </div>
        ) : null}
        {note ? (
          <div className={text || card ? "mb-2" : ""}>
            <NoteMiniCard card={note} embedded />
          </div>
        ) : null}
        {card ? (
          <div className={text ? "mb-1.5" : undefined}>
            <SecondOpinionCard card={card} />
          </div>
        ) : null}
        {text ? (
          <pre
            ref={textRef}
            className={`min-w-0 whitespace-pre-wrap break-words font-sans text-sm ${expanded ? "" : "line-clamp-4"}`}
          >
            {text}
          </pre>
        ) : null}
      </div>
      {onEdit ? (
        <div className="user-message-actions flex items-center gap-1 px-3 pt-1">
          <EditLastTurnButton onEdit={onEdit} editing={editing} />
        </div>
      ) : null}
    </div>
  );
}

function HandoffDivider({ block }: { block: Block }) {
  const meta = block.handoff;
  if (!meta) return null;

  const preparing = meta.status === "preparing";
  const label = preparing
    ? "Preparing a handoff"
    : meta.from === meta.to
      ? "Continued with context"
      : HARNESS_TITLE[meta.to];

  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-3">
        <div className="h-px min-w-4 flex-1 bg-content/12" />
        <div
          role="separator"
          aria-label={
            preparing
              ? `Preparing a handoff to ${HARNESS_TITLE[meta.to]}`
              : meta.from === meta.to
                ? "Continued with context"
                : `Continued with ${label}`
          }
          className="flex max-w-[min(100%,20rem)] items-center gap-1.5 px-1.5 font-sans text-[12px] text-content/55"
        >
          {preparing ? (
            <>
              <TerminalSpinner className="inline-block w-3.5 shrink-0 select-none text-center text-[11px] leading-none text-content/45" />
              <Shimmer duration={1.4}>{label}</Shimmer>
            </>
          ) : (
            <>
              <HarnessIcon harness={meta.to} className="size-3.5 shrink-0" />
              <span>{label}</span>
            </>
          )}
        </div>
        <div className="h-px min-w-4 flex-1 bg-content/12" />
      </div>
    </div>
  );
}

export { TranscriptBlock };