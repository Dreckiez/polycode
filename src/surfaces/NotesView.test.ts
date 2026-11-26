// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { expect, it, vi } from "vitest";
import { NotesView } from "./NotesView";

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async () => () => undefined,
  }),
}));
vi.mock("../chrome/WindowControls", () => ({ WindowControls: () => null }));
vi.mock("./AgentMarkdown", () => ({
  AgentMarkdown: () => null,
  MarkdownSourceHighlight: () => null,
}));

it("opens the note from its own menu and keeps its editor mounted when returning to Notes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "notes_list") {
      return [
        {
          id: "example",
          slug: "example",
          title: "Example note",
          body: "Note body",
          tags: [],
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: "second",
          slug: "second",
          title: "Second note",
          body: "Another note body",
          tags: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ];
    }
  });

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();

  function Notes() {
    const [besideSession, setBesideSession] = useState(false);
    return createElement(NotesView, {
      besideRail: true,
      besideSession,
      onClose,
      onOpenBesideSession: () => setBesideSession(true),
      onOpenFull: () => setBesideSession(false),
    });
  }

  try {
    await act(async () => root.render(createElement(Notes)));
    const selectedTitle = () =>
      container.querySelector<HTMLInputElement>('[aria-label="Note title"]');
    expect(selectedTitle()?.value).toBe("Example note");
    expect(container.textContent).not.toContain("Open beside session");
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Actions for Second note"]',
    )!;
    const menuItem = () =>
      document.querySelector<HTMLButtonElement>('[role="menuitem"]');
    act(() => trigger.click());
    expect(selectedTitle()?.value).toBe("Example note");
    expect(menuItem()?.textContent).toBe("Open beside session");
    expect(document.activeElement).toBe(menuItem());
    act(() => {
      menuItem()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(menuItem()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    act(() => trigger.click());
    act(() => menuItem()!.click());
    expect(
      container.querySelector('[aria-label="Note beside session"]'),
    ).toBeTruthy();
    expect(container.querySelector('[aria-label="Filter notes"]')).toBeNull();
    const noteTitle = selectedTitle();
    expect(noteTitle?.value).toBe("Second note");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close note pane"]')!
        .click();
    });
    expect(onClose).toHaveBeenCalledOnce();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open full Notes"]')!
        .click();
    });
    expect(container.querySelector('[aria-label="Notes"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Filter notes"]')).toBeTruthy();
    expect(selectedTitle()).toBe(noteTitle);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
