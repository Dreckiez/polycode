import { message } from "@tauri-apps/plugin-dialog";
import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  newDefaultSession,
  newSession,
  sessionDisplayTitle,
  sessionWorkCwd,
  type HarnessId,
  type Session,
} from "../lib/session";
import {
  isFilesystemTab,
  newTab,
  type WorkspaceTab,
} from "../lib/layout";
import { restoreSessionCheckout } from "../lib/fs";
import {
  bindHarnessSession,
  forgetHarnessSession,
  isLiveHarness,
} from "../lib/harness";
import {
  deleteSession,
  getSession,
  persistFingerprint,
  setSessionArchived,
  setSessionPinned,
  shouldPersistSession,
  upsertSession,
  type SessionSummary,
} from "../lib/sessionStore";
import { flushSessionCheckpoint } from "../lib/checkpoint";
import { runSessionRemoval } from "../lib/sessionRemoval";
import { filesInWorkspaceTabs } from "../lib/appTabs";
import { confirmDiscardUnsaved } from "../lib/appConfirm";
import { confirmCloseTerminals } from "../lib/terminalClose";
import {
  mergeHistorySummary,
  mergeProjectHistorySummary,
  summaryFromSession,
} from "../lib/sessionHistory";
import { sessionChildHarnesses } from "../lib/handoff";
import { type WorkspaceTabCloseScope } from "../lib/workspaceTabGroups";

export type SessionLifecycleDeps = {
  active: Session | undefined;
  sessionDefaults: Session | undefined;
  projectCwd: string;
  sidebarCwd: string;
  history: SessionSummary[];
  appendTab: (tab: WorkspaceTab, cwd?: string) => void;
  focusOpenSession: (sessionId: string) => boolean;
  replaceBlankPaneWithSession: (session: Session) => boolean;
  refreshHistory: (cwd: string) => Promise<void>;
  stopSessionForRemoval: (sessionId: string) => Promise<Session | undefined>;
  activateTab: (id: string, paneId?: string) => void;
  tabCloseScope: WorkspaceTabCloseScope;
  sessionsRef: RefObject<Session[]>;
  tabsRef: RefObject<WorkspaceTab[]>;
  activeTabIdRef: RefObject<string>;
  dirtyFilesRef: RefObject<Set<string>>;
  lastPersisted: RefObject<Map<string, string>>;
  pendingPersist: RefObject<Map<string, Session>>;
  removingSessionIds: RefObject<Set<string>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setSearchViewOpen: Dispatch<SetStateAction<boolean>>;
  setNotesViewOpen: Dispatch<SetStateAction<boolean>>;
  setDirtyFiles: Dispatch<SetStateAction<Set<string>>>;
  setHistory: Dispatch<SetStateAction<SessionSummary[]>>;
};

export function useSessionLifecycle(deps: SessionLifecycleDeps) {
  const d = deps;

  const onNew = useCallback(() => {
    d.setSearchViewOpen(false);
    d.setNotesViewOpen(false);
    const cwd = d.active?.cwd ?? d.sessionDefaults?.cwd ?? d.projectCwd;
    const session = newDefaultSession(cwd, d.sessionDefaults?.runtimeMode);
    const tab = newTab(session.id);
    d.setSessions((prev) => [...prev, session]);
    d.appendTab(tab, cwd);
    d.setActiveTabId(tab.id);
    d.setComposerFocused(true);
    return session.id;
  }, [
    d.active?.cwd,
    d.appendTab,
    d.sessionDefaults?.cwd,
    d.sessionDefaults?.runtimeMode,
    d.projectCwd,
  ]);

  const ensureOpenSession = useCallback(
    async (sessionId: string): Promise<Session | null> => {
      const open = d.sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (open) return open;

      const loaded = await getSession(sessionId).catch(() => null);
      if (!loaded) {
        void d.refreshHistory(d.sidebarCwd);
        return null;
      }
      const restored = restoreSessionCheckout(loaded);
      if (restored.providerSessionId && isLiveHarness(restored.harness)) {
        bindHarnessSession(
          restored.harness,
          restored.id,
          restored.providerSessionId,
          sessionWorkCwd(restored),
          restored.providerAccountId,
        );
      }
      d.lastPersisted.current.set(restored.id, persistFingerprint(restored));
      if (!d.sessionsRef.current.some((session) => session.id === restored.id)) {
        const next = [...d.sessionsRef.current, restored];
        d.sessionsRef.current = next;
        d.setSessions(next);
      }
      return restored;
    },
    [d.refreshHistory, d.sidebarCwd],
  );

  const onSelectHistorySession = useCallback(
    async (sessionId: string) => {
      if (d.focusOpenSession(sessionId)) return;
      const session = await ensureOpenSession(sessionId);
      if (!session) return;
      if (d.replaceBlankPaneWithSession(session)) return;
      const tab = newTab(session.id);
      d.appendTab(tab, session.cwd);
      d.setActiveTabId(tab.id);
      d.setComposerFocused(true);
    },
    [
      d.appendTab,
      ensureOpenSession,
      d.focusOpenSession,
      d.replaceBlankPaneWithSession,
    ],
  );

  const onRemoveHistorySession = useCallback(
    async (
      sessionId: string,
      mode: "archive" | "delete",
      skipDeleteConfirm = false,
    ): Promise<boolean> => {
      if (d.removingSessionIds.current.has(sessionId)) return false;
      const open = d.sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      const summary = d.history.find((entry) => entry.id === sessionId);
      const seed = open ?? summary;
      const label = seed
        ? sessionDisplayTitle(seed.title, seed.harness)
        : "this session";
      if (
        mode === "delete" &&
        !skipDeleteConfirm &&
        !window.confirm(`Delete “${label}”?`)
      )
        return false;

      d.removingSessionIds.current.add(sessionId);
      d.pendingPersist.current.delete(sessionId);
      let savedSummary: SessionSummary | undefined;
      try {
        return await runSessionRemoval({
          sessionId,
          scope: d.tabCloseScope,
          readWorkspace: () => ({
            tabs: d.tabsRef.current,
            sessions: d.sessionsRef.current,
            activeTabId: d.activeTabIdRef.current,
            dirtyFiles: d.dirtyFilesRef.current,
          }),
          createReplacement: (latest) =>
            newSession(
              latest?.harness ?? seed?.harness ?? "cursor",
              latest?.cwd ?? seed?.cwd ?? d.sidebarCwd,
              latest?.model ?? seed?.model,
              latest?.runtimeMode ?? seed?.runtimeMode,
              latest?.modelSettings ?? open?.modelSettings,
            ),
          confirmClose: async (closedTabs) => {
            const files = filesInWorkspaceTabs(closedTabs);
            const unsaved = files.some(
              (file) =>
                isFilesystemTab(file) && d.dirtyFilesRef.current.has(file.id),
            );
            if (
              unsaved &&
              !(await confirmDiscardUnsaved(
                `${mode === "archive" ? "Archive" : "Delete"} this conversation with unsaved files?`,
              ))
            )
              return false;
            const terminals = files.filter((file) => file.terminal);
            return (
              terminals.length === 0 || (await confirmCloseTerminals(terminals))
            );
          },
          stop: async () => {
            await d.stopSessionForRemoval(sessionId);
          },
          updateSession: (stopped) => {
            const next = d.sessionsRef.current.map((session) =>
              session.id === sessionId ? stopped : session,
            );
            d.sessionsRef.current = next;
            d.setSessions(next);
          },
          persist: async (latest) => {
            if (latest) await flushSessionCheckpoint(sessionId);
            if (mode === "delete") {
              await deleteSession(sessionId);
              return;
            }
            if (latest && shouldPersistSession(latest)) {
              const saved = await upsertSession(latest);
              if (!saved)
                throw new Error("The conversation could not be saved.");
              savedSummary = saved;
            }
            await setSessionArchived(sessionId, true);
          },
          commit: (removal) => {
            const latest = d.sessionsRef.current.find(
              (session) => session.id === sessionId,
            );
            const harnesses: HarnessId[] = latest
              ? sessionChildHarnesses(latest)
              : [seed?.harness ?? "cursor"];
            for (const harness of harnesses) {
              void forgetHarnessSession(harness, sessionId);
            }
            d.lastPersisted.current.delete(sessionId);
            d.pendingPersist.current.delete(sessionId);
            const closingFiles = filesInWorkspaceTabs(removal.closedTabs);
            d.setDirtyFiles((current) => {
              const next = new Set(current);
              for (const file of closingFiles) next.delete(file.id);
              return next;
            });
            d.sessionsRef.current = removal.sessions;
            d.tabsRef.current = removal.tabs;
            d.setSessions(removal.sessions);
            d.setTabs(removal.tabs);
            if (removal.activeTabId !== d.activeTabIdRef.current) {
              d.activateTab(removal.activeTabId);
            }
            const activeTab = removal.tabs.find(
              (tab) => tab.id === removal.activeTabId,
            );
            d.setComposerFocused(
              removal.sessions.some(
                (session) => session.id === activeTab?.focusedId,
              ),
            );
            if (mode === "archive") {
              const archived =
                savedSummary ??
                summary ??
                (latest && summaryFromSession(latest));
              if (archived) {
                d.setHistory((current) =>
                  mergeHistorySummary(current, { ...archived, archived: true }),
                );
              }
            } else {
              d.setHistory((current) =>
                current.filter((entry) => entry.id !== sessionId),
              );
              void d.refreshHistory(d.sidebarCwd);
            }
          },
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void message(`Could not ${mode} this conversation.\n\n${detail}`, {
          title: "MonoCode",
          kind: "error",
        });
        return false;
      } finally {
        d.removingSessionIds.current.delete(sessionId);
      }
    },
    [
      d.activateTab,
      d.history,
      d.refreshHistory,
      d.sidebarCwd,
      d.stopSessionForRemoval,
      d.tabCloseScope,
    ],
  );

  const onArchiveHistorySession = useCallback(
    async (sessionId: string, archived: boolean) => {
      if (archived) return onRemoveHistorySession(sessionId, "archive");
      if (d.removingSessionIds.current.has(sessionId)) return false;
      try {
        await setSessionArchived(sessionId, false);
        d.setHistory((current) =>
          current.map((entry) =>
            entry.id === sessionId ? { ...entry, archived: false } : entry,
          ),
        );
        return true;
      } catch (error) {
        void message(
          `Could not unarchive this conversation.\n\n${String(error)}`,
          {
            title: "MonoCode",
            kind: "error",
          },
        );
        return false;
      }
    },
    [onRemoveHistorySession],
  );

  const onPinHistorySession = useCallback(
    async (sessionId: string, pinned: boolean) => {
      const open = d.sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (open && shouldPersistSession(open)) {
        await upsertSession(open).catch(() => undefined);
      }
      await setSessionPinned(sessionId, pinned).catch(() => undefined);
      d.setHistory((current) => {
        const existing = current.find((entry) => entry.id === sessionId);
        if (existing) {
          return mergeProjectHistorySummary(current, { ...existing, pinned });
        }
        if (!open) return current;
        return mergeProjectHistorySummary(current, {
          ...summaryFromSession(open),
          pinned,
        });
      });
    },
    [],
  );

  return {
    onNew,
    ensureOpenSession,
    onSelectHistorySession,
    onRemoveHistorySession,
    onArchiveHistorySession,
    onPinHistorySession,
  };
}