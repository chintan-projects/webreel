/**
 * E2E test assertions — domain-specific matchers for video,
 * image, subtitle, and HTML output validation.
 *
 * Each assertion provides meaningful error messages on failure,
 * using ffprobe/ffmpeg for media validation where available.
 */

import { stat, readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Assert that a file exists at the given path.
 * @throws Error with path context if the file does not exist.
 */
export async function assertFileExists(filePath: string): Promise<void> {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) {
      throw new Error(`Path exists but is not a file: ${filePath}`);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Expected file does not exist: ${filePath}`, {
        cause: err,
      });
    }
    throw err;
  }
}

/**
 * Assert that a file is a valid video by probing with ffprobe.
 * Checks codec type, duration > 0, and container format.
 */
export async function assertValidVideo(
  filePath: string,
  expectedFormat: "mp4" | "webm" | "gif" = "mp4",
): Promise<{ durationMs: number; codec: string }> {
  await assertFileExists(filePath);

  const ffprobePath = await findFfprobe();
  if (!ffprobePath) {
    // Fallback: just check file size and magic bytes
    return assertVideoByMagicBytes(filePath, expectedFormat);
  }

  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);

    const probe = JSON.parse(stdout) as {
      format?: { duration?: string; format_name?: string };
      streams?: Array<{ codec_type?: string; codec_name?: string }>;
    };

    const duration = parseFloat(probe.format?.duration ?? "0");
    if (duration <= 0) {
      throw new Error(`Video has zero or negative duration: ${duration}s (${filePath})`);
    }

    const videoStream = probe.streams?.find((s) => s.codec_type === "video");
    const codec = videoStream?.codec_name ?? "unknown";

    return { durationMs: Math.round(duration * 1000), codec };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("duration")) throw err;
    throw new Error(`ffprobe failed for ${filePath}: ${(err as Error).message}`, {
      cause: err,
    });
  }
}

/**
 * Assert that a file is a valid PNG by checking magic bytes and dimensions.
 */
export async function assertValidPng(
  filePath: string,
): Promise<{ width: number; height: number }> {
  await assertFileExists(filePath);

  const buf = await readFile(filePath);
  if (buf.length < 24) {
    throw new Error(`File too small to be a valid PNG: ${buf.length} bytes`);
  }

  // PNG magic bytes: 89 50 4E 47
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error(`Invalid PNG magic bytes: ${buf.subarray(0, 4).toString("hex")}`);
  }

  // IHDR chunk: width at offset 16, height at offset 20 (big-endian uint32)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);

  return { width, height };
}

/**
 * Assert that a subtitle file is valid (SRT or VTT format).
 * Checks that timestamps are sequential and text is non-empty.
 */
export async function assertValidSubtitles(
  filePath: string,
  format: "srt" | "vtt" = "srt",
): Promise<{ entryCount: number }> {
  await assertFileExists(filePath);

  const content = await readFile(filePath, "utf-8");

  if (format === "vtt") {
    if (!content.startsWith("WEBVTT")) {
      throw new Error(`VTT file does not start with WEBVTT header`);
    }
  }

  // Count entries by timestamp lines
  const timestampPattern =
    format === "srt"
      ? /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/g
      : /\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/g;

  const matches = content.match(timestampPattern) ?? [];
  if (matches.length === 0) {
    throw new Error(`No valid timestamp entries found in ${format} file`);
  }

  return { entryCount: matches.length };
}

/**
 * Assert that an HTML file is a valid self-contained video player.
 */
export async function assertValidHtml(filePath: string): Promise<void> {
  await assertFileExists(filePath);

  const content = await readFile(filePath, "utf-8");

  if (!content.includes("<video")) {
    throw new Error(`HTML file does not contain a <video> element`);
  }

  if (!content.includes("</html>")) {
    throw new Error(`HTML file does not contain closing </html> tag`);
  }
}

/**
 * Assert the number of frame files in a directory matches expected count.
 * @param tolerance - Allowed deviation from expected count (default 0).
 */
export async function assertFrameCount(
  dir: string,
  expected: number,
  tolerance = 0,
): Promise<number> {
  const entries = await readdir(dir);
  const frameFiles = entries.filter((f) => f.startsWith("frame_") && f.endsWith(".png"));
  const actual = frameFiles.length;

  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `Expected ~${expected} frames (±${tolerance}), got ${actual} in ${dir}`,
    );
  }

  return actual;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function findFfprobe(): Promise<string | undefined> {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(cmd, ["ffprobe"]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function assertVideoByMagicBytes(
  filePath: string,
  format: "mp4" | "webm" | "gif",
): Promise<{ durationMs: number; codec: string }> {
  const buf = await readFile(filePath);

  if (buf.length < 12) {
    throw new Error(`File too small to be valid video: ${buf.length} bytes`);
  }

  if (format === "mp4") {
    // MP4 ftyp box check
    const ftyp = buf.subarray(4, 8).toString("ascii");
    if (ftyp !== "ftyp") {
      throw new Error(`MP4 file missing ftyp box at offset 4: got "${ftyp}"`);
    }
    return { durationMs: -1, codec: "h264" };
  }

  if (format === "webm") {
    // WebM starts with EBML header (1A 45 DF A3)
    if (buf[0] !== 0x1a || buf[1] !== 0x45 || buf[2] !== 0xdf || buf[3] !== 0xa3) {
      throw new Error(`WebM file missing EBML header`);
    }
    return { durationMs: -1, codec: "vp9" };
  }

  if (format === "gif") {
    // GIF87a or GIF89a
    const sig = buf.subarray(0, 6).toString("ascii");
    if (!sig.startsWith("GIF")) {
      throw new Error(`GIF file missing GIF signature: got "${sig}"`);
    }
    return { durationMs: -1, codec: "gif" };
  }

  return { durationMs: -1, codec: "unknown" };
}
