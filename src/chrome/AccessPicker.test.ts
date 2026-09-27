// @vitest-environment happy-dom
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccessPicker,
  getRuntimeModeDisabledReason,
  isRuntimeModeSupported,
} from "./AccessPicker";

vi.mock("./Popover", () => ({
  Popover: ({
    children,
    role,
    className,
    tabIndex,
    onKeyDown,
  }: {
    children: React.ReactNode;
    role?: string;
    className?: string;
    tabIndex?: number;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  }) =>
    createElement(
      "div",
      {
        role,
        className,
        tabIndex,
        onKeyDown,
      },
      children,
    ),
}));

describe("AccessPicker mode support helpers", () => {
  it("enables auto only when harness is codex", () => {
    expect(isRuntimeModeSupported("auto", "codex")).toBe(true);
    expect(isRuntimeModeSupported("auto", "antigravity")).toBe(false);
    expect(isRuntimeModeSupported("auto", "claude")).toBe(false);
    expect(isRuntimeModeSupported("auto", undefined)).toBe(false);
  });

  it("enables only full-access for antigravity", () => {
    expect(isRuntimeModeSupported("supervised", "antigravity")).toBe(false);
    expect(isRuntimeModeSupported("auto-accept-edits", "antigravity")).toBe(false);
    expect(isRuntimeModeSupported("auto", "antigravity")).toBe(false);
    expect(isRuntimeModeSupported("full-access", "antigravity")).toBe(true);
  });

  it("enables supervised, auto-accept-edits, full-access for other providers", () => {
    expect(isRuntimeModeSupported("supervised", "claude")).toBe(true);
    expect(isRuntimeModeSupported("auto-accept-edits", "claude")).toBe(true);
    expect(isRuntimeModeSupported("full-access", "claude")).toBe(true);
    expect(isRuntimeModeSupported("auto", "claude")).toBe(false);
  });

  it("provides appropriate disabled reasons", () => {
    expect(getRuntimeModeDisabledReason("auto", "claude")).toBe(
      "Only available for Codex",
    );
    expect(getRuntimeModeDisabledReason("auto", "antigravity")).toBe(
      "Only available for Codex",
    );
    expect(getRuntimeModeDisabledReason("supervised", "antigravity")).toBe(
      "Antigravity CLI only supports Full Access",
    );
    expect(
      getRuntimeModeDisabledReason("auto-accept-edits", "antigravity"),
    ).toBe("Antigravity CLI only supports Full Access");
    expect(
      getRuntimeModeDisabledReason("full-access", "antigravity"),
    ).toBeUndefined();
    expect(getRuntimeModeDisabledReason("auto", "codex")).toBeUndefined();
  });
});

describe("AccessPicker component lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("auto-clamps to full-access if harness is antigravity and mode is supervised", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        createElement(AccessPicker, {
          value: "supervised",
          harness: "antigravity",
          onChange,
        }),
      );
    });

    expect(onChange).toHaveBeenCalledWith("full-access");
  });

  it("auto-clamps to supervised if non-codex harness has auto mode selected", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        createElement(AccessPicker, {
          value: "auto",
          harness: "claude",
          onChange,
        }),
      );
    });

    expect(onChange).toHaveBeenCalledWith("supervised");
  });

  it("renders disabled options with reason and prevents clicking them", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        createElement(AccessPicker, {
          value: "full-access",
          harness: "antigravity",
          onChange,
        }),
      );
    });

    // Open dropdown
    const trigger = container.querySelector(
      'button[aria-haspopup="listbox"]',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    act(() => {
      trigger.click();
    });

    // Supervised should be disabled
    const options = Array.from(
      container.querySelectorAll('button[role="option"]'),
    ) as HTMLButtonElement[];
    expect(options.length).toBe(4);

    const supervisedOption = options.find((btn) =>
      btn.textContent?.includes("Supervised"),
    )!;
    expect(supervisedOption).toBeTruthy();
    expect(supervisedOption.disabled).toBe(true);
    expect(supervisedOption.getAttribute("aria-disabled")).toBe("true");
    expect(supervisedOption.textContent).toContain(
      "Antigravity CLI only supports Full Access",
    );

    // Clicking supervised should not trigger onChange
    act(() => {
      supervisedOption.click();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
