import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  closeLeaf,
  findSurfacePane,
  leafIds,
  splitPane,
  type SplitDir,
  type WorkspaceTab,
} from "../lib/layout";
import { newDefaultSession, type Session } from "../lib/session";
import {
  planWorkspaceTabClose,
  type WorkspaceTabCloseScope,
} from "../lib/workspaceTabGroups";

export type PaneManagementDeps = {
  activeTab: WorkspaceTab | undefined;
  activeTabId: string;
  activeTabIdRef: RefObject<string>;
  tabsRef: RefObject<WorkspaceTab[]>;
  sessionsRef: RefObject<Session[]>;
  projectCwd: string;
  sidebarCwd: string;
  tabCloseScope: WorkspaceTabCloseScope;
  sessionDefaults: Session | undefined;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setProjectTerminalFocused: Dispatch<SetStateAction<boolean>>;
  onCloseTab: (id: string, opts?: { confirmedTerminalIds?: string[] }) => void;
  onCloseTabs: (ids: string[], fallbackId: string) => void;
  onCloseFile: (paneId: string, fileId: string) => void;
  onClearTabSession: (id: string) => void;
  persistSession: (session: Session | undefined) => void;
  refreshHistory: (cwd: string) => Promise<void>;
};

export function usePaneManagement(deps: PaneManagementDeps) {
  const d = deps;

  const onSplit = useCallback(
    (dir: SplitDir) => {
      const activeTab = d.activeTab;
      if (!activeTab) return;
      const session = newDefaultSession(
        d.sessionDefaults?.cwd ?? d.projectCwd,
        d.sessionDefaults?.runtimeMode,
      );
      d.setSessions((prev) => [...prev, session]);
      d.setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== activeTab.id) return t;
          return {
            ...t,
            layout: splitPane(t.layout, t.focusedId, dir, session.id),
            focusedId: session.id,
          };
        }),
      );
      d.setComposerFocused(true);
    },
    [
      d.activeTab,
      d.projectCwd,
      d.sessionDefaults?.cwd,
      d.sessionDefaults?.runtimeMode,
    ],
  );

  const onCloseOtherTabs = useCallback(() => {
    const current = d.tabsRef.current;
    const activeId = d.activeTabIdRef.current;
    if (!current.some((tab) => tab.id === activeId)) return;
    d.onCloseTabs(
      current.filter((tab) => tab.id !== activeId).map((tab) => tab.id),
      activeId,
    );
  }, [d.onCloseTabs]);

  const onClosePane = useCallback(
    (sessionId?: string) => {
      // The project terminal is shared by every workspace tab in the project.
      // Keep the global close command scoped to workspace tabs and panes even
      // while the dock has focus; terminal tabs have their own close buttons.
      const activeTab = d.activeTab;
      if (!activeTab) return;
      const focusedSurface = findSurfacePane(activeTab, activeTab.focusedId);
      if (sessionId === undefined && focusedSurface) {
        d.onCloseFile(
          focusedSurface.pane.id,
          focusedSurface.pane.activeFileId,
        );
        return;
      }
      const closingId = sessionId ?? activeTab.focusedId;
      const ids = leafIds(activeTab.layout);
      const sessionIds = ids.filter((paneId) =>
        d.sessionsRef.current.some((session) => session.id === paneId),
      );
      if (!sessionIds.includes(closingId)) return;
      const nextTab = closeLeaf(activeTab, closingId);
      if (!nextTab) {
        const closePlan = planWorkspaceTabClose({
          tabs: d.tabsRef.current,
          sessions: d.sessionsRef.current,
          closingTabId: activeTab.id,
          scope: d.tabCloseScope,
        });
        if (closePlan.action === "keep")
          d.onClearTabSession(activeTab.id);
        else d.onCloseTab(activeTab.id);
        return;
      }
      d.persistSession(
        d.sessionsRef.current.find((s) => s.id === closingId),
      );
      d.setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? { ...t, layout: nextTab.layout, focusedId: nextTab.focusedId }
            : t,
        ),
      );
      if (closingId === activeTab.focusedId) {
        d.setComposerFocused(
          nextTab &&
            d.sessionsRef.current.some(
              (session) => session.id === nextTab.focusedId,
            ),
        );
      }
      void d.refreshHistory(d.sidebarCwd);
    },
    [
      d.activeTab,
      d.onCloseFile,
      d.onCloseTab,
      d.onClearTabSession,
      d.persistSession,
      d.refreshHistory,
      d.sidebarCwd,
      d.tabCloseScope,
    ],
  );

  const onFocusPane = useCallback(
    (paneId: string) => {
      d.setProjectTerminalFocused(false);
      d.setTabs((prev) =>
        prev.map((t) =>
          t.id === d.activeTabId
            ? { ...t, focusedId: paneId, diffFocused: false }
            : t,
        ),
      );
      d.setComposerFocused(
        d.sessionsRef.current.some((session) => session.id === paneId),
      );
    },
    [d.activeTabId],
  );

  return {
    onSplit,
    onCloseOtherTabs,
    onClosePane,
    onFocusPane,
  };
}