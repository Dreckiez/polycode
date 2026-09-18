/**
 * Retro Bayer ordered dithering engine for chat backgrounds.
 * Applies an 8x8 Bayer threshold matrix with a vertical cosine fade ramp
 * transitioning smoothly to solid dark background at the bottom.
 */

export const BAYER_8X8: readonly number[] = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];

export type DitherOptions = {
  /** Size of each dither pixel block in screen pixels (default: 1 or 2). */
  pixelSize?: number;
  /** Number of quantized color steps per channel (default: 6). */
  colorSteps?: number;
  /** Dither intensity spread (default: 52). */
  ditherStrength?: number;

  // --- VERTICAL POSITION BOUNDARIES ---
  /** Height where top fade begins (0.0 = top of screen, 1.0 = bottom). */
  fadeStart?: number;
  /** Height where top segment meets bottom segment (inflection checkpoint). */
  fadeMid?: number;
  /** Height where bottom fade reaches its end (0.0 to 1.0). */
  fadeEnd?: number;

  // --- LUMINANCE TARGET LEVELS (BRIGHTNESS) ---
  /** Brightness at fadeStart (default: 1.0 = 100% full brightness). */
  fadeStartLevel?: number;
  /** Brightness at fadeMid checkpoint (default: 0.35 = 35% brightness). */
  fadeMidLevel?: number;
  /** Brightness at fadeEnd (default: 0.0 = solid pitch black). */
  fadeEndLevel?: number;

  // --- SEPARATE SEGMENT CURVE POWERS ---
  /**
   * Curve power for top segment (from fadeStart to fadeMid).
   * 1.0 = smooth cosine fade.
   * >1.0 (e.g. 2.0) = stays brighter near top, fades quicker towards mid.
   * <1.0 (e.g. 0.5) = darkens immediately near top, flattens towards mid.
   */
  fadeTopPower?: number;
  /**
   * Curve power for bottom segment (from fadeMid to fadeEnd).
   * 1.0 = smooth cosine fade.
   * >1.0 (e.g. 2.0) = stays near mid-level longer, then drops sharply to black at the end.
   * <1.0 (e.g. 0.5) = drops rapidly towards black, then lingers near zero.
   */
  fadeBottomPower?: number;
};

export const DEFAULT_DITHER_OPTIONS: Required<DitherOptions> = {
  pixelSize: 1,
  colorSteps: 6,
  ditherStrength: 52,
  fadeStart: 0.10,
  fadeMid: 0.50,
  fadeEnd: 0.94,
  fadeStartLevel: 1.0,
  fadeMidLevel: 0.32,
  fadeEndLevel: 0.0,
  fadeTopPower: 1.0,
  fadeBottomPower: 2,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculates the vertical luminance fade factor for normalized height y in [0, 1].
 * Separately evaluates:
 * 1. Top segment (fadeStart -> fadeMid): fades from fadeStartLevel to fadeMidLevel with fadeTopPower.
 * 2. Bottom segment (fadeMid -> fadeEnd): fades from fadeMidLevel to fadeEndLevel with fadeBottomPower.
 */
export function calculateVerticalFade(
  yNorm: number,
  fadeStart = DEFAULT_DITHER_OPTIONS.fadeStart,
  fadeEnd = DEFAULT_DITHER_OPTIONS.fadeEnd,
  fadeMid?: number,
  fadeMidLevel = DEFAULT_DITHER_OPTIONS.fadeMidLevel,
  fadeStartLevel = DEFAULT_DITHER_OPTIONS.fadeStartLevel,
  fadeEndLevel = DEFAULT_DITHER_OPTIONS.fadeEndLevel,
  fadeTopPower = DEFAULT_DITHER_OPTIONS.fadeTopPower,
  fadeBottomPower = DEFAULT_DITHER_OPTIONS.fadeBottomPower,
): number {
  if (yNorm <= fadeStart) return fadeStartLevel;
  if (yNorm >= fadeEnd) return fadeEndLevel;

  const defaultMid = fadeStart + (fadeEnd - fadeStart) * 0.8;
  const midTarget = fadeMid ?? defaultMid;
  const mid = Math.min(Math.max(midTarget, fadeStart + 0.001), fadeEnd - 0.001);

  if (yNorm <= mid) {
    const progress = (yNorm - fadeStart) / (mid - fadeStart);
    const cosine = Math.cos(progress * (Math.PI / 2));
    const t = Math.pow(Math.max(0, cosine), fadeTopPower);
    return fadeMidLevel + (fadeStartLevel - fadeMidLevel) * t;
  }

  const progress = (yNorm - mid) / (fadeEnd - mid);
  const cosine = Math.cos(progress * (Math.PI / 2));
  const t = Math.pow(Math.max(0, cosine), fadeBottomPower);
  return fadeEndLevel + (fadeMidLevel - fadeEndLevel) * t;
}

/**
 * Applies Bayer 8x8 dithering with vertical fade to an RGBA pixel array in-place.
 */
export function applyBayerDitherToBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: DitherOptions,
): void {
  const pixelSize = Math.max(
    1,
    Math.round(options?.pixelSize ?? DEFAULT_DITHER_OPTIONS.pixelSize),
  );
  const colorSteps = Math.max(
    2,
    Math.round(options?.colorSteps ?? DEFAULT_DITHER_OPTIONS.colorSteps),
  );
  const fadeStart = options?.fadeStart ?? DEFAULT_DITHER_OPTIONS.fadeStart;
  const fadeMid = options?.fadeMid ?? DEFAULT_DITHER_OPTIONS.fadeMid;
  const fadeEnd = options?.fadeEnd ?? DEFAULT_DITHER_OPTIONS.fadeEnd;
  const fadeStartLevel =
    options?.fadeStartLevel ?? DEFAULT_DITHER_OPTIONS.fadeStartLevel;
  const fadeMidLevel =
    options?.fadeMidLevel ?? DEFAULT_DITHER_OPTIONS.fadeMidLevel;
  const fadeEndLevel =
    options?.fadeEndLevel ?? DEFAULT_DITHER_OPTIONS.fadeEndLevel;
  const fadeTopPower =
    options?.fadeTopPower ?? DEFAULT_DITHER_OPTIONS.fadeTopPower;
  const fadeBottomPower =
    options?.fadeBottomPower ?? DEFAULT_DITHER_OPTIONS.fadeBottomPower;
  const strength =
    options?.ditherStrength ?? DEFAULT_DITHER_OPTIONS.ditherStrength;
  const stepSize = 255 / (colorSteps - 1);

  for (let y = 0; y < height; y += pixelSize) {
    const yNorm = height > 1 ? y / (height - 1) : 0;
    const fade = calculateVerticalFade(
      yNorm,
      fadeStart,
      fadeEnd,
      fadeMid,
      fadeMidLevel,
      fadeStartLevel,
      fadeEndLevel,
      fadeTopPower,
      fadeBottomPower,
    );
    const by = Math.floor(y / pixelSize) % 8;

    for (let x = 0; x < width; x += pixelSize) {
      const bx = Math.floor(x / pixelSize) % 8;
      const bayerVal = (BAYER_8X8[by * 8 + bx] / 64 - 0.5) * strength;
      // Preserve full dither threshold amplitude so dots thin out cleanly to fadeEnd
      const offset = bayerVal;

      // Sample base pixel at (x, y)
      const srcIdx = (y * width + x) * 4;
      const srcR = data[srcIdx];
      const srcG = data[srcIdx + 1];
      const srcB = data[srcIdx + 2];
      const srcA = data[srcIdx + 3];

      let outR = 0;
      let outG = 0;
      let outB = 0;

      if (fade > 0.001) {
        // Modulate RGB by fade, apply dither offset, and quantize
        const rVal = clamp(srcR * fade + offset, 0, 255);
        const gVal = clamp(srcG * fade + offset, 0, 255);
        const bVal = clamp(srcB * fade + offset, 0, 255);

        outR = Math.round(Math.round(rVal / stepSize) * stepSize);
        outG = Math.round(Math.round(gVal / stepSize) * stepSize);
        outB = Math.round(Math.round(bVal / stepSize) * stepSize);
      }

      // Write pixel block of size pixelSize x pixelSize
      const yMax = Math.min(y + pixelSize, height);
      const xMax = Math.min(x + pixelSize, width);
      for (let py = y; py < yMax; py++) {
        const rowOffset = py * width;
        for (let px = x; px < xMax; px++) {
          const idx = (rowOffset + px) * 4;
          data[idx] = outR;
          data[idx + 1] = outG;
          data[idx + 2] = outB;
          data[idx + 3] = srcA;
        }
      }
    }
  }
}

// Memory cache for dithered image data URLs: key -> dataUrl
const ditherUrlCache = new Map<string, string>();
const MAX_CACHE_ITEMS = 24;

function cacheKey(
  src: string,
  width: number,
  height: number,
  options?: DitherOptions,
): string {
  const p = options?.pixelSize ?? DEFAULT_DITHER_OPTIONS.pixelSize;
  const s = options?.colorSteps ?? DEFAULT_DITHER_OPTIONS.colorSteps;
  const str = options?.ditherStrength ?? DEFAULT_DITHER_OPTIONS.ditherStrength;
  const fs = options?.fadeStart ?? DEFAULT_DITHER_OPTIONS.fadeStart;
  const fm = options?.fadeMid ?? DEFAULT_DITHER_OPTIONS.fadeMid;
  const fe = options?.fadeEnd ?? DEFAULT_DITHER_OPTIONS.fadeEnd;
  const fsl = options?.fadeStartLevel ?? DEFAULT_DITHER_OPTIONS.fadeStartLevel;
  const fml = options?.fadeMidLevel ?? DEFAULT_DITHER_OPTIONS.fadeMidLevel;
  const fel = options?.fadeEndLevel ?? DEFAULT_DITHER_OPTIONS.fadeEndLevel;
  const ftp = options?.fadeTopPower ?? DEFAULT_DITHER_OPTIONS.fadeTopPower;
  const fbp = options?.fadeBottomPower ?? DEFAULT_DITHER_OPTIONS.fadeBottomPower;
  return `${src}#${width}x${height}#p${p}s${s}str${str}fs${fs}fm${fm}fe${fe}fsl${fsl}fml${fml}fel${fel}ftp${ftp}fbp${fbp}`;
}

/**
 * Creates a dithered image data URL from an image URL or element.
 */
export async function createDitheredImageUrl(
  imageSource: string | HTMLImageElement,
  targetWidth = 960,
  targetHeight = 720,
  options?: DitherOptions,
): Promise<string> {
  const src = typeof imageSource === "string" ? imageSource : imageSource.src;
  const key = cacheKey(src, targetWidth, targetHeight, options);
  const cached = ditherUrlCache.get(key);
  if (cached) return cached;

  let img: HTMLImageElement;
  if (typeof imageSource === "string") {
    img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error(`Failed to load image: ${imageSource}`));
      img.src = imageSource;
    });
  } else {
    img = imageSource;
  }

  if (typeof document === "undefined") {
    return src;
  }

  const canvas = document.createElement("canvas");
  // Scale proportionally to fit within target bounds to optimize dither rendering speed
  const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  let w = targetWidth;
  let h = Math.round(w / aspect);
  if (h > targetHeight) {
    h = targetHeight;
    w = Math.round(h * aspect);
  }
  w = Math.max(16, w);
  h = Math.max(16, h);

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  applyBayerDitherToBuffer(imgData.data, w, h, options);
  ctx.putImageData(imgData, 0, 0);

  const resultUrl = canvas.toDataURL("image/png");
  if (ditherUrlCache.size >= MAX_CACHE_ITEMS) {
    const firstKey = ditherUrlCache.keys().next().value;
    if (firstKey) ditherUrlCache.delete(firstKey);
  }
  ditherUrlCache.set(key, resultUrl);
  return resultUrl;
}

export function clearDitherCache(): void {
  ditherUrlCache.clear();
}
