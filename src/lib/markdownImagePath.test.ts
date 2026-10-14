import { describe, expect, it } from "vitest";
import { resolveMarkdownImagePath } from "./markdownImagePath";

describe("resolveMarkdownImagePath", () => {
  it("resolves a relative image from the Markdown file's directory", () => {
    expect(resolveMarkdownImagePath("../assets/logo.png", "/repo/docs/guide")).toBe(
      "/repo/docs/assets/logo.png",
    );
  });

  it("decodes file URLs and Windows drive paths", () => {
    expect(
      resolveMarkdownImagePath(
        "file:///D:/Repo/My%20Project/image.png",
        "/repo/docs",
      ),
    ).toBe("D:/Repo/My Project/image.png");
  });

  it("keeps encoded filename characters while dropping a browser fragment", () => {
    expect(
      resolveMarkdownImagePath("images/diagram%23final.png#preview", "/repo/docs"),
    ).toBe("/repo/docs/images/diagram#final.png");
  });
});
