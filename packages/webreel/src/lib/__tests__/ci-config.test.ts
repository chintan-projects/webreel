import { describe, it, expect, afterEach } from "vitest";
import { detectCI, getCIConfig, formatCIInfo } from "../ci-config.js";
import type { CIEnvironment } from "../ci-config.js";

/** Snapshot of process.env before each test for safe restoration. */
const originalEnv = { ...process.env };

/** CI-related env vars that must be cleaned between tests. */
const CI_ENV_VARS = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
  "JENKINS_URL",
  "TRAVIS",
  "BUILDKITE",
] as const;

/** Remove all known CI env vars so detection starts clean. */
function clearCIEnv(): void {
  for (const key of CI_ENV_VARS) {
    delete process.env[key];
  }
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("detectCI", () => {
  it("detects GitHub Actions", () => {
    clearCIEnv();
    process.env.GITHUB_ACTIONS = "true";
    const result = detectCI();
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("github-actions");
  });

  it("detects GitLab CI", () => {
    clearCIEnv();
    process.env.GITLAB_CI = "true";
    const result = detectCI();
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("gitlab-ci");
  });

  it("detects CircleCI", () => {
    clearCIEnv();
    process.env.CIRCLECI = "true";
    const result = detectCI();
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("circleci");
  });

  it("detects Jenkins via JENKINS_URL", () => {
    clearCIEnv();
    process.env.JENKINS_URL = "https://ci.example.com";
    const result = detectCI();
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("jenkins");
  });

  it("detects Travis CI", () => {
    clearCIEnv();
    process.env.TRAVIS = "true";
    const result = detectCI();
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("travis");
  });

  it("detects Buildkite", () => {
    clearCIEnv();
    process.env.BUILDKITE = "true";
    const result = detectCI();
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("buildkite");
  });

  it("detects generic CI via CI=true", () => {
    clearCIEnv();
    process.env.CI = "true";
    const result = detectCI();
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("generic");
  });

  it("detects generic CI via CI=1", () => {
    clearCIEnv();
    process.env.CI = "1";
    const result = detectCI();
    expect(result.isCI).toBe(true);
    expect(result.provider).toBe("generic");
  });

  it("returns local when no CI env vars are set", () => {
    clearCIEnv();
    const result = detectCI();
    expect(result.isCI).toBe(false);
    expect(result.provider).toBe("local");
  });

  it("prioritizes GitHub Actions over generic CI", () => {
    clearCIEnv();
    process.env.CI = "true";
    process.env.GITHUB_ACTIONS = "true";
    const result = detectCI();
    expect(result.provider).toBe("github-actions");
  });
});

describe("getCIConfig", () => {
  it("returns Chrome flags including --no-sandbox", () => {
    const config = getCIConfig();
    expect(config.chromeFlags).toContain("--no-sandbox");
  });

  it("returns Chrome flags including --disable-dev-shm-usage", () => {
    const config = getCIConfig();
    expect(config.chromeFlags).toContain("--disable-dev-shm-usage");
  });

  it("returns a 1920x1080 viewport", () => {
    const config = getCIConfig();
    expect(config.viewport).toEqual({ width: 1920, height: 1080 });
  });

  it("has silent mode enabled", () => {
    const config = getCIConfig();
    expect(config.silent).toBe(true);
  });

  it("has timeout multiplier of 2", () => {
    const config = getCIConfig();
    expect(config.timeoutMultiplier).toBe(2);
  });

  it("uses a workspace-relative cache directory", () => {
    const config = getCIConfig();
    expect(config.cacheDir).toBe(".webreel/cache");
  });
});

describe("formatCIInfo", () => {
  it("formats a CI provider name", () => {
    const env: CIEnvironment = { isCI: true, provider: "github-actions" };
    expect(formatCIInfo(env)).toBe("CI detected: github-actions");
  });

  it("formats forced CI mode", () => {
    const env: CIEnvironment = { isCI: true, provider: "forced" };
    expect(formatCIInfo(env)).toBe("CI detected: forced");
  });

  it("formats non-CI environment", () => {
    const env: CIEnvironment = { isCI: false, provider: "local" };
    expect(formatCIInfo(env)).toBe("Not running in CI");
  });
});
