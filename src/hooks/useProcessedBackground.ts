import { useEffect, useState } from "react";
import {
  createDitheredImageUrl,
  getCachedDitheredImageUrl,
} from "../lib/dither";

/**
 * Hook that returns the dithered background image URL if dithering is enabled,
 * falling back to the raw image source.
 * Synchronously checks in-memory cache to prevent visual flashing and redundant renders.
 */
export function useProcessedBackground(
  rawSrc: string | null | undefined,
  dither = true,
): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!rawSrc) return null;
    if (!dither) return rawSrc;
    return getCachedDitheredImageUrl(rawSrc) ?? rawSrc;
  });

  useEffect(() => {
    if (!rawSrc) {
      setUrl(null);
      return;
    }
    if (!dither) {
      setUrl(rawSrc);
      return;
    }

    const cached = getCachedDitheredImageUrl(rawSrc);
    if (cached) {
      setUrl(cached);
      return;
    }

    let active = true;
    createDitheredImageUrl(rawSrc)
      .then((dithered) => {
        if (active) setUrl(dithered);
      })
      .catch(() => {
        if (active) setUrl(rawSrc);
      });

    return () => {
      active = false;
    };
  }, [rawSrc, dither]);

  return url;
}
