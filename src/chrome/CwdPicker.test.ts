// @vitest-environment happy-dom
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CwdPicker } from "./CwdPicker";

vi.mock("./Popover", () => ({
  Popover: ({
    children,
    role,
    className,
  }: {
    children: React.ReactNode;
    role?: string;
    className?: string;
  }) =>
    createElement(
      "div",
      {
        role,
        className,
        "data-mock-popover": "true",
      },
      children,
    ),
}));

describe("CwdPicker", () => {
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

  it("cleanly shows Open project and New terminal when there is no project", async () => {
    const onOpenProject = vi.fn();
    const onNewTerminal = vi.fn();
    const onCwdChange = vi.fn();

    await act(async () => {
      root.render(
        createElement(CwdPicker, {
          cwd: "~",
          recents: [],
          onCwdChange,
          onOpenProject,
          onNewTerminal,
        }),
      );
    });

    const trigger = container.querySelector("button");
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.click();
    });

    const menuItems = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const itemTexts = menuItems.map((el) => el.textContent?.trim() ?? "");

    expect(itemTexts).toContain("Open project…");
    expect(itemTexts.some((t) => t.includes("New terminal"))).toBe(true);
    expect(container.textContent).not.toContain("Current project");
    expect(container.textContent).not.toContain("Recent projects");

    const openProjectBtn = menuItems.find((el) =>
      el.textContent?.includes("Open project…"),
    );
    expect(openProjectBtn).toBeTruthy();

    await act(async () => {
      openProjectBtn?.click();
    });

    expect(onOpenProject).toHaveBeenCalledTimes(1);
  });

  it("shows recents in the top section when recents are available", async () => {
    const onOpenProject = vi.fn();
    const onCwdChange = vi.fn();

    await act(async () => {
      root.render(
        createElement(CwdPicker, {
          cwd: "~",
          recents: [{ path: "/path/to/my-repo", openedAt: Date.now() }],
          onCwdChange,
          onOpenProject,
        }),
      );
    });

    const trigger = container.querySelector("button");
    await act(async () => {
      trigger?.click();
    });

    expect(container.textContent).toContain("Recent projects");
    expect(container.textContent).toContain("my-repo");
    expect(container.textContent).toContain("Open project…");
  });
});
