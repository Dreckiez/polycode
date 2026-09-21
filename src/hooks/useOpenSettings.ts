import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { saveSettingsSection, type SettingsSectionId } from "../lib/settings";

export type OpenSettingsDeps = {
  setFilePickerOpen: Dispatch<SetStateAction<boolean>>;
  setNotesViewOpen: Dispatch<SetStateAction<boolean>>;
  setSearchViewOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsSection: Dispatch<SetStateAction<SettingsSectionId>>;
};

export function useOpenSettings(deps: OpenSettingsDeps) {
  const d = deps;

  const openSettings = useCallback(
    (section?: SettingsSectionId) => {
      d.setFilePickerOpen(false);
      d.setSearchViewOpen(false);
      d.setNotesViewOpen(false);
      if (section) {
        d.setSettingsSection(section);
        saveSettingsSection(section);
      }
      d.setSettingsOpen(true);
    },
    [
      d.setFilePickerOpen,
      d.setSearchViewOpen,
      d.setNotesViewOpen,
      d.setSettingsSection,
      d.setSettingsOpen,
    ],
  );

  const onOpenSettings = useCallback(() => openSettings(), [openSettings]);

  return { openSettings, onOpenSettings };
}