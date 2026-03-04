/** Video assembler — assembles scene frames into video, HTML player, or subtitle output. */

import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { DemoScript, Scene } from "@webreel/director";
import type { NarrationTimeline } from "@webreel/narrator";
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
  timelineToSubtitles,
  mergeSubtitleSegments,
  generateSRT,
  generateVTT,
  type SubtitleSegment,
} from "./subtitle-generator.js";
import { extractChapters, generateFfmpegChapterMetadata } from "./chapter-generator.js";
import { generateInteractiveHTML } from "./html-generator.js";
import { mixSceneAudio, createSilence, concatenateAudioTracks } from "./audio-mixer.js";

/** Scene result data for the assembler. */
export interface AssemblerSceneResult {
  readonly sceneName: string;
  readonly actName: string;
  readonly frames: readonly Buffer[];
  readonly durationMs: number;
  readonly scene: Scene;
  /** Narration timeline with WAV audio segments (if TTS was available). */
  readonly narrationTimeline?: NarrationTimeline;
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

/** Assemble rendered scene results into a final video or HTML player. */
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

  if (format === "html") {
    return assembleHtmlOutput(results, script, options, config, ffmpegPath, outputPath);
  }

  const sceneTransitions = results.map((r) => r.scene.transitions);
  const transitions = resolveTransitions(sceneTransitions);
  const useTransitions = results.length > 1 && hasNonCutTransitions(transitions);
  const chaptersRequested = options.chapters !== false && format === "mp4";
  const tempDir = await mkdtemp(join(tmpdir(), "webreel-assemble-"));

  try {
    let metadataPath: string | undefined;
    if (chaptersRequested) {
      metadataPath = await writeChapterMetadata(results, script, config.fps, tempDir);
    }

    // Build composite audio from narration timelines (if any scene has narration)
    const audioPath = await buildCompositeAudio(results, config.fps, format, tempDir);

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
        audioPath,
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
        audioPath,
      );
    }
    if (options.subtitles) {
      await writeSubtitleFiles(results, config.fps, outputPath);
    }

    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Build a composite audio WAV from all scenes' narration timelines.
 *
 * Each scene with a narration timeline gets its audio mixed into a WAV.
 * Scenes without narration produce silence of the correct duration.
 * All per-scene WAVs are concatenated into a single composite file.
 *
 * Returns undefined if no scene has narration, or if the format doesn't
 * support audio (gif).
 */
async function buildCompositeAudio(
  results: readonly AssemblerSceneResult[],
  fps: number,
  format: string,
  tempDir: string,
): Promise<string | undefined> {
  if (format === "gif") return undefined;
  const hasNarration = results.some((r) => r.narrationTimeline);
  if (!hasNarration) return undefined;

  const sceneWavs: Buffer[] = [];
  for (const result of results) {
    const sceneDurationMs = (result.frames.length / fps) * 1000;
    if (result.narrationTimeline) {
      sceneWavs.push(mixSceneAudio(result.narrationTimeline, sceneDurationMs));
    } else {
      sceneWavs.push(createSilence(sceneDurationMs));
    }
  }

  const compositeWav = concatenateAudioTracks(sceneWavs);
  const audioFilePath = join(tempDir, "narration.wav");
  await writeFile(audioFilePath, compositeWav);
  return audioFilePath;
}

/** Write chapter metadata to a temp file, return the path. */
async function writeChapterMetadata(
  results: readonly AssemblerSceneResult[],
  script: DemoScript,
  fps: number,
  tempDir: string,
): Promise<string> {
  const durations = new Map<string, number>();
  for (const r of results) durations.set(r.sceneName, (r.frames.length / fps) * 1000);
  const chapters = extractChapters(script, durations);
  const totalMs = Array.from(durations.values()).reduce((a, b) => a + b, 0);
  const path = join(tempDir, "ffmetadata.txt");
  await writeFile(path, generateFfmpegChapterMetadata(chapters, totalMs), "utf-8");
  return path;
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
  audioPath?: string,
): Promise<void> {
  let idx = 0;
  for (const result of results) {
    for (const frame of result.frames) {
      await writeFile(join(tempDir, `frame_${String(idx).padStart(6, "0")}.png`), frame);
      idx++;
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
    audioPath,
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
  audioPath?: string,
): Promise<void> {
  const segments: SceneSegmentInfo[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    let frameIdx = 0;
    for (const frame of result.frames) {
      await writeFile(
        join(tempDir, `s${i}_f${String(frameIdx).padStart(6, "0")}.png`),
        frame,
      );
      frameIdx++;
    }
    const segPath = join(tempDir, `scene_${i}.mp4`);
    await runFfmpeg(
      ffmpegPath,
      buildFfmpegArgs(
        join(tempDir, `s${i}_f%06d.png`),
        segPath,
        config.fps,
        "mp4",
        config.crf,
        config.preset,
      ),
      verbose,
    );
    segments.push({ path: segPath, durationSec: result.frames.length / config.fps });
  }
  const filterComplex = buildTransitionFilterComplex(segments, transitions);
  if (filterComplex === null) {
    await assembleDirectFrames(
      results,
      tempDir,
      outputPath,
      config,
      format,
      ffmpegPath,
      verbose,
      metadataPath,
      audioPath,
    );
    return;
  }
  await runFfmpeg(
    ffmpegPath,
    buildTransitionFfmpegArgs(
      segments.map((s) => s.path),
      filterComplex,
      outputPath,
      format,
      config.crf,
      config.preset,
      metadataPath,
      audioPath,
    ),
    verbose,
  );
}

/** Encode frames to temp MP4, then wrap in a self-contained HTML player. */
async function assembleHtmlOutput(
  results: readonly AssemblerSceneResult[],
  script: DemoScript,
  options: AssemblyOptions,
  config: AssemblyConfig,
  ffmpegPath: string,
  outputPath: string,
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "webreel-html-"));
  try {
    const tempMp4 = join(tempDir, "video.mp4");
    await assembleDirectFrames(
      results,
      tempDir,
      tempMp4,
      config,
      "mp4",
      ffmpegPath,
      options.verbose ?? false,
    );
    const sceneDurations = new Map<string, number>();
    for (const r of results)
      sceneDurations.set(r.sceneName, (r.frames.length / config.fps) * 1000);
    const html = await generateInteractiveHTML({
      videoPath: tempMp4,
      script,
      sceneDurations,
      subtitleSegments: buildSubtitleSegments(results, config.fps),
    });
    await writeFile(outputPath, html, "utf-8");
    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Build subtitle segments from scene narration with timing offsets.
 *
 * Uses real TTS timeline data (timelineToSubtitles) when a narration
 * timeline is available for accurate subtitle timing. Falls back to
 * naive equal division when TTS was unavailable.
 */
function buildSubtitleSegments(
  results: readonly AssemblerSceneResult[],
  fps: number,
): readonly SubtitleSegment[] {
  const allSubs: SubtitleSegment[][] = [];
  let offsetMs = 0;
  for (const result of results) {
    const sceneDurationMs = (result.frames.length / fps) * 1000;

    if (result.narrationTimeline) {
      // Use real timeline from TTS — accurate per-segment timing
      allSubs.push([...timelineToSubtitles(result.narrationTimeline, offsetMs)]);
    } else if (result.scene.narration.length > 0) {
      // Fallback: naive equal division (no TTS available)
      const narration = result.scene.narration;
      const segDur = sceneDurationMs / narration.length;
      allSubs.push(
        narration.map((block, idx) => ({
          index: idx + 1,
          startMs: offsetMs + idx * segDur,
          endMs: offsetMs + (idx + 1) * segDur,
          text: block.text,
        })),
      );
    }

    offsetMs += sceneDurationMs;
  }
  return mergeSubtitleSegments(allSubs);
}

/** Generate SRT and VTT subtitle files alongside the video output. */
async function writeSubtitleFiles(
  results: readonly AssemblerSceneResult[],
  fps: number,
  outputPath: string,
): Promise<void> {
  const merged = buildSubtitleSegments(results, fps);
  const base = basename(outputPath).replace(/\.[^.]+$/, "");
  const dir = dirname(outputPath);
  await writeFile(join(dir, `${base}.srt`), generateSRT(merged), "utf-8");
  await writeFile(join(dir, `${base}.vtt`), generateVTT(merged), "utf-8");
}
