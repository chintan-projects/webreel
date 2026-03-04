/**
 * Shared utilities for annotation renderers.
 *
 * Provides target clamping, frame validation, and easing functions
 * used across all renderer implementations.
 */

import sharp from "sharp";
import type { AnnotationTarget } from "../types.js";
import { AnnotationRenderError } from "../errors.js";

/**
 * Clamp a target region to fit within frame bounds.
 * Returns a new target with coordinates and dimensions
 * adjusted so nothing extends outside the frame.
 */
export function clampTarget(
  target: AnnotationTarget,
  frameWidth: number,
  frameHeight: number,
): AnnotationTarget {
  const x = Math.max(0, Math.min(target.x, frameWidth));
  const y = Math.max(0, Math.min(target.y, frameHeight));
  const maxW = frameWidth - x;
  const maxH = frameHeight - y;
  const width = Math.max(0, Math.min(target.width, maxW));
  const height = Math.max(0, Math.min(target.height, maxH));
  return { x, y, width, height };
}

/**
 * Validate that a buffer is a decodable image and return its metadata.
 * @throws {AnnotationRenderError} if the buffer is empty or unreadable.
 */
export async function validateFrameBuffer(
  frame: Buffer,
  rendererType: string,
): Promise<sharp.Metadata> {
  if (!frame || frame.length === 0) {
    throw new AnnotationRenderError(rendererType, "Frame buffer is empty.");
  }

  try {
    const metadata = await sharp(frame).metadata();
    if (!metadata.width || !metadata.height) {
      throw new AnnotationRenderError(
        rendererType,
        "Frame buffer has no width/height metadata.",
      );
    }
    return metadata;
  } catch (e) {
    if (e instanceof AnnotationRenderError) throw e;
    throw new AnnotationRenderError(
      rendererType,
      `Failed to read frame metadata: ${(e as Error).message}`,
      e instanceof Error ? e : undefined,
    );
  }
}

/**
 * Ease-in-out cubic interpolation for smooth zoom/animation.
 * Maps t in [0, 1] to a smoothed output in [0, 1].
 */
export function easeInOut(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * Linear interpolation between two values.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Compute the progress (0-1) of an annotation at a given timestamp.
 * Returns 0 if before start, 1 if after end, fractional in between.
 */
export function computeProgress(
  timestampMs: number,
  startMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0) return 1;
  const elapsed = timestampMs - startMs;
  return Math.max(0, Math.min(1, elapsed / durationMs));
}

/**
 * Determine the best edge to originate an arrow from,
 * based on available space around the target.
 */
export function autoSelectEdge(
  target: AnnotationTarget,
  frameWidth: number,
  frameHeight: number,
): "left" | "right" | "top" | "bottom" {
  const spaceLeft = target.x;
  const spaceRight = frameWidth - (target.x + target.width);
  const spaceTop = target.y;
  const spaceBottom = frameHeight - (target.y + target.height);

  const max = Math.max(spaceLeft, spaceRight, spaceTop, spaceBottom);

  if (max === spaceLeft) return "left";
  if (max === spaceRight) return "right";
  if (max === spaceTop) return "top";
  return "bottom";
}

/**
 * Determine the best position for a callout box
 * based on available space around the target.
 */
export function autoSelectPosition(
  target: AnnotationTarget,
  frameWidth: number,
  frameHeight: number,
): "top-left" | "top-right" | "bottom-left" | "bottom-right" {
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;

  const isRightHalf = centerX > frameWidth / 2;
  const isBottomHalf = centerY > frameHeight / 2;

  if (isBottomHalf) {
    return isRightHalf ? "top-left" : "top-right";
  }
  return isRightHalf ? "bottom-left" : "bottom-right";
}
