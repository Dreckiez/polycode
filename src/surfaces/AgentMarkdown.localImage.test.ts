// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readBinaryFile: vi.fn(async () =>
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ),
}));

vi.mock("../lib/fs", () => ({
  readBinaryFile: mocks.readBinaryFile,
  revealPath: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
  openUrl: vi.fn(),
}));

const { AgentMarkdown } = await import("./AgentMarkdown");

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  class TestURL extends URL {
    static createObjectURL = vi.fn(() => "blob:local-image");
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", TestURL);
  mocks.readBinaryFile.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AgentMarkdown local images", () => {
  it("loads a relative image from beside the Markdown file", async () => {
    await act(async () => {
      root.render(
        createElement(AgentMarkdown, {
          text: "![REST Đủ hàng](report_images/Truoc_Du.png)",
          cwd: "D:/work/reports",
        }),
      );
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.readBinaryFile).toHaveBeenCalledWith(
      "D:/work/reports/report_images/Truoc_Du.png",
    );
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("blob:local-image");
    expect(image?.getAttribute("alt")).toBe("REST Đủ hàng");
  });
});
