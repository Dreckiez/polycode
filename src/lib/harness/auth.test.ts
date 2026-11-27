import { beforeEach, describe, expect, it, vi } from "vitest";

const child = vi.hoisted(() => ({
  killChild: vi.fn(async () => undefined),
  spawnChild: vi.fn(async () => undefined),
  unwatchChild: vi.fn(),
  watchChild: vi.fn(),
  resolveClaudeBinary: vi.fn(async () => ({ path: "/bin/claude" })),
  resolveAntigravityBinary: vi.fn(async () => ({ path: "/bin/agy" })),
  resolveCodexBinary: vi.fn(async () => ({ path: "/bin/codex" })),
  resolveCursorBinary: vi.fn(async () => ({ path: "/bin/agent" })),
  resolveGrokBinary: vi.fn(async () => ({ path: "/bin/grok" })),
  resolveFxBinary: vi.fn(async () => ({ path: "/bin/fx" })),
  writeChild: vi.fn<(_id: string, _line: string) => Promise<void>>(),
}));
const native = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("./child", () => child);
vi.mock("@tauri-apps/api/core", () => native);
vi.mock("../fs", () => ({ homeDir: vi.fn(async () => "/home/alice") }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "test-window" }),
}));

import {
  harnessLoginArgs,
  isHarnessAuthError,
  latestTurnNeedsHarnessLogin,
  loginHarness,
  resetHarnessLoginState,
  supportsHarnessLogin,
} from "./auth";

beforeEach(() => {
  resetHarnessLoginState();
  vi.clearAllMocks();
});

describe("harness login", () => {
  it("advertises only deterministic account login commands", () => {
    expect(harnessLoginArgs("claude")).toEqual(["auth", "login"]);
    expect(harnessLoginArgs("codex")).toEqual(["login"]);
    expect(harnessLoginArgs("cursor")).toEqual(["login"]);
    expect(harnessLoginArgs("grok")).toEqual(["login", "--oauth"]);
    expect(harnessLoginArgs("fx")).toEqual(["login", "vercel"]);
    expect(supportsHarnessLogin("opencode")).toBe(false);
    expect(supportsHarnessLogin("pi")).toBe(false);
    expect(supportsHarnessLogin("omp")).toBe(false);
  });

  it("recognizes provider authentication failures without matching unrelated errors", () => {
    expect(
      isHarnessAuthError(
        "Authentication required\n\nGrok Build is not signed in. Run `grok login` in a terminal.",
      ),
    ).toBe(true);
    expect(isHarnessAuthError("Claude sign-in expired")).toBe(true);
    expect(isHarnessAuthError("Provider request timed out")).toBe(false);
  });

  it("only carries an authentication failure through its current turn", () => {
    const error = {
      role: "system" as const,
      notice: "error" as const,
      text: "Grok Build is not signed in.",
    };
    expect(latestTurnNeedsHarnessLogin([error])).toBe(true);
    expect(
      latestTurnNeedsHarnessLogin([
        error,
        { role: "user", text: "Retry this", notice: undefined },
      ]),
    ).toBe(false);
  });

  it("launches Claude's official login command and waits for success", async () => {
    const login = loginHarness("claude");
    await vi.waitFor(() => expect(child.watchChild).toHaveBeenCalledOnce());
    expect(child.spawnChild).toHaveBeenCalledWith(
      "polycode-provider-login-test-window-claude",
      "/bin/claude",
      ["auth", "login"],
      "/home/alice",
    );

    const onExit = child.watchChild.mock.calls[0]?.[2] as
      ((code: number | null) => void) | undefined;
    onExit?.(0);
    await expect(login).resolves.toBeUndefined();
  });

  it("isolates a named Codex account during sign-in", async () => {
    const login = loginHarness("codex", "account-work");
    await vi.waitFor(() => expect(child.watchChild).toHaveBeenCalledOnce());
    expect(child.spawnChild).toHaveBeenCalledWith(
      "polycode-provider-login-test-window-codex-account-work",
      "/bin/codex",
      ["login"],
      "/home/alice",
      { provider: "codex", id: "account-work" },
    );

    const onExit = child.watchChild.mock.calls[0]?.[2] as
      | ((code: number | null) => void)
      | undefined;
    onExit?.(0);
    await expect(login).resolves.toBeUndefined();
  });

  it("opens Antigravity browser sign-in in the named profile and verifies its local token", async () => {
    native.invoke.mockResolvedValue(true);
    child.writeChild.mockImplementation(async (_id, line) => {
      const request = JSON.parse(line);
      const onLine = child.watchChild.mock.calls[0]?.[1] as (line: string) => void;
      onLine(JSON.stringify({ id: request.id, result: {} }));
    });

    await loginHarness("antigravity", "account-work");

    const sessionId = "polycode-provider-login-test-window-antigravity-account-work";
    expect(child.spawnChild).toHaveBeenCalledWith(
      sessionId,
      "/bin/agy",
      ["acp", "--stdio"],
      "/home/alice",
      { provider: "antigravity", id: "account-work" },
    );
    expect(child.writeChild.mock.calls.map(([, line]) => JSON.parse(line))).toEqual([
      expect.objectContaining({ method: "initialize" }),
      expect.objectContaining({ method: "authenticate", params: { methodId: "oauth-personal" } }),
    ]);
    expect(native.invoke).toHaveBeenCalledWith("antigravity_account_signed_in", {
      accountId: "account-work",
    });
    expect(child.killChild).toHaveBeenLastCalledWith(sessionId);
  });

  it("deduplicates repeated login clicks", async () => {
    const first = loginHarness("codex");
    const second = loginHarness("codex");
    expect(second).toBe(first);
    await vi.waitFor(() => expect(child.watchChild).toHaveBeenCalledOnce());

    const onExit = child.watchChild.mock.calls[0]?.[2] as
      ((code: number | null) => void) | undefined;
    onExit?.(0);
    await first;
    expect(child.spawnChild).toHaveBeenCalledOnce();
  });

  it("does not invent one login flow for multi-provider harnesses", async () => {
    await expect(loginHarness("opencode")).rejects.toThrow(
      "does not offer a single browser sign-in flow",
    );
    expect(child.spawnChild).not.toHaveBeenCalled();
  });
});
