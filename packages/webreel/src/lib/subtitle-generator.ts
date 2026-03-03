/**
 * Subtitle generator — converts narration timelines into SRT and WebVTT
 * subtitle formats for accessibility and offline viewing.
 *
 * SRT uses comma-separated milliseconds (00:00:01,000).
 * WebVTT uses period-separated milliseconds (00:00:01.000).
 */

import type { NarrationTimeline, NarrationSegment } from "@webreel/narrator";

/** A single subtitle entry with timing and text. */
export interface SubtitleSegment {
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

/**
 * Format milliseconds to SRT timestamp: HH:MM:SS,mmm
 *
 * SRT format uses comma as the decimal separator per specification.
 */
function formatSRTTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "," +
    String(millis).padStart(3, "0")
  );
}

/**
 * Format milliseconds to VTT timestamp: HH:MM:SS.mmm
 *
 * WebVTT format uses period as the decimal separator per specification.
 */
function formatVTTTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "." +
    String(millis).padStart(3, "0")
  );
}

/**
 * Convert a NarrationTimeline to an array of SubtitleSegments.
 *
 * Each narration segment with non-empty text becomes a subtitle entry.
 * The absolute offset within the scene is used for timing.
 *
 * @param timeline - Narration timeline from the narration engine.
 * @param sceneOffsetMs - Absolute offset of this scene in the full video (default 0).
 * @returns Ordered array of subtitle segments.
 */
export function timelineToSubtitles(
  timeline: NarrationTimeline,
  sceneOffsetMs: number = 0,
): readonly SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  let index = 1;

  for (const segment of timeline.segments) {
    const text = segment.text.trim();
    if (text === "") continue;

    segments.push({
      index,
      startMs: sceneOffsetMs + segment.startOffsetMs,
      endMs: sceneOffsetMs + segment.startOffsetMs + segment.durationMs,
      text,
    });
    index++;
  }

  return segments;
}

/**
 * Generate SRT format subtitles from subtitle segments.
 *
 * SRT format:
 * ```
 * 1
 * 00:00:01,000 --> 00:00:04,500
 * First narration segment text
 *
 * 2
 * 00:00:05,200 --> 00:00:08,800
 * Second narration segment text
 * ```
 *
 * @param segments - Ordered subtitle segments.
 * @returns SRT formatted string.
 */
export function generateSRT(segments: readonly SubtitleSegment[]): string {
  if (segments.length === 0) return "";

  const entries: string[] = [];

  for (const segment of segments) {
    const start = formatSRTTimestamp(segment.startMs);
    const end = formatSRTTimestamp(segment.endMs);
    entries.push(`${segment.index}\n${start} --> ${end}\n${segment.text}`);
  }

  return entries.join("\n\n") + "\n";
}

/**
 * Generate WebVTT format subtitles from subtitle segments.
 *
 * VTT format:
 * ```
 * WEBVTT
 *
 * 1
 * 00:00:01.000 --> 00:00:04.500
 * First narration segment text
 *
 * 2
 * 00:00:05.200 --> 00:00:08.800
 * Second narration segment text
 * ```
 *
 * @param segments - Ordered subtitle segments.
 * @returns WebVTT formatted string.
 */
export function generateVTT(segments: readonly SubtitleSegment[]): string {
  const entries: string[] = ["WEBVTT"];

  for (const segment of segments) {
    const start = formatVTTTimestamp(segment.startMs);
    const end = formatVTTTimestamp(segment.endMs);
    entries.push(`\n${segment.index}\n${start} --> ${end}\n${segment.text}`);
  }

  return entries.join("") + "\n";
}

/**
 * Merge multiple scenes' subtitle segments into a single ordered list.
 * Re-indexes all segments sequentially starting from 1.
 *
 * @param sceneSubs - Per-scene subtitle segment arrays (already offset-adjusted).
 * @returns Merged and re-indexed subtitle segments.
 */
export function mergeSubtitleSegments(
  sceneSubs: readonly (readonly SubtitleSegment[])[],
): readonly SubtitleSegment[] {
  const all: SubtitleSegment[] = [];

  for (const subs of sceneSubs) {
    all.push(...subs);
  }

  // Sort by start time, then re-index
  all.sort((a, b) => a.startMs - b.startMs);

  return all.map((seg, i) => ({
    ...seg,
    index: i + 1,
  }));
}
