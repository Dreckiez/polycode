// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cssColor } from "./TerminalView";

describe("cssColor", () => {
  it("resolves valid CSS colors", () => {
    const red = cssColor("red", "#000000");
    expect(red).toBeDefined();
    expect(red).not.toBe("#000000");
  });

  it("returns fallback for invalid colors without leaking previous context color", () => {
    // 1. Establish a previous color in the singleton context
    const valid = cssColor("#00ff00", "#000000");
    expect(valid).toBe("#00ff00");

    // 2. Call with an invalid color; must return the fallback rather than #00ff00
    const fallback = cssColor("not-a-real-color-12345", "#ff00ff");
    expect(fallback).toBe("#ff00ff");
  });

  it("supports var fallback syntax when variable is unset", () => {
    const result = cssColor("var(--non-existent-variable, #abcdef)", "#000000");
    expect(result).toBe("#abcdef");
  });

  it("does not leak previous color when given keywords unparseable by canvas like currentColor", () => {
    const valid = cssColor("#00ff00", "#000000");
    expect(valid).toBe("#00ff00");

    const result = cssColor("currentColor", "#ff00ff");
    expect(result).not.toBe("#00ff00");
  });
});
