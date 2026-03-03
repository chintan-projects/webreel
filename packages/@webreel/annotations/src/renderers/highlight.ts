/**
 * Highlight annotation renderer.
 *
 * Dims the entire frame with a semi-transparent dark overlay
 * and cuts out the target region to leave it bright. Optionally
 * adds a colored border glow around the target.
 */

import sharp from "sharp";
import type { AnnotationConfig, AnnotationRenderer, AnnotationTarget } from "../types.js";
import type { HighlightConfig } from "../types.js";
import { AnnotationRenderError } from "../errors.js";
import { clampTarget, validateFrameBuffer } from "./utils.js";

const DEFAULT_DIM_OPACITY = 0.6;
const DEFAULT_BORDER_COLOR = "#3b82f6";
const DEFAULT_BORDER_WIDTH = 2;

export class HighlightRenderer implements AnnotationRenderer {
  readonly type = "highlight" as const;

  async render(
    frame: Buffer,
    config: AnnotationConfig,
    _timestampMs: number,
  ): Promise<Buffer> {
    const metadata = await validateFrameBuffer(frame, this.type);
    const frameWidth = metadata.width!;
    const frameHeight = metadata.height!;
    const hc = config as HighlightConfig;

    if (!config.target) {
      return frame;
    }

    const target = clampTarget(config.target, frameWidth, frameHeight);
    if (target.width <= 0 || target.height <= 0) {
      return frame;
    }

    try {
      return await this.compositeHighlight(frame, frameWidth, frameHeight, target, hc);
    } catch (e) {
      throw new AnnotationRenderError(
        this.type,
        `Failed to composite highlight overlay: ${(e as Error).message}`,
        e instanceof Error ? e : undefined,
      );
    }
  }

  private async compositeHighlight(
    frame: Buffer,
    frameWidth: number,
    frameHeight: number,
    target: AnnotationTarget,
    config: HighlightConfig,
  ): Promise<Buffer> {
    const dimOpacity = config.dimOpacity ?? DEFAULT_DIM_OPACITY;
    const borderColor = config.borderColor ?? DEFAULT_BORDER_COLOR;
    const borderWidth = config.borderWidth ?? DEFAULT_BORDER_WIDTH;
    const alpha = Math.round(dimOpacity * 255);

    // Build an SVG overlay: full-frame dark rect with a cutout for the target
    const svg = buildHighlightSvg(
      frameWidth,
      frameHeight,
      target,
      alpha,
      borderColor,
      borderWidth,
    );

    const overlayBuffer = Buffer.from(svg);

    return sharp(frame)
      .composite([{ input: overlayBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();
  }
}

/**
 * Build an SVG with a dark overlay that has a rectangular cutout
 * over the target region, plus an optional border around the cutout.
 */
function buildHighlightSvg(
  width: number,
  height: number,
  target: AnnotationTarget,
  alpha: number,
  borderColor: string,
  borderWidth: number,
): string {
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `  <defs>`,
    `    <mask id="cutout">`,
    `      <rect width="${width}" height="${height}" fill="white"/>`,
    `      <rect x="${target.x}" y="${target.y}" width="${target.width}" height="${target.height}" fill="black"/>`,
    `    </mask>`,
    `  </defs>`,
    `  <rect width="${width}" height="${height}" fill="rgba(0,0,0,${alpha / 255})" mask="url(#cutout)"/>`,
  ];

  if (borderWidth > 0) {
    lines.push(
      `  <rect x="${target.x}" y="${target.y}" width="${target.width}" height="${target.height}" ` +
        `fill="none" stroke="${borderColor}" stroke-width="${borderWidth}" rx="2"/>`,
    );
  }

  lines.push(`</svg>`);
  return lines.join("\n");
}
