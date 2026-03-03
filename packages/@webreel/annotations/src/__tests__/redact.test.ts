import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { RedactRenderer } from "../renderers/redact.js";
import type { RedactConfig } from "../types.js";
import {
  createTestFrame,
  isPng,
  getDimensions,
  TEST_WIDTH,
  TEST_HEIGHT,
} from "./helpers.js";

describe("RedactRenderer", () => {
  const renderer = new RedactRenderer();

  it("has type 'redact'", () => {
    expect(renderer.type).toBe("redact");
  });

  it("returns original frame when no target is specified", async () => {
    const frame = await createTestFrame();
    const config: RedactConfig = {
      type: "redact",
      startMs: 0,
      durationMs: 1000,
    };

    const result = await renderer.render(frame, config, 500);
    expect(result).toBe(frame);
  });

  it("blur mode produces valid PNG with same dimensions", async () => {
    const frame = await createTestFrame();
    const config: RedactConfig = {
      type: "redact",
      startMs: 0,
      durationMs: 1000,
      target: { x: 100, y: 100, width: 200, height: 150 },
      mode: "blur",
    };

    const result = await renderer.render(frame, config, 500);
    expect(isPng(result)).toBe(true);

    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
  });

  it("pixelate mode produces valid PNG with same dimensions", async () => {
    const frame = await createTestFrame();
    const config: RedactConfig = {
      type: "redact",
      startMs: 0,
      durationMs: 1000,
      target: { x: 100, y: 100, width: 200, height: 150 },
      mode: "pixelate",
    };

    const result = await renderer.render(frame, config, 500);
    expect(isPng(result)).toBe(true);

    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
  });

  it("blur and pixelate modes produce different outputs", async () => {
    // Use a multi-color frame so the different modes have visible effect
    const frame = await createMultiColorFrame();
    const target = { x: 50, y: 50, width: 200, height: 150 };

    const blurConfig: RedactConfig = {
      type: "redact",
      startMs: 0,
      durationMs: 1000,
      target,
      mode: "blur",
      intensity: 15,
    };

    const pixelConfig: RedactConfig = {
      type: "redact",
      startMs: 0,
      durationMs: 1000,
      target,
      mode: "pixelate",
      intensity: 15,
    };

    const blurred = await renderer.render(frame, blurConfig, 500);
    const pixelated = await renderer.render(frame, pixelConfig, 500);

    expect(isPng(blurred)).toBe(true);
    expect(isPng(pixelated)).toBe(true);
    // The two redaction modes should produce different pixel data
    expect(blurred.equals(pixelated)).toBe(false);
  });

  it("handles target clamped to frame edge", async () => {
    const frame = await createTestFrame();
    const config: RedactConfig = {
      type: "redact",
      startMs: 0,
      durationMs: 1000,
      target: { x: TEST_WIDTH - 50, y: TEST_HEIGHT - 50, width: 200, height: 200 },
      mode: "blur",
    };

    const result = await renderer.render(frame, config, 500);
    expect(isPng(result)).toBe(true);
    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
  });

  it("respects custom intensity for blur", async () => {
    const frame = await createMultiColorFrame();
    const target = { x: 100, y: 100, width: 200, height: 150 };

    const lowIntensity: RedactConfig = {
      type: "redact",
      startMs: 0,
      durationMs: 1000,
      target,
      mode: "blur",
      intensity: 2,
    };

    const highIntensity: RedactConfig = {
      type: "redact",
      startMs: 0,
      durationMs: 1000,
      target,
      mode: "blur",
      intensity: 20,
    };

    const low = await renderer.render(frame, lowIntensity, 500);
    const high = await renderer.render(frame, highIntensity, 500);

    expect(low.equals(high)).toBe(false);
  });
});

/**
 * Create a frame with a gradient pattern for visible redaction effects.
 * Each row has a unique color to ensure blur and pixelate produce
 * visually distinct outputs.
 */
async function createMultiColorFrame(): Promise<Buffer> {
  // Build a raw pixel buffer with a vertical gradient (R varies by row)
  const channels = 3;
  const rawData = Buffer.alloc(TEST_WIDTH * TEST_HEIGHT * channels);
  for (let y = 0; y < TEST_HEIGHT; y++) {
    const r = Math.round((y / TEST_HEIGHT) * 255);
    const g = Math.round(((TEST_HEIGHT - y) / TEST_HEIGHT) * 255);
    for (let x = 0; x < TEST_WIDTH; x++) {
      const b = Math.round((x / TEST_WIDTH) * 255);
      const offset = (y * TEST_WIDTH + x) * channels;
      rawData[offset] = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
    }
  }

  return sharp(rawData, {
    raw: { width: TEST_WIDTH, height: TEST_HEIGHT, channels },
  })
    .png()
    .toBuffer();
}
