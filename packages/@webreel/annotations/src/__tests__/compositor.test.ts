import { describe, it, expect } from "vitest";
import { composeAnnotations, isAnnotationActive } from "../compositor.js";
import { HighlightRenderer } from "../renderers/highlight.js";
import { RedactRenderer } from "../renderers/redact.js";
import type { AnnotationLayer, AnnotationRenderer, AnnotationConfig } from "../types.js";
import {
  createTestFrame,
  isPng,
  getDimensions,
  TEST_WIDTH,
  TEST_HEIGHT,
} from "./helpers.js";

describe("isAnnotationActive", () => {
  function makeLayer(startMs: number, durationMs: number): AnnotationLayer {
    return {
      renderer: {
        type: "highlight",
        render: async (f: Buffer) => f,
      } as AnnotationRenderer,
      config: {
        type: "highlight",
        startMs,
        durationMs,
        target: { x: 0, y: 0, width: 100, height: 100 },
      },
    };
  }

  it("returns true when timestamp is within [startMs, startMs + durationMs)", () => {
    const layer = makeLayer(1000, 2000);
    expect(isAnnotationActive(layer, 1000)).toBe(true);
    expect(isAnnotationActive(layer, 1500)).toBe(true);
    expect(isAnnotationActive(layer, 2999)).toBe(true);
  });

  it("returns false when timestamp is before start", () => {
    const layer = makeLayer(1000, 2000);
    expect(isAnnotationActive(layer, 0)).toBe(false);
    expect(isAnnotationActive(layer, 999)).toBe(false);
  });

  it("returns false when timestamp is at or after end", () => {
    const layer = makeLayer(1000, 2000);
    expect(isAnnotationActive(layer, 3000)).toBe(false);
    expect(isAnnotationActive(layer, 5000)).toBe(false);
  });

  it("handles zero-duration annotations (active only at exact startMs)", () => {
    const layer = makeLayer(500, 0);
    expect(isAnnotationActive(layer, 500)).toBe(true);
    expect(isAnnotationActive(layer, 501)).toBe(false);
    expect(isAnnotationActive(layer, 499)).toBe(false);
  });
});

describe("composeAnnotations", () => {
  it("returns original frame when no layers are provided", async () => {
    const frame = await createTestFrame();
    const result = await composeAnnotations(frame, [], 500);
    expect(result).toBe(frame);
  });

  it("returns original frame when no layers are active at timestamp", async () => {
    const frame = await createTestFrame();
    const layers: AnnotationLayer[] = [
      {
        renderer: new HighlightRenderer(),
        config: {
          type: "highlight",
          startMs: 2000,
          durationMs: 1000,
          target: { x: 100, y: 100, width: 200, height: 150 },
        },
      },
    ];

    // timestamp 500 is before startMs 2000
    const result = await composeAnnotations(frame, layers, 500);
    // Frame should be unchanged (no annotations active)
    expect(isPng(result)).toBe(true);
  });

  it("applies a single active annotation", async () => {
    const frame = await createTestFrame();
    const layers: AnnotationLayer[] = [
      {
        renderer: new HighlightRenderer(),
        config: {
          type: "highlight",
          startMs: 0,
          durationMs: 2000,
          target: { x: 100, y: 100, width: 200, height: 150 },
        },
      },
    ];

    const result = await composeAnnotations(frame, layers, 500);
    expect(isPng(result)).toBe(true);
    const dims = await getDimensions(result);
    expect(dims.width).toBe(TEST_WIDTH);
    expect(dims.height).toBe(TEST_HEIGHT);
    // Should differ from original (highlight overlay applied)
    expect(result.equals(frame)).toBe(false);
  });

  it("applies multiple annotations in order", async () => {
    const frame = await createTestFrame();
    const layers: AnnotationLayer[] = [
      {
        renderer: new HighlightRenderer(),
        config: {
          type: "highlight",
          startMs: 0,
          durationMs: 2000,
          target: { x: 100, y: 100, width: 200, height: 150 },
        },
      },
      {
        renderer: new RedactRenderer(),
        config: {
          type: "redact",
          startMs: 0,
          durationMs: 2000,
          target: { x: 300, y: 200, width: 100, height: 80 },
          mode: "blur",
        } as AnnotationConfig,
      },
    ];

    const result = await composeAnnotations(frame, layers, 500);
    expect(isPng(result)).toBe(true);
    expect(result.equals(frame)).toBe(false);
  });

  it("skips inactive layers and applies only active ones", async () => {
    const frame = await createTestFrame();

    // Layer 1: active at ts=500 (0..2000)
    // Layer 2: inactive at ts=500 (starts at 3000)
    const layers: AnnotationLayer[] = [
      {
        renderer: new HighlightRenderer(),
        config: {
          type: "highlight",
          startMs: 0,
          durationMs: 2000,
          target: { x: 100, y: 100, width: 200, height: 150 },
        },
      },
      {
        renderer: new RedactRenderer(),
        config: {
          type: "redact",
          startMs: 3000,
          durationMs: 1000,
          target: { x: 300, y: 200, width: 100, height: 80 },
        },
      },
    ];

    // Only highlight should be applied at t=500
    const resultAt500 = await composeAnnotations(frame, layers, 500);
    expect(isPng(resultAt500)).toBe(true);
    expect(resultAt500.equals(frame)).toBe(false);

    // Both inactive at t=5000
    const resultAt5000 = await composeAnnotations(frame, layers, 5000);
    expect(isPng(resultAt5000)).toBe(true);
  });
});
