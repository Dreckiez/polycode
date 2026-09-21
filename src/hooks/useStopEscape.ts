import {
  useCallback,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { nudgeWorkspace } from "../lib/appSession";
import { notifyReviewChanged } from "../lib/checkpoint";
import { nudgeWatchedFiles } from "../lib/fileWatch";
import { notifyGitChanged } from "../lib/fs";
import {
  buildDeterministicHandoff,
  completeHandoff,
  isPreparingHandoff,
  sessionChildHarnesses,
} from "../lib/handoff";
import { cancelHarnessTurn, stopStreaming } from "../lib/harness";
import { type WorkspaceTab } from "../lib/layout";
import { type Session, sessionWorkCwd } from "../lib/session";
import {
  deferUnhandledEscape,
  focusedBusyAgentSessionId,
  shouldStopFocusedTurnOnEscape,
} from "../lib/tabKeys";

export type StopEscapeDeps = {
  sessionsRef: RefObject<Session[]>;
  turnGen: RefObject<Map<string, number>>;
  flushHarnessEvents: () => void;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  flushSessionLiveText: (sessionId: string, session: Session) => Session;
  activeTabIdRef: RefObject<string>;
  tabsRef: RefObject<WorkspaceTab[]>;
  projectTerminalFocusedRef: RefObject<boolean>;
};

export function useStopEscape(deps: StopEscapeDeps) {
  const d = deps;

  const onStop = useCallback(
    (sessionId: string) => {
      const session = d.sessionsRef.current.find((s) => s.id === sessionId);
      d.turnGen.current.set(
        sessionId,
        (d.turnGen.current.get(sessionId) ?? 0) + 1,
      );
      d.flushHarnessEvents();
      if (session) {
        for (const id of sessionChildHarnesses(session)) {
          void cancelHarnessTurn(id, sessionId);
        }
      }
      d.setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const withLiveText = d.flushSessionLiveText(s.id, s);
          const stopped = stopStreaming(withLiveText);
          const completed = isPreparingHandoff(stopped)
            ? completeHandoff(stopped, buildDeterministicHandoff(stopped))
            : stopped;
          return completed.queuedMessages?.length
            ? { ...completed, queueStatus: "paused" }
            : completed;
        }),
      );
      if (session) {
        notifyReviewChanged(sessionId);
        nudgeWorkspace(sessionWorkCwd(session));
        notifyGitChanged();
        nudgeWatchedFiles();
        window.setTimeout(() => nudgeWatchedFiles(), 150);
      } else {
        notifyReviewChanged(sessionId);
      }
    },
    [d.flushHarnessEvents],
  );

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const inTerminal = Boolean(target?.closest(".monocode-terminal"));
      const activeTabId = d.activeTabIdRef.current;
      const sessionId = focusedBusyAgentSessionId(
        activeTabId,
        d.tabsRef.current,
        d.sessionsRef.current,
        d.projectTerminalFocusedRef.current,
      );
      if (
        !sessionId ||
        !shouldStopFocusedTurnOnEscape(event, {
          inTerminal,
          focusedSessionBusy: true,
        })
      ) {
        return;
      }

      // Other surfaces (drag/reorder included) can claim Escape later in the
      // same keydown dispatch. Defer the destructive stop until every handler
      // has had a chance to preventDefault, then verify focus did not move.
      deferUnhandledEscape(event, () => {
        const stillFocusedSessionId = focusedBusyAgentSessionId(
          d.activeTabIdRef.current,
          d.tabsRef.current,
          d.sessionsRef.current,
          d.projectTerminalFocusedRef.current,
        );
        if (
          d.activeTabIdRef.current !== activeTabId ||
          stillFocusedSessionId !== sessionId
        ) {
          return;
        }
        onStop(sessionId);
      });
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onStop]);

  return {
    onStop,
  };
}