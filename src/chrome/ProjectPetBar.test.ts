// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectPetBar } from "./ProjectPetBar";
import { PetPlayground } from "../lib/petPlayground";

let root: Root;
let container: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let now: number;
let render: (busy?: boolean, enabled?: boolean) => void;

beforeEach(() => {
  localStorage.clear();
  frames = new Map();
  now = 0;
  let nextFrame = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Math, "random").mockReturnValue(0.6);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return new DOMRect(0, 100, this.tagName === "IMG" ? 40 : 800, 40);
    },
  );
  const captured = new Set<number>();
  Element.prototype.setPointerCapture = (id) => {
    captured.add(id);
  };
  Element.prototype.hasPointerCapture = (id) => captured.has(id);
  Element.prototype.releasePointerCapture = (id) => {
    captured.delete(id);
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  render = (busy = false, enabled = true) => {
    act(() =>
      root.render(
        createElement(ProjectPetBar, {
          project: "C:/work/pets",
          busy,
          enabled,
          scale: 1,
        }),
      ),
    );
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function tick(count = 1) {
  act(() => {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      const current = [...frames.values()];
      frames.clear();
      for (const callback of current) callback(now);
    }
  });
}

function pointer(type: string, x: number, y: number) {
  const stage = container.firstElementChild!;
  act(() =>
    stage.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: x,
        clientY: y,
      }),
    ),
  );
}

describe("project pet bar interactions", () => {
  it("uses ledge pixels and launches the dragged ball after release", () => {
    render();
    tick();
    const pet = container.querySelector("img")!;
    expect(pet.style.transform).toContain("px");
    expect(parseFloat(pet.style.transform.split("(")[1])).toBeGreaterThan(400);
    pointer("pointerdown", 400, 130);
    pointer("pointermove", 450, 80);
    tick();
    const ball = container.querySelector("span")!;
    const held = ball.style.transform;
    pointer("pointerup", 500, 60);
    tick(2);
    expect(ball.style.visibility).toBe("visible");
    expect(ball.style.transform).not.toBe(held);
    expect(container.firstElementChild!.hasPointerCapture(1)).toBe(false);
  });

  it("blocks mouse throws during a turn and throws automatically only once", () => {
    const autoThrow = vi.spyOn(PetPlayground.prototype, "throwRandomBall");
    render(true);
    tick();
    const ball = container.querySelector("span")!;
    const initial = ball.style.transform;
    render(true);
    tick();
    expect(ball.style.transform).not.toBe(initial);
    const afterRender = ball.style.transform;
    pointer("pointerdown", 50, 120);
    pointer("pointerup", 50, 120);
    expect(ball.style.transform).toBe(afterRender);
    expect(container.firstElementChild!.hasPointerCapture(1)).toBe(false);
    expect(autoThrow).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    tick();
    expect(autoThrow).toHaveBeenCalledTimes(1);
    render(false);
    render(true);
    tick();
    expect(autoThrow).toHaveBeenCalledTimes(2);
  });

  it("cancels captured throws and shuts down every frame when disabled or hidden", () => {
    render();
    pointer("pointerdown", 400, 120);
    pointer("pointercancel", 400, 120);
    tick();
    expect(container.querySelector("span")!.style.visibility).toBe("hidden");
    render(false, false);
    expect(container.childElementCount).toBe(0);
    expect(frames.size).toBe(0);
    render();
    expect(frames.size).toBe(1);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(container.childElementCount).toBe(0);
    expect(frames.size).toBe(0);
  });
});
