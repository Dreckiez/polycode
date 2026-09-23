// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecondOpinionButton, HandoffButton } from "./SecondOpinionButton";

vi.mock("../lib/harness/availability", () => ({
  getHarnessAvailabilitySnapshot: () => 0,
  hasProbedHarnessAvailability: () => true,
  isHarnessAvailable: () => true,
  probeHarnessAvailability: () => Promise.resolve(),
  subscribeHarnessAvailability: () => () => undefined,
}));

vi.mock("../lib/harness/registry", () => ({
  refreshHarnessCatalogs: () => Promise.resolve(),
}));

vi.mock("../lib/models", () => ({
  getModelSnapshot: () => 0,
  getPickerVisibilitySnapshot: () => 0,
  isPickerProviderVisible: () => true,
  modelsFor: (harness: string) => [
    { id: `${harness}:model-alpha`, name: `${harness} Alpha` },
    { id: `${harness}:model-beta`, name: `${harness} Beta` },
    { id: `${harness}:model-gamma`, name: `${harness} Gamma` },
  ],
  preferredModelId: (harness: string) => `${harness}:model-alpha`,
  subscribeModels: () => () => undefined,
  subscribePickerVisibility: () => () => undefined,
}));

vi.mock("./Popover", () => ({
  Popover: ({
    children,
    role,
    className,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode;
    role?: string;
    className?: string;
    "aria-label"?: string;
  }) => createElement("div", { role, className, "aria-label": ariaLabel }, children),
}));

let container: HTMLDivElement;
let root: Root;

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

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

describe("SecondOpinionButton & HandoffButton", () => {
  it("renders trigger button with cursor-pointer", () => {
    act(() => {
      root.render(
        createElement(SecondOpinionButton, {
          from: "claude",
          onPick: vi.fn(),
        }),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>("button");
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain("cursor-pointer");
  });

  it("includes the current provider in targets by default", () => {
    act(() => {
      root.render(
        createElement(SecondOpinionButton, {
          from: "claude",
          onPick: vi.fn(),
        }),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    act(() => trigger.click());

    const menuItems = container.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]',
    );
    const itemTexts = Array.from(menuItems).map((btn) => btn.textContent ?? "");

    // Current provider (Claude Code) must be included
    expect(itemTexts.some((text) => text.includes("Claude"))).toBe(true);
    // Other providers must also be present
    expect(itemTexts.some((text) => text.includes("Codex"))).toBe(true);
    // Items must have cursor-pointer
    expect(menuItems[0]?.className).toContain("cursor-pointer");
  });

  it("HandoffButton also includes current provider and cursor-pointer", () => {
    act(() => {
      root.render(
        createElement(HandoffButton, {
          from: "claude",
          onPick: vi.fn(),
        }),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    expect(trigger.className).toContain("cursor-pointer");
    act(() => trigger.click());

    const menuItems = container.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]',
    );
    const itemTexts = Array.from(menuItems).map((btn) => btn.textContent ?? "");
    expect(itemTexts.some((text) => text.includes("Claude"))).toBe(true);
  });

  it("renders search bar in model submenu and filters models", () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        createElement(SecondOpinionButton, {
          from: "claude",
          onPick,
        }),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    act(() => trigger.click());

    // Hover first provider to activate submenu
    const firstProvider = container.querySelector<HTMLButtonElement>(
      'button[role="menuitem"][data-provider-index="0"]',
    )!;
    act(() => {
      firstProvider.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });

    // Check search input exists in submenu
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label^="Search"]',
    );
    expect(searchInput).not.toBeNull();
    expect(searchInput?.placeholder).toContain("Search 3 models");

    // Initially shows all 3 models
    let modelItems = container.querySelectorAll<HTMLButtonElement>(
      'div[aria-label$="models"] button[role="menuitem"]',
    );
    expect(modelItems.length).toBe(3);

    // Type "Beta" in the search box
    act(() => {
      setInputValue(searchInput!, "Beta");
    });

    modelItems = container.querySelectorAll<HTMLButtonElement>(
      'div[aria-label$="models"] button[role="menuitem"]',
    );
    expect(modelItems.length).toBe(1);
    expect(modelItems[0].textContent).toContain("Beta");

    // Click filtered model item
    act(() => {
      modelItems[0].click();
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("claude", "claude:model-beta");
  });

  it("clears model search query when clear button is clicked", () => {
    act(() => {
      root.render(
        createElement(SecondOpinionButton, {
          from: "claude",
          onPick: vi.fn(),
        }),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    act(() => trigger.click());

    const firstProvider = container.querySelector<HTMLButtonElement>(
      'button[role="menuitem"][data-provider-index="0"]',
    )!;
    act(() => {
      firstProvider.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });

    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label^="Search"]',
    )!;

    act(() => {
      setInputValue(searchInput, "Alpha");
    });

    let clearBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear search"]',
    );
    expect(clearBtn).not.toBeNull();

    act(() => {
      clearBtn!.click();
    });

    expect(searchInput.value).toBe("");
    const modelItems = container.querySelectorAll<HTMLButtonElement>(
      'div[aria-label$="models"] button[role="menuitem"]',
    );
    expect(modelItems.length).toBe(3);
  });
});
