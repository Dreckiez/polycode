import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  cancelScheduledFlush,
  scheduleHarnessFlush,
  type ScheduledFlush,
} from "../lib/appFlush";
import {
  appendLiveText,
  clearBlockLiveText,
  liveTextByBlock,
  setLiveText,
  useChatStore,
} from "../lib/chatStore";
import { syncDockBadge } from "../lib/dockBadge";
import { applyHarnessEvent, type HarnessEvent } from "../lib/harness";
import type { Session } from "../lib/session";

export type HarnessEventQueueDeps = {
  sessionsRef: RefObject<Session[]>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
};

export function useHarnessEventQueue(deps: HarnessEventQueueDeps) {
  const d = deps;

  const harnessQueued = useRef(new Map<string, HarnessEvent[]>());
  const harnessFlush = useRef<ScheduledFlush | null>(null);

  const flushHarnessEvents = useCallback(() => {
    cancelScheduledFlush(harnessFlush.current);
    harnessFlush.current = null;
    const batches = harnessQueued.current;
    if (batches.size === 0) return;
    harnessQueued.current = new Map();
    const prev = d.sessionsRef.current;
    const next = prev.map((session) => {
      const events = batches.get(session.id);
      return events ? events.reduce(applyHarnessEvent, session) : session;
    });
    if (!next.some((session, index) => session !== prev[index])) return;
    d.sessionsRef.current = next;
    syncDockBadge(next);
    d.setSessions(next);
  }, []);

  const applyApprovalEvent = useCallback(
    (sessionId: string, event: HarnessEvent) => {
      const queued = harnessQueued.current.get(sessionId) ?? [];
      harnessQueued.current.delete(sessionId);
      const events = [...queued, event];
      const prev = d.sessionsRef.current;
      const next = prev.map((session) =>
        session.id === sessionId
          ? events.reduce(applyHarnessEvent, session)
          : session,
      );
      if (!next.some((session, index) => session !== prev[index])) return;
      d.sessionsRef.current = next;
      syncDockBadge(next);
      d.setSessions(next);
    },
    [],
  );

  const enqueueHarnessEvent = useCallback(
    (sessionId: string, event: HarnessEvent) => {
      if (
        event.type === "approval.requested" ||
        event.type === "approval.resolved" ||
        event.type === "question.asked" ||
        event.type === "question.resolved"
      ) {
        applyApprovalEvent(sessionId, event);
        return;
      }

      // Route streaming text deltas through chatStore to isolate re-renders
      const role = event.type === "message.delta" ? "assistant" : event.type === "reasoning.delta" ? "reasoning" : null;
      const isCompleted = event.type === "message.completed" ? "assistant" : event.type === "reasoning.completed" ? "reasoning" : null;

      if (role && (event.type === "message.delta" || event.type === "reasoning.delta")) {
        // Streaming delta: check if there's an open streaming block for this session+role
        const session = d.sessionsRef.current.find((s) => s.id === sessionId);
        const streamingBlock = session?.blocks
          .filter((b) => b.role === role && b.streaming)
          .pop();

        if (streamingBlock) {
          // Open streaming block exists -> route delta through chatStore only
          const entry = { sessionId, blockId: streamingBlock.id };
          const existingStoreText = liveTextByBlock(useChatStore.getState(), entry);
          if (existingStoreText) {
            // Store already has content -> append delta
            appendLiveText(entry, event.text);
          } else if (streamingBlock.text) {
            // First delta to store: seed with canonical text + delta
            setLiveText(entry, streamingBlock.text + event.text);
          } else {
            // No canonical text either, just append
            appendLiveText(entry, event.text);
          }
          return;
        }
        // No open streaming block -> enqueue normally (will create block on flush)
      } else if (isCompleted && (event.type === "message.completed" || event.type === "reasoning.completed")) {
        // Turn completed: flush any accumulated store text to canonical, then seal
        const session = d.sessionsRef.current.find((s) => s.id === sessionId);
        const streamingBlock = session?.blocks
          .filter((b) => b.role === isCompleted && b.streaming)
          .pop();

        if (streamingBlock) {
          const storeText = liveTextByBlock(useChatStore.getState(), { sessionId, blockId: streamingBlock.id });
          if (storeText) {
            // Enqueue a final delta with the full accumulated text to update canonical
            const queued = harnessQueued.current;
            const events = queued.get(sessionId) ?? [];
            events.push({ type: `${isCompleted === "assistant" ? "message" : "reasoning"}.delta` as const, text: storeText });
            queued.set(sessionId, events);
            // Clear the store entry for this specific block
            clearBlockLiveText({ sessionId, blockId: streamingBlock.id });
          }
          // Fall through to enqueue the completed event
        }
      }

      const queued = harnessQueued.current;
      const events = queued.get(sessionId);
      if (events) events.push(event);
      else queued.set(sessionId, [event]);
      if (!harnessFlush.current) {
        harnessFlush.current = scheduleHarnessFlush(flushHarnessEvents);
      }
    },
    [applyApprovalEvent, flushHarnessEvents],
  );

  useEffect(() => {
    return () => {
      cancelScheduledFlush(harnessFlush.current);
      harnessFlush.current = null;
    };
  }, []);

  return { enqueueHarnessEvent, flushHarnessEvents };
}