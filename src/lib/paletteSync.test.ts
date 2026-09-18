import { beforeEach, describe, expect, it } from "vitest";
import {
  extractPaletteFromRgbaBuffer,
  hslToHex,
  rgbToHsl,
  saveExtractedImagePalette,
  loadExtractedImagePalette,
  type ExtractedPalette,
} from "./paletteSync";

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

describe("paletteSync", () => {
  beforeEach(mockLocalStorage);
  describe("rgbToHsl and hslToHex conversions", () => {
    it("converts pure colors correctly", () => {
      expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
      expect(rgbToHsl(0, 255, 0)).toEqual({ h: 120, s: 100, l: 50 });
      expect(rgbToHsl(0, 0, 255)).toEqual({ h: 240, s: 100, l: 50 });
    });

    it("converts HSL back to hex properly", () => {
      expect(hslToHex(0, 100, 50).toLowerCase()).toBe("#ff0000");
      expect(hslToHex(120, 100, 50).toLowerCase()).toBe("#00ff00");
      expect(hslToHex(240, 100, 50).toLowerCase()).toBe("#0000ff");
    });
  });

  describe("extractPaletteFromRgbaBuffer", () => {
    it("detects violet/purple dominant colors from a purple sample image", () => {
      const width = 10;
      const height = 10;
      const buffer = new Uint8ClampedArray(width * height * 4);

      // Fill with vibrant violet (#8b5cf6 -> rgb(139, 92, 246))
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 139;
        buffer[i + 1] = 92;
        buffer[i + 2] = 246;
        buffer[i + 3] = 255;
      }

      const palette = extractPaletteFromRgbaBuffer(buffer);

      expect(palette.accentColor).toBeTruthy();
      // Hue around 250-270 (violet/purple)
      expect(palette.themeHue).toBeGreaterThanOrEqual(240);
      expect(palette.themeHue).toBeLessThanOrEqual(280);
      expect(palette.themeSaturation).toBeGreaterThanOrEqual(15);
      expect(palette.swatches.length).toBeGreaterThan(0);
    });
  });

  describe("storage and persistence", () => {
    it("persists and restores extracted palette", () => {
      const mockPalette: ExtractedPalette = {
        accentColor: "#bb9af7",
        themeHue: 255,
        themeSaturation: 30,
        linkColor: "#7dcfff",
        markdownHeadingColor: "#bb9af7",
        swatches: ["#bb9af7", "#7aa2f7"],
      };

      saveExtractedImagePalette(mockPalette);
      const loaded = loadExtractedImagePalette();
      expect(loaded).toEqual(mockPalette);
    });
  });
});
