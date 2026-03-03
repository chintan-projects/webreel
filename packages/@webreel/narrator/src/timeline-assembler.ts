/**
 * Timeline assembly for narration segments.
 *
 * Takes generated TTS segments (with audio buffers and measured durations)
 * and calculates sequential timing offsets with configurable inter-segment
 * gaps to produce a complete NarrationTimeline.
 */

import type { NarrationSegment, NarrationTimeline, NarratorConfig } from "./types.js";

/**
 * A TTS-generated segment with audio data and timing metadata.
 * Produced by the narration engine after TTS generation or cache lookup.
 */
export interface GeneratedSegment {
  /** Raw audio data (WAV format). Empty buffer for pause segments. */
  readonly audioBuffer: Buffer;
  /** Measured or estimated audio duration in milliseconds. */
  readonly durationMs: number;
  /** Original narration text (empty for pause segments). */
  readonly text: string;
  /** Whether this segment was generated from a deferred dynamic reference. */
  readonly isDeferred: boolean;
  /** Whether the next action should wait for this segment to finish. */
  readonly waitForNarration: boolean;
}

/**
 * Assemble a narration timeline from generated segments.
 *
 * Lays out segments sequentially with `interSegmentGapMs` gaps between
 * non-pause segments. Pause segments contribute their duration but no
 * additional inter-segment gap.
 *
 * @param segments - Generated TTS segments in playback order.
 * @param config - Narrator configuration (provides interSegmentGapMs).
 * @returns Complete narration timeline with absolute timing offsets.
 */
export function assembleTimeline(
  segments: readonly GeneratedSegment[],
  config: NarratorConfig,
): NarrationTimeline {
  const { interSegmentGapMs } = config;
  const timelineSegments: NarrationSegment[] = [];
  let currentOffsetMs = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;

    const narrationSegment: NarrationSegment = {
      audioBuffer: segment.audioBuffer,
      durationMs: segment.durationMs,
      text: segment.text,
      startOffsetMs: currentOffsetMs,
      waitForNarration: segment.waitForNarration,
      isDeferred: segment.isDeferred,
    };

    timelineSegments.push(narrationSegment);

    // Advance the offset by the segment duration
    currentOffsetMs += segment.durationMs;

    // Add inter-segment gap after non-pause segments (except the last one)
    const isPause = segment.text.length === 0 && segment.durationMs > 0;
    if (!isPause && i < segments.length - 1) {
      currentOffsetMs += interSegmentGapMs;
    }
  }

  return {
    segments: timelineSegments,
    totalDurationMs: currentOffsetMs,
  };
}
