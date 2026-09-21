import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  archiveProject,
  forgetProject,
  looksLikeProject,
  normalizeProjectPath,
  rememberProject,
  sameProjectPath,
  type RecentProject,
} from "../lib/recents";
import {
  newDefaultSession,
  newSession,
  type Session,
} from "../lib/session";
import {
  leafIds,
  newTab,
  type WorkspaceTab,
} from "../lib/layout";
import {
  isBlankSession,
  planProjectReturn,
  type ProjectReturnMemory,
} from "../lib/projectReturn";
import {
  keepSessionChanges,
  notifyReviewChanged,
} from "../lib/checkpoint";
import { projectName } from "../lib/paths";
import {
  removeTabFromGroup,
  tabGroupProject,
} from "../lib/tabGroups";
import { filterTabsForProject } from "../lib/workspaceTabGroups";
import { sessionChildHarnesses } from "../lib/handoff";
import {
  cancelHarnessTurn,
  forgetHarnessSession,
} from "../lib/harness";
import { removeProjectData } from "../lib/projectData";
import { type ProjectTerminalDock } from "../lib/projectTerminal";

export type ProjectNavigationDeps = {
  sessionsRef: RefObject<Session[]>;
  tabsRef: RefObject<WorkspaceTab[]>;
  activeTabIdRef: RefObject<string>;
  projectCwdRef: RefObject<string>;
  turnGen: RefObject<Map<string, number>>;
  lastPersisted: RefObject<Map<string, string>>;
  pendingPersist: RefObject<Map<string, Session>>;
  activeTabId: string;
  appendTab: (tab: WorkspaceTab, cwd?: string) => void;
  activateTab: (id: string, paneId?: string) => void;
  readProjectReturnMemory: () => ProjectReturnMemory;
  persistSession: (session: Session | undefined) => void;
  projectOfTab: (id: string) => string | undefined;
  setProjectCwd: Dispatch<SetStateAction<string>>;
  setRecents: Dispatch<SetStateAction<RecentProject[]>>;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  setActiveTabId: Dispatch<SetStateAction<string>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setSearchViewOpen: Dispatch<SetStateAction<boolean>>;
  setNotesViewOpen: Dispatch<SetStateAction<boolean>>;
  setDirtyFiles: Dispatch<SetStateAction<Set<string>>>;
  setProjectTerminals: Dispatch<SetStateAction<ProjectTerminalDock[]>>;
};

export function useProjectNavigation(deps: ProjectNavigationDeps) {
  const d = deps;

  const onCwdChange = useCallback(
    (sessionId: string, cwd: string) => {
      const normalized = normalizeProjectPath(cwd);
      const current = d.sessionsRef.current.find((s) => s.id === sessionId);
      const previous = current?.cwd;
      // Threads stay bound to their project. Switching from the composer opens a
      // new tab instead of retargeting the conversation.
      if (
        current &&
        previous &&
        looksLikeProject(previous) &&
        !sameProjectPath(previous, normalized) &&
        !isBlankSession(current)
      ) {
        d.setProjectCwd(normalized);
        d.setRecents(rememberProject(normalized));
        const session = newSession(
          current.harness,
          normalized,
          current.model,
          current.runtimeMode,
          current.modelSettings,
        );
        const tab = newTab(session.id);
        d.setSessions((prev) => [...prev, session]);
        d.appendTab(tab, normalized);
        d.setActiveTabId(tab.id);
        d.setComposerFocused(true);
        return;
      }
      if (
        previous &&
        !sameProjectPath(previous, normalized) &&
        previous !== "~"
      ) {
        void keepSessionChanges(sessionId, previous).catch(() => undefined);
      }
      d.setProjectCwd(normalized);
      d.setRecents(rememberProject(normalized));
      d.setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                cwd: normalized,
                branch: undefined,
                worktreeCwd: undefined,
              }
            : s,
        ),
      );
      // The session's project just moved in place; a group only holds tabs that
      // share one project, so drop this tab out if it no longer matches.
      d.setTabs((prev) => {
        const tab = prev.find((t) => leafIds(t.layout).includes(sessionId));
        // The tab's visible project follows its focused pane; a background
        // pane changing project doesn't change what the group check should see.
        if (!tab?.groupId || tab.focusedId !== sessionId) return prev;
        const newProject = projectName(normalized);
        const othersProject = tabGroupProject(
          prev.filter((t) => t.id !== tab.id),
          tab.groupId,
          d.projectOfTab,
        );
        if (othersProject && newProject && othersProject !== newProject) {
          return removeTabFromGroup(prev, tab.id);
        }
        return prev;
      });
      notifyReviewChanged(sessionId);
    },
    [d.appendTab, d.projectOfTab],
  );

  const onSelectProject = useCallback(
    (path: string) => {
      d.setSearchViewOpen(false);
      d.setNotesViewOpen(false);
      const normalized = normalizeProjectPath(path);
      if (!looksLikeProject(normalized)) return;

      const activeWorkspace = d.tabsRef.current.find(
        (entry) => entry.id === d.activeTabIdRef.current,
      );
      const current = activeWorkspace
        ? d.sessionsRef.current.find(
            (session) => session.id === activeWorkspace.focusedId,
          )
        : undefined;
      const decision = planProjectReturn({
        memory: d.readProjectReturnMemory(),
        tabs: d.tabsRef.current,
        sessions: d.sessionsRef.current,
        activeTabId: d.activeTabIdRef.current,
        projectPath: normalized,
      });
      switch (decision.action) {
        case "keep":
          d.setProjectCwd(normalized);
          d.setRecents(rememberProject(normalized));
          return;
        case "reuse-blank":
          onCwdChange(decision.sessionId, normalized);
          return;
        case "activate":
          d.setProjectCwd(normalized);
          d.setRecents(rememberProject(normalized));
          d.activateTab(decision.tabId, decision.paneId);
          return;
        case "create":
          break;
        default: {
          const exhaustive: never = decision;
          return exhaustive;
        }
      }

      const seed = current ?? d.sessionsRef.current[0];
      const session = newSession(
        seed?.harness ?? "claude",
        normalized,
        seed?.model,
        seed?.runtimeMode,
        seed?.modelSettings,
      );
      const tab = newTab(session.id);
      d.setProjectCwd(normalized);
      d.setRecents(rememberProject(normalized));
      d.setSessions((prev) => [...prev, session]);
      d.appendTab(tab, normalized);
      d.setActiveTabId(tab.id);
      d.setComposerFocused(true);
    },
    [d.activateTab, d.appendTab, onCwdChange, d.readProjectReturnMemory],
  );

  const onRemoveProject = useCallback(
    (path: string, options: { purgeData: boolean }) => {
      const normalized = normalizeProjectPath(path);
      const wasCurrent = sameProjectPath(d.projectCwdRef.current, normalized);
      const remaining = options.purgeData
        ? forgetProject(normalized)
        : archiveProject(normalized);
      d.setRecents(remaining);

      const tabs = d.tabsRef.current;
      const sessions = d.sessionsRef.current;
      const projectTabs = filterTabsForProject(tabs, sessions, normalized);
      const projectTabIds = new Set(projectTabs.map((tab) => tab.id));
      const projectSessions = sessions.filter((session) =>
        sameProjectPath(session.cwd, normalized),
      );
      const projectSessionIds = new Set(
        projectSessions.map((session) => session.id),
      );

      if (options.purgeData) {
        for (const session of projectSessions) {
          d.pendingPersist.current.delete(session.id);
          if (session.busy) {
            d.turnGen.current.set(
              session.id,
              (d.turnGen.current.get(session.id) ?? 0) + 1,
            );
            for (const id of sessionChildHarnesses(session)) {
              void cancelHarnessTurn(id, session.id);
            }
          }
          for (const id of sessionChildHarnesses(session)) {
            void forgetHarnessSession(id, session.id);
          }
          d.lastPersisted.current.delete(session.id);
        }
        void removeProjectData(normalized);
      } else {
        for (const session of projectSessions) {
          if (session.busy) continue;
          d.persistSession(session);
          d.pendingPersist.current.delete(session.id);
          for (const id of sessionChildHarnesses(session)) {
            void forgetHarnessSession(id, session.id);
          }
        }
      }

      let nextTabs = tabs.filter((tab) => !projectTabIds.has(tab.id));
      let nextSessions = sessions.filter((session) => {
        if (!projectSessionIds.has(session.id)) return true;
        return !options.purgeData && session.busy;
      });
      let nextActiveTabId = d.activeTabIdRef.current;

      if (nextTabs.length === 0) {
        const fallback = nextSessions[0];
        const session = newDefaultSession("~", fallback?.runtimeMode);
        const tab = newTab(session.id);
        nextSessions = [...nextSessions, session];
        nextTabs = [tab];
        nextActiveTabId = tab.id;
      } else if (projectTabIds.has(nextActiveTabId)) {
        nextActiveTabId = nextTabs[0]?.id ?? nextActiveTabId;
      }

      d.sessionsRef.current = nextSessions;
      d.tabsRef.current = nextTabs;
      d.activeTabIdRef.current = nextActiveTabId;
      d.setSessions(nextSessions);
      d.setTabs(nextTabs);
      if (nextActiveTabId !== d.activeTabId) {
        d.setActiveTabId(nextActiveTabId);
      }
      d.setDirtyFiles((prev) => {
        const updated = new Set(prev);
        for (const tab of projectTabs) {
          for (const file of [
            ...tab.editorPanes.flatMap((pane) => pane.files),
            ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
          ]) {
            updated.delete(file.id);
          }
        }
        return updated;
      });
      d.setProjectTerminals((prev) =>
        prev.filter((dock) => !sameProjectPath(dock.projectPath, normalized)),
      );

      if (wasCurrent) {
        const next = remaining.find((item) => looksLikeProject(item.path));
        if (next) {
          onSelectProject(next.path);
          d.setProjectCwd(next.path);
        } else {
          d.setProjectCwd("~");
          d.setComposerFocused(true);
        }
      }
    },
    [d.activeTabId, onSelectProject, d.persistSession],
  );

  return {
    onCwdChange,
    onSelectProject,
    onRemoveProject,
  };
}