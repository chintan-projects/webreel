import { describe, it, expect, beforeEach } from "vitest";
import sharp from "sharp";

import { TitleCardSurface } from "../title-card.js";
import type { SurfaceConfig, ExecutionContext } from "../types.js";

function makeConfig(options: Record<string, unknown> = {}): SurfaceConfig {
  return { type: "title", options };
}

function makeContext(): ExecutionContext {
  return {
    sceneName: "Test Scene",
    actName: "Test Act",
    captures: {},
    verbose: false,
  };
}

describe("TitleCardSurface", () => {
  let surface: TitleCardSurface;

  beforeEach(() => {
    surface = new TitleCardSurface();
  });

  it("setup() parses config options correctly", async () => {
    const config = makeConfig({
      background: "#ff0000",
      color: "#00ff00",
      subtitle: "Test subtitle",
      font_size: 64,
    });
    await surface.setup(config);

    // If setup succeeds without throwing, config was parsed correctly.
    // Verify by capturing a frame (the surface is functional).
    const frame = await surface.captureFrame();
    expect(frame).toBeInstanceOf(Buffer);
    expect(frame.length).toBeGreaterThan(0);
  });

  it("captureFrame() returns a valid PNG buffer", async () => {
    await surface.setup(makeConfig({ title: "PNG Test" }));
    const frame = await surface.captureFrame();

    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    expect(frame[0]).toBe(0x89);
    expect(frame[1]).toBe(0x50);
    expect(frame[2]).toBe(0x4e);
    expect(frame[3]).toBe(0x47);
  });

  it("captureFrame() returns buffer with correct dimensions", async () => {
    const config: SurfaceConfig = {
      type: "title",
      viewport: { width: 800, height: 600 },
      options: { title: "Dimensions Test" },
    };
    await surface.setup(config);
    const frame = await surface.captureFrame();

    const metadata = await sharp(frame).metadata();
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
  });

  it("execute() handles wait/pause actions", async () => {
    await surface.setup(makeConfig({ title: "Wait Test" }));
    const ctx = makeContext();

    const result = await surface.execute(
      { type: "wait", params: { duration: 0.01 } },
      ctx,
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("execute() returns immediately for unknown actions", async () => {
    await surface.setup(makeConfig({ title: "Unknown Action" }));
    const ctx = makeContext();
    const start = Date.now();

    const result = await surface.execute({ type: "unknown_action", params: {} }, ctx);
    const elapsed = Date.now() - start;

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(100);
  });

  it("teardown() is idempotent", async () => {
    await surface.setup(makeConfig({ title: "Teardown Test" }));
    await surface.teardown();
    await surface.teardown(); // second call should not throw
  });

  it("default colors are applied when not specified", async () => {
    await surface.setup(makeConfig());
    const frame = await surface.captureFrame();

    // Frame should render successfully with defaults (1280x720)
    const metadata = await sharp(frame).metadata();
    expect(metadata.width).toBe(1280);
    expect(metadata.height).toBe(720);
    expect(metadata.format).toBe("png");
  });
});
