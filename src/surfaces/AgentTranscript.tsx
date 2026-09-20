import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { useTranscriptLayout } from "../hooks/useTranscriptLayout";
import { useTranscriptAnchor } from "../hooks/useTranscriptAnchor";
import { useTranscriptSelection } from "../hooks/useTranscriptSelection";
import type { ApprovalDecision } from "../lib/harness";
import { hasPendingApproval, type Block, type HarnessId, type PlanBuildTarget } from "../lib/session";
import { resolveModel } from "../lib/models";
import { harnessForTurn } from "../lib/secondOpinion";
import { groupTurns, subagentFailureSummary } from "./transcriptActivity";
import {
  lastUserBlockId,
  turnUserBlock,
  isNearBottom,
  pinToBottom,
  syncTranscriptViewport,
  NEAR_BOTTOM_PX,
} from "./transcriptShared";
import { TranscriptTurn } from "./TranscriptTurn";
import { TranscriptSelectionMenu } from "./TranscriptSelectionMenu";

const INITIAL_TURNS = 20;
const TURN_PAGE_SIZE = 20;

type Props = {
  blocks: Block[];
  sessionId: string;
  busy?: boolean;
  cwd?: string;
  harness?: HarnessId;
  model?: string;
  pendingQuestion?: boolean;
  onApproval?: (requestId: number, decision: ApprovalDecision) => void;
  onAddToChat?: (text: string) => void;
  onSaveNote?: (text: string) => void;
  onSaveSelectionNote?: (text: string) => void;
  onOpenFile?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
  onOpenPlan?: (blockId: string) => void;
  onBuildPlan?: (blockId: string, target?: PlanBuildTarget) => void;
  onSecondOpinion?: (harness: HarnessId, turn: Block[], model: string) => void;
  onHandoff?: (harness: HarnessId, turn: Block[], model: string) => void;
  onJumpToBottomChange?: (show: boolean) => void;
  onJumpToBottomReady?: (jump: () => void) => void;
  /** Passes a function that renders the turn that holds a block. The render completes before the function returns. */
  onRevealReady?: (reveal: (blockId: string) => boolean) => void;
  /** Session-level output shown after the latest reply and before its action row. */
  latestTurnAccessory?: ReactNode;
  /** False while another tab is in front; local transcript state is retained. */
  visible?: boolean;
};

function sameTurnBlocks(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function AgentTranscriptComponent({
  blocks,
  sessionId,
  busy,
  cwd,
  harness,
  model,
  pendingQuestion = false,
  onApproval,
  onAddToChat,
  onSaveNote,
  onSaveSelectionNote,
  onOpenFile,
  onOpenDiff,
  onOpenPlan,
  onBuildPlan,
  onSecondOpinion,
  onHandoff,
  onJumpToBottomChange,
  onJumpToBottomReady,
  onRevealReady,
  latestTurnAccessory,
  visible = true,
}: Props) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const showJumpRef = useRef(false);
  const distanceFromBottom = useRef(0);
  const prependHeight = useRef<number | null>(null);
  const wasVisible = useRef(false);
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const [visibleTurnCount, setVisibleTurnCount] = useState(INITIAL_TURNS);
  // Turns whose folded work the reader has opened, by turn id.
  const [openWork, setOpenWork] = useState<Record<string, boolean>>({});
  const toggleWork = useCallback((turnId: string, currentlyOpen: boolean) => {
    setOpenWork((open) => ({ ...open, [turnId]: !currentlyOpen }));
  }, []);
  // Stretch the last turn after a send while this tab stays open. Closing
  // the tab is a new visit: the remount uses the true transcript height so
  // the latest reply sits on the composer instead of a hole of empty space.
  const [anchorTurn, setAnchorTurn] = useState(!!busy);
  const { selection, dismissSelection } = useTranscriptSelection(
    scrollerEl,
    onAddToChat !== undefined || onSaveSelectionNote !== undefined,
  );
  const transcriptLayout = useTranscriptLayout();
  const promptAnchor = useTranscriptAnchor();
  const lastUserId = lastUserBlockId(blocks);
  const seenUserId = useRef(lastUserId);
  if (lastUserId !== seenUserId.current) {
    seenUserId.current = lastUserId;
    if (lastUserId && !anchorTurn) setAnchorTurn(true);
  }
  const currentModelName = harness
    ? resolveModel(harness, model).name
    : undefined;
  const waitingForApproval = hasPendingApproval(blocks) || pendingQuestion;
  const preparingHandoff = blocks.some(
    (block) =>
      block.role === "handoff" && block.handoff?.status === "preparing",
  );

  const setShowJump = useCallback(
    (show: boolean) => {
      if (showJumpRef.current === show) return;
      showJumpRef.current = show;
      onJumpToBottomChange?.(show);
    },
    [onJumpToBottomChange],
  );

  const syncPinned = useCallback(
    (el: HTMLElement) => {
      const near = isNearBottom(el);
      stickToBottom.current = near;
      distanceFromBottom.current =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJump(!near);
    },
    [setShowJump],
  );

  const jumpToBottom = useCallback(() => {
    stickToBottom.current = true;
    distanceFromBottom.current = 0;
    setShowJump(false);
    const el = scroller.current;
    syncTranscriptViewport(el);
    pinToBottom(el);
  }, [setShowJump]);

  const setScroller = useCallback(
    (el: HTMLDivElement | null) => {
      scroller.current = el;
      setScrollerEl(el);
      lockOverscroll(el);
    },
    [lockOverscroll],
  );

  useEffect(() => {
    onJumpToBottomReady?.(jumpToBottom);
  }, [jumpToBottom, onJumpToBottomReady]);

  useEffect(() => {
    if (!visible || !scrollerEl) return;
    syncPinned(scrollerEl);
    const onScroll = () => syncPinned(scrollerEl);
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        stickToBottom.current = false;
        setShowJump(true);
      }
    };
    scrollerEl.addEventListener("scroll", onScroll, { passive: true });
    scrollerEl.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      scrollerEl.removeEventListener("scroll", onScroll);
      scrollerEl.removeEventListener("wheel", onWheel);
    };
  }, [scrollerEl, setShowJump, syncPinned, visible]);

  useLayoutEffect(() => {
    stickToBottom.current = true;
    setShowJump(false);
    const el = scroller.current;
    syncTranscriptViewport(el);
    pinToBottom(el);
  }, [lastUserId, setShowJump]);

  useLayoutEffect(() => {
    const opened = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (!opened) return;
    const el = scroller.current;
    if (!el) return;
    syncTranscriptViewport(el);
    // Previously opened tabs normally retain their scroll position. Only pin
    // when the scroller looks empty after being hidden with `display: none`.
    if (el.scrollHeight <= el.clientHeight + NEAR_BOTTOM_PX) {
      stickToBottom.current = true;
      setShowJump(false);
      pinToBottom(el);
    }
  }, [visible, setShowJump]);

  useLayoutEffect(() => {
    if (!visible || !stickToBottom.current) return;
    const el = scroller.current;
    pinToBottom(el);
  }, [blocks, busy, visible]);

  useLayoutEffect(() => {
    const el = scrollerEl;
    const inner = el?.firstElementChild;
    if (!visible || !el || !inner) return;
    const onResize = () => {
      syncTranscriptViewport(el);
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (stickToBottom.current) {
        pinToBottom(el);
        distanceFromBottom.current = 0;
        return;
      }
      distanceFromBottom.current = distance;
      setShowJump(!isNearBottom(el));
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(inner);
    observer.observe(el);
    onResize();
    return () => observer.disconnect();
  }, [scrollerEl, setShowJump, visible]);

  const rawTurns = useMemo(() => groupTurns(blocks), [blocks]);
  const previousTurnsRef = useRef<Block[][]>([]);
  const turns = useMemo(() => {
    const prev = previousTurnsRef.current;
    const stabilized: Block[][] = [];
    let changed = false;
    for (let i = 0; i < rawTurns.length; i++) {
      const nextTurn = rawTurns[i];
      const prevTurn = prev[i];
      if (prevTurn && sameTurnBlocks(prevTurn, nextTurn)) {
        stabilized.push(prevTurn);
      } else {
        stabilized.push(nextTurn);
        changed = true;
      }
    }
    if (!changed && prev.length === rawTurns.length) {
      return prev;
    }
    previousTurnsRef.current = stabilized;
    return stabilized;
  }, [rawTurns]);
  const firstVisibleTurn = Math.max(0, turns.length - visibleTurnCount);
  const visibleTurns = useMemo(
    () => turns.slice(firstVisibleTurn),
    [turns, firstVisibleTurn],
  );
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const visibleTurnCountRef = useRef(visibleTurnCount);
  visibleTurnCountRef.current = visibleTurnCount;

  useLayoutEffect(() => {
    const previousHeight = prependHeight.current;
    const el = scroller.current;
    if (previousHeight == null || !el) return;
    prependHeight.current = null;
    el.scrollTop += el.scrollHeight - previousHeight;
    distanceFromBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight;
  }, [visibleTurnCount]);

  const prepareToPrepend = useCallback(() => {
    const el = scroller.current;
    if (el) prependHeight.current = el.scrollHeight;
    stickToBottom.current = false;
  }, []);

  const loadEarlier = () => {
    prepareToPrepend();
    setVisibleTurnCount((count) =>
      Math.min(turns.length, count + TURN_PAGE_SIZE),
    );
  };

  const revealBlock = useCallback(
    (blockId: string): boolean => {
      const all = turnsRef.current;
      const index = all.findIndex((turn) =>
        turn.some((block) => block.id === blockId),
      );
      if (index < 0) return false;
      const needed = all.length - index;
      if (needed <= visibleTurnCountRef.current) return true;
      prepareToPrepend();
      // Synchronous. The caller finds the turn in the DOM after this call.
      flushSync(() => setVisibleTurnCount(needed));
      return true;
    },
    [prepareToPrepend],
  );

  useEffect(() => {
    onRevealReady?.(revealBlock);
  }, [revealBlock, onRevealReady]);

  return (
    <div
      ref={setScroller}
      className="agent-transcript h-full overflow-y-auto overscroll-none [overflow-anchor:none] font-mono text-[13px] leading-5"
    >
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-1 pb-1">
        {firstVisibleTurn > 0 ? (
          <div className="flex justify-center px-4 py-3">
            <button
              type="button"
              className="cursor-pointer rounded-md bg-content/8 px-2.5 py-1.5 font-sans text-[12px] text-content/60 hover:bg-content/12 hover:text-content"
              onClick={loadEarlier}
            >
              Load earlier messages
            </button>
          </div>
        ) : null}
        {visibleTurns.map((turn, turnIndex) => {
          const isLastTurn = firstVisibleTurn + turnIndex === turns.length - 1;
          const turnId = turn[0].id;
          const subagentFailure = subagentFailureSummary(turn);
          const workOpen = openWork[turnId] ?? !!subagentFailure;
          const turnModel = turnUserBlock(turn)?.turnModel;
          const turnHarness = harness
            ? (turnModel?.harness ?? harnessForTurn(blocks, turn, harness))
            : undefined;
          return (
            <TranscriptTurn
              key={turnId}
              turn={turn}
              turnIndex={turnIndex}
              firstVisibleTurn={firstVisibleTurn}
              isLastTurn={isLastTurn}
              busy={!!busy}
              visible={visible}
              cwd={cwd}
              harness={harness}
              model={model}
              turnHarness={turnHarness}
              currentModelName={currentModelName}
              waitingForApproval={waitingForApproval}
              pendingQuestion={pendingQuestion}
              preparingHandoff={preparingHandoff}
              transcriptLayout={transcriptLayout}
              promptAnchor={promptAnchor}
              anchorTurn={anchorTurn}
              workOpen={workOpen}
              onToggleWork={toggleWork}
              latestTurnAccessory={isLastTurn ? latestTurnAccessory : null}
              onApproval={onApproval}
              onOpenFile={onOpenFile}
              onOpenDiff={onOpenDiff}
              onOpenPlan={onOpenPlan}
              onBuildPlan={onBuildPlan}
              onSecondOpinion={onSecondOpinion}
              onHandoff={onHandoff}
              onSaveNote={onSaveNote}
              sessionId={sessionId}
            />
          );
        })}
      </div>
      {onAddToChat || onSaveSelectionNote ? (
        <TranscriptSelectionMenu
          selection={selection}
          onAddToChat={onAddToChat}
          onAddToNotes={onSaveSelectionNote}
          onDismiss={dismissSelection}
        />
      ) : null}
    </div>
  );
}

// Keep hidden panes' local state, and catch up with current props on activation.
export const AgentTranscript = memo(
  AgentTranscriptComponent,
  (previous, next) => previous.visible === false && next.visible === false,
);