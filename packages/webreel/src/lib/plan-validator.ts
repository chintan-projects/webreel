/**
 * Plan Validator — runs pre-flight checks before rendering.
 *
 * Verifies that all prerequisites (binaries, URLs, env vars) are available
 * before committing to a potentially long render. Each check is timed
 * for observability.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionPlan, Prerequisite } from "./plan-generator.js";

const execAsync = promisify(exec);

/** Result of running all pre-flight checks. */
export interface ValidationResult {
  readonly passed: boolean;
  readonly checks: readonly PreflightCheck[];
}

/** A single pre-flight check result. */
export interface PreflightCheck {
  readonly name: string;
  readonly status: "pass" | "fail" | "warn" | "skip";
  readonly message: string;
  readonly durationMs: number;
}

/** Timeout for URL reachability checks in milliseconds. */
const URL_CHECK_TIMEOUT_MS = 5000;

/**
 * Run pre-flight validation checks for all prerequisites in an execution plan.
 *
 * Checks include: binary availability (which), URL reachability (HEAD request),
 * and environment variable presence.
 *
 * @param plan - The execution plan to validate.
 * @returns Validation result with per-check status and timing.
 */
export async function validatePrerequisites(
  plan: ExecutionPlan,
): Promise<ValidationResult> {
  const checks: PreflightCheck[] = [];

  const checkPromises = plan.prerequisites.map(async (prereq) => {
    const check = await runPrerequisiteCheck(prereq);
    return check;
  });

  const results = await Promise.all(checkPromises);
  checks.push(...results);

  const passed = checks.every(
    (c) => c.status === "pass" || c.status === "skip" || c.status === "warn",
  );

  return { passed, checks };
}

/** Run a single prerequisite check based on its type. */
async function runPrerequisiteCheck(prereq: Prerequisite): Promise<PreflightCheck> {
  const startMs = Date.now();

  switch (prereq.type) {
    case "binary":
      return checkBinary(prereq, startMs);
    case "url":
      return checkUrl(prereq, startMs);
    case "env":
      return checkEnvVar(prereq, startMs);
    case "app":
      return checkApp(prereq, startMs);
    default:
      return {
        name: prereq.name,
        status: "skip",
        message: `Unknown prerequisite type: ${prereq.type}`,
        durationMs: Date.now() - startMs,
      };
  }
}

/** Check if a binary is available on the system PATH. */
async function checkBinary(
  prereq: Prerequisite,
  startMs: number,
): Promise<PreflightCheck> {
  // node-pty is a Node.js package, not a system binary
  if (prereq.value === "node-pty") {
    try {
      // Check if the package can be resolved
      await execAsync("node -e \"require.resolve('node-pty')\"");
      return {
        name: prereq.name,
        status: "pass",
        message: `Node module "${prereq.value}" is available`,
        durationMs: Date.now() - startMs,
      };
    } catch {
      const status = prereq.required ? "fail" : "warn";
      return {
        name: prereq.name,
        status,
        message: `Node module "${prereq.value}" not found (npm install node-pty)`,
        durationMs: Date.now() - startMs,
      };
    }
  }

  // Check for env var override (e.g., FFMPEG_PATH, CHROME_PATH)
  const envKey = binaryEnvKey(prereq.value);
  const envPath = envKey ? process.env[envKey] : undefined;
  if (envPath) {
    return {
      name: prereq.name,
      status: "pass",
      message: `Found via ${envKey}=${envPath}`,
      durationMs: Date.now() - startMs,
    };
  }

  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execAsync(`${whichCmd} ${prereq.value}`);
    return {
      name: prereq.name,
      status: "pass",
      message: `Found at ${stdout.trim()}`,
      durationMs: Date.now() - startMs,
    };
  } catch {
    // Try platform-specific alternatives for Chrome
    if (prereq.value === "google-chrome") {
      const chromePath = await findChromeBinary();
      if (chromePath) {
        return {
          name: prereq.name,
          status: "pass",
          message: `Found at ${chromePath}`,
          durationMs: Date.now() - startMs,
        };
      }
    }

    const status = prereq.required ? "fail" : "warn";
    return {
      name: prereq.name,
      status,
      message: `Binary "${prereq.value}" not found on PATH`,
      durationMs: Date.now() - startMs,
    };
  }
}

/** Check if a URL is reachable with a HEAD request. */
async function checkUrl(prereq: Prerequisite, startMs: number): Promise<PreflightCheck> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);

    try {
      const response = await fetch(prereq.value, {
        method: "HEAD",
        signal: controller.signal,
      });

      return {
        name: prereq.name,
        status: response.ok ? "pass" : "warn",
        message: response.ok
          ? `Reachable (HTTP ${response.status})`
          : `Returned HTTP ${response.status}`,
        durationMs: Date.now() - startMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Timeout after ${URL_CHECK_TIMEOUT_MS}ms`
        : `Unreachable: ${err instanceof Error ? err.message : String(err)}`;

    return {
      name: prereq.name,
      status: prereq.required ? "fail" : "warn",
      message,
      durationMs: Date.now() - startMs,
    };
  }
}

/** Check if an environment variable is set. */
function checkEnvVar(prereq: Prerequisite, startMs: number): PreflightCheck {
  const value = process.env[prereq.value];
  if (value !== undefined && value !== "") {
    return {
      name: prereq.name,
      status: "pass",
      message: `Environment variable ${prereq.value} is set`,
      durationMs: Date.now() - startMs,
    };
  }

  return {
    name: prereq.name,
    status: prereq.required ? "fail" : "warn",
    message: `Environment variable ${prereq.value} is not set`,
    durationMs: Date.now() - startMs,
  };
}

/** Check if an application is available (best-effort). */
async function checkApp(prereq: Prerequisite, startMs: number): Promise<PreflightCheck> {
  // Application checks are platform-specific and best-effort
  if (process.platform === "darwin") {
    try {
      await execAsync(
        `mdfind "kMDItemKind == 'Application'" | grep -i "${prereq.value}"`,
      );
      return {
        name: prereq.name,
        status: "pass",
        message: `Application "${prereq.value}" found`,
        durationMs: Date.now() - startMs,
      };
    } catch {
      return {
        name: prereq.name,
        status: prereq.required ? "fail" : "warn",
        message: `Application "${prereq.value}" not found`,
        durationMs: Date.now() - startMs,
      };
    }
  }

  return {
    name: prereq.name,
    status: "skip",
    message: `Application check not supported on ${process.platform}`,
    durationMs: Date.now() - startMs,
  };
}

/** Map binary names to environment variable overrides. */
function binaryEnvKey(binaryName: string): string | undefined {
  const mapping: Record<string, string> = {
    ffmpeg: "FFMPEG_PATH",
    "google-chrome": "CHROME_PATH",
  };
  return mapping[binaryName];
}

/** Try to find Chrome on common platform-specific paths. */
async function findChromeBinary(): Promise<string | undefined> {
  const candidates: string[] = [];

  if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else if (process.platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    );
  }

  for (const candidate of candidates) {
    try {
      await execAsync(`test -f "${candidate}"`);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}
