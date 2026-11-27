// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ImageLightbox } from "./ImageLightbox";

it("zooms at the cursor with plain scrolling in either direction", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  try {
    act(() => {
      root.render(
        createElement(ImageLightbox, {
          src: "blob:preview",
          alt: "Preview",
          onClose: vi.fn(),
        }),
      );
    });
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const image = dialog.querySelector("img")!;
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 200, 150),
    );
    Object.defineProperties(dialog, {
      clientWidth: { value: 200 },
      clientHeight: { value: 150 },
    });
    Object.defineProperties(image, {
      offsetWidth: { value: 200 },
      offsetHeight: { value: 150 },
    });

    const scroll = (deltaY: number, deltaX = 0) => {
      const wheel = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY,
      });
      // happy-dom omits the MouseEvent fields on WheelEvent.
      Object.assign(wheel, { clientX: 140, clientY: 100 });
      act(() => image.dispatchEvent(wheel));
      expect(wheel.defaultPrevented).toBe(true);
    };

    scroll(-Math.log(2) * 100);
    expect(image.style.transform).toBe("translate(-40px, -25px) scale(2)");
    scroll(0, 50);
    expect(image.style.transform).toBe("translate(-40px, -25px) scale(2)");
    scroll(Math.log(2) * 100);
    expect(image.style.transform).toBe("translate(0px, 0px) scale(1)");
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
