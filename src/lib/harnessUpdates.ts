import { invoke } from "@tauri-apps/api/core";
import {
  isHarnessAvailable,
  probeHarnessAvailability,
} from "./harness/availability";
import {
  execChild,
  resolveAntigravityBinary,
  resolveClaudeBinary,
  resolveCodexBinary,
  resolveOpenCodeBinary,
  resolvePiBinary,
} from "./harness/child";
import {
  compareSemver,
  parseOpenCodeVersion,
} from "./harness/opencodeProtocol";
import { isPickerProviderVisible } from "./models";
import { HARNESSES, type HarnessId } from "./session";

/** Harnesses with a known release feed. */
const resolvers: Partial<Record<HarnessId, () => Promise<{ path: string }>>> = {
  antigravity: resolveAntigravityBinary,
  claude: resolveClaudeBinary,
  codex: resolveCodexBinary,
  opencode: resolveOpenCodeBinary,
  pi: resolvePiBinary,
};

export type HarnessUpdate = {
  harness: HarnessId;
  installed: string;
  latest: string;
};

export type HarnessUpdateDeps = {
  /** Installed harnesses the user has not hidden. */
  harnesses: HarnessId[];
  installedVersion: (harness: HarnessId) => Promise<string | undefined>;
  latestVersion: (harness: HarnessId) => Promise<string>;
};

/**
 * A failed lookup, offline or otherwise, drops that harness silently: this
 * runs unprompted at launch and must never surface an error of its own.
 * Nothing is remembered between launches: a harness still behind is offered
 * again, at whatever release is newest by then.
 */
export async function findHarnessUpdates({
  harnesses,
  installedVersion,
  latestVersion,
}: HarnessUpdateDeps): Promise<HarnessUpdate[]> {
  const results = await Promise.all(
    harnesses.map(async (harness): Promise<HarnessUpdate | null> => {
      if (!resolvers[harness]) return null;
      try {
        const [installedOutput, latestOutput] = await Promise.all([
          installedVersion(harness),
          latestVersion(harness),
        ]);
        const installed = parseOpenCodeVersion(installedOutput ?? "");
        const latest = parseOpenCodeVersion(latestOutput);
        if (!installed || !latest) return null;
        if (compareSemver(latest, installed) <= 0) return null;
        return { harness, installed, latest };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((update): update is HarnessUpdate => update !== null);
}

// Reuse the result across StrictMode remounts. Only one window per process
// can claim the launch check, so secondary windows do not repeat it.
let launchCheck: Promise<HarnessUpdate[]> | undefined;

export function checkHarnessUpdatesOnLaunch(): Promise<HarnessUpdate[]> {
  return (launchCheck ??= runLaunchCheck().catch(() => []));
}

async function runLaunchCheck(): Promise<HarnessUpdate[]> {
  if (!(await invoke<boolean>("harness_update_check_claim"))) return [];
  await probeHarnessAvailability({ force: true });
  return findHarnessUpdates({
    harnesses: HARNESSES.filter(
      (harness) =>
        isHarnessAvailable(harness) && isPickerProviderVisible(harness),
    ),
    installedVersion: async (harness) => {
      const binary = await resolvers[harness]?.();
      return binary && execChild(binary.path, ["--version"]);
    },
    latestVersion: (harness) =>
      invoke<string>("harness_latest_version", { provider: harness }),
  });
}
