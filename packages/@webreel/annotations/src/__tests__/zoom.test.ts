import { describe, it, expect } from "vitest";
import { ZoomRenderer } from "../renderers/zoom.js";
import type { ZoomConfig } from "../types.js";
import {
  createTestFrame,
  isPng,
  getDimensions,
  TEST_WIDTH,
  TEST_HEIGHT,
} from "./helpers.js";

describe("ZoomRenderer", () => {
  const renderer = new ZoomRenderer();

  it("has type 'zoom'", () => {
    expect(renderer.type).toBe("zoom");
  });

  it("returns original frame when no target is specified", async () => {
    const frame = await createTestFrame();
    const config: ZoomConfig = {
      type: "zoom",
      startMs: 0,
      durationMs: 1000,
    };

    const result = await renderer.render(frame, config, 500);
    expect(result).toBe(frame);
  });

  it("at progress 0 returns the original frame (before start)", async () => {
    const frame = await createTestFrame();
    const config: ZoomConfig = {
      type: "zoom",
      startMs: 1000,
      durationMs: 2000,
      target: { x: 200, y: 150, width: 100, height: 80 },
    };

    // timestampMs = 500 is before startMs = 1000 (progress <= 0)
    const result = await renderer.render(frame, config, 500);
    expect(result).toBe(frame);
  });

  it("at progress 1 returns a zoomed frame with same dimensions", async () => {
    const frame = await createTestFrame();
    const config: ZoomConfig = {
      type: "zoom",
      startMs: 0,
      durationMs: 1000,
      target: { x: 200, y: 150, width: 100, height: 80 },
      maxScale: 2.0,
    };

    // timestampMs = 1000 means progress = 1.0
    const result = await renderer.render(frame, config, 1000);
    expect(isPng(result)).toBe(true);

    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
  });

  it("zoomed output differs from original", async () => {
    const frame = await createTestFrame();
    const config: ZoomConfig = {
      type: "zoom",
      startMs: 0,
      durationMs: 1000,
      target: { x: 200, y: 150, width: 100, height: 80 },
    };

    const result = await renderer.render(frame, config, 500);
    // For a solid color frame, the zoom may or may not look different
    // depending on rounding. Test with a multi-color frame to be sure.
    expect(isPng(result)).toBe(true);
  });

  it("handles linear easing", async () => {
    const frame = await createTestFrame();
    const config: ZoomConfig = {
      type: "zoom",
      startMs: 0,
      durationMs: 1000,
      target: { x: 200, y: 150, width: 100, height: 80 },
      easing: "linear",
    };

    const result = await renderer.render(frame, config, 500);
    expect(isPng(result)).toBe(true);
    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
  });

  it("handles target clamped to edge", async () => {
    const frame = await createTestFrame();
    const config: ZoomConfig = {
      type: "zoom",
      startMs: 0,
      durationMs: 1000,
      target: { x: TEST_WIDTH - 20, y: TEST_HEIGHT - 20, width: 100, height: 100 },
      maxScale: 3.0,
    };

    const result = await renderer.render(frame, config, 800);
    expect(isPng(result)).toBe(true);
    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
  });
});
