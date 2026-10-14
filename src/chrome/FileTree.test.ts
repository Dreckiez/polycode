// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listCachedDir,
  notifyDirsChanged,
  refreshDir,
  saveExpanded,
} from "../lib/fileTree";
import type { FsEntry } from "../lib/fs";
import { FileTree } from "./FileTree";

const { iconRender, directories, invoke } = vi.hoisted(() => ({
  iconRender: vi.fn(),
  directories: new Map<string, FsEntry[]>(),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args: Record<string, string>) => {
    invoke(command, args);
    if (command !== "list_dir")
      return command === "move_path"
        ? `${args.destParent}/${args.from.split("/").at(-1)}`
        : undefined;
    return directories.get(args.path) ?? [];
  },
}));

// Count row renders independently of FileTypeIcon's own memoization.
vi.mock("./FileTypeIcon", () => ({
  FileTypeIcon: ({ name }: { name: string }) => {
    iconRender(name);
    return createElement("span", { "data-icon": name });
  },
}));

let container: HTMLDivElement;
let root: Root;
let cwd: string;
let props: ComponentProps<typeof FileTree>;
let project = 0;

function file(name: string): FsEntry {
  return { name, path: `${cwd}/${name}`, isDir: false, ignored: false };
}

function render(tick = 0, hidden = false) {
  root.render(
    createElement(
      "div",
      { hidden, "data-tick": tick },
      createElement(FileTree, props),
    ),
  );
}

function row(name: string): HTMLButtonElement {
  return container.querySelector(`[role="treeitem"][title="${cwd}/${name}"]`)!;
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cwd = `/project-${++project}`;
  props = { cwd, onOpenFile: vi.fn() };
  directories.set(cwd, [file("first.ts")]);
  await listCachedDir(cwd);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("FileTree render isolation", () => {
  it.each([false, true])(
    "skips unchanged rows on parent updates (hidden=%s)",
    async (hidden) => {
      await act(async () => render(0, hidden));
      expect(row("first.ts")).not.toBeNull();
      iconRender.mockClear();

      for (let tick = 1; tick <= 20; tick++) act(() => render(tick, hidden));

      expect(iconRender.mock.calls.length).toBe(0);
    },
  );

  it("still updates Git decorations and uses a changed navigation callback", async () => {
    await act(async () => render());
    const onOpenFile = vi.fn();
    props = {
      ...props,
      onOpenFile,
      gitStatuses: {
        files: new Map([[`${cwd}/first.ts`, "modified"]]),
        dirs: new Map(),
      },
    };
    act(() => render(1));
    expect(row("first.ts").querySelector(".text-amber-400")).not.toBeNull();
    act(() => row("first.ts").click());
    expect(onOpenFile).toHaveBeenCalledWith(`${cwd}/first.ts`, undefined, {
      exact: true,
    });
  });

  it("still expands folders and refreshes rows after filesystem changes", async () => {
    saveExpanded(cwd, new Set());
    await act(async () => render());
    expect(row("first.ts")).toBeNull();
    const expand = container.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    )!;
    await act(async () => expand.click());
    expect(row("first.ts")).not.toBeNull();

    vi.useFakeTimers();
    directories.set(cwd, [file("added.ts")]);
    await act(async () => {
      notifyDirsChanged();
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(row("added.ts")).not.toBeNull();
    expect(row("first.ts")).toBeNull();
  });

  it("skips re-rendering unaffected rows when selection changes", async () => {
    directories.set(cwd, [file("a.ts"), file("b.ts"), file("c.ts")]);
    await refreshDir(cwd);
    await act(async () => render());
    expect(row("a.ts")).not.toBeNull();
    expect(row("b.ts")).not.toBeNull();
    expect(row("c.ts")).not.toBeNull();

    // Select a.ts first
    act(() => row("a.ts").click());
    iconRender.mockClear();

    // Switch selection from a.ts to b.ts
    act(() => row("b.ts").click());

    // Only a.ts (deselected) and b.ts (selected) should re-render; c.ts must NOT re-render!
    const renderedNames = iconRender.mock.calls.map((call) => call[0]);
    expect(renderedNames).not.toContain("c.ts");
    expect(iconRender.mock.calls.length).toBe(2);
  });

  it("moves a file when it is dropped on a folder", async () => {
    const folder: FsEntry = {
      name: "nested",
      path: `${cwd}/nested`,
      isDir: true,
      ignored: false,
    };
    directories.set(cwd, [file("first.ts"), folder]);
    await refreshDir(cwd);
    await act(async () => render());
    const source = row("first.ts");
    const target = row("nested");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => target),
    });

    act(() => {
      source.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 1,
          clientY: 1,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 12,
          clientY: 12,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 12,
          clientY: 12,
        }),
      );
    });

    await act(async () => Promise.resolve());
    expect(invoke).toHaveBeenCalledWith("move_path", {
      from: `${cwd}/first.ts`,
      destParent: `${cwd}/nested`,
    });
  });

  it("moves a folder when it is dropped on another folder", async () => {
    const sourceFolder: FsEntry = {
      name: "source",
      path: `${cwd}/source`,
      isDir: true,
      ignored: false,
    };
    const targetFolder: FsEntry = {
      name: "target",
      path: `${cwd}/target`,
      isDir: true,
      ignored: false,
    };
    directories.set(cwd, [sourceFolder, targetFolder]);
    await refreshDir(cwd);
    await act(async () => render());
    const source = row("source");
    const target = row("target");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => target),
    });

    act(() => {
      source.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 1,
          clientY: 1,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 12,
          clientY: 12,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 12,
          clientY: 12,
        }),
      );
    });

    await act(async () => Promise.resolve());
    expect(invoke).toHaveBeenCalledWith("move_path", {
      from: `${cwd}/source`,
      destParent: `${cwd}/target`,
    });
  });

  it("deletes the selected entry with the Delete key", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    await act(async () => render());
    const source = row("first.ts");
    act(() => source.click());
    act(() => {
      source.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Delete" }),
      );
    });

    await act(async () => Promise.resolve());
    expect(invoke).toHaveBeenCalledWith("delete_path", {
      path: `${cwd}/first.ts`,
    });
  });

  it("deletes a selected folder with the Delete key", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const folder: FsEntry = {
      name: "obsolete",
      path: `${cwd}/obsolete`,
      isDir: true,
      ignored: false,
    };
    directories.set(cwd, [folder]);
    await refreshDir(cwd);
    await act(async () => render());
    const source = row("obsolete");
    act(() => source.click());
    act(() => {
      source.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Delete" }),
      );
    });

    await act(async () => Promise.resolve());
    expect(invoke).toHaveBeenCalledWith("delete_path", {
      path: `${cwd}/obsolete`,
    });
  });
});
