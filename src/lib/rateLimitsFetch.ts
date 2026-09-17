import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "./fs";
import {
  errorRateLimits,
  parseAntigravityUsage,
  parseClaudeOAuthUsage,
  parseCodexRateLimits,
  parseOpencodeGoUsage,
  unavailableRateLimits,
  type ProviderRateLimits,
} from "./rateLimits";
import {
  execChild,
  killChild,
  resolveAntigravityBinary,
  resolveCodexBinary,
  spawnChild,
  unwatchChild,
  watchChild,
} from "./harness/child";
import { asRecord } from "./harness/codexProtocol";
import { JsonRpcClient } from "./harness/jsonRpc";

const USAGE_CHILD_ID = "monocode-codex-usage";
const DISCOVERY_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 12_000;

type OpencodeGoUsageFetch = {
  status: "ok" | "error" | "unavailable" | string;
  httpStatus?: number | null;
  body?: string | null;
  error?: string | null;
};

/**
 * Fetch OpenCode Go 5h / weekly / monthly usage via the official API.
 * Runs through a Tauri command so the webview CORS policy does not apply.
 */
export async function fetchOpencodeGoRateLimits(): Promise<ProviderRateLimits> {
  let result: OpencodeGoUsageFetch;
  try {
    result = await invoke<OpencodeGoUsageFetch>("fetch_opencode_go_usage");
  } catch (error) {
    return errorRateLimits(
      "opencode",
      error instanceof Error
        ? error.message
        : "OpenCode Go usage unavailable",
    );
  }
  if (result.status === "ok" && result.body) {
    try {
      const parsed = parseOpencodeGoUsage(JSON.parse(result.body));
      if (parsed.session || parsed.weekly || parsed.monthly) return parsed;
    } catch {
      return errorRateLimits("opencode", "OpenCode Go response was not JSON");
    }
    // A 200 with no usable windows is malformed: report an error so the
    // footer retries instead of sticking in "unavailable" forever.
    return errorRateLimits(
      "opencode",
      "OpenCode Go usage response was unexpected",
    );
  }
  if (result.status === "unavailable") {
    return unavailableRateLimits(
      "opencode",
      result.error?.trim() || "OpenCode Go not connected",
    );
  }
  return errorRateLimits(
    "opencode",
    result.error?.trim() || "OpenCode Go usage unavailable",
  );
}

export type CodexRateLimitResetOutcome =
  | "reset"
  | "nothingToReset"
  | "noCredit"
  | "alreadyRedeemed";

type ClaudeUsageFetch = {
  status: "ok" | "error" | "unavailable" | string;
  httpStatus?: number | null;
  body?: string | null;
  error?: string | null;
};

export async function fetchClaudeRateLimits(
  accountId = "default",
): Promise<ProviderRateLimits> {
  try {
    const result = await invoke<ClaudeUsageFetch>("fetch_claude_usage", {
      accountId,
    });
    if (result.status === "ok" && result.body) {
      const parsed = parseClaudeOAuthUsage(result.body);
      if (parsed.session || parsed.weekly) return parsed;
      return {
        ...parsed,
        status: parsed.status === "ok" ? "ok" : parsed.status,
      };
    }
    if (result.status === "unavailable") {
      return unavailableRateLimits(
        "claude",
        result.error?.trim() || "Claude not signed in",
      );
    }
    return errorRateLimits(
      "claude",
      result.error?.trim() || "Claude usage unavailable",
    );
  } catch (error) {
    return errorRateLimits(
      "claude",
      error instanceof Error ? error.message : "Claude usage unavailable",
    );
  }
}

export async function fetchAntigravityRateLimits(
  modelId?: string,
): Promise<ProviderRateLimits> {
  let path: string;
  try {
    path = (await resolveAntigravityBinary()).path;
  } catch {
    return unavailableRateLimits("antigravity", "Antigravity CLI not found");
  }

  try {
    const cwd = await homeDir();
    const output = await execChild(path, ["-p", "/usage"], cwd);
    return parseAntigravityUsage(output, modelId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /not signed in|authentication required|not authenticated/i.test(message)
    ) {
      return unavailableRateLimits("antigravity", "Antigravity not signed in");
    }
    if (/ENOENT|not found|could not run/i.test(message)) {
      return unavailableRateLimits("antigravity", "Antigravity CLI not found");
    }
    return errorRateLimits("antigravity", message);
  }
}

export async function fetchCodexRateLimits(
  accountId = "default",
): Promise<ProviderRateLimits> {
  let path: string;
  try {
    path = (await resolveCodexBinary()).path;
  } catch {
    return unavailableRateLimits("codex", "Codex CLI not found");
  }

  const cwd = await homeDir();
  try {
    const result = await requestCodexAccount<unknown>(
      path,
      cwd,
      "account/rateLimits/read",
      {},
      accountId,
    );
    const parsed = parseCodexRateLimits(result);
    if (parsed.session || parsed.weekly || parsed.resetCredits) return parsed;
    const rec = asRecord(result);
    if (rec && !parsed.session && !parsed.weekly) {
      return unavailableRateLimits("codex", "No Codex usage data");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /not signed in|chatgpt authentication required|not authenticated/i.test(
        message,
      )
    ) {
      return unavailableRateLimits("codex", "Codex not signed in");
    }
    if (/ENOENT|not found|could not run/i.test(message)) {
      return unavailableRateLimits("codex", "Codex CLI not found");
    }
    return errorRateLimits("codex", message);
  }
}

export async function consumeCodexRateLimitResetCredit(
  creditId?: string,
  accountId = "default",
): Promise<CodexRateLimitResetOutcome> {
  const path = (await resolveCodexBinary()).path;
  const cwd = await homeDir();
  const result = await requestCodexAccount<unknown>(
    path,
    cwd,
    "account/rateLimitResetCredit/consume",
    {
      idempotencyKey: crypto.randomUUID(),
      ...(creditId ? { creditId } : {}),
    },
    accountId,
  );
  const outcome = asRecord(result)?.outcome;
  if (
    outcome === "reset" ||
    outcome === "nothingToReset" ||
    outcome === "noCredit" ||
    outcome === "alreadyRedeemed"
  ) {
    return outcome;
  }
  throw new Error("Codex returned an unknown reset result");
}

async function requestCodexAccount<T>(
  path: string,
  cwd: string,
  method: string,
  params: unknown,
  accountId: string,
): Promise<T> {
  const rpc = new JsonRpcClient(
    USAGE_CHILD_ID,
    {
      onNotification: () => {},
      onRequest: () => {
        throw new Error("Codex usage discovery does not accept requests");
      },
    },
    { includeJsonrpc: false, label: "codex-usage" },
  );

  const stop = async () => {
    rpc.close();
    unwatchChild(USAGE_CHILD_ID);
    await killChild(USAGE_CHILD_ID).catch(() => undefined);
  };

  await killChild(USAGE_CHILD_ID).catch(() => undefined);

  watchChild(
    USAGE_CHILD_ID,
    (line) => rpc.pushLine(line),
    () => rpc.close(new Error("Codex usage probe exited")),
  );

  try {
    await spawnChild(USAGE_CHILD_ID, path, ["app-server"], cwd, {
      provider: "codex",
      id: accountId,
    });
    return await withTimeout(
      DISCOVERY_TIMEOUT_MS,
      async () => {
        await rpc.request(
          "initialize",
          {
            clientInfo: {
              name: "monocode",
              title: "MonoCode",
              version: "0.1.0",
            },
            capabilities: {
              experimentalApi: true,
            },
          },
          REQUEST_TIMEOUT_MS,
        );
        await rpc.notify("initialized", undefined);

        return rpc.request<T>(method, params, REQUEST_TIMEOUT_MS);
      },
      () => {
        void stop();
      },
    );
  } finally {
    await stop();
  }
}

function withTimeout<T>(
  ms: number,
  task: () => Promise<T>,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(new Error(`Timed out after ${ms}ms`));
      }
    }, ms);
  });

  return Promise.race([task(), timeout]).finally(() => {
    if (timer != null) clearTimeout(timer);
  });
}
