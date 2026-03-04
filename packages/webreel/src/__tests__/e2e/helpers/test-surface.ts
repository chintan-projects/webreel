/**
 * TestSurface — a real Surface implementation for e2e testing.
 *
 * NOT a mock. Implements the full Surface interface using a minimal PNG
 * generator (no native addons). Each action changes the frame color so
 * frames differ, enabling meaningful video output assertions.
 *
 * Use by registering as "test" in the SurfaceRegistry:
 *   registry.register("test", () => new TestSurface());
 */

import type {
  Surface,
  SurfaceType,
  SurfaceConfig,
  SurfaceAction,
  ExecutionContext,
  ActionResult,
} from "@webreel/surfaces";
import { createSolidPng } from "./png-generator.js";

const DEFAULT_VIEWPORT = { width: 320, height: 240 };

export class TestSurface implements Surface {
  readonly type = "browser" as SurfaceType; // Use "browser" to satisfy the union type
  private frameColor = { r: 51, g: 102, b: 204 };
  private viewport = DEFAULT_VIEWPORT;
  private initialized = false;

  async setup(config: SurfaceConfig): Promise<void> {
    this.viewport = config.viewport ?? DEFAULT_VIEWPORT;
    this.initialized = true;
  }

  async execute(
    _action: SurfaceAction,
    _context: ExecutionContext,
  ): Promise<ActionResult> {
    if (!this.initialized) {
      throw new Error("TestSurface: setup() must be called before execute()");
    }

    // Shift frame color on each action so frames are visually distinct
    this.frameColor = {
      r: (this.frameColor.r + 50) % 256,
      g: (this.frameColor.g + 30) % 256,
      b: (this.frameColor.b + 20) % 256,
    };

    return { durationMs: 0 };
  }

  async captureFrame(): Promise<Buffer> {
    if (!this.initialized) {
      throw new Error("TestSurface: setup() must be called before captureFrame()");
    }

    // Generate a minimal valid PNG without requiring sharp.
    // Uses raw RGB pixel grid and manual PNG chunk construction.
    return createSolidPng(this.viewport.width, this.viewport.height, this.frameColor);
  }

  async teardown(): Promise<void> {
    this.initialized = false;
  }
}
