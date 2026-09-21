import {
  useCallback,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { lastUserBlockId, openSessionIds } from "../lib/appTabs";
import type { ResumedWorkspace } from "../lib/appLifecycle";
import type { WorkspaceTab } from "../lib/layout";
import { normalizeProjectPath } from "../lib/recents";
import type { Session } from "../lib/session";
import {
  mergeProjectHistorySummary,
  replaceProjectHistory,
} from "../lib/sessionHistory";
import {
  listSessionsByProject,
  persistFingerprint,
  shouldPersistSession,
  upsertSession,
  type SessionSummary,
} from "../lib/sessionStore";
import type { WindowTransferPayload } from "../lib/windowTransfer";

export type SessionPersistenceDeps = {
  importedSessionsApplied: RefObject<boolean>;
  lastBoundProvider: RefObject<Map<string, string>>;
  lastPersisted: RefObject<Map<string, string>>;
  lastPersistedUserBlock: RefObject<Map<string, string>>;
  loadedProjectsRef: RefObject<ReadonlySet<string>>;
  observedSessions: RefObject<Map<string, Session>>;
  pendingPersist: RefObject<Map<string, Session>>;
  removingSessionIds: RefObject<Set<string>>;
  resumed: ResumedWorkspace | null;
  setHistory: Dispatch<SetStateAction<SessionSummary[]>>;
  setHistoryErrorCwd: Dispatch<SetStateAction<string | null>>;
  setLoadedProjects: Dispatch<SetStateAction<ReadonlySet<string>>>;
  sessions: Session[];
  sidebarCwd: string;
  sidebarCwdRef: RefObject<string>;
  tabsRef: RefObject<WorkspaceTab[]>;
  windowTransfer: WindowTransferPayload | null;
};

export function useSessionPersistence(deps: SessionPersistenceDeps) {
  const d = deps;

  const refreshHistory = useCallback(async (cwd: string) => {
    if (!cwd || cwd === "~") return;
    // `history` holds every visited project's rows and the sidebar filters it
    // by cwd, so a project loaded once paints from cache on the way back and
    // revalidates quietly underneath the cards already on screen. Whether the
    // first load is still pending is derived from `loadedProjects`, not
    // tracked here — a status set from this effect lands a render too late to
    // suppress the empty state.
    const key = normalizeProjectPath(cwd);
    d.setHistoryErrorCwd((prev) => (prev === key ? null : prev));
    try {
      const rows = await listSessionsByProject(cwd);
      if (cwd !== d.sidebarCwdRef.current) return;
      d.setHistory((current) => replaceProjectHistory(current, cwd, rows));
      d.setLoadedProjects((prev) =>
        prev.has(key) ? prev : new Set(prev).add(key),
      );
    } catch {
      if (cwd !== d.sidebarCwdRef.current) return;
      // A failed revalidate keeps the cached cards rather than replacing a
      // good list with an error.
      if (!d.loadedProjectsRef.current.has(key)) d.setHistoryErrorCwd(key);
    }
  }, []);

  const persistSession = useCallback((session: Session | undefined) => {
    if (
      !session ||
      !shouldPersistSession(session) ||
      d.removingSessionIds.current.has(session.id)
    )
      return;
    const fingerprint = persistFingerprint(session);
    void upsertSession(session)
      .then((summary) => {
        if (!summary) return;
        d.lastPersisted.current.set(session.id, fingerprint);
        if (summary.cwd === d.sidebarCwdRef.current) {
          d.setHistory((current) =>
            mergeProjectHistorySummary(current, summary),
          );
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (d.importedSessionsApplied.current) return;
    const imported = d.windowTransfer?.sessions ?? d.resumed?.sessions;
    if (!imported?.length) return;
    d.importedSessionsApplied.current = true;
    for (const session of imported) {
      d.observedSessions.current.set(session.id, session);
      d.lastPersisted.current.set(session.id, persistFingerprint(session));
      const userId = lastUserBlockId(session);
      if (userId) d.lastPersistedUserBlock.current.set(session.id, userId);
      if (session.providerSessionId) {
        d.lastBoundProvider.current.set(
          session.id,
          session.providerSessionId,
        );
      }
    }
  }, [d.windowTransfer, d.resumed]);

  useEffect(() => {
    void refreshHistory(d.sidebarCwd);
  }, [d.sidebarCwd, refreshHistory]);

  useEffect(() => {
    const liveIds = new Set(d.sessions.map((session) => session.id));
    const visibleIds = openSessionIds(d.tabsRef.current);
    for (const session of d.sessions) {
      if (d.removingSessionIds.current.has(session.id)) continue;
      if (d.observedSessions.current.get(session.id) === session) continue;
      d.observedSessions.current.set(session.id, session);
      const parked = !visibleIds.has(session.id);
      const newlyBound =
        !!session.providerSessionId &&
        d.lastBoundProvider.current.get(session.id) !==
          session.providerSessionId;
      const lastUserId = lastUserBlockId(session);
      const newUserTurn =
        !!lastUserId &&
        d.lastPersistedUserBlock.current.get(session.id) !== lastUserId;
      if (newlyBound && session.providerSessionId) {
        d.lastBoundProvider.current.set(session.id, session.providerSessionId);
      }
      if (newUserTurn && lastUserId) {
        d.lastPersistedUserBlock.current.set(session.id, lastUserId);
      }
      if ((newlyBound || newUserTurn) && shouldPersistSession(session)) {
        persistSession(session);
      }
      if (
        shouldPersistSession(session) &&
        (!session.busy ||
          parked ||
          newlyBound ||
          newUserTurn ||
          !d.lastPersisted.current.has(session.id))
      ) {
        d.pendingPersist.current.set(session.id, session);
      }
    }
    for (const sessionId of d.observedSessions.current.keys()) {
      if (liveIds.has(sessionId)) continue;
      d.observedSessions.current.delete(sessionId);
      d.pendingPersist.current.delete(sessionId);
    }
    if (d.pendingPersist.current.size === 0) return;

    const timer = window.setTimeout(() => {
      const dirty = [...d.pendingPersist.current.values()];
      d.pendingPersist.current.clear();
      void Promise.all(
        dirty.map(async (session) => {
          if (d.removingSessionIds.current.has(session.id)) return;
          const fingerprint = persistFingerprint(session);
          if (d.lastPersisted.current.get(session.id) === fingerprint) return;
          const summary = await upsertSession(session).catch(() => null);
          if (!summary) return;
          d.lastPersisted.current.set(session.id, fingerprint);
          if (summary.cwd === d.sidebarCwdRef.current) {
            d.setHistory((current) =>
              mergeProjectHistorySummary(current, summary),
            );
          }
        }),
      );
    }, 650);
    return () => window.clearTimeout(timer);
  }, [persistSession, d.sessions]);

  return { refreshHistory, persistSession };
}