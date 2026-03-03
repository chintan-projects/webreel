/**
 * Transition engine — builds ffmpeg filter_complex strings for xfade
 * transitions between scene segments.
 *
 * Maps webreel transition types to ffmpeg xfade filter transition names
 * and generates the full filter chain for multi-segment assembly.
 */

import type { TransitionConfig } from "@webreel/director";

/** Transition types supported by the engine. */
export type TransitionType =
  | "cut"
  | "crossfade"
  | "fade-to-black"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "wipe";

/** Specification for a transition between two scene segments. */
export interface TransitionSpec {
  readonly type: TransitionType;
  readonly durationMs: number;
}

/** Info about a single scene segment for transition assembly. */
export interface SceneSegmentInfo {
  readonly path: string;
  readonly durationSec: number;
}

const DEFAULT_TRANSITION_DURATION_MS = 500;

/**
 * Map a webreel transition type to the corresponding ffmpeg xfade
 * transition name. Returns `null` for "cut" which uses concat instead.
 */
function toFfmpegTransition(type: TransitionType): string | null {
  switch (type) {
    case "cut":
      return null;
    case "crossfade":
      return "fade";
    case "fade-to-black":
      return "fadeblack";
    case "slide-left":
      return "slideleft";
    case "slide-right":
      return "slideright";
    case "slide-up":
      return "slideup";
    case "wipe":
      return "wipeleft";
  }
}

/**
 * Determine whether any transitions in the list require xfade processing.
 * If all transitions are "cut", we can use simple concatenation instead.
 */
export function hasNonCutTransitions(transitions: readonly TransitionSpec[]): boolean {
  return transitions.some((t) => t.type !== "cut");
}

/**
 * Build an ffmpeg filter_complex string for xfade transitions between
 * scene segments.
 *
 * For N inputs, there are N-1 transitions. Each xfade filter takes
 * two inputs and produces one output, chaining through the sequence:
 *
 *   [0:v][1:v] xfade=transition=fade:duration=0.5:offset=4.5 [v01];
 *   [v01][2:v] xfade=transition=fadeblack:duration=0.3:offset=8.2 [v012];
 *   ...
 *
 * For "cut" transitions between two segments, no xfade is applied;
 * the segments are concatenated directly.
 *
 * @param segments - Ordered scene segment info (path + duration).
 * @param transitions - Transitions between segments (length = segments.length - 1).
 * @returns The filter_complex string, or `null` if simple concat suffices.
 */
export function buildTransitionFilterComplex(
  segments: readonly SceneSegmentInfo[],
  transitions: readonly TransitionSpec[],
): string | null {
  if (segments.length < 2) return null;
  if (!hasNonCutTransitions(transitions)) return null;

  const filters: string[] = [];
  let cumulativeOffset = 0;
  let prevLabel = "[0:v]";

  for (let i = 0; i < transitions.length; i++) {
    const transition = transitions[i]!;
    const segDuration = segments[i]!.durationSec;
    const nextInput = `[${i + 1}:v]`;
    const ffmpegName = toFfmpegTransition(transition.type);

    // The xfade offset is the point in the output timeline where
    // the transition starts — the end of the current segment minus
    // the transition duration.
    const transitionDurSec = transition.type === "cut" ? 0 : transition.durationMs / 1000;
    const offset = cumulativeOffset + segDuration - transitionDurSec;

    // Output label for chained filters
    const isLast = i === transitions.length - 1;
    const outLabel = isLast ? "[vout]" : `[v${i}]`;

    if (ffmpegName === null) {
      // Cut transition: concat the two segments without xfade.
      // Use a simple concat filter for this pair.
      filters.push(`${prevLabel}${nextInput}concat=n=2:v=1:a=0${outLabel}`);
    } else {
      const offsetFixed = Math.max(0, offset).toFixed(3);
      const durFixed = transitionDurSec.toFixed(3);
      filters.push(
        `${prevLabel}${nextInput}xfade=transition=${ffmpegName}:duration=${durFixed}:offset=${offsetFixed}${outLabel}`,
      );
    }

    // Update cumulative offset: segment duration minus overlap from transition
    cumulativeOffset += segDuration - transitionDurSec;
    prevLabel = outLabel;
  }

  return filters.join(";");
}

/**
 * Build ffmpeg arguments for concatenating segments without transitions.
 * Uses the concat demuxer approach with a file list.
 */
export function buildConcatFileList(segments: readonly SceneSegmentInfo[]): string {
  return segments.map((s) => `file '${s.path}'`).join("\n");
}

/**
 * Convert a TransitionConfig (from the parsed IR) to a TransitionSpec.
 * Fills in default duration when not specified.
 */
export function toTransitionSpec(config: TransitionConfig): TransitionSpec {
  return {
    type: config.type as TransitionType,
    durationMs: config.durationMs ?? DEFAULT_TRANSITION_DURATION_MS,
  };
}

/**
 * Resolve the transitions between an ordered list of scenes.
 *
 * For each pair of adjacent scenes (i, i+1), the transition is:
 *   scene[i].transitions.out ?? scene[i+1].transitions.in ?? { type: "cut" }
 *
 * @param sceneTransitions - Array of per-scene transition configs.
 * @returns Array of TransitionSpec (length = sceneTransitions.length - 1).
 */
export function resolveTransitions(
  sceneTransitions: readonly {
    readonly in?: TransitionConfig;
    readonly out?: TransitionConfig;
  }[],
): readonly TransitionSpec[] {
  const result: TransitionSpec[] = [];

  for (let i = 0; i < sceneTransitions.length - 1; i++) {
    const outConfig = sceneTransitions[i]?.out;
    const inConfig = sceneTransitions[i + 1]?.in;
    const config = outConfig ?? inConfig;

    if (config) {
      result.push(toTransitionSpec(config));
    } else {
      result.push({ type: "cut", durationMs: 0 });
    }
  }

  return result;
}
