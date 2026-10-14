// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerMenu } from "./ExplorerMenu";

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
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("ExplorerMenu", () => {
  it("highlights a disabled action on hover without allowing it to run", () => {
    const onPick = vi.fn();
    act(() => {
      root.render(
        createElement(ExplorerMenu, {
          x: 0,
          y: 0,
          items: [
            { kind: "item", id: "open", label: "Open" },
            { kind: "item", id: "delete", label: "Delete", disabled: true },
          ],
          onPick,
          onClose: vi.fn(),
        }),
      );
    });
    const item = document.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    )[1]!;

    expect(item.disabled).toBe(false);
    act(() => {
      item.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(item.className).toContain("bg-content/5");
    act(() => item.click());
    expect(onPick).not.toHaveBeenCalled();
  });
});
