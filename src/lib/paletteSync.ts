/**
 * Palette extraction and automatic theme-matching engine.
 * Inspired by Linux customization tools (pywal, matugen, colorthief).
 * Extracts dominant mood hue, vibrant accent color, and harmonized UI tokens
 * from any background image.
 */

import {
  saveThemePresetId,
  THEME_PRESET_CHANGE_EVENT,
  type ThemePreset,
  getThemePreset,
} from "./themePresets";
import { loadImageElement } from "./dither";

const THEME_HUE_KEY = "monocode.themeHue";
const THEME_SATURATION_KEY = "monocode.themeSaturation";

export const IMAGE_PALETTE_KEY = "monocode.imagePalette";
export const IMAGE_PALETTE_CHANGED_EVENT = "monocode:image-palette-changed";

export type ExtractedPalette = {
  /** High-vibrancy signature accent color (hex or hsl). */
  accentColor: string;
  /** Dominant ambient hue (0 to 360) for background tinting. */
  themeHue: number;
  /** Ambient saturation (0 to 100) scaled for readable dark UI. */
  themeSaturation: number;
  /** Harmonized link color. */
  linkColor: string;
  /** Harmonized markdown heading color. */
  markdownHeadingColor: string;
  /** Top dominant colors extracted for UI preview swatches. */
  swatches: string[];
};

export type HSL = { h: number; s: number; l: number };
export type RGB = { r: number; g: number; b: number };

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Extracts dominant palette clusters from raw RGBA pixel data.
 */
export function extractPaletteFromRgbaBuffer(
  data: Uint8ClampedArray,
  sampleStep = 4,
): ExtractedPalette {
  const HUE_BIN_SIZE = 24; // 15 hue bins across 360 degrees
  const binCounts = new Map<number, { r: number; g: number; b: number; count: number; maxSat: number; maxSatRgb: RGB }>();

  for (let i = 0; i < data.length; i += sampleStep * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Ignore transparent pixels
    if (a < 128) continue;

    // Quick RGB luminance approximation: skip dark (<8% L) and blown highlight (>94% L)
    // without executing full rgbToHsl conversion
    const maxRgb = Math.max(r, g, b);
    const minRgb = Math.min(r, g, b);
    const sumMinMax = maxRgb + minRgb;
    if (sumMinMax < 41 || sumMinMax > 480) continue;

    const hsl = rgbToHsl(r, g, b);
    if (hsl.l < 8 || hsl.l > 94) continue;

    const bin = Math.floor(hsl.h / HUE_BIN_SIZE);
    const existing = binCounts.get(bin);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count += 1;
      if (hsl.s > existing.maxSat) {
        existing.maxSat = hsl.s;
        existing.maxSatRgb = { r, g, b };
      }
    } else {
      binCounts.set(bin, {
        r,
        g,
        b,
        count: 1,
        maxSat: hsl.s,
        maxSatRgb: { r, g, b },
      });
    }
  }

  // Rank bins by count and vibrancy
  const sortedBins = Array.from(binCounts.entries()).sort(
    (a, b) => b[1].count - a[1].count,
  );

  let primaryAccent = "#cba6f7"; // fallback
  let dominantHue = 240;
  let dominantSat = 25;
  let linkColor = "#7dd3fc";
  let headingColor = "#f5c2e7";
  const swatches: string[] = [];

  if (sortedBins.length > 0) {
    // Dominant hue from the most populated bin
    const topBin = sortedBins[0][1];
    const avgR = Math.round(topBin.r / topBin.count);
    const avgG = Math.round(topBin.g / topBin.count);
    const avgB = Math.round(topBin.b / topBin.count);
    const dominantHsl = rgbToHsl(avgR, avgG, avgB);
    dominantHue = dominantHsl.h;
    dominantSat = Math.max(16, Math.min(42, Math.round(dominantHsl.s * 0.55)));

    // Accent color: select the bin with highest vibrancy score (saturation * sqrt(lightness))
    // ensuring lightness is comfortably readable in dark theme (45% - 75%)
    let bestScore = -1;
    let bestRgb: RGB = topBin.maxSatRgb;
    let bestHsl = rgbToHsl(bestRgb.r, bestRgb.g, bestRgb.b);

    for (const [, binData] of sortedBins) {
      const avgBinR = Math.round(binData.r / binData.count);
      const avgBinG = Math.round(binData.g / binData.count);
      const avgBinB = Math.round(binData.b / binData.count);
      const hsl = rgbToHsl(binData.maxSatRgb.r, binData.maxSatRgb.g, binData.maxSatRgb.b);
      // Boost bins with rich saturation and good mid-lightness
      const lScore = hsl.l >= 35 && hsl.l <= 80 ? 1 : 0.5;
      const score = hsl.s * Math.sqrt(hsl.l) * lScore * Math.log10(binData.count + 1);

      if (score > bestScore) {
        bestScore = score;
        bestRgb = binData.maxSatRgb;
        bestHsl = hsl;
      }

      // Collect top swatch colors
      if (swatches.length < 5) {
        swatches.push(rgbToHex(avgBinR, avgBinG, avgBinB));
      }
    }

    // Tune accent lightness for high visibility in dark mode if needed
    const tunedAccentL = Math.max(52, Math.min(72, bestHsl.l));
    const tunedAccentS = Math.max(65, bestHsl.s);
    primaryAccent = hslToHex(bestHsl.h, tunedAccentS, tunedAccentL);

    // Complementary / adjacent heading and link colors
    const headingHue = (bestHsl.h + 30) % 360;
    headingColor = hslToHex(headingHue, Math.max(60, tunedAccentS - 10), 75);

    const linkHue = (bestHsl.h + 180) % 360;
    linkColor = hslToHex(linkHue, Math.max(70, tunedAccentS), 68);
  }

  // Ensure primary accent is included in swatches
  if (!swatches.includes(primaryAccent)) {
    swatches.unshift(primaryAccent);
  }

  return {
    accentColor: primaryAccent,
    themeHue: dominantHue,
    themeSaturation: dominantSat,
    linkColor,
    markdownHeadingColor: headingColor,
    swatches: swatches.slice(0, 5),
  };
}

/**
 * Extracts palette from an image element or URL via an offscreen canvas.
 */
export async function extractPaletteFromImage(
  imageSource: string | HTMLImageElement,
): Promise<ExtractedPalette> {
  let img: HTMLImageElement;
  if (typeof imageSource === "string") {
    img = await loadImageElement(imageSource);
  } else {
    img = imageSource;
  }

  if (typeof document === "undefined") {
    return {
      accentColor: "#cba6f7",
      themeHue: 240,
      themeSaturation: 25,
      linkColor: "#7dd3fc",
      markdownHeadingColor: "#f5c2e7",
      swatches: ["#cba6f7", "#7dd3fc"],
    };
  }

  const canvas = document.createElement("canvas");
  // Downsample to 100x100 for ultra-fast clustering (<3ms)
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Could not acquire 2D canvas context for palette extraction");
  }

  ctx.drawImage(img, 0, 0, 100, 100);
  const imgData = ctx.getImageData(0, 0, 100, 100);
  return extractPaletteFromRgbaBuffer(imgData.data, 2);
}

/**
 * Applies an extracted image palette to the DOM and persists settings.
 */
export function applyExtractedPaletteToApp(palette: ExtractedPalette): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Set theme variables
  root.style.setProperty("--theme-hue", String(palette.themeHue));
  root.style.setProperty("--theme-saturation", `${palette.themeSaturation}%`);
  root.style.setProperty("--accent-color", palette.accentColor);
  root.style.setProperty("--color-accent", palette.accentColor);
  root.style.setProperty("--link-color", palette.linkColor);
  root.style.setProperty("--color-markdown-heading", palette.markdownHeadingColor);

  // Persist hue, saturation, and custom preset
  try {
    localStorage.setItem(THEME_HUE_KEY, String(palette.themeHue));
    localStorage.setItem(THEME_SATURATION_KEY, String(palette.themeSaturation));
  } catch {}
  saveThemePresetId("custom");
  saveExtractedImagePalette(palette);

  if (typeof window !== "undefined") {
    // Notify components of theme change
    const customPreset: ThemePreset = {
      ...getThemePreset("custom"),
      id: "custom",
      name: "Custom (From Image)",
      hue: palette.themeHue,
      saturation: palette.themeSaturation,
      accentColor: palette.accentColor,
      linkColor: palette.linkColor,
      markdownHeadingColor: palette.markdownHeadingColor,
    };
    window.dispatchEvent(
      new CustomEvent<ThemePreset>(THEME_PRESET_CHANGE_EVENT, {
        detail: customPreset,
      }),
    );
    window.dispatchEvent(new CustomEvent(IMAGE_PALETTE_CHANGED_EVENT));
  }
}

export function saveExtractedImagePalette(palette: ExtractedPalette): void {
  try {
    localStorage.setItem(IMAGE_PALETTE_KEY, JSON.stringify(palette));
  } catch {
    // quota / private mode
  }
}

export function loadExtractedImagePalette(): ExtractedPalette | null {
  try {
    const raw = localStorage.getItem(IMAGE_PALETTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExtractedPalette;
    if (parsed && typeof parsed.accentColor === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reapplies the last saved image palette to the app with a single call.
 */
export function reapplyImagePalette(): boolean {
  const palette = loadExtractedImagePalette();
  if (!palette) return false;
  applyExtractedPaletteToApp(palette);
  return true;
}
