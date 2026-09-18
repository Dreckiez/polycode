import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemePreset,
  DEFAULT_THEME_ID,
  getThemePreset,
  loadThemePresetId,
  saveThemePresetId,
  THEME_PRESET_KEY,
  THEME_PRESETS,
} from "./themePresets";

function mockLocalStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

describe("themePresets", () => {
  beforeEach(mockLocalStorage);

  it("includes all popular presets with full color palettes", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(10);
    for (const preset of THEME_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.accentColor).toBeTruthy();
      expect(preset.editorPalette.keyword).toBeTruthy();
      expect(preset.editorPalette.string).toBeTruthy();
      expect(preset.editorPalette.callable).toBeTruthy();
      expect(preset.terminalPalette.black).toBeTruthy();
      expect(preset.terminalPalette.red).toBeTruthy();
      expect(preset.terminalPalette.green).toBeTruthy();
    }
  });

  it("defaults to the default theme", () => {
    expect(DEFAULT_THEME_ID).toBe("default");
    expect(loadThemePresetId()).toBe("default");
    expect(getThemePreset("default").name).toBe("MonoCode Slate");
  });

  it("falls back to default for unknown preset IDs", () => {
    expect(getThemePreset("non-existent-theme").id).toBe("default");
  });

  it("persists and applies selected theme preset", () => {
    saveThemePresetId("dracula");
    expect(loadThemePresetId()).toBe("dracula");
    const applied = applyThemePreset("catppuccin-mocha");
    expect(applied.id).toBe("catppuccin-mocha");
    expect(loadThemePresetId()).toBe("catppuccin-mocha");
  });
});
