/**
 * FFmpeg runner — builds arguments and spawns ffmpeg for video encoding.
 *
 * Extracted from scene-orchestrator to keep the orchestrator under 300 lines
 * and provide a focused module for the encoding pipeline.
 */

import { spawn } from "node:child_process";
import { WebReelError } from "@webreel/core";

/** Build ffmpeg arguments for the given output format. */
export function buildFfmpegArgs(
  inputPattern: string,
  outputPath: string,
  fps: number,
  format: string,
  crf: number,
  preset: string,
  metadataPath?: string,
  audioPath?: string,
): readonly string[] {
  const baseArgs = ["-y", "-framerate", String(fps), "-i", inputPattern];

  // Add audio input if provided (must come before metadata for correct stream indexing)
  const hasAudio = audioPath !== undefined && format !== "gif";
  if (hasAudio) {
    baseArgs.push("-i", audioPath);
  }

  // Add chapter metadata input if provided
  if (metadataPath) {
    const metadataStreamIdx = hasAudio ? 2 : 1;
    baseArgs.push("-i", metadataPath, "-map_metadata", String(metadataStreamIdx));
  }

  switch (format) {
    case "gif":
      return [
        ...baseArgs,
        "-vf",
        `fps=${fps},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        outputPath,
      ];
    case "webm":
      return [
        ...baseArgs,
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        "yuva420p",
        "-crf",
        String(crf),
        "-b:v",
        "0",
        ...(hasAudio ? ["-c:a", "libopus", "-shortest"] : []),
        outputPath,
      ];
    default:
      // mp4
      return [
        ...baseArgs,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        preset,
        "-crf",
        String(crf),
        ...(hasAudio ? ["-c:a", "aac", "-shortest"] : []),
        outputPath,
      ];
  }
}

/**
 * Build ffmpeg arguments for assembling scene segments with xfade transitions.
 * Each segment is an input file. The filter_complex applies xfade between them.
 */
export function buildTransitionFfmpegArgs(
  segmentPaths: readonly string[],
  filterComplex: string,
  outputPath: string,
  format: string,
  crf: number,
  preset: string,
  metadataPath?: string,
  audioPath?: string,
): readonly string[] {
  const args: string[] = ["-y"];

  for (const path of segmentPaths) {
    args.push("-i", path);
  }

  // Add audio input after video segments
  const hasAudio = audioPath !== undefined;
  if (hasAudio) {
    args.push("-i", audioPath);
  }

  if (metadataPath) {
    const metadataIdx = segmentPaths.length + (hasAudio ? 1 : 0);
    args.push("-i", metadataPath, "-map_metadata", String(metadataIdx));
  }

  args.push("-filter_complex", filterComplex, "-map", "[vout]");

  // Map audio stream if present
  if (hasAudio) {
    args.push("-map", `${segmentPaths.length}:a`);
  }

  switch (format) {
    case "webm":
      args.push("-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p");
      args.push("-crf", String(crf), "-b:v", "0");
      if (hasAudio) args.push("-c:a", "libopus", "-shortest");
      break;
    default:
      args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
      args.push("-preset", preset, "-crf", String(crf));
      if (hasAudio) args.push("-c:a", "aac", "-shortest");
      break;
  }

  args.push(outputPath);
  return args;
}

/** Spawn ffmpeg and wait for it to complete. */
export function runFfmpeg(
  ffmpegPath: string,
  args: readonly string[],
  verbose: boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, args as string[], {
      stdio: verbose ? "inherit" : "pipe",
    });

    let stderr = "";
    if (!verbose && proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

    proc.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        const detail = stderr ? `\n${stderr.slice(-500)}` : "";
        reject(
          new WebReelError(`ffmpeg exited with code ${code ?? "null"}${detail}`, {
            code: "FFMPEG_FAILED",
          }),
        );
      }
    });

    proc.on("error", (err: Error) => {
      reject(
        new WebReelError(`Failed to spawn ffmpeg: ${err.message}`, {
          code: "FFMPEG_SPAWN_FAILED",
          cause: err,
        }),
      );
    });
  });
}
