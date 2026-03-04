/**
 * CI environment detection and configuration.
 * Provides CI-safe defaults for Chrome flags, viewport, timeouts,
 * and cache paths when running in CI environments.
 */

/** Detected CI environment info. */
export interface CIEnvironment {
  /** Whether running in a CI environment. */
  readonly isCI: boolean;
  /** Name of the CI provider (e.g., "github-actions", "gitlab-ci", "generic"). */
  readonly provider: string;
}

/** CI-safe configuration overrides. */
export interface CIConfig {
  /** Additional Chrome launch flags for headless CI environments. */
  readonly chromeFlags: readonly string[];
  /** Default viewport for CI rendering. */
  readonly viewport: { readonly width: number; readonly height: number };
  /** Extended timeout multiplier for slower CI machines. */
  readonly timeoutMultiplier: number;
  /** Whether to suppress progress output (quiet mode). */
  readonly silent: boolean;
  /** Cache directory path suitable for CI (uses workspace-relative path). */
  readonly cacheDir: string;
}

/**
 * Detect if running in a CI environment.
 * Checks common CI environment variables in priority order,
 * returning the most specific provider match.
 */
export function detectCI(): CIEnvironment {
  if (process.env.GITHUB_ACTIONS === "true") {
    return { isCI: true, provider: "github-actions" };
  }
  if (process.env.GITLAB_CI === "true") {
    return { isCI: true, provider: "gitlab-ci" };
  }
  if (process.env.CIRCLECI === "true") {
    return { isCI: true, provider: "circleci" };
  }
  if (process.env.JENKINS_URL) {
    return { isCI: true, provider: "jenkins" };
  }
  if (process.env.TRAVIS === "true") {
    return { isCI: true, provider: "travis" };
  }
  if (process.env.BUILDKITE === "true") {
    return { isCI: true, provider: "buildkite" };
  }
  // Generic CI detection (many CI systems set CI=true or CI=1)
  if (process.env.CI === "true" || process.env.CI === "1") {
    return { isCI: true, provider: "generic" };
  }
  return { isCI: false, provider: "local" };
}

/**
 * Get CI-safe configuration defaults.
 * These settings work reliably in containerized CI environments
 * where there may be no display, limited memory, or security restrictions.
 */
export function getCIConfig(): CIConfig {
  return {
    chromeFlags: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--no-first-run",
      "--single-process",
    ],
    viewport: { width: 1920, height: 1080 },
    timeoutMultiplier: 2,
    silent: true,
    cacheDir: ".webreel/cache",
  };
}

/**
 * Format CI environment info for display in CLI output.
 *
 * @param env - The detected CI environment.
 * @returns A human-readable string describing the CI environment.
 */
export function formatCIInfo(env: CIEnvironment): string {
  if (!env.isCI) return "Not running in CI";
  return `CI detected: ${env.provider}`;
}
