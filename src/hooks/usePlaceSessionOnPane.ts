import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { leafIds, type PaneEdge, type WorkspaceTab } from "../lib/layout";
import { forgetHarnessSession } from "../lib/harness";
import { isBlankSession } from "../lib/projectReturn";
import { newDefaultSession, type Session } from "../lib/session";
import {
  applyPlaceSessionOnPane,
  type WorkspaceTabCloseScope,
} from "../lib/workspaceTabGroups";

export type PlaceSessionOnPaneDeps = {
  ensureOpenSession: (sessionId: string) => Promise<Session | null>;
  lastPersisted: RefObject<Map<string, string>>;
  projectCwdRef: RefObject<string>;
  sessionsRef: RefObject<Session[]>;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setProjectTerminalFocused: Dispatch<SetStateAction<boolean>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  tabCloseScope: WorkspaceTabCloseScope;
  tabsRef: RefObject<WorkspaceTab[]>;
};

export function usePlaceSessionOnPane(deps: PlaceSessionOnPaneDeps) {
  const d = deps;

  const onPlaceSessionOnPane = useCallback(
    async (sessionId: string, targetId: string, edge: PaneEdge) => {
      if (sessionId === targetId) return;
      const targetTab = d.tabsRef.current.find((tab) =>
        leafIds(tab.layout).includes(targetId),
      );
      if (!targetTab) return;

      const alreadyHere = leafIds(targetTab.layout).includes(sessionId);
      if (!alreadyHere) {
        const session = await d.ensureOpenSession(sessionId);
        if (!session) return;
      }

      const tab = d.tabsRef.current.find((entry) => entry.id === targetTab.id);
      if (!tab || !leafIds(tab.layout).includes(targetId)) return;

      const replaceTarget =
        !leafIds(tab.layout).includes(sessionId) &&
        isBlankSession(
          d.sessionsRef.current.find((entry) => entry.id === targetId),
        );

      if (replaceTarget) {
        d.lastPersisted.current.delete(targetId);
        const blank = d.sessionsRef.current.find(
          (entry) => entry.id === targetId,
        );
        if (blank) void forgetHarnessSession(blank.harness, targetId);
      }

      const result = applyPlaceSessionOnPane({
        tabs: d.tabsRef.current,
        sessions: d.sessionsRef.current,
        sessionId,
        targetId,
        edge,
        replaceTarget,
        scope: d.tabCloseScope,
        createReplacement: (seed) =>
          newDefaultSession(
            seed?.cwd ?? d.projectCwdRef.current,
            seed?.runtimeMode,
          ),
      });
      if (!result) return;

      d.sessionsRef.current = result.sessions;
      d.tabsRef.current = result.tabs;
      d.setSessions(result.sessions);
      d.setTabs(result.tabs);
      d.setActiveTabId(result.activeTabId);
      d.setProjectTerminalFocused(false);
      d.setComposerFocused(true);
    },
    [d.ensureOpenSession, d.tabCloseScope],
  );

  return {
    onPlaceSessionOnPane,
  };
}