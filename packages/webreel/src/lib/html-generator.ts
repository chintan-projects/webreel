/**
 * HTML output generator — wraps a rendered video in an interactive HTML player.
 *
 * Reads a rendered MP4 file, encodes it as a base64 data URI, extracts
 * chapter markers and subtitle segments from the script metadata, and
 * produces a self-contained HTML page via the html-player-template.
 */

import { readFile } from "node:fs/promises";

import type { DemoScript } from "@webreel/director";

import { extractChapters } from "./chapter-generator.js";
import {
  generateHtmlPlayer,
  type HtmlChapter,
  type HtmlSubtitle,
} from "./html-player-template.js";
import type { SubtitleSegment } from "./subtitle-generator.js";

/** Input required to generate an interactive HTML output file. */
export interface HtmlGeneratorInput {
  /** Path to the rendered MP4 video file (intermediate). */
  readonly videoPath: string;
  /** Parsed demo script for metadata and chapter extraction. */
  readonly script: DemoScript;
  /** Scene durations for chapter timing (sceneName -> durationMs). */
  readonly sceneDurations: ReadonlyMap<string, number>;
  /** Subtitle segments (optional — from narration). */
  readonly subtitleSegments?: readonly SubtitleSegment[];
}

/**
 * Generate a self-contained interactive HTML file from a rendered video.
 *
 * The video is base64-encoded and embedded as a data URI so the HTML file
 * has zero external dependencies. Chapter markers are derived from script
 * acts; subtitle segments are mapped from narration timelines.
 *
 * @param input - Video path, script metadata, scene durations, and subtitles.
 * @returns Complete HTML document string ready to write to disk.
 */
export async function generateInteractiveHTML(
  input: HtmlGeneratorInput,
): Promise<string> {
  const videoBuffer = await readFile(input.videoPath);
  const videoBase64 = videoBuffer.toString("base64");

  // Build a mutable Map for extractChapters (which expects Map, not ReadonlyMap)
  const durationsMap = new Map<string, number>(input.sceneDurations);
  const rawChapters = extractChapters(input.script, durationsMap);

  const chapters: HtmlChapter[] = rawChapters.map((ch) => ({
    title: ch.title,
    startMs: ch.startMs,
  }));

  const subtitles: HtmlSubtitle[] = (input.subtitleSegments ?? []).map((s) => ({
    startMs: s.startMs,
    endMs: s.endMs,
    text: s.text,
  }));

  return generateHtmlPlayer({
    videoBase64,
    mimeType: "video/mp4",
    title: input.script.meta.title,
    chapters,
    subtitles,
  });
}
