import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { handleEditorFindKey, openFindInActiveEditor } from "../surfaces/editorSearch";
import { runUpdateFlow } from "../lib/updater";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  UI_SCALE_DEFAULT,
  uiScaleCommand,
  zoomInUiScale,
  zoomOutUiScale,
} from "../lib/uiScale";
import { NOTIFICATION_CLICK_EVENT } from "../lib/notifications";
import { tabCommand, shouldHandleListNavigation } from "../lib/tabKeys";
import type { SettingsSectionId } from "../lib/settings";

export type KeyboardShortcutActions = {
  onNew: () => void;
  onArchiveFocusedSession: (e: KeyboardEvent) => void;
  onCloseOtherTabs: () => void;
  onClosePane: (sessionId?: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onVisitBack: () => void;
  onVisitForward: () => void;
  onActivate: (slot: number) => void;
  onSplit: (dir: "right" | "down") => void;
  onFocusDir: (dir: "left" | "right" | "up" | "down") => void;
  onToggleSidebar: () => void;
  onGoToFile: () => void;
  onFindInProject: () => void;
  onOpenSearch: () => void;
  onOpenNotes: () => void;
  pickProject: () => void;
  onNewTerminal: () => void;
  onNewTerminalTab: () => void;
  onToggleProjectTerminal: () => void;
  onNavigateSessionList: (delta: number) => void;
  onNavigateProjectList: (delta: number) => void;
  openSettings: (section?: SettingsSectionId) => void;
  onOpenApprovalSession: (sessionId: string) => void;
};

export type KeyboardShortcutDeps = {
  searchViewOpen: boolean;
  notesViewOpen: boolean;
  settingsOpen: boolean;
  filePickerOpen: boolean;
  whatsNewVersion: string | null;
  sessions: Array<{ id: string }>;
  runUpdateFlow: (manual: boolean) => Promise<unknown>;
  openFindInActiveEditor: () => void;
  getCurrentWindow: () => { setFocus: () => void };
  loadUiScale: () => number;
  saveUiScale: (scale: number) => number;
  applyUiScale: (scale: number) => void;
  uiScaleDefault: number;
  zoomInUiScale: (scale: number) => number;
  zoomOutUiScale: (scale: number) => number;
};

export function useKeyboardShortcuts(
  actions: React.RefObject<KeyboardShortcutActions>,
  deps: KeyboardShortcutDeps
): void {
  const debounce = useRef({ name: "", at: 0 });
  const run = useCallback((name: string, fn: () => void) => {
    const now = performance.now();
    if (name === debounce.current.name && now - debounce.current.at < 80) return;
    debounce.current = { name, at: now };
    fn();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.isComposing) {
        const zoom = uiScaleCommand(e);
        if (zoom) {
          e.preventDefault();
          e.stopPropagation();
          if (zoom === "zoom-in") {
            const next = saveUiScale(zoomInUiScale(loadUiScale()));
            void applyUiScale(next);
          } else if (zoom === "zoom-out") {
            const next = saveUiScale(zoomOutUiScale(loadUiScale()));
            void applyUiScale(next);
          } else {
            saveUiScale(UI_SCALE_DEFAULT);
            void applyUiScale(UI_SCALE_DEFAULT);
          }
          return;
        }
      }
      const cmd = tabCommand(e);
      if (cmd) {
        if (cmd === "archive-session") {
          actions.current.onArchiveFocusedSession(e);
          return;
        }
        const target = e.target instanceof Element ? e.target : null;
        const listNavigation =
          cmd === "prev-session" ||
          cmd === "next-session" ||
          cmd === "prev-project" ||
          cmd === "next-project";
        if (listNavigation) {
          const target = e.target instanceof Element ? e.target : null;
          const blockedTarget = Boolean(
            target?.closest(
              'input, textarea, select, [contenteditable="true"], .cm-editor, .monocode-terminal, [role="dialog"], [data-model-picker"], [data-file-picker], [data-branch-picker"], [data-skill-picker"], [data-mention-picker], [data-app-search]'
            )
          );
          const emptyComposerTarget = Boolean(
            target?.matches('textarea[data-composer-empty="true"]')
          );
          const surfaceOpen =
            deps.searchViewOpen ||
            deps.notesViewOpen ||
            deps.settingsOpen ||
            deps.filePickerOpen ||
            Boolean(deps.whatsNewVersion);
          if (
            !shouldHandleListNavigation({
              blockedTarget,
              emptyComposerTarget,
              surfaceOpen,
            })
          ) {
            return;
          }
        }
        if (
          target?.closest(".monocode-terminal") &&
          e.ctrlKey &&
          !e.metaKey &&
          (cmd === "back" ||
            cmd === "forward" ||
            /Mac|iPhone|iPad/.test(navigator.platform))
        ) {
          return;
        }
        if (
          (cmd === "split-right" || cmd === "split-down") &&
          target?.closest(".cm-editor")
        ) {
          return;
        }
        const inPicker =
          target &&
          target.closest(
            "[data-model-picker], [data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-app-search]"
          );
        if (inPicker && typeof cmd === "object" && "activate" in cmd) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const a = actions.current;
        if (cmd === "new") run("new", a.onNew);
        else if (cmd === "close-others") run("close-others", a.onCloseOtherTabs);
        else if (cmd === "close") run("close", a.onClosePane);
        else if (cmd === "next") run("next", a.onNext);
        else if (cmd === "prev") run("prev", a.onPrev);
        else if (cmd === "back") run("back", a.onVisitBack);
        else if (cmd === "forward") run("forward", a.onVisitForward);
        else if (cmd === "split-right") run("split-right", () => a.onSplit("right"));
        else if (cmd === "split-down") run("split-down", () => a.onSplit("down"));
        else if (cmd === "new-terminal") run("new-terminal", a.onNewTerminal);
        else if (cmd === "new-terminal-tab") run("new-terminal-tab", a.onNewTerminalTab);
        else if (cmd === "toggle-terminal") run("toggle-terminal", a.onToggleProjectTerminal);
        else if (cmd === "prev-session") run("prev-session", () => a.onNavigateSessionList(-1));
        else if (cmd === "next-session") run("next-session", () => a.onNavigateSessionList(1));
        else if (cmd === "prev-project") run("prev-project", () => a.onNavigateProjectList(-1));
        else if (cmd === "next-project") run("next-project", () => a.onNavigateProjectList(1));
        else if ("focus" in cmd) run(`focus-${cmd.focus}`, () => a.onFocusDir(cmd.focus));
        else run(`activate-${cmd.activate}`, () => a.onActivate(cmd.activate));
        return;
      }
      if (
        !deps.searchViewOpen &&
        !deps.notesViewOpen &&
        handleEditorFindKey(e)
      ) {
        e.stopPropagation();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        e.stopPropagation();
        run("toggle_sidebar", actions.current.onToggleSidebar);
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        e.stopPropagation();
        run("go_to_file", actions.current.onGoToFile);
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        const target = e.target instanceof Element ? e.target : null;
        if (target?.closest(".monocode-terminal") && e.ctrlKey && !e.metaKey) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        run("open_search", actions.current.onOpenSearch);
        return;
      }
      if (mod && !e.altKey && !e.shiftKey && e.key === ",") {
        e.preventDefault();
        e.stopPropagation();
        run("open_settings", () => actions.current.openSettings());
        return;
      }
      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        e.stopPropagation();
        run("find_in_project", actions.current.onFindInProject);
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deps.searchViewOpen, deps.notesViewOpen, deps.settingsOpen, deps.filePickerOpen, deps.whatsNewVersion]);

  useEffect(() => {
    const unlisten: Array<Promise<() => void>> = [
      listen("new_tab", () => run("new", actions.current.onNew)),
      listen("close_other_tabs", () => run("close-others", actions.current.onCloseOtherTabs)),
      listen("close_tab", () => run("close", actions.current.onClosePane)),
      listen("next_tab", () => run("next", actions.current.onNext)),
      listen("prev_tab", () => run("prev", actions.current.onPrev)),
      listen("back_tab", () => run("back", actions.current.onVisitBack)),
      listen("forward_tab", () => run("forward", actions.current.onVisitForward)),
      listen("split_right", () => run("split-right", () => actions.current.onSplit("right"))),
      listen("split_down", () => run("split-down", () => actions.current.onSplit("down"))),
      listen("new_terminal", () => run("new-terminal", actions.current.onNewTerminal)),
      listen("new_terminal_tab", () => run("new-terminal-tab", actions.current.onNewTerminalTab)),
      listen("toggle_terminal", () => run("toggle-terminal", actions.current.onToggleProjectTerminal)),
      listen("focus_left", () => run("focus-left", () => actions.current.onFocusDir("left"))),
      listen("focus_right", () => run("focus-right", () => actions.current.onFocusDir("right"))),
      listen("focus_up", () => run("focus-up", () => actions.current.onFocusDir("up"))),
      listen("focus_down", () => run("focus-down", () => actions.current.onFocusDir("down"))),
      listen("toggle_sidebar", () => run("toggle_sidebar", actions.current.onToggleSidebar)),
      listen("open_project", () => {
        void actions.current.pickProject();
      }),
      listen("go_to_file", () => actions.current.onGoToFile()),
      listen("open_search", () => actions.current.onOpenSearch()),
      listen("open_notes", () => actions.current.onOpenNotes()),
      listen("open_settings", () => actions.current.openSettings()),
      listen("check_for_updates", () => {
        void runUpdateFlow(true);
      }),
      listen("sidebar_opacity", () => {
        actions.current.openSettings("appearance");
      }),
      listen("find_in_project", () => actions.current.onFindInProject()),
      listen("find", () => {
        openFindInActiveEditor();
      }),
      listen("open_model_picker", () => {
        window.dispatchEvent(new Event("open_model_picker"));
      }),
      listen<string>(NOTIFICATION_CLICK_EVENT, ({ payload: sessionId }) => {
        if (!deps.sessions.some((s) => s.id === sessionId)) return;
        void getCurrentWindow().setFocus();
        actions.current.onOpenApprovalSession(sessionId);
      }),
      listen("zoom_in", () => {
        const next = zoomInUiScale(loadUiScale());
        saveUiScale(next);
        void applyUiScale(next);
      }),
      listen("zoom_out", () => {
        const next = zoomOutUiScale(loadUiScale());
        saveUiScale(next);
        void applyUiScale(next);
      }),
      listen("zoom_reset", () => {
        saveUiScale(UI_SCALE_DEFAULT);
        void applyUiScale(UI_SCALE_DEFAULT);
      }),
    ];
    return () => {
      void Promise.all(unlisten).then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);
}