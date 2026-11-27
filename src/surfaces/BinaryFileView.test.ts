// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BinaryFileView } from "./BinaryFileView";

const actions = vi.hoisted(() => ({
  readBinaryFile: vi.fn(
    async () =>
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ),
}));

vi.mock("../lib/fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/fs")>()),
  readBinaryFile: actions.readBinaryFile,
}));

vi.mock("../lib/fileWatch", () => ({
  watchFile: () => () => {},
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("zooms at the cursor with plain scrolling and lets a drag pan without resetting zoom", async () => {
  await act(async () => {
    root.render(
      createElement(BinaryFileView, {
        path: "/repo/art/original image.png",
        cwd: "/repo",
      }),
    );
  });
  const image = container.querySelector("img")!;
  const scroller = image.parentElement!;
  Object.defineProperties(image, {
    naturalWidth: { value: 400 },
    naturalHeight: { value: 300 },
  });
  vi.spyOn(image, "getBoundingClientRect").mockImplementation(() =>
    image.style.width
      ? new DOMRect(20, 10, 400, 300)
      : new DOMRect(50, 20, 200, 150),
  );
  act(() => image.dispatchEvent(new Event("load")));

  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -Math.log(2) * 100,
  });
  // happy-dom omits the MouseEvent fields on WheelEvent.
  Object.assign(wheel, { clientX: 150, clientY: 95 });
  act(() => image.dispatchEvent(wheel));
  expect(wheel.defaultPrevented).toBe(true);
  expect(image.style.width).toBe("400px");
  expect(scroller.scrollLeft).toBeCloseTo(70);

  Object.defineProperty(image, "setPointerCapture", { value: vi.fn() });
  act(() => {
    for (const [type, clientX] of [
      ["pointerdown", 150],
      ["pointermove", 120],
      ["pointerup", 120],
    ] as const) {
      image.dispatchEvent(
        new PointerEvent(type, { pointerId: 1, clientX, bubbles: true }),
      );
    }
    image.click();
  });
  expect(scroller.scrollLeft).toBeCloseTo(100);
  expect(image.style.width).toBe("400px");
});
