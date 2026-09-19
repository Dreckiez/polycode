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

  // Precompute scaled Bayer matrix offsets to eliminate inner-loop arithmetic
  const scaledBayer = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    scaledBayer[i] = (BAYER_8X8[i] / 64 - 0.5) * strength;
  }

  // Precompute quantization lookup table for all 256 possible clamped values
  const quantTable = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    quantTable[i] = Math.round(Math.round(i / stepSize) * stepSize);
  }

  // Fast path for pixelSize === 1 (linear sequential memory traversal)
  if (pixelSize === 1) {
    let srcIdx = 0;
    for (let y = 0; y < height; y++) {
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

      // When reaching solid black tail, zero remaining pixels and exit loop immediately
      if (yNorm >= fadeEnd && fadeEndLevel === 0) {
        const remainingPixels = (height - y) * width;
        for (let i = 0; i < remainingPixels; i++) {
          data[srcIdx] = 0;
          data[srcIdx + 1] = 0;
          data[srcIdx + 2] = 0;
          srcIdx += 4;
        }
        break;
      }

      if (fade <= 0.001) {
        for (let x = 0; x < width; x++) {
          data[srcIdx] = 0;
          data[srcIdx + 1] = 0;
          data[srcIdx + 2] = 0;
          srcIdx += 4;
        }
        continue;
      }

      const byRow = (y & 7) << 3;
      for (let x = 0; x < width; x++) {
        const offset = scaledBayer[byRow | (x & 7)];
        const rVal = data[srcIdx] * fade + offset;
        const gVal = data[srcIdx + 1] * fade + offset;
        const bVal = data[srcIdx + 2] * fade + offset;

        data[srcIdx] =
          rVal <= 0 ? 0 : rVal >= 255 ? quantTable[255] : quantTable[rVal | 0];
        data[srcIdx + 1] =
          gVal <= 0 ? 0 : gVal >= 255 ? quantTable[255] : quantTable[gVal | 0];
        data[srcIdx + 2] =
          bVal <= 0 ? 0 : bVal >= 255 ? quantTable[255] : quantTable[bVal | 0];
        srcIdx += 4;
      }
    }
    return;
  }

  // General path for block pixelSize > 1
  const data32 = new Uint32Array(
    data.buffer,
    data.byteOffset,
    data.byteLength >> 2,
  );
  let blockY = 0;
  for (let y = 0; y < height; y += pixelSize, blockY++) {
    const yNorm = height > 1 ? y / (height - 1) : 0;

    // Solid black tail: zero out RGB for all remaining pixels and exit immediately
    if (yNorm >= fadeEnd && fadeEndLevel === 0) {
      let srcIdx = y * width * 4;
      const remainingPixels = (height - y) * width;
      for (let i = 0; i < remainingPixels; i++) {
        data[srcIdx] = 0;
        data[srcIdx + 1] = 0;
        data[srcIdx + 2] = 0;
        srcIdx += 4;
      }
      break;
    }

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

    const byRow = (blockY & 7) << 3;
    const yMax = Math.min(y + pixelSize, height);
    const rowHeight = yMax - y;
    let blockX = 0;

    for (let x = 0; x < width; x += pixelSize, blockX++) {
      const offset = scaledBayer[byRow | (blockX & 7)];

      const srcIdx = (y * width + x) * 4;
      const srcR = data[srcIdx];
      const srcG = data[srcIdx + 1];
      const srcB = data[srcIdx + 2];
      const srcA = data[srcIdx + 3];

      let outR = 0;
      let outG = 0;
      let outB = 0;

      if (fade > 0.001) {
        const rVal = srcR * fade + offset;
        const gVal = srcG * fade + offset;
        const bVal = srcB * fade + offset;

        outR =
          rVal <= 0 ? 0 : rVal >= 255 ? quantTable[255] : quantTable[rVal | 0];
        outG =
          gVal <= 0 ? 0 : gVal >= 255 ? quantTable[255] : quantTable[gVal | 0];
        outB =
          bVal <= 0 ? 0 : bVal >= 255 ? quantTable[255] : quantTable[bVal | 0];
      }

      const pixel32 = (srcA << 24) | (outB << 16) | (outG << 8) | outR;
      const xMax = Math.min(x + pixelSize, width);
      const blockWidth = xMax - x;

      let rowStart = y * width + x;
      for (let py = 0; py < rowHeight; py++) {
        for (let px = 0; px < blockWidth; px++) {
          data32[rowStart + px] = pixel32;
        }
        rowStart += width;
      }
    }
  }
}

// Memory cache for dithered image URLs: key -> url (blob: or data:)
const ditherUrlCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();
const imageElementCache = new Map<string, Promise<HTMLImageElement>>();
const pendingRevokeBlobs = new Set<string>();
const MAX_CACHE_ITEMS = 36;
const MAX_IMAGE_CACHE = 12;

let ditherWorker: Worker | null = null;
let nextWorkerRequestId = 0;
const workerPendingRequests = new Map<
  number,
  {
    resolve: (buffer: ArrayBuffer) => void;
    reject: (err: Error) => void;
  }
>();

export function canUseDitherWorker(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function getDitherWorker(): Worker {
  if (!ditherWorker) {
    ditherWorker = new Worker(new URL("./dither.worker.ts", import.meta.url), {
      type: "module",
    });
    ditherWorker.onmessage = (
      e: MessageEvent<{ id: number; buffer?: ArrayBuffer; error?: string }>,
    ) => {
      const { id, buffer, error } = e.data;
      const pending = workerPendingRequests.get(id);
      if (!pending) return;
      workerPendingRequests.delete(id);
      if (error) {
        pending.reject(new Error(error));
      } else if (buffer) {
        pending.resolve(buffer);
      } else {
        pending.reject(new Error("Worker returned empty response"));
      }
    };
    ditherWorker.onerror = (e) => {
      console.error("Dither worker error:", e);
      for (const pending of workerPendingRequests.values()) {
        pending.reject(new Error("Dither worker error"));
      }
      workerPendingRequests.clear();
      ditherWorker = null;
    };
  }
  return ditherWorker;
}

export function runDitherInWorker(
  buffer: ArrayBuffer,
  width: number,
  height: number,
  options?: DitherOptions,
): Promise<ArrayBuffer> {
  const worker = getDitherWorker();
  const id = ++nextWorkerRequestId;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    workerPendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, buffer, width, height, options }, [buffer]);
  });
}

export function terminateDitherWorker(): void {
  if (ditherWorker) {
    ditherWorker.terminate();
    ditherWorker = null;
    for (const pending of workerPendingRequests.values()) {
      pending.reject(new Error("Dither worker terminated"));
    }
    workerPendingRequests.clear();
  }
}

export function isBlobInUse(url: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const bg = document.documentElement?.style?.getPropertyValue(
      "--chat-background-image",
    );
    if (bg && bg.includes(url)) return true;
    if (typeof document.querySelector === "function") {
      const escaped = url.replace(/["\\]/g, "\\$&");
      if (document.querySelector(`[style*="${escaped}"]`)) return true;
      if (document.querySelector(`img[src="${escaped}"]`)) return true;
    }
  } catch {}
  return false;
}

export function cleanupPendingBlobs(): void {
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
    pendingRevokeBlobs.clear();
    return;
  }
  for (const url of Array.from(pendingRevokeBlobs)) {
    if (!isBlobInUse(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      pendingRevokeBlobs.delete(url);
    }
  }
}

export function freeUrlIfBlob(url: string | undefined, force = false): void {
  if (!url || !url.startsWith("blob:")) return;
  cleanupPendingBlobs();
  if (force || !isBlobInUse(url)) {
    if (
      typeof URL !== "undefined" &&
      typeof URL.revokeObjectURL === "function"
    ) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    pendingRevokeBlobs.delete(url);
  } else {
    pendingRevokeBlobs.add(url);
  }
}

/**
 * Shared image element loader and cache to prevent decoding the same image multiple times.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  const existing = imageElementCache.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image is not available in this environment"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageElementCache.delete(src);
      reject(new Error(`Failed to load image: ${src}`));
    };
    img.src = src;
  });

  if (imageElementCache.size >= MAX_IMAGE_CACHE) {
    const firstKey = imageElementCache.keys().next().value;
    if (firstKey) imageElementCache.delete(firstKey);
  }
  imageElementCache.set(src, promise);
  return promise;
}

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
 * Synchronously retrieves a cached dithered URL if available.
 * Useful for initializing React state without frame flashing.
 */
export function getCachedDitheredImageUrl(
  imageSource: string | HTMLImageElement,
  targetWidth = 960,
  targetHeight = 720,
  options?: DitherOptions,
): string | null {
  const src = typeof imageSource === "string" ? imageSource : imageSource.src;
  const key = cacheKey(src, targetWidth, targetHeight, options);
  return ditherUrlCache.get(key) ?? null;
}

/**
 * Converts a canvas to an efficient Object URL (Blob) or data URL fallback.
 */
function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise<string>((resolve) => {
    if (
      typeof canvas.toBlob === "function" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve(canvas.toDataURL("image/webp", 0.92));
          }
        },
        "image/webp",
        0.92,
      );
    } else {
      resolve(canvas.toDataURL("image/png"));
    }
  });
}

/**
 * Creates a dithered image URL from an image URL or element.
 * Deduplicates in-flight requests and caches results.
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

  const inFlight = inFlightRequests.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      let img: HTMLImageElement;
      if (typeof imageSource === "string") {
        img = await loadImageElement(imageSource);
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

      if (canUseDitherWorker()) {
        try {
          const ditheredBuffer = await runDitherInWorker(
            imgData.data.buffer,
            w,
            h,
            options,
          );
          const finalImgData = new ImageData(
            new Uint8ClampedArray(ditheredBuffer),
            w,
            h,
          );
          ctx.putImageData(finalImgData, 0, 0);
        } catch {
          applyBayerDitherToBuffer(imgData.data, w, h, options);
          ctx.putImageData(imgData, 0, 0);
        }
      } else {
        applyBayerDitherToBuffer(imgData.data, w, h, options);
        ctx.putImageData(imgData, 0, 0);
      }

      const resultUrl = await canvasToUrl(canvas);
      if (ditherUrlCache.size >= MAX_CACHE_ITEMS) {
        const firstKey = ditherUrlCache.keys().next().value;
        if (firstKey) {
          freeUrlIfBlob(ditherUrlCache.get(firstKey));
          ditherUrlCache.delete(firstKey);
        }
      }
      ditherUrlCache.set(key, resultUrl);
      return resultUrl;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

export function clearDitherCache(): void {
  for (const url of ditherUrlCache.values()) {
    freeUrlIfBlob(url, true);
  }
  for (const url of pendingRevokeBlobs) {
    if (
      typeof URL !== "undefined" &&
      typeof URL.revokeObjectURL === "function"
    ) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  }
  pendingRevokeBlobs.clear();
  ditherUrlCache.clear();
  inFlightRequests.clear();
  imageElementCache.clear();
}
