import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";

import type {
  SurfaceConfig,
  ExecutionContext,
  SurfaceAction,
  Surface,
} from "../types.js";
import { SurfaceRegistry } from "../registry.js";
import { CompositeSurface } from "../composite.js";

/** Create a mock surface that returns a solid-color frame. */
function createMockSurface(
  surfaceType: string,
  color: { r: number; g: number; b: number },
): Surface {
  let width = 1280;
  let height = 720;

  return {
    type: surfaceType as Surface["type"],
    setup: vi.fn(async (config: SurfaceConfig) => {
      if (config.viewport) {
        width = config.viewport.width;
        height = config.viewport.height;
      }
    }),
    execute: vi.fn(async () => ({ durationMs: 0 })),
    captureFrame: vi.fn(async () => {
      return sharp({
        create: {
          width,
          height,
          channels: 3,
          background: color,
        },
      })
        .png()
        .toBuffer();
    }),
    teardown: vi.fn(async () => undefined),
  };
}

function makeContext(): ExecutionContext {
  return {
    sceneName: "Test Scene",
    actName: "Test Act",
    captures: {},
    verbose: false,
  };
}

describe("CompositeSurface", () => {
  let registry: SurfaceRegistry;
  let mockTerminal: Surface;
  let mockBrowser: Surface;

  beforeEach(() => {
    registry = new SurfaceRegistry();
    mockTerminal = createMockSurface("terminal", { r: 0, g: 0, b: 0 });
    mockBrowser = createMockSurface("browser", { r: 255, g: 255, b: 255 });

    registry.register("terminal", () => mockTerminal);
    registry.register("browser", () => mockBrowser);
  });

  describe("layout calculations", () => {
    it("split-horizontal creates left and right regions", async () => {
      const surface = new CompositeSurface(registry);
      const config: SurfaceConfig = {
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "split-horizontal",
          left: { type: "terminal", options: {} },
          right: { type: "browser", options: {} },
        },
      };

      await surface.setup(config);

      // Verify children were set up with half-width viewports
      expect(mockTerminal.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 960, height: 1080 },
        }),
      );
      expect(mockBrowser.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 960, height: 1080 },
        }),
      );

      await surface.teardown();
    });

    it("split-vertical creates top and bottom regions", async () => {
      const surface = new CompositeSurface(registry);
      const config: SurfaceConfig = {
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "split-vertical",
          top: { type: "terminal", options: {} },
          bottom: { type: "browser", options: {} },
        },
      };

      await surface.setup(config);

      expect(mockTerminal.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 540 },
        }),
      );
      expect(mockBrowser.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 540 },
        }),
      );

      await surface.teardown();
    });

    it("picture-in-picture creates main and pip regions", async () => {
      const surface = new CompositeSurface(registry);
      const config: SurfaceConfig = {
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "picture-in-picture",
          main: { type: "browser", options: {} },
          pip: { type: "terminal", options: {} },
        },
      };

      await surface.setup(config);

      // Main should be full viewport
      expect(mockBrowser.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 1080 },
        }),
      );

      // PiP should be 1/4 size
      expect(mockTerminal.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 480, height: 270 },
        }),
      );

      await surface.teardown();
    });
  });

  describe("setup", () => {
    it("throws on unknown layout", async () => {
      const surface = new CompositeSurface(registry);
      const config: SurfaceConfig = {
        type: "composite",
        options: {
          layout: "diagonal",
          left: { type: "terminal", options: {} },
        },
      };

      await expect(surface.setup(config)).rejects.toThrow('Unknown layout: "diagonal"');
    });

    it("throws when no child surfaces configured", async () => {
      const surface = new CompositeSurface(registry);
      const config: SurfaceConfig = {
        type: "composite",
        options: {
          layout: "split-horizontal",
        },
      };

      await expect(surface.setup(config)).rejects.toThrow("No child surfaces configured");
    });

    it("rolls back on partial setup failure", async () => {
      const failingSurface = createMockSurface("browser", { r: 0, g: 0, b: 0 });
      vi.mocked(failingSurface.setup).mockRejectedValueOnce(new Error("setup boom"));

      const failRegistry = new SurfaceRegistry();
      failRegistry.register("terminal", () => mockTerminal);
      failRegistry.register("browser", () => failingSurface);

      const surface = new CompositeSurface(failRegistry);
      const config: SurfaceConfig = {
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "split-horizontal",
          left: { type: "terminal", options: {} },
          right: { type: "browser", options: {} },
        },
      };

      await expect(surface.setup(config)).rejects.toThrow("setup boom");

      // Terminal was successfully set up, so it should have been torn down
      expect(mockTerminal.teardown).toHaveBeenCalled();
    });

    it("uses default split-horizontal layout when none specified", async () => {
      const surface = new CompositeSurface(registry);
      const config: SurfaceConfig = {
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          left: { type: "terminal", options: {} },
          right: { type: "browser", options: {} },
        },
      };

      await surface.setup(config);

      expect(mockTerminal.setup).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 960, height: 1080 },
        }),
      );

      await surface.teardown();
    });
  });

  describe("execute", () => {
    let surface: CompositeSurface;

    beforeEach(async () => {
      surface = new CompositeSurface(registry);
      await surface.setup({
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "split-horizontal",
          left: { type: "terminal", options: {} },
          right: { type: "browser", options: {} },
        },
      });
    });

    afterEach(async () => {
      await surface.teardown();
    });

    it("routes targeted actions to the correct child", async () => {
      const action: SurfaceAction = {
        type: "type_text",
        params: { target: "left", text: "hello" },
      };
      await surface.execute(action, makeContext());

      expect(mockTerminal.execute).toHaveBeenCalled();
      expect(mockBrowser.execute).not.toHaveBeenCalled();
    });

    it("strips target from delegated action params", async () => {
      const action: SurfaceAction = {
        type: "run",
        params: { target: "left", command: "ls" },
      };
      await surface.execute(action, makeContext());

      const delegatedAction = vi.mocked(mockTerminal.execute).mock.calls[0]?.[0];
      expect(delegatedAction?.params).not.toHaveProperty("target");
      expect(delegatedAction?.params["command"]).toBe("ls");
    });

    it("executes on all children when no target specified", async () => {
      const action: SurfaceAction = {
        type: "wait",
        params: { duration: 0.01 },
      };
      await surface.execute(action, makeContext());

      expect(mockTerminal.execute).toHaveBeenCalled();
      expect(mockBrowser.execute).toHaveBeenCalled();
    });

    it("throws when target not found", async () => {
      const action: SurfaceAction = {
        type: "click",
        params: { target: "center" },
      };
      await expect(surface.execute(action, makeContext())).rejects.toThrow(
        'Composite target "center" not found',
      );
    });

    it("throws when not initialized", async () => {
      const freshSurface = new CompositeSurface(registry);
      const action: SurfaceAction = { type: "wait", params: {} };
      await expect(freshSurface.execute(action, makeContext())).rejects.toThrow(
        "not initialized",
      );
    });

    it("merges captures from child execution", async () => {
      vi.mocked(mockTerminal.execute).mockResolvedValueOnce({
        durationMs: 0,
        captures: { stdout: "hello world" },
      });

      const action: SurfaceAction = {
        type: "run",
        params: { target: "left", command: "echo hello" },
      };
      const result = await surface.execute(action, makeContext());
      expect(result.captures?.["stdout"]).toBe("hello world");
    });
  });

  describe("captureFrame", () => {
    it("composites child frames into a single image", async () => {
      const surface = new CompositeSurface(registry);
      await surface.setup({
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "split-horizontal",
          left: { type: "terminal", options: {} },
          right: { type: "browser", options: {} },
        },
      });

      const frame = await surface.captureFrame();
      expect(frame).toBeInstanceOf(Buffer);

      // Verify it's a valid PNG
      expect(frame[0]).toBe(0x89);
      expect(frame[1]).toBe(0x50);
      expect(frame[2]).toBe(0x4e);
      expect(frame[3]).toBe(0x47);

      // Verify dimensions
      const metadata = await sharp(frame).metadata();
      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);

      // Both children should have been asked for frames
      expect(mockTerminal.captureFrame).toHaveBeenCalled();
      expect(mockBrowser.captureFrame).toHaveBeenCalled();

      await surface.teardown();
    });

    it("throws when not initialized", async () => {
      const freshSurface = new CompositeSurface(registry);
      await expect(freshSurface.captureFrame()).rejects.toThrow("not initialized");
    });
  });

  describe("teardown", () => {
    it("tears down all child surfaces", async () => {
      const surface = new CompositeSurface(registry);
      await surface.setup({
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "split-horizontal",
          left: { type: "terminal", options: {} },
          right: { type: "browser", options: {} },
        },
      });

      await surface.teardown();

      expect(mockTerminal.teardown).toHaveBeenCalled();
      expect(mockBrowser.teardown).toHaveBeenCalled();
    });

    it("is idempotent", async () => {
      const surface = new CompositeSurface(registry);
      await surface.setup({
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "split-horizontal",
          left: { type: "terminal", options: {} },
        },
      });

      await surface.teardown();
      await surface.teardown(); // should not throw
    });

    it("continues teardown even if a child fails", async () => {
      vi.mocked(mockTerminal.teardown).mockRejectedValueOnce(new Error("teardown error"));

      const surface = new CompositeSurface(registry);
      await surface.setup({
        type: "composite",
        viewport: { width: 1920, height: 1080 },
        options: {
          layout: "split-horizontal",
          left: { type: "terminal", options: {} },
          right: { type: "browser", options: {} },
        },
      });

      // Should not throw even though terminal teardown fails
      await surface.teardown();
      expect(mockBrowser.teardown).toHaveBeenCalled();
    });
  });
});
