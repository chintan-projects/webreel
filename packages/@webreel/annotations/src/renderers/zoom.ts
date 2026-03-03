/**
 * Zoom annotation renderer (Ken Burns effect).
 *
 * Smoothly crops into the target region over the annotation duration.
 * Uses progress (0-1) to interpolate between full-frame and zoomed view.
 * At progress=0 the full frame is shown; at progress=1 the target region
 * fills the output at maxScale.
 */

import sharp from "sharp";
import type { AnnotationConfig, AnnotationRenderer, AnnotationTarget } from "../types.js";
import type { ZoomConfig } from "../types.js";
import { AnnotationRenderError } from "../errors.js";
import { clampTarget, validateFrameBuffer, computeProgress, easeInOut } from "./utils.js";

const DEFAULT_MAX_SCALE = 2.0;
const DEFAULT_EASING = "ease-in-out";

export class ZoomRenderer implements AnnotationRenderer {
  readonly type = "zoom" as const;

  async render(
    frame: Buffer,
    config: AnnotationConfig,
    timestampMs: number,
  ): Promise<Buffer> {
    const metadata = await validateFrameBuffer(frame, this.type);
    const frameWidth = metadata.width!;
    const frameHeight = metadata.height!;
    const zc = config as ZoomConfig;

    if (!config.target) {
      return frame;
    }

    const target = clampTarget(config.target, frameWidth, frameHeight);
    if (target.width <= 0 || target.height <= 0) {
      return frame;
    }

    const rawProgress = computeProgress(timestampMs, config.startMs, config.durationMs);

    // At progress 0, return the original frame (no zoom)
    if (rawProgress <= 0) {
      return frame;
    }

    try {
      return await this.compositeZoom(
        frame,
        frameWidth,
        frameHeight,
        target,
        rawProgress,
        zc,
      );
    } catch (e) {
      throw new AnnotationRenderError(
        this.type,
        `Failed to composite zoom effect: ${(e as Error).message}`,
        e instanceof Error ? e : undefined,
      );
    }
  }

  private async compositeZoom(
    frame: Buffer,
    frameWidth: number,
    frameHeight: number,
    target: AnnotationTarget,
    rawProgress: number,
    config: ZoomConfig,
  ): Promise<Buffer> {
    const maxScale = config.maxScale ?? DEFAULT_MAX_SCALE;
    const easing = config.easing ?? DEFAULT_EASING;

    // Apply easing to raw progress
    const progress = easing === "ease-in-out" ? easeInOut(rawProgress) : rawProgress;

    // Compute the visible region at current progress.
    // At progress=0: full frame. At progress=1: zoomed to target.
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;

    // The zoomed view width/height (what portion of the original frame is visible)
    const zoomedWidth = frameWidth / maxScale;
    const zoomedHeight = frameHeight / maxScale;

    // Interpolate the extract region from full-frame to zoomed
    const extractWidth = Math.round(frameWidth + (zoomedWidth - frameWidth) * progress);
    const extractHeight = Math.round(
      frameHeight + (zoomedHeight - frameHeight) * progress,
    );

    // Center the extract on the target, clamped to frame bounds
    const extractX = Math.round(
      clampValue(
        targetCenterX * progress - (extractWidth / 2) * progress,
        0,
        frameWidth - extractWidth,
      ),
    );
    const extractY = Math.round(
      clampValue(
        targetCenterY * progress - (extractHeight / 2) * progress,
        0,
        frameHeight - extractHeight,
      ),
    );

    // Ensure minimum extract size of 1
    const safeWidth = Math.max(1, Math.min(extractWidth, frameWidth - extractX));
    const safeHeight = Math.max(1, Math.min(extractHeight, frameHeight - extractY));

    return sharp(frame)
      .extract({
        left: extractX,
        top: extractY,
        width: safeWidth,
        height: safeHeight,
      })
      .resize(frameWidth, frameHeight, { fit: "fill" })
      .png()
      .toBuffer();
  }
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
