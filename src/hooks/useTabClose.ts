import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  findSurfacePane,
  firstLeafId,
  isFilesystemTab,
  leaf,
  leafIds,
  removePane,
  siblingLeafId,
  surfacePanes,
  withSurfacePanes,
  type WorkspaceTab,
} from "../lib/layout";
import {
  planWorkspaceTabClose,
  type WorkspaceTabCloseScope,
} from "../lib/workspaceTabGroups";
import {
  confirmCloseTerminal,
  confirmCloseTerminals,
} from "../lib/terminalClose";
import { killPty } from "../lib/pty";
import { newSession, type Session } from "../lib/session";
import { basename } from "../lib/fs";
import { confirmDiscardUnsaved } from "../lib/appConfirm";
import { isBlankWorkspaceTab } from "../lib/appTabs";

export type TabCloseDeps = {
  activeTabId: string;
  activeTabIdRef: RefObject<string>;
  activateTab: (id: string, paneId?: string) => void;
  dirtyFilesRef: RefObject<Set<string>>;
  persistSession: (session: Session | undefined) => void;
  projectCwd: string;
  refreshHistory: (cwd: string) => Promise<void>;
  sessionsRef: RefObject<Session[]>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setDirtyFiles: Dispatch<SetStateAction<Set<string>>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  sidebarCwd: string;
  tabCloseScope: WorkspaceTabCloseScope;
  tabs: WorkspaceTab[];
  tabsRef: RefObject<WorkspaceTab[]>;
};

export function useTabClose(deps: TabCloseDeps) {
  const d = deps;

  const onCloseTab = useCallback(
    (id: string, opts?: { confirmedTerminalIds?: string[] }) => {
      const current = d.tabsRef.current;
      const index = current.findIndex((t) => t.id === id);
      if (index < 0) return;
      const closePlan = planWorkspaceTabClose({
        tabs: current,
        sessions: d.sessionsRef.current,
        closingTabId: id,
        scope: d.tabCloseScope,
      });
      if (closePlan.action === "keep") return;
      const closing = current[index];
      const closingFiles = [
        ...closing.editorPanes.flatMap((pane) => pane.files),
        ...(closing.terminalPanes ?? []).flatMap((pane) => pane.files),
      ];
      const unsaved = closingFiles.filter(
        (file) => isFilesystemTab(file) && d.dirtyFilesRef.current.has(file.id),
      );
      const confirmed = new Set(opts?.confirmedTerminalIds ?? []);
      const terminals = closingFiles.filter(
        (file) => file.terminal && !confirmed.has(file.id),
      );

      const finishClose = () => {
        for (const file of closingFiles) {
          if (file.terminal) void killPty(file.id);
        }
        const nextActiveTabId = closePlan.nextActiveTabId;
        const next = current.filter((t) => t.id !== id);
        const gone = new Set(
          leafIds(closing.layout).filter((paneId) =>
            d.sessionsRef.current.some((session) => session.id === paneId),
          ),
        );
        for (const sessionId of gone) {
          d.persistSession(
            d.sessionsRef.current.find((s) => s.id === sessionId),
          );
        }
        d.setDirtyFiles((prev) => {
          const updated = new Set(prev);
          for (const file of closingFiles) updated.delete(file.id);
          return updated;
        });
        d.setTabs(next);
        if (id === d.activeTabIdRef.current && nextActiveTabId) {
          d.activateTab(nextActiveTabId);
        }
        void d.refreshHistory(d.sidebarCwd);
      };

      void (async () => {
        if (unsaved.length > 0) {
          const ok = await confirmDiscardUnsaved(
            "Close this tab with unsaved files?",
          );
          if (!ok) return;
        }
        if (terminals.length > 0) {
          const ok = await confirmCloseTerminals(terminals);
          if (!ok) return;
        }
        finishClose();
      })();
    },
    [
      d.activateTab,
      d.persistSession,
      d.refreshHistory,
      d.sidebarCwd,
      d.tabCloseScope,
    ],
  );

  const onCloseTabs = useCallback(
    (ids: string[], fallbackId: string) => {
      const current = d.tabsRef.current;
      const closingIds = new Set(ids);
      const closing = current.filter((tab) => closingIds.has(tab.id));
      const fallback = current.find(
        (tab) => tab.id === fallbackId && !closingIds.has(tab.id),
      );
      if (!fallback || closing.length === 0) return;

      const closingFiles = closing.flatMap((tab) => [
        ...tab.editorPanes.flatMap((pane) => pane.files),
        ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
      ]);
      const unsaved = closingFiles.filter(
        (file) => isFilesystemTab(file) && d.dirtyFilesRef.current.has(file.id),
      );
      const terminals = closingFiles.filter((file) => file.terminal);

      const finishClose = () => {
        for (const file of terminals) void killPty(file.id);
        const sessionIds = new Set(
          closing.flatMap((tab) =>
            leafIds(tab.layout).filter((paneId) =>
              d.sessionsRef.current.some((session) => session.id === paneId),
            ),
          ),
        );
        for (const sessionId of sessionIds) {
          d.persistSession(
            d.sessionsRef.current.find((session) => session.id === sessionId),
          );
        }
        d.setDirtyFiles((prev) => {
          const next = new Set(prev);
          for (const file of closingFiles) next.delete(file.id);
          return next;
        });
        d.setTabs((prev) => prev.filter((tab) => !closingIds.has(tab.id)));
        if (closingIds.has(d.activeTabIdRef.current)) d.activateTab(fallback.id);
        void d.refreshHistory(d.sidebarCwd);
      };

      void (async () => {
        if (unsaved.length > 0) {
          const ok = await confirmDiscardUnsaved(
            "Close these tabs with unsaved files?",
          );
          if (!ok) return;
        }
        if (terminals.length > 0) {
          const ok = await confirmCloseTerminals(terminals);
          if (!ok) return;
        }
        finishClose();
      })();
    },
    [d.activateTab, d.persistSession, d.refreshHistory, d.sidebarCwd],
  );

  const onCloseFile = useCallback(
    (paneId: string, fileId: string) => {
      const tab = d.tabsRef.current.find((entry) =>
        findSurfacePane(entry, paneId),
      );
      if (!tab) return;
      const found = findSurfacePane(tab, paneId);
      if (!found) return;
      const { kind, pane } = found;
      const index = pane.files.findIndex((file) => file.id === fileId);
      if (index < 0) return;
      const file = pane.files[index];
      const needsUnsavedConfirm =
        isFilesystemTab(file) && d.dirtyFilesRef.current.has(fileId);

      const finishClose = () => {
        const files = pane.files.filter((entry) => entry.id !== fileId);
        let nextFocus = tab.focusedId;
        let nextLayout = tab.layout;
        let nextPanes = surfacePanes(tab, kind);
        if (files.length > 0) {
          nextFocus = paneId;
          const activeFileId =
            pane.activeFileId === fileId
              ? files[Math.min(index, files.length - 1)].id
              : pane.activeFileId;
          nextPanes = nextPanes.map((entry) =>
            entry.id === paneId ? { ...entry, files, activeFileId } : entry,
          );
        } else {
          const sibling = siblingLeafId(tab.layout, paneId);
          const withoutPane = removePane(tab.layout, paneId);
          if (!withoutPane) {
            d.setDirtyFiles((prev) => {
              const next = new Set(prev);
              next.delete(fileId);
              return next;
            });
            const closePlan = planWorkspaceTabClose({
              tabs: d.tabsRef.current,
              sessions: d.sessionsRef.current,
              closingTabId: tab.id,
              scope: d.tabCloseScope,
            });
            if (closePlan.action === "close") {
              onCloseTab(
                tab.id,
                file.terminal ? { confirmedTerminalIds: [fileId] } : undefined,
              );
              return;
            }
            const seed = d.sessionsRef.current[0];
            const session = newSession(
              seed?.harness ?? "claude",
              file.cwd || d.projectCwd,
              seed?.model,
              seed?.runtimeMode,
              seed?.modelSettings,
            );
            d.setSessions((prev) => [...prev, session]);
            d.setTabs((prev) =>
              prev.map((entry) =>
                entry.id === tab.id
                  ? {
                      ...entry,
                      layout: leaf(session.id),
                      focusedId: session.id,
                      editorPanes: [],
                      terminalPanes: [],
                      diffOpen: false,
                      diffFocused: false,
                    }
                  : entry,
              ),
            );
            d.setComposerFocused(true);
            return;
          }
          nextLayout = withoutPane;
          nextFocus =
            tab.focusedId === paneId
              ? (sibling ?? firstLeafId(withoutPane))
              : tab.focusedId;
          nextPanes = nextPanes.filter((entry) => entry.id !== paneId);
        }

        d.setTabs((prev) =>
          prev.map((entry) =>
            entry.id === tab.id
              ? withSurfacePanes(
                  {
                    ...entry,
                    layout: nextLayout,
                    focusedId: nextFocus,
                  },
                  kind,
                  nextPanes,
                )
              : entry,
          ),
        );
        d.setDirtyFiles((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
        if (tab.id === d.activeTabId && files.length === 0) {
          d.setComposerFocused(
            d.sessionsRef.current.some((session) => session.id === nextFocus),
          );
        }
      };

      void (async () => {
        if (needsUnsavedConfirm) {
          const ok = await confirmDiscardUnsaved(
            `Close ${basename(file.path)} without saving?`,
          );
          if (!ok) return;
        }
        if (file.terminal) {
          const ok = await confirmCloseTerminal(file);
          if (!ok) return;
          void killPty(file.id);
        }
        finishClose();
      })();
    },
    [d.activeTabId, onCloseTab, d.projectCwd, d.tabCloseScope],
  );

  const onCloseOtherFiles = useCallback((paneId: string, fileId: string) => {
    const tab = d.tabsRef.current.find((entry) => findSurfacePane(entry, paneId));
    if (!tab) return;
    const found = findSurfacePane(tab, paneId);
    if (!found?.pane.files.some((file) => file.id === fileId)) return;
    const closingFiles = found.pane.files.filter((file) => file.id !== fileId);
    if (closingFiles.length === 0) return;
    const closingIds = new Set(closingFiles.map((file) => file.id));
    const unsaved = closingFiles.filter(
      (file) => isFilesystemTab(file) && d.dirtyFilesRef.current.has(file.id),
    );
    const terminals = closingFiles.filter((file) => file.terminal);

    const finishClose = () => {
      d.setTabs((prev) =>
        prev.map((entry) => {
          if (entry.id !== tab.id) return entry;
          const current = findSurfacePane(entry, paneId);
          if (!current?.pane.files.some((file) => file.id === fileId)) {
            return entry;
          }
          return withSurfacePanes(
            { ...entry, focusedId: paneId },
            current.kind,
            surfacePanes(entry, current.kind).map((pane) =>
              pane.id === paneId
                ? {
                    ...pane,
                    files: pane.files.filter(
                      (file) => !closingIds.has(file.id),
                    ),
                    activeFileId: fileId,
                  }
                : pane,
            ),
          );
        }),
      );
      d.setDirtyFiles((prev) => {
        const next = new Set(prev);
        for (const id of closingIds) next.delete(id);
        return next;
      });
    };

    void (async () => {
      if (unsaved.length > 0) {
        const ok = await confirmDiscardUnsaved(
          "Close other tabs with unsaved files?",
        );
        if (!ok) return;
      }
      if (terminals.length > 0) {
        const ok = await confirmCloseTerminals(terminals);
        if (!ok) return;
        for (const file of terminals) void killPty(file.id);
      }
      finishClose();
    })();
  }, []);

  const onClearTabSession = useCallback(
    (id: string) => {
      const tab = d.tabs.find((entry) => entry.id === id);
      if (!tab || isBlankWorkspaceTab(tab, d.sessionsRef.current)) return;

      const closingFiles = [
        ...tab.editorPanes.flatMap((pane) => pane.files),
        ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
      ];
      const unsaved = closingFiles.filter(
        (file) => isFilesystemTab(file) && d.dirtyFilesRef.current.has(file.id),
      );

      const oldSessionId = leafIds(tab.layout).find((paneId) =>
        d.sessionsRef.current.some((session) => session.id === paneId),
      );
      const oldSession = d.sessionsRef.current.find(
        (session) => session.id === oldSessionId,
      );
      if (!oldSession) return;

      const finishClear = () => {
        for (const file of closingFiles) {
          if (file.terminal) void killPty(file.id);
        }
        d.persistSession(oldSession);

        const session = newSession(
          oldSession.harness,
          oldSession.cwd,
          oldSession.model,
          oldSession.runtimeMode,
          oldSession.modelSettings,
        );

        d.setSessions((prev) => [...prev, session]);
        d.setDirtyFiles((prev) => {
          const updated = new Set(prev);
          for (const file of closingFiles) updated.delete(file.id);
          return updated;
        });
        d.setTabs((prev) =>
          prev.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  layout: leaf(session.id),
                  focusedId: session.id,
                  editorPanes: [],
                  terminalPanes: [],
                  diffOpen: false,
                  diffFocused: false,
                }
              : entry,
          ),
        );
        d.setComposerFocused(true);
        void d.refreshHistory(d.sidebarCwd);
      };

      if (unsaved.length === 0) {
        finishClear();
        return;
      }
      void confirmDiscardUnsaved(
        "Close this conversation with unsaved files?",
      ).then((ok) => ok && finishClear());
    },
    [d.tabs, d.persistSession, d.refreshHistory, d.sidebarCwd],
  );

  return {
    onCloseTab,
    onCloseTabs,
    onCloseFile,
    onCloseOtherFiles,
    onClearTabSession,
  };
}