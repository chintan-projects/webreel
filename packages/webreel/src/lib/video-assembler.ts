/**
 * Video assembler — handles the final assembly of rendered scene frames
 * into a complete video with transitions, chapters, and subtitles.
 *
 * Extracted from scene-orchestrator to keep each module under 300 lines
 * and provide a focused module for the post-render assembly pipeline.
 */

import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";

import type { DemoScript, Scene } from "@webreel/director";

import {
  buildFfmpegArgs,
  buildTransitionFfmpegArgs,
  runFfmpeg,
} from "./ffmpeg-runner.js";
import {
  resolveTransitions,
  buildTransitionFilterComplex,
  hasNonCutTransitions,
  type SceneSegmentInfo,
  type TransitionSpec,
} from "./transitions.js";
import {
  mergeSubtitleSegments,
  generateSRT,
  generateVTT,
  type SubtitleSegment,
} from "./subtitle-generator.js";
import { extractChapters, generateFfmpegChapterMetadata } from "./chapter-generator.js";

/** Scene result data needed by the assembler. */
export interface AssemblerSceneResult {
  readonly sceneName: string;
  readonly actName: string;
  readonly frames: readonly Buffer[];
  readonly durationMs: number;
  readonly scene: Scene;
}

/** Options for the assembly step. */
export interface AssemblyOptions {
  readonly scriptPath: string;
  readonly outputPath: string;
  readonly format?: string;
  readonly verbose?: boolean;
  readonly subtitles?: boolean;
  readonly chapters?: boolean;
}

/** Render pipeline configuration for assembly. */
export interface AssemblyConfig {
  readonly fps: number;
  readonly crf: number;
  readonly preset: string;
}

/**
 * Assemble rendered scene results into a final video.
 *
 * Handles transitions (xfade), chapter markers, and subtitle generation.
 * Falls back to direct frame concatenation when no transitions are needed.
 */
export async function assembleVideo(
  results: readonly AssemblerSceneResult[],
  script: DemoScript,
  options: AssemblyOptions,
  config: AssemblyConfig,
  ffmpegPath: string,
): Promise<string> {
  const format = options.format ?? script.meta.output?.format ?? "mp4";
  const defaultName = `${basename(options.scriptPath, ".md")}.${format}`;
  const outputPath = options.outputPath || defaultName;

  // Resolve transitions between scenes
  const sceneTransitions = results.map((r) => r.scene.transitions);
  const transitions = resolveTransitions(sceneTransitions);
  const useTransitions = results.length > 1 && hasNonCutTransitions(transitions);

  // Chapter metadata (MP4 only, enabled by default)
  const chaptersRequested = options.chapters !== false && format === "mp4";
  const tempDir = await mkdtemp(join(tmpdir(), "webreel-assemble-"));

  try {
    let metadataPath: string | undefined;

    if (chaptersRequested) {
      metadataPath = await writeChapterMetadata(results, script, config.fps, tempDir);
    }

    if (useTransitions) {
      await assembleWithTransitions(
        results,
        transitions,
        tempDir,
        outputPath,
        config,
        format,
        ffmpegPath,
        options.verbose ?? false,
        metadataPath,
      );
    } else {
      await assembleDirectFrames(
        results,
        tempDir,
        outputPath,
        config,
        format,
        ffmpegPath,
        options.verbose ?? false,
        metadataPath,
      );
    }

    // Generate subtitle files alongside the video
    if (options.subtitles) {
      await writeSubtitleFiles(results, config.fps, outputPath);
    }

    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/** Write chapter metadata to a temp file, return the path. */
async function writeChapterMetadata(
  results: readonly AssemblerSceneResult[],
  script: DemoScript,
  fps: number,
  tempDir: string,
): Promise<string> {
  const sceneDurations = new Map<string, number>();
  for (const r of results) {
    sceneDurations.set(r.sceneName, (r.frames.length / fps) * 1000);
  }
  const chapters = extractChapters(script, sceneDurations);
  const totalMs = Array.from(sceneDurations.values()).reduce((a, b) => a + b, 0);
  const metadata = generateFfmpegChapterMetadata(chapters, totalMs);
  const metadataPath = join(tempDir, "ffmetadata.txt");
  await writeFile(metadataPath, metadata, "utf-8");
  return metadataPath;
}

/** Assemble using direct frame concatenation (no xfade). */
async function assembleDirectFrames(
  results: readonly AssemblerSceneResult[],
  tempDir: string,
  outputPath: string,
  config: AssemblyConfig,
  format: string,
  ffmpegPath: string,
  verbose: boolean,
  metadataPath?: string,
): Promise<void> {
  let frameIndex = 0;
  for (const result of results) {
    for (const frame of result.frames) {
      const framePath = join(tempDir, `frame_${String(frameIndex).padStart(6, "0")}.png`);
      await writeFile(framePath, frame);
      frameIndex++;
    }
  }
  const args = buildFfmpegArgs(
    join(tempDir, "frame_%06d.png"),
    outputPath,
    config.fps,
    format,
    config.crf,
    config.preset,
    metadataPath,
  );
  await runFfmpeg(ffmpegPath, args, verbose);
}

/** Assemble using per-scene intermediate mp4s with xfade transitions. */
async function assembleWithTransitions(
  results: readonly AssemblerSceneResult[],
  transitions: readonly TransitionSpec[],
  tempDir: string,
  outputPath: string,
  config: AssemblyConfig,
  format: string,
  ffmpegPath: string,
  verbose: boolean,
  metadataPath?: string,
): Promise<void> {
  const segments: SceneSegmentInfo[] = [];

  // Render each scene to an intermediate mp4
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    let frameIdx = 0;
    for (const frame of result.frames) {
      const p = join(tempDir, `s${i}_f${String(frameIdx).padStart(6, "0")}.png`);
      await writeFile(p, frame);
      frameIdx++;
    }

    const segPath = join(tempDir, `scene_${i}.mp4`);
    const sceneArgs = buildFfmpegArgs(
      join(tempDir, `s${i}_f%06d.png`),
      segPath,
      config.fps,
      "mp4",
      config.crf,
      config.preset,
    );
    await runFfmpeg(ffmpegPath, sceneArgs, verbose);
    segments.push({ path: segPath, durationSec: result.frames.length / config.fps });
  }

  const filterComplex = buildTransitionFilterComplex(segments, transitions);
  if (filterComplex === null) {
    // No effective transitions after resolution — fall back to direct frames
    await assembleDirectFrames(
      results,
      tempDir,
      outputPath,
      config,
      format,
      ffmpegPath,
      verbose,
      metadataPath,
    );
    return;
  }

  const args = buildTransitionFfmpegArgs(
    segments.map((s) => s.path),
    filterComplex,
    outputPath,
    format,
    config.crf,
    config.preset,
    metadataPath,
  );
  await runFfmpeg(ffmpegPath, args, verbose);
}

/** Generate SRT and VTT subtitle files alongside the video output. */
async function writeSubtitleFiles(
  results: readonly AssemblerSceneResult[],
  fps: number,
  outputPath: string,
): Promise<void> {
  // Build subtitle segments from scene narration blocks with timing offsets.
  // Full narration timeline integration is planned for WS-2.4;
  // for now, derive basic subtitles from scene narration text and frame counts.
  const allSubs: SubtitleSegment[][] = [];
  let offsetMs = 0;

  for (const result of results) {
    const sceneDurationMs = (result.frames.length / fps) * 1000;
    const sceneNarration = result.scene.narration;
    if (sceneNarration.length > 0) {
      const segDuration = sceneDurationMs / sceneNarration.length;
      const subs: SubtitleSegment[] = sceneNarration.map((block, idx) => ({
        index: idx + 1,
        startMs: offsetMs + idx * segDuration,
        endMs: offsetMs + (idx + 1) * segDuration,
        text: block.text,
      }));
      allSubs.push(subs);
    }
    offsetMs += sceneDurationMs;
  }

  const merged = mergeSubtitleSegments(allSubs);
  const dir = dirname(outputPath);
  const base = basename(outputPath).replace(/\.[^.]+$/, "");

  await writeFile(join(dir, `${base}.srt`), generateSRT(merged), "utf-8");
  await writeFile(join(dir, `${base}.vtt`), generateVTT(merged), "utf-8");
}
