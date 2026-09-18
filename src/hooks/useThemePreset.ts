import { useEffect, useState } from "react";
import {
  getThemePreset,
  loadThemePresetId,
  THEME_PRESET_CHANGE_EVENT,
  type ThemePreset,
} from "../lib/themePresets";

export function useThemePreset(): ThemePreset {
  const [preset, setPreset] = useState<ThemePreset>(() =>
    getThemePreset(loadThemePresetId()),
  );

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<ThemePreset>).detail;
      if (detail && detail.id) {
        setPreset(detail);
      } else {
        setPreset(getThemePreset(loadThemePresetId()));
      }
    };
    window.addEventListener(THEME_PRESET_CHANGE_EVENT, onThemeChange);
    return () =>
      window.removeEventListener(THEME_PRESET_CHANGE_EVENT, onThemeChange);
  }, []);

  return preset;
}
