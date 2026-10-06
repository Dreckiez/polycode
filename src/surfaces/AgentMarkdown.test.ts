import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentMarkdown } from "./AgentMarkdown";

describe("AgentMarkdown text direction", () => {
  it("detects direction independently for RTL and LTR blocks", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: [
          "# راهنمای تنظیمات",
          "",
          "این متن فارسی است.",
          "",
          "1. مرحله اول",
          "2. مرحله دوم",
          "",
          "English remains left to right.",
        ].join("\n"),
      }),
    );

    expect(markup).toMatch(/dir="rtl"[^>]*><h1/);
    expect(markup).toMatch(/dir="rtl"[^>]*><p/);
    expect(markup).toMatch(/dir="rtl"[^>]*><ol/);
    expect(markup).toMatch(/dir="ltr"[^>]*><p/);
  });

  it("isolates links and inline code inside RTL prose", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: "مسیر `templates/admin/settings.html` و [پیوند](https://example.com) را بررسی کنید.",
      }),
    );

    expect(markup).toContain('<code dir="ltr"');
    expect(markup).toContain('dir="auto"');
  });

  it("keeps fenced code blocks LTR when their content is Arabic", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: "```txt\nمرحبا بالعالم\n```",
      }),
    );

    expect(markup).toContain('class="markdown-code-shell" dir="ltr"');
  });
});

describe("AgentMarkdown inline code", () => {
  it("lets a long inline code span grow instead of clipping to a fixed height", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: "1. `Before I refactor the transcript rendering, summarize how turns are grouped, in five bullets.`",
      }),
    );

    const match = markup.match(/<code dir="ltr" class="([^"]*)"/);
    expect(match).not.toBeNull();
    const classes = match![1].split(/\s+/);
    expect(classes).toContain("inline-flex");
    expect(classes).toContain("min-h-6");
    expect(classes).toContain("max-w-full");
    expect(classes).toContain("[overflow-wrap:anywhere]");
    expect(classes).not.toContain("h-6");
  });
});

describe("AgentMarkdown note images", () => {
  it("keeps app-owned note image references for the async image resolver", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: "![Diagram](/note-assets/note-1/123-diagram.png)",
      }),
    );

    expect(markup).toContain(
      'data-note-image="/note-assets/note-1/123-diagram.png"',
    );
    expect(markup).toContain('alt="Diagram"');
  });

  it("renders web images with lazy loading and styling", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: "![Logo](https://example.com/logo.png)",
      }),
    );

    expect(markup).toContain('src="https://example.com/logo.png"');
    expect(markup).toContain('alt="Logo"');
    expect(markup).toContain('loading="lazy"');
  });
});

describe("AgentMarkdown tables", () => {
  it("renders GFM tables with wrapper, header, and alignment", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: [
          "| Header 1 | Header 2 |",
          "| :--- | ---: |",
          "| Cell A | Cell B |",
        ].join("\n"),
      }),
    );

    expect(markup).toContain('class="markdown-table-wrapper');
    expect(markup).toContain("<table");
    expect(markup).toContain("<thead");
    expect(markup).toContain("<tbody");
    expect(markup).toContain("Header 1");
    expect(markup).toContain("Header 2");
    expect(markup).toContain("Cell A");
    expect(markup).toContain("Cell B");
    expect(markup).toContain('style="text-align:left"');
    expect(markup).toContain('style="text-align:right"');
  });
});

describe("AgentMarkdown task lists and disclosures", () => {
  it("renders checkboxes for task lists", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: ["- [ ] Todo item", "- [x] Done item"].join("\n"),
      }),
    );

    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("Todo item");
    expect(markup).toContain("Done item");
  });

  it("renders details and summary disclosures", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: [
          "<details>",
          "<summary>Click me</summary>",
          "Hidden content",
          "</details>",
        ].join("\n"),
      }),
    );

    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
    expect(markup).toContain("Click me");
    expect(markup).toContain("Hidden content");
  });
});

describe("AgentMarkdown frontmatter", () => {
  it("parses and renders frontmatter metadata card and content", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentMarkdown, {
        text: [
          "---",
          "title: Documentation",
          "version: 1.0.0",
          "---",
          "# Heading",
          "Body text",
        ].join("\n"),
      }),
    );

    expect(markup).toContain("Metadata");
    expect(markup).toContain("title:");
    expect(markup).toContain("Documentation");
    expect(markup).toContain("version:");
    expect(markup).toContain("1.0.0");
    expect(markup).toContain("<h1");
    expect(markup).toContain("Heading");
  });
});

