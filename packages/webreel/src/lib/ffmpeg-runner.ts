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
): readonly string[] {
  const baseArgs = ["-y", "-framerate", String(fps), "-i", inputPattern];

  // Add chapter metadata input if provided
  if (metadataPath) {
    baseArgs.push("-i", metadataPath, "-map_metadata", "1");
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
): readonly string[] {
  const args: string[] = ["-y"];

  for (const path of segmentPaths) {
    args.push("-i", path);
  }

  if (metadataPath) {
    args.push("-i", metadataPath, "-map_metadata", String(segmentPaths.length));
  }

  args.push("-filter_complex", filterComplex, "-map", "[vout]");

  switch (format) {
    case "webm":
      args.push("-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p");
      args.push("-crf", String(crf), "-b:v", "0");
      break;
    default:
      args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
      args.push("-preset", preset, "-crf", String(crf));
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
