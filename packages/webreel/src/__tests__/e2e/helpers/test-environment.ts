/**
 * E2E test environment — binary detection, temp dir lifecycle, and skip guards.
 *
 * Provides helpers to ensure Chrome and ffmpeg are available before running
 * heavyweight integration tests, and manages isolated temp directories
 * that are automatically cleaned up.
 */

import { mkdtemp, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Default timeout for e2e tests (60 seconds). */
export const E2E_TIMEOUT = 60_000;

/** Extended timeout for browser e2e tests (2 minutes). */
export const BROWSER_E2E_TIMEOUT = 120_000;

/** Whether browser e2e tests should run (requires E2E_BROWSER=1). */
export const BROWSER_E2E_ENABLED = process.env["E2E_BROWSER"] === "1";

/** Whether e2e tests should run in CI (requires E2E=1). */
export const E2E_ENABLED_IN_CI = !process.env["CI"] || process.env["E2E"] === "1";

interface BinaryDetectionResult {
  readonly chrome: boolean;
  readonly ffmpeg: boolean;
  readonly chromePath?: string;
  readonly ffmpegPath?: string;
}

/**
 * Detect whether Chrome and ffmpeg binaries are available on the system.
 * Returns paths when found, undefined when not.
 */
export async function detectBinaries(): Promise<BinaryDetectionResult> {
  const chromePath = await findChrome();
  const ffmpegPath = await findFfmpeg();

  return {
    chrome: chromePath !== undefined,
    ffmpeg: ffmpegPath !== undefined,
    chromePath,
    ffmpegPath,
  };
}

/**
 * Create an isolated temporary directory for test output.
 * Returns an object with the path and a cleanup function.
 */
export async function createTempDir(
  prefix = "webreel-e2e-",
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}

/**
 * Wrap an async test body with a configurable timeout.
 * Throws if the function takes longer than `ms` milliseconds.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number = E2E_TIMEOUT,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Test timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Check whether the current environment is CI without E2E=1.
 * Use to conditionally skip heavyweight tests.
 */
export function shouldSkipInCI(): boolean {
  return process.env["CI"] === "true" && process.env["E2E"] !== "1";
}

// ---------------------------------------------------------------------------
// Binary detection helpers
// ---------------------------------------------------------------------------

async function findChrome(): Promise<string | undefined> {
  // Check CHROME_PATH env var first
  const envPath = process.env["CHROME_PATH"];
  if (envPath) {
    if (await fileExists(envPath)) return envPath;
  }

  // Common Chrome paths by platform
  const candidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : process.platform === "linux"
        ? [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
          ]
        : ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  // Try which/where
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(cmd, ["google-chrome"]);
    const path = stdout.trim();
    if (path) return path;
  } catch {
    // Not found via which
  }

  return undefined;
}

async function findFfmpeg(): Promise<string | undefined> {
  const envPath = process.env["FFMPEG_PATH"];
  if (envPath) {
    if (await fileExists(envPath)) return envPath;
  }

  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(cmd, ["ffmpeg"]);
    const path = stdout.trim();
    if (path) return path;
  } catch {
    // Not found
  }

  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
