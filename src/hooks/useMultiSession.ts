import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  leafIds,
  newTab,
  splitPane,
  type WorkspaceTab,
} from "../lib/layout";
import {
  HARNESS_TITLE,
  formatSessionTitle,
  newSession,
  sessionDisplayTitle,
  sessionWorkCwd,
  type Attachment,
  type Block,
  type HarnessId,
  type SecondOpinionMeta,
  type Session,
} from "../lib/session";
import {
  SECOND_OPINION_TITLE,
  buildSecondOpinionCard,
  buildSecondOpinionPrompt,
  harnessForTurn,
  turnEditedFiles,
  turnReport,
  turnUserRequest,
} from "../lib/secondOpinion";
import {
  HANDOFF_TITLE,
  buildDeterministicHandoff,
  buildHandoffComposerCard,
  sessionThroughTurn,
} from "../lib/handoff";
import {
  applyHarnessEvent,
  canCompactHarnessContext,
  compactHarnessContext,
  type HarnessEvent,
} from "../lib/harness";
import { syncDockBadge } from "../lib/dockBadge";
import { selectedProviderAccountId } from "../lib/providerAccounts";

export type MultiSessionDeps = {
  activeTabIdRef: RefObject<string>;
  tabsRef: RefObject<WorkspaceTab[]>;
  sessionsRef: RefObject<Session[]>;
  turnGen: RefObject<Map<string, number>>;
  appendTab: (tab: WorkspaceTab, cwd?: string) => void;
  onSubmit: (
    sessionId: string,
    text: string,
    attachments?: Attachment[],
    options?: { secondOpinion?: SecondOpinionMeta },
  ) => void;
  enqueueHarnessEvent: (sessionId: string, event: HarnessEvent) => void;
  flushHarnessEvents: () => void;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setProjectTerminalFocused: Dispatch<SetStateAction<boolean>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
};

export function useMultiSession(deps: MultiSessionDeps) {
  const d = deps;

  const openSessionBeside = useCallback(
    (
      sourceId: string,
      session: Session,
      cwd: string,
      focusComposer = false,
    ) => {
      const nextSessions = [...d.sessionsRef.current, session];
      d.sessionsRef.current = nextSessions;
      d.setSessions(nextSessions);

      const tab = d.tabsRef.current.find((entry) =>
        leafIds(entry.layout).includes(sourceId),
      );
      if (tab) {
        const nextTabs = d.tabsRef.current.map((entry) =>
          entry.id === tab.id
            ? {
                ...entry,
                layout: splitPane(entry.layout, sourceId, "right", session.id),
                focusedId: session.id,
                diffFocused: false,
              }
            : entry,
        );
        d.tabsRef.current = nextTabs;
        d.setTabs(nextTabs);
        if (tab.id !== d.activeTabIdRef.current) d.setActiveTabId(tab.id);
      } else {
        const nextTab = newTab(session.id);
        d.appendTab(nextTab, cwd);
        d.setActiveTabId(nextTab.id);
      }

      d.setProjectTerminalFocused(false);
      d.setComposerFocused(focusComposer);
    },
    [d.appendTab],
  );

  const onSecondOpinion = useCallback(
    (sourceId: string, harness: HarnessId, turn: Block[], model: string) => {
      const source = d.sessionsRef.current.find(
        (session) => session.id === sourceId,
      );
      if (!source) return;
      const cwd = sessionWorkCwd(source);
      const from = harnessForTurn(source.blocks, turn, source.harness);
      const userRequest = turnUserRequest(turn);
      const files = turnEditedFiles(turn, cwd);
      const prompt = buildSecondOpinionPrompt({
        from,
        userRequest,
        report: turnReport(turn),
        files,
      });
      const session = {
        ...newSession(harness, cwd, model, source.runtimeMode),
        title: formatSessionTitle(harness, SECOND_OPINION_TITLE),
      };
      openSessionBeside(sourceId, session, cwd);
      d.onSubmit(session.id, prompt, [], {
        secondOpinion: buildSecondOpinionCard({
          from,
          to: harness,
          userRequest,
          files,
        }),
      });
    },
    [d.onSubmit, openSessionBeside],
  );

  const onHandoff = useCallback(
    (sourceId: string, harness: HarnessId, turn: Block[], model: string) => {
      const source = d.sessionsRef.current.find(
        (session) => session.id === sourceId,
      );
      if (!source) return;
      const cwd = sessionWorkCwd(source);
      const from = harnessForTurn(source.blocks, turn, source.harness);
      const sliced = sessionThroughTurn(source, turn);
      const userRequest = turnUserRequest(turn);
      const files = turnEditedFiles(sliced.blocks, cwd);
      const display = sessionDisplayTitle(source.title, source.harness);
      const session = {
        ...newSession(harness, cwd, model, source.runtimeMode),
        title: formatSessionTitle(
          harness,
          display === "New session" ? HANDOFF_TITLE : display,
        ),
        handoffCard: buildHandoffComposerCard({
          from,
          to: harness,
          brief: buildDeterministicHandoff(sliced),
          userRequest,
          files,
        }),
      };
      openSessionBeside(sourceId, session, cwd, true);
    },
    [openSessionBeside],
  );

  const onCompactContext = useCallback(
    (sessionId: string) => {
      const current = d.sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!current || current.busy) return false;
      if (!canCompactHarnessContext(current.harness)) {
        const unsupported = d.sessionsRef.current.map((session) =>
          session.id === sessionId
            ? applyHarnessEvent(session, {
                type: "status",
                text: `${HARNESS_TITLE[current.harness]} does not support manual context compaction.`,
              })
            : session,
        );
        d.sessionsRef.current = unsupported;
        syncDockBadge(unsupported);
        d.setSessions(unsupported);
        return true;
      }

      const gen = (d.turnGen.current.get(sessionId) ?? 0) + 1;
      d.turnGen.current.set(sessionId, gen);
      const workCwd = sessionWorkCwd(current);
      const started = d.sessionsRef.current.map((session) =>
        session.id === sessionId
          ? applyHarnessEvent(
              { ...session, busy: true },
              { type: "status", text: "Compacting context…" },
            )
          : session,
      );
      d.sessionsRef.current = started;
      syncDockBadge(started);
      d.setSessions(started);

      void (async () => {
        try {
          await compactHarnessContext({
            harness: current.harness,
            sessionId,
            cwd: workCwd,
            model: current.model,
            modelSettings: current.modelSettings,
            providerAccountId:
              current.harness === "claude" || current.harness === "codex"
                ? (current.providerAccountId ??
                  selectedProviderAccountId(current.harness, current.cwd))
                : undefined,
            runtimeMode: current.runtimeMode,
            onEvent: (event) => {
              if (d.turnGen.current.get(sessionId) !== gen) return;
              d.enqueueHarnessEvent(sessionId, event);
            },
          });
          if (d.turnGen.current.get(sessionId) !== gen) return;
          d.enqueueHarnessEvent(sessionId, {
            type: "status",
            text: "Compacted context",
          });
        } catch (error: unknown) {
          if (d.turnGen.current.get(sessionId) !== gen) return;
          d.enqueueHarnessEvent(sessionId, {
            type: "session.error",
            message:
              error instanceof Error
                ? error.message
                : `${current.harness} could not compact this context`,
          });
        } finally {
          if (d.turnGen.current.get(sessionId) !== gen) return;
          d.flushHarnessEvents();
          const finished = d.sessionsRef.current.map((session) =>
            session.id === sessionId ? { ...session, busy: false } : session,
          );
          d.sessionsRef.current = finished;
          syncDockBadge(finished);
          d.setSessions(finished);
        }
      })();
      return true;
    },
    [d.enqueueHarnessEvent, d.flushHarnessEvents],
  );

  return {
    openSessionBeside,
    onSecondOpinion,
    onHandoff,
    onCompactContext,
  };
}