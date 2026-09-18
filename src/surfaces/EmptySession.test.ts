import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptySession } from "./EmptySession";

describe("empty session background", () => {
  it("renders the composer container", () => {
    const markup = renderToStaticMarkup(
      createElement(EmptySession, {
        cwd: "/work/demo",
        composer: createElement("div", { id: "composer-slot" }),
      }),
    );

    expect(markup).toContain('id="composer-slot"');
    expect(markup).not.toContain("<canvas");
  });
});
