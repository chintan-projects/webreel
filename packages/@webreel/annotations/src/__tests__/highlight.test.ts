import { describe, it, expect } from "vitest";
import { HighlightRenderer } from "../renderers/highlight.js";
import type { HighlightConfig } from "../types.js";
import {
  createTestFrame,
  isPng,
  getDimensions,
  TEST_WIDTH,
  TEST_HEIGHT,
} from "./helpers.js";

describe("HighlightRenderer", () => {
  const renderer = new HighlightRenderer();

  it("has type 'highlight'", () => {
    expect(renderer.type).toBe("highlight");
  });

  it("returns original frame when no target is specified", async () => {
    const frame = await createTestFrame();
    const config: HighlightConfig = {
      type: "highlight",
      startMs: 0,
      durationMs: 1000,
    };

    const result = await renderer.render(frame, config, 500);
    expect(result).toBe(frame);
  });

  it("renders a valid PNG with correct dimensions", async () => {
    const frame = await createTestFrame();
    const config: HighlightConfig = {
      type: "highlight",
      startMs: 0,
      durationMs: 1000,
      target: { x: 100, y: 100, width: 200, height: 150 },
    };

    const result = await renderer.render(frame, config, 500);
    expect(isPng(result)).toBe(true);

    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
  });

  it("output differs from input (overlay was applied)", async () => {
    const frame = await createTestFrame();
    const config: HighlightConfig = {
      type: "highlight",
      startMs: 0,
      durationMs: 1000,
      target: { x: 100, y: 100, width: 200, height: 150 },
    };

    const result = await renderer.render(frame, config, 500);
    expect(result.equals(frame)).toBe(false);
  });

  it("handles target at frame edge (clamping)", async () => {
    const frame = await createTestFrame();
    const config: HighlightConfig = {
      type: "highlight",
      startMs: 0,
      durationMs: 1000,
      target: { x: TEST_WIDTH - 50, y: TEST_HEIGHT - 50, width: 200, height: 200 },
    };

    const result = await renderer.render(frame, config, 500);
    expect(isPng(result)).toBe(true);
    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
  });

  it("returns original frame when target is fully outside bounds", async () => {
    const frame = await createTestFrame();
    const config: HighlightConfig = {
      type: "highlight",
      startMs: 0,
      durationMs: 1000,
      target: { x: TEST_WIDTH + 100, y: TEST_HEIGHT + 100, width: 200, height: 200 },
    };

    const result = await renderer.render(frame, config, 500);
    // After clamping, width and height become 0, so original frame is returned
    expect(result).toBe(frame);
  });

  it("respects custom dimOpacity and borderColor", async () => {
    const frame = await createTestFrame();
    const config: HighlightConfig = {
      type: "highlight",
      startMs: 0,
      durationMs: 1000,
      target: { x: 50, y: 50, width: 100, height: 100 },
      dimOpacity: 0.8,
      borderColor: "#ff0000",
      borderWidth: 4,
    };

    const result = await renderer.render(frame, config, 500);
    expect(isPng(result)).toBe(true);
    expect(result.equals(frame)).toBe(false);
  });
});
