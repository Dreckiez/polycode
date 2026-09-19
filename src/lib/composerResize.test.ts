import { describe, expect, it } from "vitest";
import { COMPOSER_MAX_HEIGHT, resizeComposer } from "./composerResize";

function field(scrollHeight: number, height = "") {
  return { style: { height }, scrollHeight };
}

describe("resizeComposer", () => {
  it("grows the field to fit the draft", () => {
    const el = field(88);
    resizeComposer(el);
    expect(el.style.height).toBe("88px");
  });

  it("stops growing at the max height", () => {
    const el = field(400);
    resizeComposer(el);
    expect(el.style.height).toBe(`${COMPOSER_MAX_HEIGHT}px`);
  });

  it("leaves the height alone when the field has no layout box", () => {
    const el = field(0, "88px");
    resizeComposer(el);
    expect(el.style.height).toBe("88px");
  });

  it("shrinks back down when text is deleted from max height", () => {
    // Simulating textarea that was at max height, then user deletes lines down to 48px
    const el = field(48, `${COMPOSER_MAX_HEIGHT}px`);
    resizeComposer(el);
    expect(el.style.height).toBe("48px");
  });
});
