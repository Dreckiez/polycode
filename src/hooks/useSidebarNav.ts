import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

export type SidebarNavDeps = {
  setProjectRailOpen: Dispatch<SetStateAction<boolean>>;
  saveProjectRailOpen: (value: boolean) => void;
  setFilePickerOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setNotesViewOpen: Dispatch<SetStateAction<boolean>>;
  setSearchViewOpen: Dispatch<SetStateAction<boolean>>;
  setSearchViewFocusToken: Dispatch<SetStateAction<number>>;
  settingsOpen: boolean;
  searchViewOpen: boolean;
  notesViewOpen: boolean;
  onVisitBack: () => void;
  onVisitForward: () => void;
};

export function useSidebarNav(deps: SidebarNavDeps) {
  const d = deps;

  const onToggleSidebar = useCallback(() => {
    d.setProjectRailOpen((open) => {
      const next = !open;
      d.saveProjectRailOpen(next);
      return next;
    });
  }, []);

  const onOpenSearch = useCallback(() => {
    d.setFilePickerOpen(false);
    d.setSettingsOpen(false);
    d.setNotesViewOpen(false);
    d.setSearchViewOpen(true);
    d.setSearchViewFocusToken((token) => token + 1);
  }, []);

  const onRailBack = useCallback(() => {
    if (d.settingsOpen) {
      d.setSettingsOpen(false);
      return;
    }
    if (d.searchViewOpen) {
      d.setSearchViewOpen(false);
      return;
    }
    if (d.notesViewOpen) {
      d.setNotesViewOpen(false);
      return;
    }
    d.onVisitBack();
  }, [d.onVisitBack, d.searchViewOpen, d.settingsOpen, d.notesViewOpen]);

  const onRailForward = useCallback(() => {
    d.setSearchViewOpen(false);
    d.setSettingsOpen(false);
    d.setNotesViewOpen(false);
    d.onVisitForward();
  }, [d.onVisitForward]);

  return {
    onToggleSidebar,
    onOpenSearch,
    onRailBack,
    onRailForward,
  };
}