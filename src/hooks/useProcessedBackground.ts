import { useEffect, useState } from "react";
import { createDitheredImageUrl } from "../lib/dither";

/**
 * Hook that returns the dithered background image URL if dithering is enabled,
 * falling back to the raw image source.
 */
export function useProcessedBackground(
  rawSrc: string | null | undefined,
  dither = true,
): string | null {
  const [url, setUrl] = useState<string | null>(rawSrc ?? null);

  useEffect(() => {
    if (!rawSrc) {
      setUrl(null);
      return;
    }
    if (!dither) {
      setUrl(rawSrc);
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
