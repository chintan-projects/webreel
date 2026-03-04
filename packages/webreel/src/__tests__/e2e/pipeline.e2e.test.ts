/**
 * Pipeline integration e2e test — video assembly with synthetic frames.
 *
 * Generates PNG frames programmatically (no external image library needed),
 * then runs the real ffmpeg encoding pipeline to produce MP4, WebM, and GIF
 * output. No browser or Chrome instance is required.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import type { SubtitleSegment } from "../../lib/subtitle-generator.js";
import { generateSRT, generateVTT } from "../../lib/subtitle-generator.js";
import { buildFfmpegArgs, runFfmpeg } from "../../lib/ffmpeg-runner.js";
import {
  createTempDir,
  detectBinaries,
  E2E_TIMEOUT,
  createIndexedFrame,
  assertFileExists,
  assertValidVideo,
  assertValidSubtitles,
} from "./helpers/index.js";

// ---------------------------------------------------------------------------
// Binary detection at module level so describe.skipIf evaluates correctly
// ---------------------------------------------------------------------------

const binaries = await detectBinaries();
const ffmpegAvailable = binaries.ffmpeg;
const ffmpegPath = binaries.ffmpegPath ?? "";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of synthetic frames to generate per test. */
const FRAME_COUNT = 30;

/** Frame dimensions. */
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;

/** FPS for encoding. */
const FPS = 30;

// ---------------------------------------------------------------------------
// Frame helpers
// ---------------------------------------------------------------------------

/**
 * Write numbered frame files to a directory.
 * Files are named frame_000000.png through frame_NNNNNN.png.
 */
async function writeFramesToDir(dir: string, frames: readonly Buffer[]): Promise<void> {
  for (let i = 0; i < frames.length; i++) {
    const filename = `frame_${String(i).padStart(6, "0")}.png`;
    await writeFile(join(dir, filename), frames[i]!);
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("pipeline integration (synthetic frames)", () => {
  let frames: Buffer[] = [];

  beforeAll(async () => {
    if (ffmpegAvailable) {
      frames = [];
      for (let i = 0; i < FRAME_COUNT; i++) {
        frames.push(await createIndexedFrame(i, FRAME_WIDTH, FRAME_HEIGHT));
      }
    }
  }, E2E_TIMEOUT);

  describe.skipIf(!ffmpegAvailable)("video encoding", () => {
    it(
      "assembles synthetic frames into valid MP4",
      async () => {
        const outputDir = await createTempDir("webreel-mp4-e2e-");
        try {
          await writeFramesToDir(outputDir.path, frames);

          const outputPath = join(outputDir.path, "output.mp4");
          const args = buildFfmpegArgs(
            join(outputDir.path, "frame_%06d.png"),
            outputPath,
            FPS,
            "mp4",
            23,
            "ultrafast",
          );

          await runFfmpeg(ffmpegPath, args, false);

          await assertFileExists(outputPath);
          const info = await assertValidVideo(outputPath, "mp4");
          expect(info.codec).toBeDefined();
        } finally {
          await outputDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );

    it(
      "assembles synthetic frames into valid WebM",
      async () => {
        const outputDir = await createTempDir("webreel-webm-e2e-");
        try {
          await writeFramesToDir(outputDir.path, frames);

          const outputPath = join(outputDir.path, "output.webm");
          const args = buildFfmpegArgs(
            join(outputDir.path, "frame_%06d.png"),
            outputPath,
            FPS,
            "webm",
            23,
            "ultrafast",
          );

          await runFfmpeg(ffmpegPath, args, false);

          await assertFileExists(outputPath);
          const info = await assertValidVideo(outputPath, "webm");
          expect(info.codec).toBeDefined();
        } finally {
          await outputDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );

    it(
      "assembles synthetic frames into valid GIF",
      async () => {
        const outputDir = await createTempDir("webreel-gif-e2e-");
        try {
          await writeFramesToDir(outputDir.path, frames);

          const outputPath = join(outputDir.path, "output.gif");
          const args = buildFfmpegArgs(
            join(outputDir.path, "frame_%06d.png"),
            outputPath,
            FPS,
            "gif",
            23,
            "ultrafast",
          );

          await runFfmpeg(ffmpegPath, args, false);

          await assertFileExists(outputPath);
          const info = await assertValidVideo(outputPath, "gif");
          expect(info.codec).toBeDefined();
        } finally {
          await outputDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );
  });

  describe("subtitle generation", () => {
    it(
      "subtitle generation produces valid SRT and VTT",
      async () => {
        const subDir = await createTempDir("webreel-subs-e2e-");
        try {
          const segments: readonly SubtitleSegment[] = [
            { index: 1, startMs: 0, endMs: 2000, text: "Welcome to the demo" },
            { index: 2, startMs: 2000, endMs: 4500, text: "This is the second segment" },
            { index: 3, startMs: 5000, endMs: 8000, text: "Final narration block" },
          ];

          const srtContent = generateSRT(segments);
          const vttContent = generateVTT(segments);

          const srtPath = join(subDir.path, "test.srt");
          const vttPath = join(subDir.path, "test.vtt");

          await writeFile(srtPath, srtContent, "utf-8");
          await writeFile(vttPath, vttContent, "utf-8");

          // Validate SRT
          const srtResult = await assertValidSubtitles(srtPath, "srt");
          expect(srtResult.entryCount).toBe(3);

          // Validate VTT
          const vttResult = await assertValidSubtitles(vttPath, "vtt");
          expect(vttResult.entryCount).toBe(3);

          // Verify SRT format details
          expect(srtContent).toContain("00:00:00,000 --> 00:00:02,000");
          expect(srtContent).toContain("Welcome to the demo");

          // Verify VTT format details
          expect(vttContent).toMatch(/^WEBVTT/);
          expect(vttContent).toContain("00:00:00.000 --> 00:00:02.000");
          expect(vttContent).toContain("Welcome to the demo");
        } finally {
          await subDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );
  });

  describe.skipIf(!ffmpegAvailable)("edge cases", () => {
    it(
      "empty frame array produces no output",
      async () => {
        const emptyDir = await createTempDir("webreel-empty-e2e-");
        try {
          const outputPath = join(emptyDir.path, "empty.mp4");
          const args = buildFfmpegArgs(
            join(emptyDir.path, "frame_%06d.png"),
            outputPath,
            FPS,
            "mp4",
            23,
            "ultrafast",
          );

          // ffmpeg should fail when no input frames match the pattern
          await expect(runFfmpeg(ffmpegPath, args, false)).rejects.toThrow();
        } finally {
          await emptyDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );
  });
});
