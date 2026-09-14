import type { HarnessId } from "../session";
import { HARNESSES } from "../session";
import {
  resolveAntigravityBinary,
  resolveClaudeBinary,
  resolveCodexBinary,
  resolveCursorBinary,
  resolveFxBinary,
  resolveGrokBinary,
  resolveOmpBinary,
  resolveOpenCodeBinary,
  resolvePiBinary,
} from "./child";
import { isLiveHarness } from "./registry";

export type HarnessAvailability = Record<HarnessId, boolean>;

/**
 * We only ever check whether the binary exists, never whether it is
 * authenticated, so the hint must not blame a login.
 */
const CLI: Record<HarnessId, { name: string; install?: string }> = {
  antigravity: { name: "Antigravity CLI" },
  claude: { name: "Claude Code CLI" },
  codex: { name: "Codex CLI" },
  cursor: { name: "Cursor CLI" },
  grok: {
    name: "Grok Build CLI",
    install: "curl -fsSL https://x.ai/cli/install.sh | bash",
  },
  opencode: { name: "OpenCode CLI" },
  pi: { name: "Pi CLI", install: "npm i -g @earendil-works/pi-coding-agent" },
  omp: { name: "omp CLI", install: "curl -fsSL https://omp.sh/install | sh" },
  fx: { name: "fx CLI", install: "curl -fsSL https://fx.sh/setup.sh | bash" },
};

const AVAILABILITY_STORAGE_KEY = "monocode.harnessAvailability";

function loadCachedAvailability(): {
  cached: HarnessAvailability;
  hasCache: boolean;
} {
  const defaults: HarnessAvailability = {
    antigravity: false,
    claude: false,
    codex: false,
    cursor: false,
    grok: false,
    opencode: false,
    pi: false,
    omp: false,
    fx: false,
  };
  try {
    if (typeof localStorage === "undefined") {
      return { cached: defaults, hasCache: false };
    }
    const raw = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
    if (!raw) return { cached: defaults, hasCache: false };
    const parsed = JSON.parse(raw) as Partial<HarnessAvailability>;
    const cached = { ...defaults };
    let hasCache = false;
    for (const key of HARNESSES) {
      if (typeof parsed[key] === "boolean") {
        cached[key] = parsed[key];
        hasCache = true;
      }
    }
    return { cached, hasCache };
  } catch {
    return { cached: defaults, hasCache: false };
  }
}

function saveCachedAvailability(data: HarnessAvailability): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(data));
    }
  } catch {
    // Private mode / quota
  }
}

const initialAvailability = loadCachedAvailability();
let availability: HarnessAvailability = initialAvailability.cached;
let version = 0;
let inflight: Promise<void> | null = null;
let probedAt = initialAvailability.hasCache ? Date.now() : 0;
const listeners = new Set<() => void>();

/**
 * A probe stats ~100 paths across eight resolvers. The model picker and the
 * providers pane both probe on open, so without a TTL every open pays for it
 * again to learn what it already knows. Installing a CLI mid-session is rare,
 * and `force` covers it.
 */
const PROBE_TTL_MS = 30_000;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeHarnessAvailability(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getHarnessAvailabilitySnapshot(): number {
  return version;
}

export function hasProbedHarnessAvailability(): boolean {
  return probedAt > 0;
}

export function isHarnessAvailable(id: HarnessId): boolean {
  return availability[id];
}

export function harnessUnavailableHint(id: HarnessId): string {
  const { name, install } = CLI[id];
  const how = install ? ` (\`${install}\`)` : "";
  return `${name} not found${how}. Install it, or restart MonoCode if it is already installed.`;
}

export function probeHarnessAvailability(
  options?: { force?: boolean },
): Promise<void> {
  if (inflight) return inflight;
  if (!options?.force && probedAt > 0 && Date.now() - probedAt < PROBE_TTL_MS) {
    return Promise.resolve();
  }
  inflight = Promise.all(
    HARNESSES.map(async (id) => {
      if (!isLiveHarness(id)) return [id, false] as const;
      if (id === "antigravity") {
        try {
          await resolveAntigravityBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      if (id === "cursor") {
        try {
          await resolveCursorBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      if (id === "claude") {
        try {
          await resolveClaudeBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      if (id === "codex") {
        try {
          await resolveCodexBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      if (id === "opencode") {
        try {
          await resolveOpenCodeBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      if (id === "pi") {
        try {
          await resolvePiBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      if (id === "omp") {
        try {
          await resolveOmpBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      if (id === "fx") {
        try {
          await resolveFxBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      if (id === "grok") {
        try {
          await resolveGrokBinary();
          return [id, true] as const;
        } catch {
          return [id, false] as const;
        }
      }
      return [id, false] as const;
    }),
  )
    .then((entries) => {
      const next = { ...availability };
      for (const [id, ok] of entries) next[id] = ok;
      availability = next;
      probedAt = Date.now();
      saveCachedAvailability(next);
      emit();
    })
    .catch(() => {
      probedAt = Date.now();
      emit();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
