import sharp from "sharp";

import type {
  Surface,
  SurfaceType,
  SurfaceConfig,
  SurfaceAction,
  ActionResult,
  ExecutionContext,
} from "./types.js";
import { SurfaceError, SurfaceSetupError } from "./errors.js";

const DEFAULT_BACKGROUND = "#1a1a2e";
const DEFAULT_TEXT_COLOR = "#ffffff";
const DEFAULT_TITLE_FONT_SIZE = 48;
const DEFAULT_SUBTITLE_FONT_SIZE = 24;
const DEFAULT_ALIGN = "center";
const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;

/** Options parsed from SurfaceConfig.options for the title card surface. */
interface TitleCardOptions {
  readonly background: string;
  readonly color: string;
  readonly title: string;
  readonly subtitle: string;
  readonly fontSize: number;
  readonly subtitleSize: number;
  readonly align: string;
}

/**
 * Title card surface: renders a static title/subtitle frame using SVG + sharp.
 *
 * Config options (from blockquote front matter):
 *   surface: title
 *   background: #1a1a2e (solid color)
 *   color: #ffffff (text color)
 *   subtitle: "Optional subtitle text"
 *   font_size: 48
 *   subtitle_size: 24
 *   align: center
 *
 * The title text comes from config.options.title or falls back to the
 * scene name passed via ExecutionContext during execute().
 */
export class TitleCardSurface implements Surface {
  readonly type: SurfaceType = "title";

  private options: TitleCardOptions | null = null;
  private viewportWidth = DEFAULT_VIEWPORT_WIDTH;
  private viewportHeight = DEFAULT_VIEWPORT_HEIGHT;
  private cachedFrame: Buffer | null = null;
  private tornDown = false;

  async setup(config: SurfaceConfig): Promise<void> {
    try {
      this.options = this.parseOptions(config);
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SurfaceSetupError(
        "title",
        `Failed to parse title card options: ${cause.message}`,
        cause,
      );
    }

    if (config.viewport) {
      this.viewportWidth = config.viewport.width;
      this.viewportHeight = config.viewport.height;
    }

    // Pre-render the frame since title cards are static
    this.cachedFrame = await this.renderFrame();
  }

  async execute(
    action: SurfaceAction,
    _context: ExecutionContext,
  ): Promise<ActionResult> {
    this.ensureReady(action.type);
    const start = Date.now();

    switch (action.type) {
      case "wait":
      case "pause": {
        const duration = (action.params["duration"] as number | undefined) ?? 1;
        await delay(duration * 1000);
        break;
      }
      default:
        // Title cards are static display surfaces. Non-wait actions
        // are no-ops -- the card is shown while narration plays.
        break;
    }

    return { durationMs: Date.now() - start };
  }

  async captureFrame(): Promise<Buffer> {
    this.ensureReady("captureFrame");

    if (this.cachedFrame) {
      return this.cachedFrame;
    }

    // Fallback: re-render if cache was cleared (should not happen in practice)
    const frame = await this.renderFrame();
    this.cachedFrame = frame;
    return frame;
  }

  async teardown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;
    this.cachedFrame = null;
    this.options = null;
  }

  private parseOptions(config: SurfaceConfig): TitleCardOptions {
    const raw = (config.options ?? {}) as Record<string, unknown>;
    return {
      background: (raw["background"] as string | undefined) ?? DEFAULT_BACKGROUND,
      color: (raw["color"] as string | undefined) ?? DEFAULT_TEXT_COLOR,
      title: (raw["title"] as string | undefined) ?? "",
      subtitle: (raw["subtitle"] as string | undefined) ?? "",
      fontSize: (raw["font_size"] as number | undefined) ?? DEFAULT_TITLE_FONT_SIZE,
      subtitleSize:
        (raw["subtitle_size"] as number | undefined) ?? DEFAULT_SUBTITLE_FONT_SIZE,
      align: (raw["align"] as string | undefined) ?? DEFAULT_ALIGN,
    };
  }

  private ensureReady(action: string): void {
    if (!this.options) {
      throw new SurfaceError(
        `Title card surface not initialized. Call setup() before ${action}.`,
        { surfaceType: "title", action },
      );
    }
  }

  /**
   * Render the title card as a PNG buffer.
   * Creates an SVG with background, title, and optional subtitle,
   * then converts to PNG at viewport dimensions via sharp.
   */
  private async renderFrame(): Promise<Buffer> {
    const opts = this.options!;
    const w = this.viewportWidth;
    const h = this.viewportHeight;

    const titleEscaped = escapeXml(opts.title);
    const subtitleEscaped = escapeXml(opts.subtitle);

    // Compute vertical positions based on whether subtitle exists
    const titleY = opts.subtitle ? "45%" : "50%";
    const textAnchor = anchorFromAlign(opts.align);

    // Compute horizontal position based on alignment
    const textX = xFromAlign(opts.align);

    let subtitleElement = "";
    if (opts.subtitle) {
      subtitleElement = `<text x="${textX}" y="58%" text-anchor="${textAnchor}" dominant-baseline="middle" font-family="sans-serif" font-size="${opts.subtitleSize}" fill="${opts.color}" opacity="0.7">${subtitleEscaped}</text>`;
    }

    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${opts.background}"/>
  <text x="${textX}" y="${titleY}" text-anchor="${textAnchor}" dominant-baseline="middle" font-family="sans-serif" font-size="${opts.fontSize}" fill="${opts.color}" font-weight="bold">${titleEscaped}</text>
  ${subtitleElement}
</svg>`;

    return sharp(Buffer.from(svg)).resize(w, h).png().toBuffer();
  }
}

/** Map align option to SVG text-anchor value. */
function anchorFromAlign(align: string): string {
  switch (align) {
    case "left":
      return "start";
    case "right":
      return "end";
    default:
      return "middle";
  }
}

/** Map align option to SVG x position. */
function xFromAlign(align: string): string {
  switch (align) {
    case "left":
      return "5%";
    case "right":
      return "95%";
    default:
      return "50%";
  }
}

/** Escape special XML characters in text content. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
