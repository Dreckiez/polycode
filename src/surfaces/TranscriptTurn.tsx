import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight, X } from "../chrome/icons";
import { HarnessIcon } from "../chrome/HarnessIcon";
import { Shimmer } from "./Shimmer";
import { LiveFoldTitle, TurnDuration, formatWorkingDuration } from "./TranscriptTurnMeta";
import { ActivityPhases, ActivityPhaseIcon } from "./ActivityPhases";
import { TranscriptBlock } from "./TranscriptBlock";
import { turnUserBlock } from "./transcriptShared";
import {
  activityStillRunning,
  firstFoldableIndex,
  foldableWork,
  foldedBlocks,
  groupTurnItems,
  hasRunningSubagent,
  initialThinkingIndex,
  isProseBlock,
  lastActivityIndex,
  subagentFailureSummary,
  turnCopyText,
  workKind,
  workSummaryLine,
  type ActivityPhaseKind,
  type TurnItem,
} from "./transcriptActivity";
import type { ApprovalDecision } from "../lib/harness";
import type { TranscriptLayout } from "../lib/appearance";
import {
  type Block,
  type HarnessId,
  type PlanBuildTarget,
} from "../lib/session";

type TranscriptTurnProps = {
  turn: Block[];
  turnIndex: number;
  firstVisibleTurn: number;
  isLastTurn: boolean;
  busy: boolean;
  visible: boolean;
  cwd?: string;
  harness?: HarnessId;
  model?: string;
  turnHarness?: HarnessId;
  currentModelName?: string;
  waitingForApproval: boolean;
  pendingQuestion: boolean;
  preparingHandoff: boolean;
  transcriptLayout: TranscriptLayout;
  promptAnchor: boolean;
  anchorTurn: boolean;
  workOpen: boolean;
  onToggleWork: (turnId: string, open: boolean) => void;
  latestTurnAccessory?: ReactNode;
  onApproval?: (requestId: number, decision: ApprovalDecision) => void;
  onOpenFile?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
  onOpenPlan?: (blockId: string) => void;
  onBuildPlan?: (blockId: string, target?: PlanBuildTarget) => void;
  onSecondOpinion?: (harness: HarnessId, turn: Block[], model: string) => void;
  onHandoff?: (harness: HarnessId, turn: Block[], model: string) => void;
  onSaveNote?: (text: string) => void;
  sessionId: string;
};

/** Placeholder for private reasoning before the first assistant text arrives. */
function InitialThinking({ live }: { live: boolean }) {
  return (
    <div className="min-w-0 px-4 pt-3 pb-1 font-sans text-sm text-content/50">
      {live ? <Shimmer duration={1.6}>Thinking…</Shimmer> : "Thinking…"}
    </div>
  );
}

/**
 * Animate one fold, then release its contents. Closed work must not retain
 * a component and DOM tree for every tool; only expansion builds those rows.
 * Visible rows stay out of Grid so they rewrap when their pane changes width.
 */
function TurnRow({
  folded,
  children,
}: {
  folded: boolean;
  children: ReactNode | (() => ReactNode);
}) {
  const [foldState, setFoldState] = useState<
    "open" | "opening" | "closing" | "closed"
  >(folded ? "closed" : "open");

  useLayoutEffect(() => {
    setFoldState((current) => {
      if (folded) {
        return current === "closed" || current === "closing"
          ? current
          : "closing";
      }
      return current === "open" || current === "opening" ? current : "opening";
    });
  }, [folded]);

  useEffect(() => {
    if (foldState !== "opening" && foldState !== "closing") return;
    // Hidden tabs and reduced-motion styles may never fire animationend.
    const timer = window.setTimeout(() => {
      setFoldState(folded ? "closed" : "open");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [foldState, folded]);

  if (folded && foldState === "closed") return null;

  return (
    // `inert` keeps folded work out of tab order and off the screen reader.
    <div
      className="zen-fold-item"
      data-fold-state={foldState}
      inert={folded}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        setFoldState(folded ? "closed" : "open");
      }}
    >
      {/* Keep padding off the Grid item itself. Otherwise its 4px bottom
       * padding survives a 0fr track and every folded row leaves a gap. */}
      <div>
        <div className="pb-1">
          {typeof children === "function" ? children() : children}
        </div>
      </div>
    </div>
  );
}

/** A turn item's identity, stable as the group it names grows. */
function turnItemKey(item: TurnItem): string {
  return item.type === "activity" ? item.blocks[0].id : item.block.id;
}

/**
 * The line a turn's work folds behind: the harness mark, and the clock —
 * ticking while the agent works, how long it took once it is done. Everything
 * the fold holds stays one click away, so the settled transcript reads as
 * prompt, answer, and a receipt for the work in between.
 */
function WorkFoldLine({
  title,
  kind,
  harness,
  live = false,
  failed = false,
  expandable,
  open,
  onToggle,
}: {
  title: ReactNode;
  kind: ActivityPhaseKind;
  harness?: HarnessId;
  live?: boolean;
  failed?: boolean;
  expandable: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const icon = (
    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
      {failed ? (
        <X className="size-3.5 shrink-0 text-red-400" strokeWidth={2} />
      ) : open ? (
        // Open, the chevron stays put: it is the way back, and hunting for it
        // under the cursor is no way to close what you opened.
        <ChevronRight
          className="size-3.5 rotate-90 text-content/45"
          strokeWidth={1.75}
        />
      ) : (
        <>
          {harness ? (
            <HarnessIcon
              harness={harness}
              className={`size-3.5 shrink-0 ${expandable ? "group-hover:opacity-0" : ""}`}
            />
          ) : (
            <ActivityPhaseIcon
              kind={kind}
              className={expandable ? "group-hover:opacity-0" : ""}
            />
          )}
          {expandable ? (
            <ChevronRight
              className="absolute size-3.5 text-content/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              strokeWidth={1.75}
            />
          ) : null}
        </>
      )}
    </span>
  );
  // While the agent runs, the clock shimmers here rather than at the bottom,
  // which is now bare.
  const label = failed ? (
    <span className="min-w-0 flex-1 truncate font-sans text-sm text-red-400">
      {title}
    </span>
  ) : live ? (
    title
  ) : (
    <span className="min-w-0 flex-1 truncate font-sans text-sm text-content/50 transition-colors duration-200 group-hover:text-content/80">
      {title}
    </span>
  );
  const row = `flex w-full min-w-0 items-center gap-1.5 px-4 py-1 text-left${
    open ? " zen-fold-drop" : ""
  }`;

  if (!expandable) {
    return (
      <div
        className={`group ${row}`}
        role={live ? "status" : undefined}
        aria-live={live ? "polite" : undefined}
      >
        {icon}
        {label}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? "Hide the work" : "Show the work"}
      aria-live={live ? "polite" : undefined}
      onClick={onToggle}
      className={`group ${row}`}
    >
      {icon}
      {label}
    </button>
  );
}

function areTurnsEqual(
  prev: TranscriptTurnProps,
  next: TranscriptTurnProps,
): boolean {
  if (prev.isLastTurn || next.isLastTurn) {
    return (
      prev.turn === next.turn &&
      prev.isLastTurn === next.isLastTurn &&
      prev.busy === next.busy &&
      prev.visible === next.visible &&
      prev.currentModelName === next.currentModelName &&
      prev.waitingForApproval === next.waitingForApproval &&
      prev.pendingQuestion === next.pendingQuestion &&
      prev.preparingHandoff === next.preparingHandoff &&
      prev.workOpen === next.workOpen &&
      prev.transcriptLayout === next.transcriptLayout &&
      prev.promptAnchor === next.promptAnchor &&
      prev.anchorTurn === next.anchorTurn &&
      prev.latestTurnAccessory === next.latestTurnAccessory &&
      prev.cwd === next.cwd &&
      prev.firstVisibleTurn === next.firstVisibleTurn &&
      prev.turnIndex === next.turnIndex &&
      prev.turnHarness === next.turnHarness &&
      prev.onApproval === next.onApproval &&
      prev.onOpenFile === next.onOpenFile &&
      prev.onOpenDiff === next.onOpenDiff &&
      prev.onOpenPlan === next.onOpenPlan &&
      prev.onBuildPlan === next.onBuildPlan &&
      prev.onSecondOpinion === next.onSecondOpinion &&
      prev.onHandoff === next.onHandoff &&
      prev.onSaveNote === next.onSaveNote
    );
  }

  return (
    prev.turn === next.turn &&
    prev.workOpen === next.workOpen &&
    prev.transcriptLayout === next.transcriptLayout &&
    prev.firstVisibleTurn === next.firstVisibleTurn &&
    prev.turnIndex === next.turnIndex &&
    prev.cwd === next.cwd &&
    prev.turnHarness === next.turnHarness &&
    prev.visible === next.visible &&
    prev.onApproval === next.onApproval &&
    prev.onOpenFile === next.onOpenFile &&
    prev.onOpenDiff === next.onOpenDiff &&
    prev.onOpenPlan === next.onOpenPlan &&
    prev.onBuildPlan === next.onBuildPlan &&
    prev.onSecondOpinion === next.onSecondOpinion &&
    prev.onHandoff === next.onHandoff &&
    prev.onSaveNote === next.onSaveNote
  );
}

const TranscriptTurn = memo(function TranscriptTurn({
  turn,
  turnIndex,
  firstVisibleTurn,
  isLastTurn,
  busy,
  visible,
  cwd,
  harness,
  model,
  turnHarness,
  currentModelName,
  waitingForApproval,
  pendingQuestion,
  preparingHandoff,
  transcriptLayout,
  promptAnchor,
  anchorTurn,
  workOpen,
  onToggleWork,
  latestTurnAccessory,
  onApproval,
  onOpenFile,
  onOpenDiff,
  onOpenPlan,
  onBuildPlan,
  onSecondOpinion,
  onHandoff,
  onSaveNote,
sessionId,
}: TranscriptTurnProps) {
  const userBlock = useMemo(() => turnUserBlock(turn), [turn]);
  const durationMs = userBlock?.durationMs;
  const settled = !(busy && isLastTurn);
  const items = useMemo(() => groupTurnItems(turn), [turn]);
  const foldedAt = useMemo(() => lastActivityIndex(items), [items]);
  const initialThinkingAt = useMemo(() => initialThinkingIndex(items), [items]);
  const startedAt = userBlock?.startedAt;
  const answering = useMemo(
    () =>
      foldedAt >= 0 &&
      items
        .slice(foldedAt + 1)
        .some((item) => item.type === "block" && isProseBlock(item.block)),
    [items, foldedAt],
  );
  const workStillRunning = activityStillRunning(turn);
  const turnModel = userBlock?.turnModel;
  const turnId = turn[0].id;
  const fold = useMemo(() => foldableWork(items), [items]);
  const folded = useMemo(
    () => (fold ? foldedBlocks(items, fold) : []),
    [items, fold],
  );
  const subagentFailure = useMemo(() => subagentFailureSummary(turn), [turn]);
  const live = visible && !settled && !preparingHandoff;
  const turnModelName = turnModel?.name ?? (live ? currentModelName : undefined);
  const foldTitle: ReactNode = subagentFailure ? (
    subagentFailure
  ) : live ? (
    <LiveFoldTitle
      startedAt={startedAt}
      paused={waitingForApproval}
      waitingLabel={pendingQuestion ? "Waiting for answers" : undefined}
      subagent={hasRunningSubagent(turn)}
      modelName={turnModelName}
    />
  ) : durationMs != null ? (
    formatWorkingDuration(durationMs, true, false, turnModelName)
  ) : (
    workSummaryLine(folded)
  );
  const showFoldLine = live || durationMs != null || !!fold;
  const firstWork = useMemo(() => firstFoldableIndex(items), [items]);
  const foldLineAt = fold
    ? fold.start
    : firstWork >= 0
      ? firstWork
      : items.length;

  const handleToggle = useCallback(() => {
    onToggleWork(turnId, workOpen);
  }, [onToggleWork, turnId, workOpen]);

  const handleSecondOpinion = useCallback(
    (target: HarnessId, mod: string) => {
      onSecondOpinion?.(target, turn, mod);
    },
    [onSecondOpinion, turn],
  );

  const handleHandoff = useCallback(
    (target: HarnessId, mod: string) => {
      onHandoff?.(target, turn, mod);
    },
    [onHandoff, turn],
  );

  const copyOutput = useMemo(() => turnCopyText(turn), [turn]);

  const renderItem = (item: TurnItem, itemIndex: number) =>
    item.type === "activity" ? (
      itemIndex === initialThinkingAt ? (
        <InitialThinking
          key={item.blocks[0].id}
          live={visible && !settled}
        />
      ) : (
        <ActivityPhases
          key={item.blocks[0].id}
          blocks={item.blocks}
          cwd={cwd}
          done={
            !visible ||
            settled ||
            itemIndex < foldedAt ||
            (answering && !workStillRunning)
          }
          onApproval={onApproval}
          onOpenFile={onOpenFile}
          onOpenDiff={onOpenDiff}
        />
      )
    ) : (
      <TranscriptBlock
        key={item.block.id}
        block={item.block}
        layout={transcriptLayout}
        stickyIndex={firstVisibleTurn + turnIndex + 1}
        underLine={
          isProseBlock(item.block) &&
          itemIndex > 0 &&
          (items[itemIndex - 1]?.type === "activity" ||
            (itemIndex === foldLineAt && showFoldLine))
        }
        onApproval={onApproval}
        onOpenFile={onOpenFile}
        onOpenDiff={onOpenDiff}
        onOpenPlan={onOpenPlan}
        onBuildPlan={onBuildPlan}
        planBusy={!!busy}
        planHarness={harness}
        planModel={model}
        cwd={cwd}
        sessionId={sessionId}
      />
    );

  const foldLineRow = (
    <TurnRow key="work-fold" folded={!showFoldLine}>
      <WorkFoldLine
        title={foldTitle}
        kind={workKind(folded)}
        harness={turnHarness}
        live={live}
        failed={!!subagentFailure}
        expandable={!!fold}
        open={workOpen && !!fold}
        onToggle={handleToggle}
      />
    </TurnRow>
  );

  return (
    <div
      key={turn[0].id}
      className={`transcript-turn flex min-w-0 flex-col${
        isLastTurn ? " transcript-turn-live" : ""
      }${
        promptAnchor && anchorTurn && isLastTurn && userBlock
          ? " transcript-turn-anchor"
          : ""
      }`}
    >
      {items.flatMap((item, itemIndex) => {
        const inFold =
          !!fold && itemIndex >= fold.start && itemIndex <= fold.end;
        if (inFold) {
          if (itemIndex !== fold.start) return [];
          return [
            foldLineRow,
            <TurnRow key="work-details" folded={!workOpen}>
              {() =>
                items
                  .slice(fold.start, fold.end + 1)
                  .map((entry, offset) => (
                    <div
                      key={turnItemKey(entry)}
                      className={`flow-root pb-1 last:pb-0 pl-5 zen-fold-rail ${
                        fold.start + offset === fold.end
                          ? "zen-fold-tail"
                          : ""
                      }`}
                    >
                      {renderItem(entry, fold.start + offset)}
                    </div>
                  ))
              }
            </TurnRow>,
          ];
        }
        const row = (
          <div key={turnItemKey(item)} className="flow-root pb-1">
            {renderItem(item, itemIndex)}
          </div>
        );
        if (itemIndex !== foldLineAt) return row;
        return [foldLineRow, row];
      })}
      {foldLineAt >= items.length ? foldLineRow : null}
      {isLastTurn && latestTurnAccessory ? latestTurnAccessory : null}
      {durationMs != null && settled ? (
        <TurnDuration
          elapsedMs={durationMs}
          labelHidden={showFoldLine}
          modelName={turnModelName}
          completedAt={
            startedAt != null ? startedAt + durationMs : undefined
          }
          copyText={copyOutput}
          onSaveNote={onSaveNote}
          harness={turnHarness}
          fromHarness={turnHarness}
          onSecondOpinion={onSecondOpinion ? handleSecondOpinion : undefined}
          onHandoff={onHandoff ? handleHandoff : undefined}
        />
      ) : null}
    </div>
  );
}, areTurnsEqual);

export { TranscriptTurn };