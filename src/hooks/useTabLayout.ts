import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  pruneTabVisitHistory,
  tabVisitBack,
  tabVisitForward,
  type TabVisitHistory,
} from "../lib/tabVisitHistory";
import {
  rememberOpenedFile,
  resolveOpenablePath,
} from "../lib/fileIndex";
import {
  leafIds,
  movePane,
  newFileTab,
  openChangesTab,
  openEditorTab,
  openSessionChangesTab,
  type PaneEdge,
  type WorkspaceTab,
} from "../lib/layout";
import { loadDiffViewer } from "../lib/settings";
import { type SidebarTabId } from "../lib/appearance";
import {
  mergeOrderedSubset,
  orderByIds,
} from "../lib/reorder";
import { applyGroupedReorder } from "../lib/tabGroups";
import { type GitFileDiffKind } from "../lib/fs";

export type TabLayoutDeps = {
  deckProjectTabs: WorkspaceTab[];
  activeTabId: string;
  activeTabIdRef: RefObject<string>;
  tabsRef: RefObject<WorkspaceTab[]>;
  tabVisitRef: RefObject<TabVisitHistory>;
  tabVisitFromHistoryRef: RefObject<boolean>;
  gitCwdRef: RefObject<string>;
  sidebarCwdRef: RefObject<string>;
  activateTab: (id: string, paneId?: string) => void;
  commitTabVisit: (history: TabVisitHistory) => void;
  projectOfTab: (id: string) => string | undefined;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTabId>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
};

export function useTabLayout(deps: TabLayoutDeps) {
  const d = deps;

  const onNext = useCallback(() => {
    const index = d.deckProjectTabs.findIndex((t) => t.id === d.activeTabId);
    if (index >= 0)
      d.activateTab(
        d.deckProjectTabs[(index + 1) % d.deckProjectTabs.length].id,
      );
  }, [d.activateTab, d.activeTabId, d.deckProjectTabs]);

  const onPrev = useCallback(() => {
    const index = d.deckProjectTabs.findIndex((t) => t.id === d.activeTabId);
    if (index >= 0) {
      d.activateTab(
        d.deckProjectTabs[
          (index - 1 + d.deckProjectTabs.length) % d.deckProjectTabs.length
        ].id,
      );
    }
  }, [d.activateTab, d.activeTabId, d.deckProjectTabs]);

  const onVisitBack = useCallback(() => {
    const openIds = new Set(d.tabsRef.current.map((tab) => tab.id));
    const pruned = pruneTabVisitHistory(
      d.tabVisitRef.current,
      openIds,
      d.activeTabIdRef.current,
    );
    const next = tabVisitBack(pruned);
    if (!next || !openIds.has(next.current)) return;
    d.tabVisitFromHistoryRef.current = true;
    d.commitTabVisit(next);
    d.activateTab(next.current);
  }, [d.activateTab, d.commitTabVisit]);

  const onVisitForward = useCallback(() => {
    const openIds = new Set(d.tabsRef.current.map((tab) => tab.id));
    const pruned = pruneTabVisitHistory(
      d.tabVisitRef.current,
      openIds,
      d.activeTabIdRef.current,
    );
    const next = tabVisitForward(pruned);
    if (!next || !openIds.has(next.current)) return;
    d.tabVisitFromHistoryRef.current = true;
    d.commitTabVisit(next);
    d.activateTab(next.current);
  }, [d.activateTab, d.commitTabVisit]);

  const onOpenDiff = useCallback(
    (
      path?: string,
      session?: { sessionId: string; cwd: string },
      changeKind?: GitFileDiffKind,
    ) => {
      void (async () => {
        const diffCwd = session?.cwd ?? d.gitCwdRef.current;
        const resolved = path
          ? ((await resolveOpenablePath(diffCwd, path)) ?? path)
          : undefined;
        if (resolved) rememberOpenedFile(diffCwd, resolved);
        d.setTabs((prev) =>
          prev.map((tab) => {
            if (tab.id !== d.activeTabId) return tab;
            if (session) {
              return openSessionChangesTab(
                tab,
                session.cwd,
                session.sessionId,
                resolved,
              );
            }
            if (loadDiffViewer() === "unified") {
              return openChangesTab(
                tab,
                d.sidebarCwdRef.current,
                resolved,
                changeKind,
              );
            }
            if (!resolved) return tab;
            return openEditorTab(
              tab,
              newFileTab(resolved, d.sidebarCwdRef.current, true, changeKind),
            );
          }),
        );
        d.setSidebarTab("changes");
        d.setComposerFocused(false);
      })();
    },
    [d.activeTabId],
  );

  const onReorderTabs = useCallback(
    (ids: string[], movedId?: string) => {
      d.setTabs((prev) => {
        const visibleIds = new Set(ids);
        const visibleTabs = prev.filter((tab) => visibleIds.has(tab.id));
        if (movedId) {
          const reordered = applyGroupedReorder(
            visibleTabs,
            ids,
            movedId,
            d.projectOfTab,
          );
          return reordered ? mergeOrderedSubset(prev, reordered) : prev;
        }
        return mergeOrderedSubset(prev, orderByIds(visibleTabs, ids));
      });
    },
    [d.projectOfTab],
  );

  const onMovePane = useCallback(
    (fromId: string, toId: string, edge: PaneEdge) => {
      d.setTabs((prev) =>
        prev.map((tab) => {
          return leafIds(tab.layout).includes(fromId)
            ? {
                ...tab,
                layout: movePane(tab.layout, fromId, toId, edge),
                focusedId: fromId,
              }
            : tab;
        }),
      );
    },
    [],
  );

  return {
    onNext,
    onPrev,
    onVisitBack,
    onVisitForward,
    onOpenDiff,
    onReorderTabs,
    onMovePane,
  };
}