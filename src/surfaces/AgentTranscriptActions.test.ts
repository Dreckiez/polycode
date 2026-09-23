// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "../lib/session";
import { AgentTranscript } from "./AgentTranscript";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AgentTranscript actions and error banner", () => {
  it("renders GenerationErrorBanner for system errors with Retry button", () => {
    const onRegenerate = vi.fn();
    const blocks: Block[] = [
      { id: "u1", role: "user", text: "Run this command" },
      {
        id: "e1",
        role: "system",
        notice: "error",
        text: "The model hit the output limit after 4,096 tokens.",
      },
    ];

    act(() => {
      root.render(
        createElement(AgentTranscript, {
          blocks,
          sessionId: "test-session",
          onRegenerate,
        }),
      );
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("Generation stopped");
    expect(alert?.textContent).toContain("The model hit the output limit after 4,096 tokens.");

    const retryBtn = Array.from(alert?.querySelectorAll("button") ?? []).find(
      (btn) => btn.textContent?.includes("Retry"),
    );
    expect(retryBtn).not.toBeNull();

    act(() => retryBtn?.click());
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledWith(blocks);
  });

  it("renders plain text for status messages rather than the error banner", () => {
    const blocks: Block[] = [
      { id: "u1", role: "user", text: "Prompt" },
      { id: "s1", role: "system", text: "Retrying in 3s" },
    ];

    act(() => {
      root.render(
        createElement(AgentTranscript, {
          blocks,
          sessionId: "test-session",
        }),
      );
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeNull();
    expect(container.textContent).toContain("Retrying in 3s");
  });

  it("renders regenerate button in message actions for finished turn and triggers onRegenerate", () => {
    const onRegenerate = vi.fn();
    const blocks: Block[] = [
      {
        id: "u1",
        role: "user",
        text: "Hello assistant",
        durationMs: 2_000,
        startedAt: 1_000,
      },
      { id: "a1", role: "assistant", text: "Hello! How can I help you?" },
    ];

    act(() => {
      root.render(
        createElement(AgentTranscript, {
          blocks,
          sessionId: "test-session",
          onRegenerate,
        }),
      );
    });

    const regenerateBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Regenerate response"]',
    );
    expect(regenerateBtn).not.toBeNull();

    act(() => regenerateBtn?.click());
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledWith(blocks);
  });

  it("disables regenerate button when session is busy", () => {
    const onRegenerate = vi.fn();
    const blocks: Block[] = [
      {
        id: "u1",
        role: "user",
        text: "First turn",
        durationMs: 1_000,
        startedAt: 1_000,
      },
      { id: "a1", role: "assistant", text: "First answer." },
      {
        id: "u2",
        role: "user",
        text: "Second turn in progress",
        startedAt: 2_000,
      },
      { id: "a2", role: "assistant", text: "Generating...", streaming: true },
    ];

    act(() => {
      root.render(
        createElement(AgentTranscript, {
          blocks,
          sessionId: "test-session",
          busy: true,
          onRegenerate,
        }),
      );
    });

    const regenerateBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Busy"]',
    );
    expect(regenerateBtn).not.toBeNull();
    expect(regenerateBtn?.disabled).toBe(true);
  });
});
