// @vitest-environment happy-dom
import { act, createElement, StrictMode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceTab } from "../lib/layout";
import type { Session } from "../lib/session";
import { filterSessionsByArchive } from "../lib/sessionHistory";
import type { SessionSummary } from "../lib/sessionStore";
import {
  type SessionPersistenceDeps,
  useSessionPersistence,
} from "./useSessionPersistence";

const mocks = vi.hoisted(() => ({
  lastUserBlockId: vi.fn(),
  openSessionIds: vi.fn(),
  normalizeProjectPath: vi.fn(),
  listSessionsByProject: vi.fn(),
  persistFingerprint: vi.fn(),
  shouldPersistSession: vi.fn(),
  upsertSession: vi.fn(),
}));

vi.mock("../lib/appTabs", () => ({
  lastUserBlockId: mocks.lastUserBlockId,
  openSessionIds: mocks.openSessionIds,
}));
vi.mock("../lib/recents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/recents")>();
  return { ...actual, normalizeProjectPath: mocks.normalizeProjectPath };
});
vi.mock("../lib/sessionStore", () => ({
  listSessionsByProject: mocks.listSessionsByProject,
  persistFingerprint: mocks.persistFingerprint,
  shouldPersistSession: mocks.shouldPersistSession,
  upsertSession: mocks.upsertSession,
}));

const store = {
  listSessionsByProject: vi.mocked(mocks.listSessionsByProject),
  persistFingerprint: vi.mocked(mocks.persistFingerprint),
  shouldPersistSession: vi.mocked(mocks.shouldPersistSession),
  upsertSession: vi.mocked(mocks.upsertSession),
};
const tabMeta = {
  lastUserBlockId: vi.mocked(mocks.lastUserBlockId),
  openSessionIds: vi.mocked(mocks.openSessionIds),
};
const resolvePath = vi.mocked(mocks.normalizeProjectPath);

let root: Root;
let container: HTMLDivElement;
let api: ReturnType<typeof useSessionPersistence>;
let lastDeps: SessionPersistenceDeps;

let historyRef: RefObject<SessionSummary[]>;
let historyErrorRef: RefObject<string | null>;
let importedSessionsAppliedRef: RefObject<boolean>;
let lastBoundProviderRef: RefObject<Map<string, string>>;
let lastPersistedRef: RefObject<Map<string, string>>;
let lastPersistedUserBlockRef: RefObject<Map<string, string>>;
let loadedProjectsRef: RefObject<ReadonlySet<string>>;
let observedSessionsRef: RefObject<Map<string, Session>>;
let pendingPersistRef: RefObject<Map<string, Session>>;
let removingSessionIdsRef: RefObject<Set<string>>;
let sidebarCwdRef: RefObject<string>;
let tabsRef: RefObject<WorkspaceTab[]>;
let resolvedSessions: Session[];
let setHistory: ReturnType<typeof vi.fn>;
let setHistoryErrorCwd: ReturnType<typeof vi.fn>;
let setLoadedProjects: ReturnType<typeof vi.fn>;

function SessionPersistenceHarness({ deps }: { deps: SessionPersistenceDeps }) {
  api = useSessionPersistence(deps);
  return null;
}

async function mount(opts: {
  sessions?: Session[];
  sidebarCwd?: string;
  tabs?: WorkspaceTab[];
  lastPersisted?: Map<string, string>;
}) {
  historyRef = { current: [] };
  historyErrorRef = { current: null };
  importedSessionsAppliedRef = { current: false };
  lastBoundProviderRef = { current: new Map() };
  lastPersistedRef = { current: opts.lastPersisted ?? new Map() };
  lastPersistedUserBlockRef = { current: new Map() };
  loadedProjectsRef = { current: new Set<string>() };
  observedSessionsRef = { current: new Map() };
  pendingPersistRef = { current: new Map() };
  removingSessionIdsRef = { current: new Set() };
  sidebarCwdRef = { current: opts.sidebarCwd ?? "/repo" };
  tabsRef = { current: opts.tabs ?? [] };
  resolvedSessions = opts.sessions ?? [];
  setHistory = vi.fn(
    (updater: SessionSummary[] | ((prev: SessionSummary[]) => SessionSummary[])) => {
      historyRef.current =
        typeof updater === "function" ? updater(historyRef.current) : updater;
    },
  );
  setHistoryErrorCwd = vi.fn(
    (updater: string | null | ((prev: string | null) => string | null)) => {
      historyErrorRef.current =
        typeof updater === "function"
          ? updater(historyErrorRef.current)
          : updater;
    },
  );
  setLoadedProjects = vi.fn(
    (
      updater:
        | ReadonlySet<string>
        | ((prev: ReadonlySet<string>) => ReadonlySet<string>),
    ) => {
      loadedProjectsRef.current =
        typeof updater === "function"
          ? updater(loadedProjectsRef.current)
          : updater;
    },
  );
  lastDeps = {
    importedSessionsApplied: importedSessionsAppliedRef,
    lastBoundProvider: lastBoundProviderRef,
    lastPersisted: lastPersistedRef,
    lastPersistedUserBlock: lastPersistedUserBlockRef,
    loadedProjectsRef,
    observedSessions: observedSessionsRef,
    pendingPersist: pendingPersistRef,
    removingSessionIds: removingSessionIdsRef,
    resumed: null,
    setHistory,
    setHistoryErrorCwd,
    setLoadedProjects,
    sessions: resolvedSessions,
    sidebarCwd: opts.sidebarCwd ?? "/repo",
    sidebarCwdRef,
    tabsRef,
    windowTransfer: null,
  } satisfies SessionPersistenceDeps;
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(SessionPersistenceHarness, { deps: lastDeps }),
      ),
    ),
  );
}

function session(
  id: string,
  cwd = "/repo",
  blocks: Session["blocks"] = [],
): Session {
  return {
    id,
    harness: "claude",
    model: "mock-model",
    modelSettings: {},
    runtimeMode: "supervised",
    title: id,
    cwd,
    blocks,
  };
}

function summary(
  id: string,
  cwd: string,
  extra: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id,
    cwd,
    harness: "claude",
    model: "mock-model",
    runtimeMode: "supervised",
    title: id,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function historyFor(cwd: string): SessionSummary[] {
  return historyRef.current.filter((entry) => entry.cwd === cwd);
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  tabMeta.lastUserBlockId.mockReset().mockReturnValue(undefined);
  tabMeta.openSessionIds.mockReset().mockReturnValue(new Set());
  resolvePath.mockReset().mockImplementation((cwd: string) => cwd);
  store.listSessionsByProject.mockReset().mockResolvedValue([]);
  store.persistFingerprint.mockReset().mockReturnValue("fp");
  store.shouldPersistSession.mockReset().mockReturnValue(false);
  store.upsertSession.mockReset().mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useSessionPersistence", () => {
  it("refreshHistory loads summaries for each project that has been loaded", async () => {
    const rowsA = [summary("a1", "/proj-a"), summary("a2", "/proj-a")];
    const rowsB = [summary("b1", "/proj-b")];
    store.listSessionsByProject.mockImplementation((cwd: string) =>
      Promise.resolve(cwd === "/proj-a" ? rowsA : cwd === "/proj-b" ? rowsB : []),
    );
    await mount({ sidebarCwd: "/proj-a" });
    sidebarCwdRef.current = "/proj-b";
    await act(async () => {
      await api.refreshHistory("/proj-b");
    });

    expect(store.listSessionsByProject).toHaveBeenCalledWith("/proj-a");
    expect(store.listSessionsByProject).toHaveBeenCalledWith("/proj-b");
    expect(historyFor("/proj-a")).toEqual([
      summary("a1", "/proj-a"),
      summary("a2", "/proj-a"),
    ]);
    expect(historyFor("/proj-b")).toEqual([summary("b1", "/proj-b")]);
  });

  it("refreshHistory returns an empty summary for a project with no sessions instead of an error", async () => {
    await mount({ sidebarCwd: "/proj-empty" });

    expect(store.listSessionsByProject).toHaveBeenCalledWith("/proj-empty");
    expect(historyFor("/proj-empty")).toEqual([]);
    expect(historyErrorRef.current).toBeNull();
    expect(loadedProjectsRef.current.has("/proj-empty")).toBe(true);
  });

  it("refreshHistory merges the fetched rows into the existing history instead of replacing the whole cache", async () => {
    const fetched = [summary("new-a1", "/proj-a"), summary("new-a2", "/proj-a")];
    store.listSessionsByProject.mockImplementation((cwd: string) =>
      Promise.resolve(cwd === "/proj-a" ? fetched : []),
    );
    await mount({ sidebarCwd: "/proj-a" });
    historyRef.current = [
      summary("cached-b", "/proj-b"),
      summary("old-a", "/proj-a"),
    ];
    await act(async () => {
      await api.refreshHistory("/proj-a");
    });

    expect(historyFor("/proj-a")).toEqual([
      summary("new-a1", "/proj-a"),
      summary("new-a2", "/proj-a"),
    ]);
    expect(historyFor("/proj-b")).toEqual([summary("cached-b", "/proj-b")]);
    expect(historyRef.current).toHaveLength(3);
  });

  it("refreshHistory keeps archived sessions out of the stored history across refreshes", async () => {
    const raw = [
      summary("archived", "/proj-a", { archived: true }),
      summary("live-1", "/proj-a"),
      summary("live-2", "/proj-a"),
    ];
    store.listSessionsByProject.mockResolvedValue(
      filterSessionsByArchive(raw, false),
    );
    await mount({ sidebarCwd: "/proj-a" });
    await act(async () => {
      await api.refreshHistory("/proj-a");
    });
    await act(async () => {
      await api.refreshHistory("/proj-a");
    });

    expect(historyFor("/proj-a")).toEqual([
      summary("live-1", "/proj-a"),
      summary("live-2", "/proj-a"),
    ]);
    expect(historyFor("/proj-a").some((row) => row.archived)).toBe(false);
  });

  it("refreshHistory is memoized and never double-inserts a project's rows", async () => {
    store.listSessionsByProject.mockResolvedValue([summary("s1", "/proj-a")]);
    await mount({ sidebarCwd: "/proj-a" });

    const refresh = api.refreshHistory;
    const loadedBefore = loadedProjectsRef.current;
    await act(async () => {
      await api.refreshHistory("/proj-a");
    });
    await act(async () => {
      await api.refreshHistory("/proj-a");
    });
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(SessionPersistenceHarness, { deps: lastDeps }),
        ),
      );
    });

    expect(api.refreshHistory).toBe(refresh);
    expect(historyFor("/proj-a")).toEqual([summary("s1", "/proj-a")]);
    expect(loadedProjectsRef.current).toBe(loadedBefore);
  });

  it("persistSession upserts a persistable session into the store", async () => {
    const ready = summary("s6", "/repo");
    store.shouldPersistSession.mockReturnValue(true);
    store.upsertSession.mockResolvedValue(ready);
    store.persistFingerprint.mockReturnValue("fp-6");
    await mount({ sessions: [] });

    const s = session("s6", "/repo");
    await act(async () => {
      api.persistSession(s);
      await flush();
    });

    expect(store.upsertSession).toHaveBeenCalledExactlyOnceWith(s);
    expect(lastPersistedRef.current.get("s6")).toBe("fp-6");
    expect(historyFor("/repo")).toContainEqual(ready);
  });

  it("persistSession does not persist a session that should not be persisted", async () => {
    const s = session("s7", "/repo");
    store.shouldPersistSession.mockReturnValue(false);
    await mount({ sessions: [] });

    await act(async () => {
      api.persistSession(s);
      await flush();
    });
    await act(async () => {
      api.persistSession(undefined);
      await flush();
    });

    expect(store.upsertSession).not.toHaveBeenCalled();
    expect(lastPersistedRef.current.size).toBe(0);
  });

  it("persisting is a no-op when the session fingerprint is already persisted", async () => {
    const s = session("s8", "/repo");
    store.shouldPersistSession.mockReturnValue(true);
    store.persistFingerprint.mockReturnValue("fp-same");
    store.upsertSession.mockResolvedValue(summary("s8", "/repo"));
    await mount({
      sessions: [s],
      lastPersisted: new Map([["s8", "fp-same"]]),
    });

    await act(async () => {
      await wait(700);
    });

    expect(pendingPersistRef.current.size).toBe(0);
    expect(store.upsertSession).not.toHaveBeenCalled();
    expect(lastPersistedRef.current.get("s8")).toBe("fp-same");
    expect(historyRef.current).toEqual([]);
  });

  it("two sessions persist independently and re-persisting one keeps the other", async () => {
    const a = session("s9-a", "/repo");
    const b = session("s9-b", "/repo");
    store.shouldPersistSession.mockReturnValue(true);
    store.persistFingerprint.mockReturnValue("fp");
    store.upsertSession.mockImplementation(async (sess: Session) =>
      summary(sess.id, sess.cwd),
    );
    await mount({ sessions: [] });

    await act(async () => {
      api.persistSession(a);
      api.persistSession(b);
      await flush();
    });
    expect(store.upsertSession.mock.calls.map((call) => call[0])).toEqual([
      a,
      b,
    ]);
    expect(lastPersistedRef.current.size).toBe(2);

    await act(async () => {
      api.persistSession(a);
      await flush();
    });
    expect(store.upsertSession).toHaveBeenCalledTimes(3);
    expect(historyFor("/repo").some((row) => row.id === "s9-a")).toBe(true);
    expect(historyFor("/repo").some((row) => row.id === "s9-b")).toBe(true);
  });
});