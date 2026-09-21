import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  addTerminalToDock,
  closeTerminalInDock,
  createProjectTerminal,
  findProjectTerminal,
  mapProjectTerminal,
  nextDockTerminalTitle,
  patchProjectTerminals,
  reorderDockTerminals,
  selectDockTerminal,
  withDockOpen,
  withDockSide,
  withDockSize,
  type DockSide,
  type ProjectTerminalDock,
} from "../lib/projectTerminal";
import {
  newTerminalFile,
  newTerminalWorkspaceTab,
  nextTerminalTitle,
  openTerminalTab,
  updateTerminalTab,
  withSurfacePanes,
  type WorkspaceTab,
} from "../lib/layout";
import { orderByIds } from "../lib/reorder";
import { type Session, sessionWorkCwd } from "../lib/session";
import { isBlankSession } from "../lib/projectReturn";
import { forgetHarnessSession } from "../lib/harness";
import { killPty } from "../lib/pty";
import {
  confirmCloseTerminal,
  confirmCloseTerminals,
} from "../lib/terminalClose";
import { type TerminalMetaPatch } from "../lib/terminalTab";

export type ProjectTerminalDeps = {
  active: Session | undefined;
  activeTab: WorkspaceTab | null;
  projectCwd: string;
  projectCwdRef: RefObject<string>;
  projectTerminalsRef: RefObject<ProjectTerminalDock[]>;
  sessionsRef: RefObject<Session[]>;
  tabsRef: RefObject<WorkspaceTab[]>;
  activeTabIdRef: RefObject<string>;
  lastPersisted: RefObject<Map<string, string>>;
  setProjectTerminals: Dispatch<SetStateAction<ProjectTerminalDock[]>>;
  setProjectTerminalFocused: Dispatch<SetStateAction<boolean>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  appendTab: (tab: WorkspaceTab, cwd?: string) => void;
  looksLikeProject: (path: string) => boolean;
};

export function useProjectTerminal(deps: ProjectTerminalDeps) {
  const d = deps;

  const focusProjectTerminal = useCallback(() => {
    d.setProjectTerminalFocused(true);
    d.setComposerFocused(false);
  }, [d.setProjectTerminalFocused, d.setComposerFocused]);

  const openProjectTerminal = useCallback(
    (cwd: string) => {
      const workdir = cwd || d.projectCwdRef.current;
      const projectPath = d.projectCwdRef.current;
      if (!d.looksLikeProject(projectPath)) return false;
      d.setProjectTerminals((prev) => {
        const existing = findProjectTerminal(prev, projectPath);
        const file = newTerminalFile(
          workdir,
          existing ? nextDockTerminalTitle(existing, workdir) : undefined,
        );
        if (!existing) {
          return [...prev, createProjectTerminal(projectPath, file)];
        }
        return mapProjectTerminal(prev, projectPath, (dock) =>
          addTerminalToDock(dock, file),
        );
      });
      focusProjectTerminal();
      return true;
    },
    [
      d.projectCwdRef,
      d.looksLikeProject,
      d.setProjectTerminals,
      focusProjectTerminal,
    ],
  );

  const onOpenTerminal = useCallback(
    (cwd: string, asWorkspaceTab = false, occupySessionId?: string) => {
      const workdir = cwd || d.active?.cwd || d.projectCwd;
      if (openProjectTerminal(workdir)) return;

      if (asWorkspaceTab || !d.activeTab) {
        const file = newTerminalFile(workdir);
        const tab = newTerminalWorkspaceTab(file);
        d.appendTab(tab, workdir);
        d.setActiveTabId(tab.id);
        d.setComposerFocused(false);
        return;
      }
      const activeTab = d.activeTab;

      const occupying = d.sessionsRef.current.find(
        (session) => session.id === (occupySessionId ?? activeTab.focusedId),
      );
      const occupyPaneId =
        occupying && isBlankSession(occupying) ? occupying.id : undefined;
      if (occupyPaneId && occupying) {
        d.lastPersisted.current.delete(occupyPaneId);
        void forgetHarnessSession(occupying.harness, occupyPaneId);
        d.setSessions((prev) =>
          prev.filter((session) => session.id !== occupyPaneId),
        );
      }

      const file = newTerminalFile(workdir, nextTerminalTitle(activeTab, workdir));
      d.setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id
            ? openTerminalTab(tab, file, occupyPaneId)
            : tab,
        ),
      );
      d.setComposerFocused(false);
    },
    [
      d.active?.cwd,
      d.activeTab,
      d.appendTab,
      openProjectTerminal,
      d.projectCwd,
      d.sessionsRef,
      d.lastPersisted,
      d.setSessions,
      d.setTabs,
      d.setActiveTabId,
      d.setComposerFocused,
    ],
  );

  const onNewTerminal = useCallback(() => {
    onOpenTerminal(d.active?.cwd ?? d.projectCwd);
  }, [d.active?.cwd, onOpenTerminal, d.projectCwd]);

  const onShowProjectTerminal = useCallback(() => {
    const dock = findProjectTerminal(d.projectTerminalsRef.current, d.projectCwd);
    if (dock && dock.pane.files.length > 0) {
      if (!dock.open) {
        d.setProjectTerminals((prev) =>
          mapProjectTerminal(prev, d.projectCwd, (entry) =>
            withDockOpen(entry, true),
          ),
        );
      }
      focusProjectTerminal();
      return;
    }
    onOpenTerminal(d.active?.cwd ?? d.projectCwd);
  }, [
    d.active?.cwd,
    d.projectCwd,
    d.projectTerminalsRef,
    d.setProjectTerminals,
    focusProjectTerminal,
    onOpenTerminal,
  ]);

  const onNewTerminalInSession = useCallback(
    (sessionId: string) => {
      const session = d.sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      onOpenTerminal(
        session ? sessionWorkCwd(session) : d.projectCwd,
        false,
        sessionId,
      );
    },
    [d.sessionsRef, onOpenTerminal, d.projectCwd],
  );

  const onToggleProjectTerminal = useCallback(() => {
    if (!d.looksLikeProject(d.projectCwd)) return;
    const dock = findProjectTerminal(d.projectTerminalsRef.current, d.projectCwd);
    if (!dock) {
      openProjectTerminal(d.active?.cwd ?? d.projectCwd);
      return;
    }
    const nextOpen = !dock.open;
    d.setProjectTerminals((prev) =>
      mapProjectTerminal(prev, d.projectCwd, (entry) =>
        withDockOpen(entry, nextOpen),
      ),
    );
    if (nextOpen) focusProjectTerminal();
    else d.setProjectTerminalFocused(false);
  }, [
    d.active?.cwd,
    d.projectCwd,
    d.looksLikeProject,
    d.projectTerminalsRef,
    d.setProjectTerminals,
    d.setProjectTerminalFocused,
    focusProjectTerminal,
    openProjectTerminal,
  ]);

  const onHideProjectTerminal = useCallback(() => {
    d.setProjectTerminals((prev) =>
      mapProjectTerminal(prev, d.projectCwdRef.current, (dock) =>
        withDockOpen(dock, false),
      ),
    );
    d.setProjectTerminalFocused(false);
  }, [d.projectCwdRef, d.setProjectTerminals, d.setProjectTerminalFocused]);

  const onProjectTerminalSide = useCallback((side: DockSide) => {
    d.setProjectTerminals((prev) =>
      mapProjectTerminal(prev, d.projectCwdRef.current, (dock) =>
        withDockSide(dock, side, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      ),
    );
  }, [d.projectCwdRef, d.setProjectTerminals]);

  const onProjectTerminalSize = useCallback((size: number) => {
    d.setProjectTerminals((prev) =>
      mapProjectTerminal(prev, d.projectCwdRef.current, (dock) =>
        withDockSize(dock, size, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      ),
    );
  }, [d.projectCwdRef, d.setProjectTerminals]);

  const onSelectProjectTerminal = useCallback(
    (fileId: string) => {
      d.setProjectTerminals((prev) =>
        mapProjectTerminal(prev, d.projectCwdRef.current, (dock) =>
          selectDockTerminal(dock, fileId),
        ),
      );
      focusProjectTerminal();
    },
    [d.projectCwdRef, d.setProjectTerminals, focusProjectTerminal],
  );

  const onReorderProjectTerminals = useCallback((ids: string[]) => {
    d.setProjectTerminals((prev) =>
      mapProjectTerminal(prev, d.projectCwdRef.current, (dock) =>
        reorderDockTerminals(dock, orderByIds(dock.pane.files, ids)),
      ),
    );
  }, [d.projectCwdRef, d.setProjectTerminals]);

  const onCloseProjectTerminal = useCallback((fileId: string) => {
    const dock = findProjectTerminal(
      d.projectTerminalsRef.current,
      d.projectCwdRef.current,
    );
    const file = dock?.pane.files.find((entry) => entry.id === fileId);
    if (!file) return;
    const finishClose = () => {
      void killPty(fileId);
      d.setProjectTerminals((prev) =>
        mapProjectTerminal(prev, d.projectCwdRef.current, (entry) =>
          closeTerminalInDock(entry, fileId),
        ),
      );
    };
    void confirmCloseTerminal(file).then((ok) => ok && finishClose());
  }, [d.projectTerminalsRef, d.projectCwdRef, d.setProjectTerminals]);

  const onCloseOtherProjectTerminals = useCallback((fileId: string) => {
    const projectPath = d.projectCwdRef.current;
    const dock = findProjectTerminal(d.projectTerminalsRef.current, projectPath);
    if (!dock?.pane.files.some((file) => file.id === fileId)) return;
    const closingFiles = dock.pane.files.filter((file) => file.id !== fileId);
    if (closingFiles.length === 0) return;
    const closingIds = new Set(closingFiles.map((file) => file.id));

    const finishClose = () => {
      for (const id of closingIds) void killPty(id);
      d.setProjectTerminals((prev) =>
        mapProjectTerminal(prev, projectPath, (entry) => {
          if (!entry.pane.files.some((file) => file.id === fileId)) {
            return entry;
          }
          const files = entry.pane.files.filter(
            (file) => !closingIds.has(file.id),
          );
          return {
            ...entry,
            pane: { ...entry.pane, files, activeFileId: fileId },
          };
        }),
      );
    };

    void confirmCloseTerminals(closingFiles).then((ok) => ok && finishClose());
  }, [d.projectTerminalsRef, d.projectCwdRef, d.setProjectTerminals]);

  const onTerminalMetaChange = useCallback(
    (fileId: string, patch: TerminalMetaPatch) => {
      d.setProjectTerminals((prev) =>
        patchProjectTerminals(prev, fileId, patch),
      );
      d.setTabs((prev) =>
        prev.map((tab) => updateTerminalTab(tab, fileId, patch)),
      );
    },
    [d.setProjectTerminals, d.setTabs],
  );

  const onToggleRunningTerminal = useCallback(
    (fileId: string) => {
      const dock = d.projectTerminalsRef.current.find((entry) =>
        entry.pane.files.some((file) => file.id === fileId),
      );
      if (dock) {
        if (dock.open) {
          d.setProjectTerminals((prev) =>
            mapProjectTerminal(prev, dock.projectPath, (entry) =>
              withDockOpen(entry, false),
            ),
          );
          d.setProjectTerminalFocused(false);
          return;
        }
        d.setProjectTerminals((prev) =>
          mapProjectTerminal(prev, dock.projectPath, (entry) =>
            withDockOpen(selectDockTerminal(entry, fileId), true),
          ),
        );
        focusProjectTerminal();
        return;
      }
      for (const tab of d.tabsRef.current) {
        for (const pane of tab.terminalPanes ?? []) {
          if (!pane.files.some((file) => file.id === fileId)) continue;
          const showing =
            d.activeTabIdRef.current === tab.id &&
            tab.focusedId === pane.id &&
            pane.activeFileId === fileId;
          if (showing) {
            d.setComposerFocused(true);
            d.setProjectTerminalFocused(false);
            return;
          }
          d.setActiveTabId(tab.id);
          d.setTabs((prev) =>
            prev.map((entry) => {
              if (entry.id !== tab.id) return entry;
              return withSurfacePanes(
                { ...entry, focusedId: pane.id },
                "terminal",
                (entry.terminalPanes ?? []).map((item) =>
                  item.id === pane.id
                    ? { ...item, activeFileId: fileId }
                    : item,
                ),
              );
            }),
          );
          d.setProjectTerminalFocused(false);
          d.setComposerFocused(false);
          return;
        }
      }
    },
    [
      d.projectTerminalsRef,
      d.setProjectTerminals,
      d.setProjectTerminalFocused,
      d.tabsRef,
      d.activeTabIdRef,
      d.setActiveTabId,
      d.setTabs,
      d.setComposerFocused,
      focusProjectTerminal,
    ],
  );

  const onNewTerminalTab = useCallback(() => {
    onOpenTerminal(d.active?.cwd ?? d.projectCwd, true);
  }, [d.active?.cwd, onOpenTerminal, d.projectCwd]);

  return {
    focusProjectTerminal,
    openProjectTerminal,
    onOpenTerminal,
    onNewTerminal,
    onShowProjectTerminal,
    onNewTerminalInSession,
    onToggleProjectTerminal,
    onHideProjectTerminal,
    onProjectTerminalSide,
    onProjectTerminalSize,
    onSelectProjectTerminal,
    onReorderProjectTerminals,
    onCloseProjectTerminal,
    onCloseOtherProjectTerminals,
    onTerminalMetaChange,
    onToggleRunningTerminal,
    onNewTerminalTab,
  };
}