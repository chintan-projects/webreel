/**
 * Redact annotation renderer.
 *
 * Obscures the target region using either gaussian blur or pixelation.
 * Blur mode uses sharp's built-in blur; pixelate mode downscales then
 * upscales to create a blocky mosaic effect.
 */

import sharp from "sharp";
import type { AnnotationConfig, AnnotationRenderer, AnnotationTarget } from "../types.js";
import type { RedactConfig } from "../types.js";
import { AnnotationRenderError } from "../errors.js";
import { clampTarget, validateFrameBuffer } from "./utils.js";

const DEFAULT_MODE = "blur";
const DEFAULT_INTENSITY = 10;
const MIN_PIXEL_BLOCK = 2;

export class RedactRenderer implements AnnotationRenderer {
  readonly type = "redact" as const;

  async render(
    frame: Buffer,
    config: AnnotationConfig,
    _timestampMs: number,
  ): Promise<Buffer> {
    const metadata = await validateFrameBuffer(frame, this.type);
    const frameWidth = metadata.width!;
    const frameHeight = metadata.height!;
    const rc = config as RedactConfig;

    if (!config.target) {
      return frame;
    }

    const target = clampTarget(config.target, frameWidth, frameHeight);
    if (target.width <= 0 || target.height <= 0) {
      return frame;
    }

    try {
      const mode = rc.mode ?? DEFAULT_MODE;
      if (mode === "pixelate") {
        return await this.applyPixelation(frame, target, rc);
      }
      return await this.applyBlur(frame, target, rc);
    } catch (e) {
      throw new AnnotationRenderError(
        this.type,
        `Failed to apply redaction: ${(e as Error).message}`,
        e instanceof Error ? e : undefined,
      );
    }
  }

  private async applyBlur(
    frame: Buffer,
    target: AnnotationTarget,
    config: RedactConfig,
  ): Promise<Buffer> {
    const sigma = config.intensity ?? DEFAULT_INTENSITY;

    // Extract target region, blur it, composite back
    const region = await sharp(frame)
      .extract({
        left: target.x,
        top: target.y,
        width: target.width,
        height: target.height,
      })
      .blur(Math.max(0.3, sigma))
      .png()
      .toBuffer();

    return sharp(frame)
      .composite([
        {
          input: region,
          left: target.x,
          top: target.y,
        },
      ])
      .png()
      .toBuffer();
  }

  private async applyPixelation(
    frame: Buffer,
    target: AnnotationTarget,
    config: RedactConfig,
  ): Promise<Buffer> {
    const blockSize = Math.max(MIN_PIXEL_BLOCK, config.intensity ?? DEFAULT_INTENSITY);

    // Downscale the target region to tiny size, then scale back up
    // to create a blocky mosaic effect.
    const smallWidth = Math.max(1, Math.round(target.width / blockSize));
    const smallHeight = Math.max(1, Math.round(target.height / blockSize));

    const pixelated = await sharp(frame)
      .extract({
        left: target.x,
        top: target.y,
        width: target.width,
        height: target.height,
      })
      .resize(smallWidth, smallHeight, { kernel: sharp.kernel.nearest })
      .resize(target.width, target.height, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();

    return sharp(frame)
      .composite([
        {
          input: pixelated,
          left: target.x,
          top: target.y,
        },
      ])
      .png()
      .toBuffer();
  }
}
