// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

let container: HTMLDivElement;
let root: Root;

function ThrowingComponent({
  shouldThrow,
  message = "Boom!",
}: {
  shouldThrow: boolean;
  message?: string;
}) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return createElement("div", { id: "safe-content" }, "Safe Content");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // Suppress console.error in tests for expected ErrorBoundary catches
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", async () => {
    await act(async () => {
      root.render(
        createElement(
          ErrorBoundary,
          null,
          createElement(ThrowingComponent, { shouldThrow: false }),
        ),
      );
    });

    expect(container.querySelector("#safe-content")?.textContent).toBe(
      "Safe Content",
    );
  });

  it("catches rendering errors and shows fallback UI", async () => {
    await act(async () => {
      root.render(
        createElement(
          ErrorBoundary,
          null,
          createElement(ThrowingComponent, {
            shouldThrow: true,
            message: "Render crashed",
          }),
        ),
      );
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("Something went wrong");
    expect(alert?.textContent).toContain("Render crashed");
  });

  it("renders custom title and description", async () => {
    await act(async () => {
      root.render(
        createElement(
          ErrorBoundary,
          {
            title: "Chat Transcript Error",
            description: "Failed to render chat messages.",
          },
          createElement(ThrowingComponent, { shouldThrow: true }),
        ),
      );
    });

    expect(container.textContent).toContain("Chat Transcript Error");
    expect(container.textContent).toContain("Failed to render chat messages.");
  });

  it("calls onError callback when error is caught", async () => {
    const onError = vi.fn();

    await act(async () => {
      root.render(
        createElement(
          ErrorBoundary,
          { onError },
          createElement(ThrowingComponent, {
            shouldThrow: true,
            message: "Custom crash",
          }),
        ),
      );
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]?.message).toBe("Custom crash");
  });

  it("resets error state when try again button is clicked", async () => {
    const onReset = vi.fn();

    function RetryHarness() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return createElement(
        ErrorBoundary,
        {
          onReset: () => {
            onReset();
            setShouldThrow(false);
          },
        },
        createElement(ThrowingComponent, { shouldThrow }),
      );
    }

    await act(async () => {
      root.render(createElement(RetryHarness));
    });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    const retryBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Try again"),
    );
    expect(retryBtn).toBeDefined();

    await act(async () => {
      retryBtn?.click();
    });

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#safe-content")?.textContent).toBe(
      "Safe Content",
    );
  });

  it("renders custom fallback function if provided", async () => {
    const customFallback = vi.fn(({ error, reset }) =>
      createElement(
        "div",
        { id: "custom-fallback" },
        `Custom error: ${error.message}`,
        createElement(
          "button",
          { id: "custom-reset", onClick: reset },
          "Reset",
        ),
      ),
    );

    await act(async () => {
      root.render(
        createElement(
          ErrorBoundary,
          { fallback: customFallback },
          createElement(ThrowingComponent, {
            shouldThrow: true,
            message: "Custom boom",
          }),
        ),
      );
    });

    expect(container.querySelector("#custom-fallback")?.textContent).toContain(
      "Custom error: Custom boom",
    );
  });

  it("renders compact mode correctly", async () => {
    await act(async () => {
      root.render(
        createElement(
          ErrorBoundary,
          { compact: true },
          createElement(ThrowingComponent, {
            shouldThrow: true,
            message: "Compact failure",
          }),
        ),
      );
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("Compact failure");
    expect(alert?.textContent).toContain("Retry");
  });

  it("copies details to clipboard when copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    await act(async () => {
      root.render(
        createElement(
          ErrorBoundary,
          null,
          createElement(ThrowingComponent, {
            shouldThrow: true,
            message: "Clipboard test",
          }),
        ),
      );
    });

    const copyBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Copy details"),
    );
    expect(copyBtn).toBeDefined();

    await act(async () => {
      copyBtn?.click();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("Clipboard test");
  });
});
