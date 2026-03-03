/**
 * Chapter marker generator — extracts chapter markers from DemoScript
 * acts and generates ffmpeg metadata for embedding in MP4 files.
 *
 * Chapter markers allow video players to show a chapter navigation
 * timeline, making longer demo videos easier to navigate.
 */

import type { DemoScript } from "@webreel/director";

/** A chapter marker with title and start time in the video. */
export interface ChapterMarker {
  readonly title: string;
  readonly startMs: number;
}

/**
 * Extract chapter markers from DemoScript acts.
 *
 * Each act becomes a chapter. The start time is computed by summing
 * the durations of all scenes in preceding acts.
 *
 * @param script - Parsed DemoScript IR.
 * @param sceneDurations - Map of scene name to duration in milliseconds.
 * @returns Ordered array of chapter markers.
 */
export function extractChapters(
  script: DemoScript,
  sceneDurations: Map<string, number>,
): readonly ChapterMarker[] {
  const chapters: ChapterMarker[] = [];
  let currentOffsetMs = 0;

  for (const act of script.acts) {
    chapters.push({
      title: act.name,
      startMs: currentOffsetMs,
    });

    // Sum durations of all scenes in this act
    for (const scene of act.scenes) {
      const duration = sceneDurations.get(scene.name) ?? 0;
      currentOffsetMs += duration;
    }
  }

  return chapters;
}

/**
 * Generate ffmpeg metadata file content for chapter markers.
 *
 * The metadata file follows the ffmpeg metadata format:
 * ```
 * ;FFMETADATA1
 *
 * [CHAPTER]
 * TIMEBASE=1/1000
 * START=0
 * END=30000
 * title=Introduction
 * ```
 *
 * @param chapters - Ordered chapter markers.
 * @param totalDurationMs - Total video duration in milliseconds (for the last chapter's end time).
 * @returns ffmpeg metadata file content string.
 */
export function generateFfmpegChapterMetadata(
  chapters: readonly ChapterMarker[],
  totalDurationMs: number,
): string {
  if (chapters.length === 0) return ";FFMETADATA1\n";

  const lines: string[] = [";FFMETADATA1"];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]!;
    // End time is the start of the next chapter, or the total duration for the last
    const endMs = i < chapters.length - 1 ? chapters[i + 1]!.startMs : totalDurationMs;

    lines.push("");
    lines.push("[CHAPTER]");
    lines.push("TIMEBASE=1/1000");
    lines.push(`START=${chapter.startMs}`);
    lines.push(`END=${endMs}`);
    lines.push(`title=${escapeMetadataValue(chapter.title)}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Escape special characters in ffmpeg metadata values.
 *
 * ffmpeg metadata format requires escaping of `=`, `;`, `#`, `\`, and newlines.
 */
function escapeMetadataValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/;/g, "\\;")
    .replace(/#/g, "\\#")
    .replace(/\n/g, "\\\n");
}
