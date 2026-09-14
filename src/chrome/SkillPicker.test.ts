// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillPicker } from "./SkillPicker";
import { ompCommandsFromRpcData } from "../lib/harness/piSkills";
import { PLAN_COMMAND } from "../lib/plan";
import { COMPACT_COMMAND } from "../lib/compact";
import { SESSION_FOLDER_COMMAND } from "../lib/sessionFolderCommand";
import type { Skill } from "../lib/skills";

describe("native command picker", () => {
  it("renders native commands and argument hints alongside MonoCode shortcuts, without new skill button", () => {
    const native: Skill[] = ompCommandsFromRpcData({
      commands: [
        { name: "plan", source: "builtin", description: "OMP planning" },
        {
          name: "compact",
          source: "builtin",
          input: { hint: "[instructions]" },
        },
        {
          name: "workflow",
          source: "custom",
          description: "Choose planners and reviewers",
          input: { hint: "<reviewer> [path]" },
        },
        {
          name: "mcp",
          source: "builtin",
          subcommands: [{ name: "list", usage: "list --all" }],
        },
      ],
    }).map((command) => ({ ...command, kind: "native" }));
    const html = renderToStaticMarkup(
      createElement(SkillPicker, {
        skills: [
          SESSION_FOLDER_COMMAND,
          PLAN_COMMAND,
          COMPACT_COMMAND,
          ...native,
        ],
        query: "",
        active: 0,
        creating: false,
        cwd: "/repo",
        onActive: vi.fn(),
        onPick: vi.fn(),
      }),
    );
    expect(html).toContain("/omp:plan");
    expect(html).toContain("/omp:compact");
    expect(html).toContain("/plan");
    expect(html).toContain("/compact");
    expect(html).toContain("/add-to-folder");
    expect(html).toContain("/workflow");
    expect(html).toContain("Choose planners and reviewers");
    expect(html).toContain("&lt;reviewer&gt; [path]");
    expect(html).toContain("omp · custom");
    expect(html).toContain("list --all");
    expect(html).not.toContain("New skill");
  });
});

describe("SkillPicker dismissal", () => {
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
    vi.unstubAllGlobals();
  });

  it("calls onDismiss when clicking outside the skill picker", () => {
    const onDismiss = vi.fn();
    act(() => {
      root.render(
        createElement(SkillPicker, {
          skills: [PLAN_COMMAND],
          query: "",
          active: 0,
          cwd: "/repo",
          onActive: vi.fn(),
          onPick: vi.fn(),
          onDismiss,
        }),
      );
    });

    const picker = container.querySelector("[data-skill-picker]");
    expect(picker).not.toBeNull();

    // Clicking inside the picker should not dismiss
    act(() => {
      picker?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // Clicking outside the picker (e.g. document body) should dismiss
    const outside = document.createElement("div");
    document.body.append(outside);
    act(() => {
      outside.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    outside.remove();
  });
});
