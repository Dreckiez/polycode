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
import { setAntigravityHasAcpForTest } from "../lib/harness/availability";

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
    expect(isRuntimeModeSupported("auto", "codex", false)).toBe(true);
    expect(isRuntimeModeSupported("auto", "codex", true)).toBe(true);
    expect(isRuntimeModeSupported("auto", "antigravity", true)).toBe(false);
    expect(isRuntimeModeSupported("auto", "antigravity", false)).toBe(false);
    expect(isRuntimeModeSupported("auto", "claude", false)).toBe(false);
    expect(isRuntimeModeSupported("auto", undefined, false)).toBe(false);
  });

  it("enables supervised, auto-accept-edits, full-access for antigravity when ACP is present", () => {
    expect(isRuntimeModeSupported("supervised", "antigravity", true)).toBe(true);
    expect(
      isRuntimeModeSupported("auto-accept-edits", "antigravity", true),
    ).toBe(true);
    expect(isRuntimeModeSupported("full-access", "antigravity", true)).toBe(
      true,
    );
    expect(isRuntimeModeSupported("auto", "antigravity", true)).toBe(false);
  });

  it("enables only full-access for antigravity when ACP is absent", () => {
    expect(isRuntimeModeSupported("supervised", "antigravity", false)).toBe(
      false,
    );
    expect(
      isRuntimeModeSupported("auto-accept-edits", "antigravity", false),
    ).toBe(false);
    expect(isRuntimeModeSupported("auto", "antigravity", false)).toBe(false);
    expect(isRuntimeModeSupported("full-access", "antigravity", false)).toBe(
      true,
    );
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
    expect(getRuntimeModeDisabledReason("auto", "antigravity", true)).toBe(
      "Only available for Codex",
    );
    expect(getRuntimeModeDisabledReason("supervised", "antigravity", false)).toBe(
      "Requires Antigravity ACP server",
    );
    expect(
      getRuntimeModeDisabledReason("auto-accept-edits", "antigravity", false),
    ).toBe("Requires Antigravity ACP server");
    expect(
      getRuntimeModeDisabledReason("full-access", "antigravity", false),
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

  it("auto-clamps to full-access if antigravity has no ACP and mode is supervised", () => {
    act(() => {
      setAntigravityHasAcpForTest(false);
    });
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
    act(() => {
      setAntigravityHasAcpForTest(true);
    });
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
    act(() => {
      setAntigravityHasAcpForTest(false);
    });
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
    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    act(() => {
      trigger.click();
    });

    // Supervised should be disabled
    const options = Array.from(container.querySelectorAll('button[role="option"]')) as HTMLButtonElement[];
    expect(options.length).toBe(4);

    const supervisedOption = options.find((btn) => btn.textContent?.includes("Supervised"))!;
    expect(supervisedOption).toBeTruthy();
    expect(supervisedOption.disabled).toBe(true);
    expect(supervisedOption.getAttribute("aria-disabled")).toBe("true");
    expect(supervisedOption.textContent).toContain("Requires Antigravity ACP server");

    // Clicking supervised should not trigger onChange
    act(() => {
      supervisedOption.click();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows selecting supervised when antigravity has ACP", () => {
    act(() => {
      setAntigravityHasAcpForTest(true);
    });
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
    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    act(() => {
      trigger.click();
    });

    const options = Array.from(container.querySelectorAll('button[role="option"]')) as HTMLButtonElement[];
    const supervisedOption = options.find((btn) => btn.textContent?.includes("Supervised"))!;
    expect(supervisedOption.disabled).toBe(false);

    act(() => {
      supervisedOption.click();
    });
    expect(onChange).toHaveBeenCalledWith("supervised");
  });
});
