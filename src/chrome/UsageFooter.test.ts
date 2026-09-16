// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsageFooter } from "./UsageFooter";

vi.mock("../lib/rateLimitsFetch", () => ({
  fetchClaudeRateLimits: vi.fn(),
  fetchCodexRateLimits: vi.fn(),
  fetchAntigravityRateLimits: vi.fn().mockResolvedValue({
    provider: "antigravity",
    session: {
      usedPercent: 58,
      remainingPercent: 42,
      windowMinutes: 300,
      resetsAt: null,
    },
    weekly: {
      usedPercent: 14,
      remainingPercent: 86,
      windowMinutes: 10_080,
      resetsAt: null,
    },
    updatedAt: Date.now(),
    error: null,
    status: "ok",
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("UsageFooter", () => {
  it("displays provider chip with remaining rate limits when antigravity is in providers", async () => {
    await act(async () => {
      root.render(
        createElement(UsageFooter, {
          providers: ["antigravity"],
          session: {
            harness: "antigravity",
            model: "antigravity:gemini-3.8-flash",
          },
        }),
      );
    });

    expect(container.textContent).toContain("42% 5h");
    expect(container.textContent).toContain("86% wk");
  });

  it("displays session chip when no provider usage requested", () => {
    act(() => {
      root.render(
        createElement(UsageFooter, {
          providers: [],
          session: {
            harness: "antigravity",
            model: "antigravity:gemini-3.8-flash",
          },
        }),
      );
    });

    expect(container.textContent).toContain("antigravity");
  });
});

