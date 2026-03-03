/**
 * Annotation compositor — applies active annotation layers to a frame.
 *
 * Called by the scene orchestrator AFTER surface frame capture and
 * BEFORE video encoding. Layers are applied in declaration order,
 * each receiving the output of the previous layer.
 *
 * Only annotations whose timing window includes the current timestamp
 * are applied (startMs <= timestampMs < startMs + durationMs).
 */

import type { AnnotationLayer } from "./types.js";
import { AnnotationRenderError } from "./errors.js";

/**
 * Check whether an annotation layer is active at the given timestamp.
 *
 * An annotation is active when:
 *   startMs <= timestampMs < startMs + durationMs
 *
 * If durationMs is 0 or negative, the annotation is treated as
 * instantaneous and is active only at its exact startMs.
 */
export function isAnnotationActive(layer: AnnotationLayer, timestampMs: number): boolean {
  const { startMs, durationMs } = layer.config;

  if (durationMs <= 0) {
    return timestampMs === startMs;
  }

  return timestampMs >= startMs && timestampMs < startMs + durationMs;
}

/**
 * Compose all active annotation layers onto a frame buffer.
 *
 * Layers are applied sequentially in declaration order.
 * Each renderer receives the output of the previous renderer,
 * allowing annotations to stack (e.g., highlight + arrow).
 *
 * @param frame - Input PNG buffer from the surface.
 * @param layers - Ordered list of annotation layers.
 * @param timestampMs - Current playback timestamp in milliseconds.
 * @returns PNG buffer with all active annotations composited.
 */
export async function composeAnnotations(
  frame: Buffer,
  layers: readonly AnnotationLayer[],
  timestampMs: number,
): Promise<Buffer> {
  if (layers.length === 0) {
    return frame;
  }

  let currentFrame = frame;

  for (const layer of layers) {
    if (!isAnnotationActive(layer, timestampMs)) {
      continue;
    }

    try {
      currentFrame = await layer.renderer.render(currentFrame, layer.config, timestampMs);
    } catch (e) {
      if (e instanceof AnnotationRenderError) {
        throw e;
      }
      throw new AnnotationRenderError(
        layer.config.type,
        `Unexpected error during annotation compositing: ${(e as Error).message}`,
        e instanceof Error ? e : undefined,
      );
    }
  }

  return currentFrame;
}
