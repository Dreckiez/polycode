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
import { HarnessIcon } from "../chrome/HarnessIcon";
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

  if (block.role === "system") {
    return (
      <div className="px-4 py-2 text-content/50">
        <pre className="min-w-0 whitespace-pre-wrap break-words">
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

function UserMessageBlock({
  block,
  layout,
  stickyIndex,
}: {
  block: Block;
  layout: TranscriptLayout;
  stickyIndex: number;
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
      className={
        chat ? "flex justify-end pt-1.5 pr-4 pb-4 pl-14" : "p-1.5 pb-3"
      }
    >
      <div
        className={`min-w-0 bg-content/10 px-3 py-2 font-sans text-content ${
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
    </div>
  );
}

function HandoffDivider({ block }: { block: Block }) {
  const meta = block.handoff;
  if (!meta) return null;

  const preparing = meta.status === "preparing";
  const label = preparing ? "Preparing a handoff" : HARNESS_TITLE[meta.to];

  return (
    <div className="px-4 py-5">
      <div className="flex items-center gap-3">
        <div className="h-px min-w-4 flex-1 bg-content/12" />
        <div
          role="separator"
          aria-label={
            preparing
              ? `Preparing a handoff to ${HARNESS_TITLE[meta.to]}`
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
            </>
          )}
        </div>
        <div className="h-px min-w-4 flex-1 bg-content/12" />
      </div>
    </div>
  );
}

export { TranscriptBlock };