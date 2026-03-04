/**
 * Browser E2E scenarios — full pipeline with real Chrome browser.
 *
 * These tests launch a real headless Chrome instance, navigate to
 * demos.liquid.ai pages, capture frames, and encode to video via ffmpeg.
 *
 * Gated by E2E_BROWSER=1 env var — skipped by default.
 * Each test has a 2-minute timeout.
 *
 * Prerequisites:
 *   - Chrome installed (auto-detected or CHROME_PATH env var)
 *   - ffmpeg installed (auto-detected or FFMPEG_PATH env var)
 *   - Network access to demos.liquid.ai
 */

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterAll } from "vitest";
import { SurfaceRegistry } from "@webreel/surfaces";
import { SceneOrchestrator } from "../../lib/scene-orchestrator.js";
import type { RenderConfig, RenderOptions } from "../../lib/scene-orchestrator.js";
import {
  createTempDir,
  detectBinaries,
  BROWSER_E2E_ENABLED,
  BROWSER_E2E_TIMEOUT,
  assertFileExists,
  assertValidVideo,
} from "./helpers/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

// ---------------------------------------------------------------------------
// Binary detection at module level for skipIf
// ---------------------------------------------------------------------------

const binaries = await detectBinaries();
const hasBothBinaries = binaries.chrome && binaries.ffmpeg;
const shouldRun = BROWSER_E2E_ENABLED && hasBothBinaries;

// ---------------------------------------------------------------------------
// Surface registry setup — uses the real browser surface
// ---------------------------------------------------------------------------

/**
 * Create a SurfaceRegistry with the real browser surface registered.
 * Imports BrowserSurface dynamically from @webreel/surfaces.
 */
async function createBrowserRegistry(): Promise<SurfaceRegistry> {
  const registry = new SurfaceRegistry();

  try {
    const { BrowserSurface } = await import("@webreel/surfaces");
    registry.register("browser", () => new BrowserSurface());
  } catch {
    // BrowserSurface not available — tests will skip
  }

  return registry;
}

/**
 * Build a RenderConfig optimized for e2e tests:
 * low FPS, fast preset, caching enabled.
 */
function createRenderConfig(cacheDir: string): RenderConfig {
  return {
    fps: 15,
    crf: 28,
    preset: "ultrafast",
    cache: {
      cacheDir,
      enabled: true,
    },
  };
}

/**
 * Read a fixture file from the fixtures directory.
 */
async function readFixture(name: string): Promise<string> {
  return readFile(join(fixturesDir, name), "utf-8");
}

// ---------------------------------------------------------------------------
// Temp directories for test output (cleaned up in afterAll)
// ---------------------------------------------------------------------------

const tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = [];

async function getTempDir(prefix: string): ReturnType<typeof createTempDir> {
  const dir = await createTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("browser e2e scenarios", () => {
  afterAll(async () => {
    for (const dir of tempDirs) {
      await dir.cleanup();
    }
  }, BROWSER_E2E_TIMEOUT);

  describe.skipIf(!shouldRun)("demos.liquid.ai recordings", () => {
    it(
      "renders Liquid AI homepage tour to MP4",
      async () => {
        const outputDir = await getTempDir("webreel-browser-homepage-e2e-");
        const registry = await createBrowserRegistry();
        const config = createRenderConfig(join(outputDir.path, "cache"));
        const orchestrator = new SceneOrchestrator(registry, config);

        // Write fixture to temp dir
        const content = await readFixture("liquid-homepage.md");
        const scriptPath = join(outputDir.path, "homepage.md");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(scriptPath, content, "utf-8");

        const outputPath = join(outputDir.path, "homepage.mp4");
        const options: RenderOptions = {
          scriptPath,
          outputPath,
        };

        const results = await orchestrator.render(options);

        expect(results.length).toBeGreaterThanOrEqual(1);

        const videoPath = results[0]!;
        await assertFileExists(videoPath);
        const info = await assertValidVideo(videoPath, "mp4");
        expect(info.codec).toBeDefined();
      },
      BROWSER_E2E_TIMEOUT,
    );

    it(
      "renders PII detection demo interaction to MP4",
      async () => {
        const outputDir = await getTempDir("webreel-browser-pii-e2e-");
        const registry = await createBrowserRegistry();
        const config = createRenderConfig(join(outputDir.path, "cache"));
        const orchestrator = new SceneOrchestrator(registry, config);

        const content = await readFixture("liquid-pii-detection.md");
        const scriptPath = join(outputDir.path, "pii-detection.md");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(scriptPath, content, "utf-8");

        const outputPath = join(outputDir.path, "pii-detection.mp4");
        const results = await orchestrator.render({
          scriptPath,
          outputPath,
        });

        expect(results.length).toBeGreaterThanOrEqual(1);
        await assertFileExists(results[0]!);
        await assertValidVideo(results[0]!, "mp4");
      },
      BROWSER_E2E_TIMEOUT,
    );

    it(
      "renders search query expansion demo to MP4",
      async () => {
        const outputDir = await getTempDir("webreel-browser-search-e2e-");
        const registry = await createBrowserRegistry();
        const config = createRenderConfig(join(outputDir.path, "cache"));
        const orchestrator = new SceneOrchestrator(registry, config);

        const content = await readFixture("liquid-search-expansion.md");
        const scriptPath = join(outputDir.path, "search-expansion.md");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(scriptPath, content, "utf-8");

        const outputPath = join(outputDir.path, "search-expansion.mp4");
        const results = await orchestrator.render({
          scriptPath,
          outputPath,
        });

        expect(results.length).toBeGreaterThanOrEqual(1);
        await assertFileExists(results[0]!);
        await assertValidVideo(results[0]!, "mp4");
      },
      BROWSER_E2E_TIMEOUT,
    );

    it(
      "renders multi-scene walkthrough with transitions",
      async () => {
        const outputDir = await getTempDir("webreel-browser-multi-e2e-");
        const registry = await createBrowserRegistry();
        const config = createRenderConfig(join(outputDir.path, "cache"));
        const orchestrator = new SceneOrchestrator(registry, config);

        const content = await readFixture("multi-scene-walkthrough.md");
        const scriptPath = join(outputDir.path, "multi-scene.md");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(scriptPath, content, "utf-8");

        const outputPath = join(outputDir.path, "multi-scene.mp4");
        const results = await orchestrator.render({
          scriptPath,
          outputPath,
        });

        expect(results.length).toBeGreaterThanOrEqual(1);
        await assertFileExists(results[0]!);
        const info = await assertValidVideo(results[0]!, "mp4");
        expect(info.codec).toBeDefined();
      },
      BROWSER_E2E_TIMEOUT,
    );

    it(
      "graceful failure on unreachable URL",
      async () => {
        const outputDir = await getTempDir("webreel-browser-unreachable-e2e-");
        const registry = await createBrowserRegistry();
        const config = createRenderConfig(join(outputDir.path, "cache"));
        const orchestrator = new SceneOrchestrator(registry, config);

        const content = [
          "---",
          "title: Unreachable Test",
          "viewport: 320x240",
          "output:",
          "  format: mp4",
          "  fps: 15",
          "---",
          "",
          "# Act 1: Error",
          "",
          "## Unreachable Page",
          "> surface: browser",
          "> url: https://this-domain-does-not-exist-webreel-test.invalid",
          "",
          "- pause: 2s",
          "",
        ].join("\n");

        const scriptPath = join(outputDir.path, "unreachable.md");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(scriptPath, content, "utf-8");

        const outputPath = join(outputDir.path, "unreachable.mp4");

        // Should throw a meaningful error — not hang or crash
        await expect(orchestrator.render({ scriptPath, outputPath })).rejects.toThrow();
      },
      BROWSER_E2E_TIMEOUT,
    );
  });

  describe.skipIf(!shouldRun)("fixture validation", () => {
    it(
      "all fixture scripts are readable and non-empty",
      async () => {
        const entries = await readdir(fixturesDir);
        const mdFiles = entries.filter((f) => f.endsWith(".md"));

        expect(mdFiles.length).toBeGreaterThanOrEqual(4);

        for (const file of mdFiles) {
          const content = await readFixture(file);
          expect(content.length).toBeGreaterThan(0);
          expect(content).toContain("---"); // Has front matter
          expect(content).toContain("surface: browser"); // Has surface config
        }
      },
      BROWSER_E2E_TIMEOUT,
    );
  });
});
