/**
 * Arrow annotation renderer.
 *
 * Draws a directional SVG arrow from the edge of the frame
 * toward the target region. Supports an optional text label
 * at the arrow origin, configurable color and thickness.
 */

import sharp from "sharp";
import type { AnnotationConfig, AnnotationRenderer, AnnotationTarget } from "../types.js";
import type { ArrowConfig } from "../types.js";
import { AnnotationRenderError } from "../errors.js";
import { clampTarget, validateFrameBuffer, autoSelectEdge } from "./utils.js";

const DEFAULT_ARROW_COLOR = "#ff4444";
const DEFAULT_ARROW_THICKNESS = 3;
const ARROW_HEAD_SIZE = 12;
const ARROW_MARGIN = 40;
const LABEL_FONT_SIZE = 14;
const LABEL_PADDING = 8;

export class ArrowRenderer implements AnnotationRenderer {
  readonly type = "arrow" as const;

  async render(
    frame: Buffer,
    config: AnnotationConfig,
    _timestampMs: number,
  ): Promise<Buffer> {
    const metadata = await validateFrameBuffer(frame, this.type);
    const frameWidth = metadata.width!;
    const frameHeight = metadata.height!;
    const ac = config as ArrowConfig;

    if (!config.target) {
      return frame;
    }

    const target = clampTarget(config.target, frameWidth, frameHeight);
    if (target.width <= 0 || target.height <= 0) {
      return frame;
    }

    try {
      return await this.compositeArrow(frame, frameWidth, frameHeight, target, ac);
    } catch (e) {
      throw new AnnotationRenderError(
        this.type,
        `Failed to composite arrow overlay: ${(e as Error).message}`,
        e instanceof Error ? e : undefined,
      );
    }
  }

  private async compositeArrow(
    frame: Buffer,
    frameWidth: number,
    frameHeight: number,
    target: AnnotationTarget,
    config: ArrowConfig,
  ): Promise<Buffer> {
    const color = config.color ?? DEFAULT_ARROW_COLOR;
    const thickness = config.thickness ?? DEFAULT_ARROW_THICKNESS;
    const edge =
      config.from === "auto" || !config.from
        ? autoSelectEdge(target, frameWidth, frameHeight)
        : config.from;

    const { startX, startY, endX, endY } = computeArrowEndpoints(
      target,
      edge,
      frameWidth,
      frameHeight,
    );

    const svg = buildArrowSvg(
      frameWidth,
      frameHeight,
      startX,
      startY,
      endX,
      endY,
      color,
      thickness,
      config.label,
    );

    const overlayBuffer = Buffer.from(svg);

    return sharp(frame)
      .composite([{ input: overlayBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();
  }
}

interface ArrowEndpoints {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

function computeArrowEndpoints(
  target: AnnotationTarget,
  edge: "left" | "right" | "top" | "bottom",
  frameWidth: number,
  frameHeight: number,
): ArrowEndpoints {
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;

  switch (edge) {
    case "left":
      return {
        startX: Math.max(ARROW_MARGIN, target.x - ARROW_MARGIN * 2),
        startY: centerY,
        endX: target.x,
        endY: centerY,
      };
    case "right":
      return {
        startX: Math.min(
          frameWidth - ARROW_MARGIN,
          target.x + target.width + ARROW_MARGIN * 2,
        ),
        startY: centerY,
        endX: target.x + target.width,
        endY: centerY,
      };
    case "top":
      return {
        startX: centerX,
        startY: Math.max(ARROW_MARGIN, target.y - ARROW_MARGIN * 2),
        endX: centerX,
        endY: target.y,
      };
    case "bottom":
      return {
        startX: centerX,
        startY: Math.min(
          frameHeight - ARROW_MARGIN,
          target.y + target.height + ARROW_MARGIN * 2,
        ),
        endX: centerX,
        endY: target.y + target.height,
      };
  }
}

function buildArrowSvg(
  width: number,
  height: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  thickness: number,
  label?: string,
): string {
  const markerId = "arrowhead";
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `  <defs>`,
    `    <marker id="${markerId}" markerWidth="${ARROW_HEAD_SIZE}" markerHeight="${ARROW_HEAD_SIZE}" ` +
      `refX="${ARROW_HEAD_SIZE}" refY="${ARROW_HEAD_SIZE / 2}" orient="auto">`,
    `      <polygon points="0,0 ${ARROW_HEAD_SIZE},${ARROW_HEAD_SIZE / 2} 0,${ARROW_HEAD_SIZE}" fill="${color}"/>`,
    `    </marker>`,
    `  </defs>`,
    `  <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" ` +
      `stroke="${color}" stroke-width="${thickness}" marker-end="url(#${markerId})"/>`,
  ];

  if (label) {
    const labelX = startX;
    const labelY = startY - LABEL_FONT_SIZE - LABEL_PADDING;
    const escapedLabel = escapeXml(label);
    lines.push(
      `  <rect x="${labelX - LABEL_PADDING}" y="${labelY - LABEL_FONT_SIZE}" ` +
        `width="${label.length * (LABEL_FONT_SIZE * 0.6) + LABEL_PADDING * 2}" ` +
        `height="${LABEL_FONT_SIZE + LABEL_PADDING}" ` +
        `fill="rgba(0,0,0,0.7)" rx="4"/>`,
      `  <text x="${labelX}" y="${labelY}" fill="white" ` +
        `font-family="sans-serif" font-size="${LABEL_FONT_SIZE}">${escapedLabel}</text>`,
    );
  }

  lines.push(`</svg>`);
  return lines.join("\n");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
