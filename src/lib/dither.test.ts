import { describe, expect, it } from "vitest";
import {
  applyBayerDitherToBuffer,
  BAYER_8X8,
  calculateVerticalFade,
  DEFAULT_DITHER_OPTIONS,
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
  });
});
