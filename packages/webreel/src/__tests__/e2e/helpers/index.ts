/**
 * E2E test helpers — re-exports all shared utilities.
 */

export {
  E2E_TIMEOUT,
  BROWSER_E2E_TIMEOUT,
  BROWSER_E2E_ENABLED,
  E2E_ENABLED_IN_CI,
  detectBinaries,
  createTempDir,
  withTimeout,
  shouldSkipInCI,
} from "./test-environment.js";

export {
  assertFileExists,
  assertValidVideo,
  assertValidPng,
  assertValidSubtitles,
  assertValidHtml,
  assertFrameCount,
} from "./assertions.js";

export {
  createMinimalScript,
  createBrowserScript,
  createMultiSceneScript,
  createNarrationScript,
  type FixtureResult,
} from "./fixtures.js";

export { TestSurface } from "./test-surface.js";

export { createSolidPng, createIndexedFrame, type RgbColor } from "./png-generator.js";
