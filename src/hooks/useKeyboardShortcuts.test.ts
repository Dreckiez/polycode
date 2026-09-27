// @vitest-environment happy-dom
import { act, createElement, StrictMode, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TabCommand } from "../lib/tabKeys";
import { NOTIFICATION_CLICK_EVENT } from "../lib/notifications";
import {
  type KeyboardShortcutActions,
  type KeyboardShortcutDeps,
  useKeyboardShortcuts,
} from "./useKeyboardShortcuts";

const mocks = vi.hoisted(() => {
  type Registration = {
    event: string;
    handler: (payload?: unknown) => void;
    unlisten: ReturnType<typeof vi.fn>;
  };
  const registrations: Registration[] = [];
  return {
    listen: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      const unlisten = vi.fn();
      registrations.push({ event, handler, unlisten });
      return Promise.resolve(unlisten) as Promise<() => void>;
    }),
    resetRegistrations: () => {
      registrations.length = 0;
    },
    emit: (event: string, payload?: unknown) => {
      for (let i = registrations.length - 1; i >= 0; i -= 1) {
        if (registrations[i]!.event === event) {
          registrations[i]!.handler(payload);
          return;
        }
      }
      throw new Error(`@tauri listen("${event}") was never registered`);
    },
    unlisteners: () => registrations.map((registration) => registration.unlisten),
    getCurrentWindow: vi.fn(() => ({ setFocus: mocks.setFocus })),
    setFocus: vi.fn(),
    runUpdateFlow: vi.fn(),
    openFindInActiveEditor: vi.fn(),
    applyUiScale: vi.fn(),
    loadUiScale: vi.fn(),
    saveUiScale: vi.fn(),
    UI_SCALE_DEFAULT: 1.05,
    uiScaleCommand: vi.fn(),
    zoomInUiScale: vi.fn(),
    zoomOutUiScale: vi.fn(),
    handleEditorFindKey: vi.fn(),
    tabCommand: vi.fn(),
    shouldHandleListNavigation: vi.fn(),
    realTabCommand: null as ((event: KeyboardEvent) => TabCommand | null) | null,
    realShouldHandleListNavigation: null as
      | ((input: {
          blockedTarget: boolean;
          emptyComposerTarget: boolean;
          surfaceOpen: boolean;
        }) => boolean)
      | null,
    NOTIFICATION_CLICK_EVENT: "polycode:notification-click",
  };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: mocks.getCurrentWindow,
}));
vi.mock("../lib/notifications", () => ({
  NOTIFICATION_CLICK_EVENT: mocks.NOTIFICATION_CLICK_EVENT,
}));
vi.mock("../lib/updater", () => ({ runUpdateFlow: mocks.runUpdateFlow }));
vi.mock("../surfaces/editorSearch", () => ({
  handleEditorFindKey: mocks.handleEditorFindKey,
  openFindInActiveEditor: mocks.openFindInActiveEditor,
}));
vi.mock("../lib/uiScale", () => ({
  applyUiScale: mocks.applyUiScale,
  loadUiScale: mocks.loadUiScale,
  saveUiScale: mocks.saveUiScale,
  UI_SCALE_DEFAULT: mocks.UI_SCALE_DEFAULT,
  uiScaleCommand: mocks.uiScaleCommand,
  zoomInUiScale: mocks.zoomInUiScale,
  zoomOutUiScale: mocks.zoomOutUiScale,
}));
vi.mock("../lib/tabKeys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/tabKeys")>();
  mocks.realTabCommand = actual.tabCommand;
  mocks.realShouldHandleListNavigation = actual.shouldHandleListNavigation;
  mocks.tabCommand.mockImplementation(actual.tabCommand);
  mocks.shouldHandleListNavigation.mockImplementation(
    actual.shouldHandleListNavigation,
  );
  return {
    ...actual,
    tabCommand: mocks.tabCommand,
    shouldHandleListNavigation: mocks.shouldHandleListNavigation,
  };
});

let root: Root;
let container: HTMLDivElement;
let actionsRef: RefObject<KeyboardShortcutActions>;
let actuators: KeyboardShortcutActions;
let deps: KeyboardShortcutDeps;

function KeyboardShortcutsHarness({
  actionsRef,
  deps,
}: {
  actionsRef: RefObject<KeyboardShortcutActions>;
  deps: KeyboardShortcutDeps;
}) {
  useKeyboardShortcuts(actionsRef, deps);
  return null;
}

function createActions(): KeyboardShortcutActions {
  return {
    onNew: vi.fn(),
    onArchiveFocusedSession: vi.fn(),
    onCloseOtherTabs: vi.fn(),
    onClosePane: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onVisitBack: vi.fn(),
    onVisitForward: vi.fn(),
    onActivate: vi.fn(),
    onSplit: vi.fn(),
    onFocusDir: vi.fn(),
    onToggleSidebar: vi.fn(),
    onGoToFile: vi.fn(),
    onFindInProject: vi.fn(),
    onOpenSearch: vi.fn(),
    onOpenNotes: vi.fn(),
    pickProject: vi.fn(),
    onNewTerminal: vi.fn(),
    onNewTerminalTab: vi.fn(),
    onToggleProjectTerminal: vi.fn(),
    onNavigateSessionList: vi.fn(),
    onNavigateProjectList: vi.fn(),
    openSettings: vi.fn(),
    onOpenApprovalSession: vi.fn(),
  };
}

async function mount(opts: {
  searchViewOpen?: boolean;
  notesViewOpen?: boolean;
  settingsOpen?: boolean;
  filePickerOpen?: boolean;
  whatsNewVersion?: string | null;
  sessions?: Array<{ id: string }>;
} = {}) {
  actuators = createActions();
  actionsRef = { current: actuators };
  deps = {
    searchViewOpen: opts.searchViewOpen ?? false,
    notesViewOpen: opts.notesViewOpen ?? false,
    settingsOpen: opts.settingsOpen ?? false,
    filePickerOpen: opts.filePickerOpen ?? false,
    whatsNewVersion: opts.whatsNewVersion ?? null,
    sessions: opts.sessions ?? [],
    runUpdateFlow: vi.fn(),
    openFindInActiveEditor: vi.fn(),
    getCurrentWindow: () => ({ setFocus: vi.fn() }),
    loadUiScale: vi.fn(),
    saveUiScale: vi.fn(),
    applyUiScale: vi.fn(),
    uiScaleDefault: 1.05,
    zoomInUiScale: vi.fn(),
    zoomOutUiScale: vi.fn(),
  };
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(KeyboardShortcutsHarness, { actionsRef, deps }),
      ),
    ),
  );
}

function press(init: {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  target?: Node;
}): void {
  const { target = document.body, isComposing, ...eventInit } = init;
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...eventInit,
  });
  if (isComposing !== undefined) {
    Object.defineProperty(event, "isComposing", { value: isComposing });
  }
  target.dispatchEvent(event);
}

const realClosest = Element.prototype
  .closest as unknown as (this: Element, selector: string) => Element | null;

function clazz(className: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  document.body.append(element);
  return element;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Element.prototype, "closest").mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return realClosest.call(this, selector.replaceAll('picker"]', "picker]"));
  });
  mocks.resetRegistrations();
  mocks.listen.mockClear();
  mocks.getCurrentWindow.mockClear().mockReturnValue({ setFocus: mocks.setFocus });
  mocks.setFocus.mockClear();
  mocks.runUpdateFlow.mockReset();
  mocks.openFindInActiveEditor.mockReset();
  mocks.applyUiScale.mockReset();
  mocks.loadUiScale.mockReset().mockReturnValue(1);
  mocks.saveUiScale.mockReset().mockImplementation((scale: number) => scale);
  mocks.uiScaleCommand.mockReset().mockImplementation(
    (event: { key: string; code: string }) => {
      if (event.code === "NumpadAdd" || event.key === "+" || event.key === "=")
        return "zoom-in";
      if (
        event.code === "NumpadSubtract" ||
        event.key === "-" ||
        event.key === "_"
      )
        return "zoom-out";
      if (event.code === "Numpad0" || event.key === "0") return "zoom-reset";
      return null;
    },
  );
  mocks.zoomInUiScale
    .mockReset()
    .mockImplementation((current: number = 1) => Math.round((current + 0.05) * 100) / 100);
  mocks.zoomOutUiScale
    .mockReset()
    .mockImplementation((current: number = 1) => Math.round((current - 0.05) * 100) / 100);
  mocks.handleEditorFindKey.mockReset().mockReturnValue(false);
  mocks.tabCommand.mockReset().mockImplementation(mocks.realTabCommand!);
  mocks.shouldHandleListNavigation
    .mockReset()
    .mockImplementation(mocks.realShouldHandleListNavigation!);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  for (const node of [...document.body.children]) node.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useKeyboardShortcuts", () => {
  it("Cmd/Ctrl+T opens a new session tab; Cmd+N does not", async () => {
    await mount();
    press({ key: "t", code: "KeyT", metaKey: true });
    expect(actuators.onNew).toHaveBeenCalledTimes(1);
    press({ key: "n", code: "KeyN", ctrlKey: true });
    expect(actuators.onNew).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+W closes the focused pane", async () => {
    await mount();
    press({ key: "w", code: "KeyW", ctrlKey: true });
    expect(actuators.onClosePane).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+Alt+T closes the other tabs", async () => {
    await mount();
    press({ key: "t", code: "KeyT", metaKey: true, altKey: true });
    expect(actuators.onCloseOtherTabs).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+Shift+]/[ navigate next/prev; Cmd/Ctrl+]/[ move back/forward", async () => {
    await mount();
    press({ key: "]", code: "BracketRight", metaKey: true, shiftKey: true });
    expect(actuators.onNext).toHaveBeenCalledTimes(1);
    press({ key: "[", code: "BracketLeft", ctrlKey: true, shiftKey: true });
    expect(actuators.onPrev).toHaveBeenCalledTimes(1);
    press({ key: "]", code: "BracketRight", metaKey: true });
    expect(actuators.onVisitForward).toHaveBeenCalledTimes(1);
    press({ key: "[", code: "BracketLeft", ctrlKey: true });
    expect(actuators.onVisitBack).toHaveBeenCalledTimes(1);
  });

  it("Escape does not call a stop action; the editor find helper is consulted instead", async () => {
    await mount();
    press({ key: "Escape", code: "Escape" });
    expect(mocks.handleEditorFindKey).toHaveBeenCalledTimes(1);
    for (const action of Object.values(actuators)) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  it("Escape is steered to the editor when the find helper claims it", async () => {
    await mount();
    mocks.handleEditorFindKey.mockReturnValue(true);
    press({ key: "Escape", code: "Escape" });
    expect(mocks.handleEditorFindKey).toHaveBeenCalledTimes(1);
    for (const action of Object.values(actuators)) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  it("skips the editor find helper while a surface is open", async () => {
    await mount({ searchViewOpen: true });
    press({ key: "f", code: "KeyF", metaKey: true });
    expect(mocks.handleEditorFindKey).not.toHaveBeenCalled();
  });

  it("Cmd+1 activates a slot and Cmd+D splits right", async () => {
    await mount();
    press({ key: "1", code: "Digit1", metaKey: true });
    expect(actuators.onActivate).toHaveBeenCalledExactlyOnceWith(0);
    press({ key: "d", code: "KeyD", metaKey: true });
    expect(actuators.onSplit).toHaveBeenCalledExactlyOnceWith("right");
  });

  it("Cmd/Ctrl+Alt+Arrow moves pane focus", async () => {
    await mount();
    press({ key: "ArrowRight", code: "ArrowRight", metaKey: true, altKey: true });
    expect(actuators.onFocusDir).toHaveBeenCalledExactlyOnceWith("right");
  });

  it("Cmd+Shift+A archives the focused session directly", async () => {
    await mount();
    press({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
    expect(actuators.onArchiveFocusedSession).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+B, P, K, comma, and Shift+F run their commands", async () => {
    await mount();
    press({ key: "b", code: "KeyB", metaKey: true });
    expect(actuators.onToggleSidebar).toHaveBeenCalledTimes(1);
    press({ key: "p", code: "KeyP", metaKey: true });
    expect(actuators.onGoToFile).toHaveBeenCalledTimes(1);
    press({ key: "k", code: "KeyK", metaKey: true });
    expect(actuators.onOpenSearch).toHaveBeenCalledTimes(1);
    press({ key: ",", code: "Comma", ctrlKey: true });
    expect(actuators.openSettings).toHaveBeenCalledTimes(1);
    press({ key: "f", code: "KeyF", ctrlKey: true, shiftKey: true });
    expect(actuators.onFindInProject).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+= zooms in and Cmd/Ctrl+0 resets the UI scale", async () => {
    await mount();
    mocks.loadUiScale.mockReturnValue(1.25);
    press({ key: "=", code: "Equal", metaKey: true });
    expect(mocks.saveUiScale).toHaveBeenCalledExactlyOnceWith(1.3);
    expect(mocks.applyUiScale).toHaveBeenCalledExactlyOnceWith(1.3);
    press({ key: "0", code: "Digit0", ctrlKey: true });
    expect(mocks.saveUiScale).toHaveBeenLastCalledWith(1.05);
    expect(mocks.applyUiScale).toHaveBeenLastCalledWith(1.05);
  });

  it("ignores composing (IME) key events", async () => {
    await mount();
    press({ key: "t", code: "KeyT", metaKey: true, isComposing: true });
    expect(actuators.onNew).not.toHaveBeenCalled();
  });

  it("Ctrl+Tab cycles tabs even while an editor is focused", async () => {
    await mount();
    const editor = clazz("cm-editor");
    press({ key: "Tab", code: "Tab", ctrlKey: true, target: editor });
    expect(actuators.onNext).toHaveBeenCalledTimes(1);
  });

  it("does not split when the shortcut is pressed inside the editor", async () => {
    await mount();
    const editor = clazz("cm-editor");
    press({ key: "d", code: "KeyD", metaKey: true, target: editor });
    expect(actuators.onSplit).not.toHaveBeenCalled();
  });

  it("Ctrl+[ is left to the terminal instead of going back", async () => {
    await mount();
    const terminal = clazz("polycode-terminal");
    press({ key: "[", code: "BracketLeft", ctrlKey: true, target: terminal });
    expect(actuators.onVisitBack).not.toHaveBeenCalled();
    press({ key: "[", code: "BracketLeft", metaKey: true, target: terminal });
    expect(actuators.onVisitBack).toHaveBeenCalledTimes(1);
  });

  it("handles session navigation from a plain focus target", async () => {
    await mount();
    press({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true, shiftKey: true });
    expect(actuators.onNavigateSessionList).toHaveBeenCalledExactlyOnceWith(-1);
    press({ key: "ArrowDown", code: "ArrowDown", metaKey: true, shiftKey: true });
    expect(actuators.onNavigateSessionList).toHaveBeenLastCalledWith(1);
  });

  it("blocks session navigation when focus is inside an editor", async () => {
    await mount();
    const editor = clazz("cm-editor");
    press({
      key: "ArrowUp",
      code: "ArrowUp",
      metaKey: true,
      shiftKey: true,
      target: editor,
    });
    expect(mocks.shouldHandleListNavigation).toHaveBeenCalledExactlyOnceWith({
      blockedTarget: true,
      emptyComposerTarget: false,
      surfaceOpen: false,
    });
    expect(actuators.onNavigateSessionList).not.toHaveBeenCalled();
  });

  it("allows session navigation from an empty composer textarea", async () => {
    await mount();
    const composer = document.createElement("textarea");
    composer.dataset.composerEmpty = "true";
    document.body.append(composer);
    press({
      key: "ArrowUp",
      code: "ArrowUp",
      metaKey: true,
      shiftKey: true,
      target: composer,
    });
    expect(mocks.shouldHandleListNavigation).toHaveBeenCalledExactlyOnceWith({
      blockedTarget: true,
      emptyComposerTarget: true,
      surfaceOpen: false,
    });
    expect(actuators.onNavigateSessionList).toHaveBeenCalledExactlyOnceWith(-1);
  });

  it("blocks session navigation while a surface is open", async () => {
    await mount({ searchViewOpen: true });
    press({ key: "ArrowUp", code: "ArrowUp", metaKey: true, shiftKey: true });
    expect(mocks.shouldHandleListNavigation).toHaveBeenCalledExactlyOnceWith({
      blockedTarget: false,
      emptyComposerTarget: false,
      surfaceOpen: true,
    });
    expect(actuators.onNavigateSessionList).not.toHaveBeenCalled();
  });

  it("honors shouldHandleListNavigation when it declines the shortcut", async () => {
    await mount();
    mocks.shouldHandleListNavigation.mockReturnValue(false);
    press({ key: "ArrowDown", code: "ArrowDown", metaKey: true, shiftKey: true });
    expect(actuators.onNavigateSessionList).not.toHaveBeenCalled();
  });

  it("registers the real Tauri menu events and dispatches them", async () => {
    await mount();
    for (const event of [
      "new_tab",
      "close_tab",
      "next_tab",
      "prev_tab",
      "open_settings",
      NOTIFICATION_CLICK_EVENT,
    ]) {
      expect(mocks.listen).toHaveBeenCalledWith(event, expect.any(Function));
    }
    mocks.emit("new_tab");
    expect(actuators.onNew).toHaveBeenCalledTimes(1);
    mocks.emit("close_tab");
    expect(actuators.onClosePane).toHaveBeenCalledTimes(1);
    mocks.emit("next_tab");
    expect(actuators.onNext).toHaveBeenCalledTimes(1);
    mocks.emit("prev_tab");
    expect(actuators.onPrev).toHaveBeenCalledTimes(1);
    mocks.emit("open_settings");
    expect(actuators.openSettings).toHaveBeenCalledTimes(1);
    mocks.emit("open_notes");
    expect(actuators.onOpenNotes).toHaveBeenCalledTimes(1);
    mocks.emit("open_project");
    expect(actuators.pickProject).toHaveBeenCalledTimes(1);
  });

  it("'check_for_updates' and 'find' menu events run the real helpers", async () => {
    await mount();
    mocks.emit("check_for_updates");
    expect(mocks.runUpdateFlow).toHaveBeenCalledExactlyOnceWith(true);
    mocks.emit("find");
    expect(mocks.openFindInActiveEditor).toHaveBeenCalledExactlyOnceWith();
  });

  it("zoom menu events adjust the UI scale", async () => {
    await mount();
    mocks.loadUiScale.mockReturnValue(1.1);
    mocks.emit("zoom_in");
    expect(mocks.saveUiScale).toHaveBeenCalledExactlyOnceWith(1.15);
    expect(mocks.applyUiScale).toHaveBeenCalledExactlyOnceWith(1.15);
    mocks.emit("zoom_out");
    expect(mocks.saveUiScale).toHaveBeenLastCalledWith(1.05);
    expect(mocks.applyUiScale).toHaveBeenLastCalledWith(1.05);
  });

  it("'open_model_picker' re-emits an app-level window event", async () => {
    await mount();
    const seen: string[] = [];
    const listener = () => {
      seen.push("open_model_picker");
    };
    window.addEventListener("open_model_picker", listener);
    mocks.emit("open_model_picker");
    expect(seen).toEqual(["open_model_picker"]);
    window.removeEventListener("open_model_picker", listener);
  });

  it("a notification click focuses the window and opens the approval session", async () => {
    await mount({ sessions: [{ id: "session-x" }] });
    mocks.emit(NOTIFICATION_CLICK_EVENT, { payload: "session-x" });
    expect(mocks.getCurrentWindow).toHaveBeenCalledTimes(1);
    expect(mocks.setFocus).toHaveBeenCalledTimes(1);
    expect(actuators.onOpenApprovalSession).toHaveBeenCalledExactlyOnceWith(
      "session-x",
    );
  });

  it("ignores notification clicks for sessions it does not know", async () => {
    await mount();
    mocks.emit(NOTIFICATION_CLICK_EVENT, "ghost");
    expect(mocks.setFocus).not.toHaveBeenCalled();
    expect(actuators.onOpenApprovalSession).not.toHaveBeenCalled();
  });

  it("unsubscribes from every Tauri event when unmounting", async () => {
    await mount();
    const pending = mocks
      .unlisteners()
      .filter((fn) => fn.mock.calls.length === 0);
    expect(pending.length).toBeGreaterThan(0);
    await act(async () => root.unmount());
    await act(async () => {});
    expect(pending.every((fn) => fn.mock.calls.length > 0)).toBe(true);
    container.remove();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
});