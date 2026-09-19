// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  applyBayerDitherToBuffer,
  BAYER_8X8,
  calculateVerticalFade,
  cleanupPendingBlobs,
  clearDitherCache,
  DEFAULT_DITHER_OPTIONS,
  freeUrlIfBlob,
  getCachedDitheredImageUrl,
  isBlobInUse,
} from "./dither";

describe("dither engine", () => {
  it("has a valid 64-element Bayer 8x8 matrix", () => {
    expect(BAYER_8X8.length).toBe(64);
    const sorted = [...BAYER_8X8].sort((a, b) => a - b);
    for (let i = 0; i < 64; i++) {
      expect(sorted[i]).toBe(i);
    }
  });

  describe("calculateVerticalFade", () => {
    it("returns 1.0 at the top down to fadeStart", () => {
      expect(calculateVerticalFade(0, 0.33, 0.98)).toBe(1.0);
      expect(calculateVerticalFade(0.20, 0.33, 0.98)).toBe(1.0);
      expect(calculateVerticalFade(0.30, 0.33, 0.98)).toBe(1.0);
      expect(calculateVerticalFade(0.33, 0.33, 0.98)).toBe(1.0);
    });

    it("starts showing black around 30-35% and slowly darkens down to 85%", () => {
      const at35 = calculateVerticalFade(0.35, 0.33, 0.98, 0.85, 0.25);
      const at50 = calculateVerticalFade(0.50, 0.33, 0.98, 0.85, 0.25);
      const at70 = calculateVerticalFade(0.70, 0.33, 0.98, 0.85, 0.25);
      const at85 = calculateVerticalFade(0.85, 0.33, 0.98, 0.85, 0.25);

      expect(at35).toBeLessThan(1.0);
      expect(at35).toBeGreaterThan(at50);
      expect(at50).toBeGreaterThan(at70);
      expect(at70).toBeGreaterThan(at85);
      // At 85%, luminance has slowly decreased to ~0.25
      expect(at85).toBeCloseTo(0.25, 2);
    });

    it("accelerates from 85% to reach full solid black by bottom", () => {
      const at90 = calculateVerticalFade(0.90, 0.33, 0.98, 0.85, 0.25);
      expect(at90).toBeLessThan(0.25);
      expect(at90).toBeGreaterThan(0.0);

      expect(calculateVerticalFade(0.98, 0.33, 0.98, 0.85, 0.25)).toBe(0.0);
      expect(calculateVerticalFade(1.0, 0.33, 0.98, 0.85, 0.25)).toBe(0.0);
    });

    it("allows adjusting top and bottom segment fades independently", () => {
      const midLevel = 0.50;
      const at0 = calculateVerticalFade(0.0, 0.0, 0.98, 0.40, midLevel);
      const atMid = calculateVerticalFade(0.40, 0.0, 0.98, 0.40, midLevel);
      const atEnd = calculateVerticalFade(0.98, 0.0, 0.98, 0.40, midLevel);

      expect(at0).toBe(1.0);
      expect(atMid).toBeCloseTo(0.50, 2);
      expect(atEnd).toBe(0.0);

      // Higher topPower holds brightness longer in top segment
      const topLinear = calculateVerticalFade(0.20, 0.0, 0.98, 0.40, midLevel, 1.0, 0.0, 1.0, 1.0);
      const topGentle = calculateVerticalFade(0.20, 0.0, 0.98, 0.40, midLevel, 1.0, 0.0, 2.0, 1.0);
      expect(topGentle).toBeLessThan(topLinear); // cosine is < 1 so cosine^2 < cosine
    });
  });

  describe("applyBayerDitherToBuffer", () => {
    it("dithers pixels at the top and turns the bottom to solid black", () => {
      const width = 16;
      const height = 16;
      const buffer = new Uint8ClampedArray(width * height * 4);

      // Fill with solid white (255, 255, 255, 255)
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 255;
        buffer[i + 1] = 255;
        buffer[i + 2] = 255;
        buffer[i + 3] = 255;
      }

      applyBayerDitherToBuffer(buffer, width, height, {
        fadeStart: 0.2,
        fadeEnd: 0.8,
        pixelSize: 2,
      });

      // Top row (y=0) should have high luminance (dithered white/near-white)
      const topR = buffer[0];
      expect(topR).toBeGreaterThan(150);

      // Bottom row (y=15, which is 15/15 = 1.0 > 0.82) must be solid black (0, 0, 0, 255)
      const bottomIdx = ((height - 1) * width + 0) * 4;
      expect(buffer[bottomIdx]).toBe(0);
      expect(buffer[bottomIdx + 1]).toBe(0);
      expect(buffer[bottomIdx + 2]).toBe(0);
      expect(buffer[bottomIdx + 3]).toBe(255);
    });

    it("processes a full 960x720 background image quickly", () => {
      const width = 960;
      const height = 720;
      const buffer = new Uint8ClampedArray(width * height * 4);
      buffer.fill(128);

      const start = performance.now();
      applyBayerDitherToBuffer(buffer, width, height);
      const elapsed = performance.now() - start;

      console.log(`[Dither Benchmark] 960x720 took ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe("caching and deduplication", () => {
    it("returns null when item is not in cache", () => {
      clearDitherCache();
      expect(getCachedDitheredImageUrl("non-existent-image.png")).toBeNull();
    });

    it("clears cache completely when clearDitherCache is invoked", () => {
      clearDitherCache();
      expect(getCachedDitheredImageUrl("test.png")).toBeNull();
    });

    it("detects when a blob URL is in use on root, in an element style, or in an img tag", () => {
      const testBlob = "blob:http://localhost/test-blob-123";
      expect(isBlobInUse(testBlob)).toBe(false);

      // 1. Attached to document root --chat-background-image
      document.documentElement.style.setProperty(
        "--chat-background-image",
        `url("${testBlob}")`,
      );
      expect(isBlobInUse(testBlob)).toBe(true);
      document.documentElement.style.removeProperty("--chat-background-image");
      expect(isBlobInUse(testBlob)).toBe(false);

      // 2. Attached to a SessionPane style attribute
      const pane = document.createElement("div");
      pane.setAttribute(
        "style",
        `--chat-background-image: url("${testBlob}"); opacity: 0.5;`,
      );
      document.body.appendChild(pane);
      expect(isBlobInUse(testBlob)).toBe(true);
      pane.remove();
      expect(isBlobInUse(testBlob)).toBe(false);

      // 3. Attached to an img element src
      const img = document.createElement("img");
      img.src = testBlob;
      document.body.appendChild(img);
      expect(isBlobInUse(testBlob)).toBe(true);
      img.remove();
      expect(isBlobInUse(testBlob)).toBe(false);
    });

    it("defers revoking in-use blobs until cleanup runs and forces revocation on clearDitherCache", () => {
      let revokedUrls: string[] = [];
      const origRevoke = URL.revokeObjectURL;
      URL.revokeObjectURL = (url: string) => {
        revokedUrls.push(url);
      };

      try {
        const testBlob = "blob:http://localhost/active-blob-456";
        const img = document.createElement("img");
        img.src = testBlob;
        document.body.appendChild(img);

        // Eviction / freeing attempt while in use: must not revoke immediately
        freeUrlIfBlob(testBlob);
        expect(revokedUrls).not.toContain(testBlob);

        // Remove element from DOM
        img.remove();

        // Cleanup now detects it is no longer in use and revokes
        cleanupPendingBlobs();
        expect(revokedUrls).toContain(testBlob);

        // clearDitherCache forces revocation of all pending blobs
        revokedUrls = [];
        const activeBlob2 = "blob:http://localhost/active-blob-789";
        const img2 = document.createElement("img");
        img2.src = activeBlob2;
        document.body.appendChild(img2);

        freeUrlIfBlob(activeBlob2);
        expect(revokedUrls).not.toContain(activeBlob2);

        clearDitherCache();
        expect(revokedUrls).toContain(activeBlob2);
        img2.remove();
      } finally {
        URL.revokeObjectURL = origRevoke;
      }
    });
  });
});
