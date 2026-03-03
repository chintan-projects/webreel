/**
 * Callout annotation renderer.
 *
 * Renders a labeled box connected to the target region by a line.
 * The box has a configurable background color, border, and text content.
 * Position is either specified or auto-selected based on available space.
 */

import sharp from "sharp";
import type { AnnotationConfig, AnnotationRenderer, AnnotationTarget } from "../types.js";
import type { CalloutConfig } from "../types.js";
import { AnnotationRenderError } from "../errors.js";
import { clampTarget, validateFrameBuffer, autoSelectPosition } from "./utils.js";

const DEFAULT_BG_COLOR = "#333333";
const DEFAULT_TEXT_COLOR = "#ffffff";
const BOX_PADDING = 12;
const BOX_FONT_SIZE = 14;
const BOX_BORDER_RADIUS = 6;
const BOX_MARGIN = 20;
const LINE_COLOR = "#666666";
const LINE_WIDTH = 2;
const MAX_BOX_WIDTH = 250;

export class CalloutRenderer implements AnnotationRenderer {
  readonly type = "callout" as const;

  async render(
    frame: Buffer,
    config: AnnotationConfig,
    _timestampMs: number,
  ): Promise<Buffer> {
    const metadata = await validateFrameBuffer(frame, this.type);
    const frameWidth = metadata.width!;
    const frameHeight = metadata.height!;
    const cc = config as CalloutConfig;

    if (!config.target || !cc.text) {
      return frame;
    }

    const target = clampTarget(config.target, frameWidth, frameHeight);
    if (target.width <= 0 || target.height <= 0) {
      return frame;
    }

    try {
      return await this.compositeCallout(frame, frameWidth, frameHeight, target, cc);
    } catch (e) {
      throw new AnnotationRenderError(
        this.type,
        `Failed to composite callout overlay: ${(e as Error).message}`,
        e instanceof Error ? e : undefined,
      );
    }
  }

  private async compositeCallout(
    frame: Buffer,
    frameWidth: number,
    frameHeight: number,
    target: AnnotationTarget,
    config: CalloutConfig,
  ): Promise<Buffer> {
    const bgColor = config.backgroundColor ?? DEFAULT_BG_COLOR;
    const textColor = config.textColor ?? DEFAULT_TEXT_COLOR;
    const position =
      config.position === "auto" || !config.position
        ? autoSelectPosition(target, frameWidth, frameHeight)
        : config.position;

    const text = config.text;
    const charWidth = BOX_FONT_SIZE * 0.6;
    const textWidth = Math.min(text.length * charWidth, MAX_BOX_WIDTH);
    const lineCount = Math.ceil((text.length * charWidth) / MAX_BOX_WIDTH);
    const boxWidth = textWidth + BOX_PADDING * 2;
    const boxHeight = lineCount * (BOX_FONT_SIZE + 4) + BOX_PADDING * 2;

    const boxPos = computeBoxPosition(
      position,
      target,
      boxWidth,
      boxHeight,
      frameWidth,
      frameHeight,
    );

    const svg = buildCalloutSvg(
      frameWidth,
      frameHeight,
      target,
      boxPos,
      boxWidth,
      boxHeight,
      text,
      bgColor,
      textColor,
    );

    const overlayBuffer = Buffer.from(svg);

    return sharp(frame)
      .composite([{ input: overlayBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();
  }
}

interface BoxPosition {
  readonly x: number;
  readonly y: number;
}

function computeBoxPosition(
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  target: AnnotationTarget,
  boxWidth: number,
  boxHeight: number,
  frameWidth: number,
  frameHeight: number,
): BoxPosition {
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;

  let x: number;
  let y: number;

  switch (position) {
    case "top-left":
      x = target.x - boxWidth - BOX_MARGIN;
      y = target.y - boxHeight - BOX_MARGIN;
      break;
    case "top-right":
      x = target.x + target.width + BOX_MARGIN;
      y = target.y - boxHeight - BOX_MARGIN;
      break;
    case "bottom-left":
      x = target.x - boxWidth - BOX_MARGIN;
      y = target.y + target.height + BOX_MARGIN;
      break;
    case "bottom-right":
      x = target.x + target.width + BOX_MARGIN;
      y = target.y + target.height + BOX_MARGIN;
      break;
  }

  // Clamp box within frame bounds
  x = Math.max(4, Math.min(x, frameWidth - boxWidth - 4));
  y = Math.max(4, Math.min(y, frameHeight - boxHeight - 4));

  return { x, y };
}

function buildCalloutSvg(
  width: number,
  height: number,
  target: AnnotationTarget,
  boxPos: BoxPosition,
  boxWidth: number,
  boxHeight: number,
  text: string,
  bgColor: string,
  textColor: string,
): string {
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const boxCenterX = boxPos.x + boxWidth / 2;
  const boxCenterY = boxPos.y + boxHeight / 2;

  const escapedText = escapeXml(text);

  // Wrap text into lines for the SVG
  const maxCharsPerLine = Math.floor(MAX_BOX_WIDTH / (BOX_FONT_SIZE * 0.6));
  const textLines = wrapText(escapedText, maxCharsPerLine);

  const tspans = textLines
    .map(
      (line, idx) =>
        `<tspan x="${boxPos.x + BOX_PADDING}" dy="${idx === 0 ? 0 : BOX_FONT_SIZE + 4}">${line}</tspan>`,
    )
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `  <line x1="${boxCenterX}" y1="${boxCenterY}" x2="${targetCenterX}" y2="${targetCenterY}" ` +
      `stroke="${LINE_COLOR}" stroke-width="${LINE_WIDTH}" stroke-dasharray="6,4"/>`,
    `  <rect x="${boxPos.x}" y="${boxPos.y}" width="${boxWidth}" height="${boxHeight}" ` +
      `fill="${bgColor}" rx="${BOX_BORDER_RADIUS}" opacity="0.9"/>`,
    `  <text x="${boxPos.x + BOX_PADDING}" ` +
      `y="${boxPos.y + BOX_PADDING + BOX_FONT_SIZE}" ` +
      `fill="${textColor}" font-family="sans-serif" font-size="${BOX_FONT_SIZE}">${tspans}</text>`,
    `</svg>`,
  ].join("\n");
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
