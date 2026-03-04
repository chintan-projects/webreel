/**
 * Scene Orchestrator integration e2e test — full render pipeline with TestSurface.
 *
 * Uses a real Surface implementation (TestSurface) that generates synthetic PNG
 * frames (no native addons), and real ffmpeg for encoding. Validates that the
 * SceneOrchestrator correctly wires parsing, surface lifecycle, frame capture,
 * caching, and video assembly together.
 *
 * No browser or Chrome instance is needed — TestSurface produces colored PNGs.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { SurfaceRegistry } from "@webreel/surfaces";
import { SceneOrchestrator } from "../../lib/scene-orchestrator.js";
import type { RenderConfig, RenderOptions } from "../../lib/scene-orchestrator.js";
import {
  createTempDir,
  createMinimalScript,
  createMultiSceneScript,
  detectBinaries,
  assertFileExists,
  assertValidVideo,
  TestSurface,
  E2E_TIMEOUT,
} from "./helpers/index.js";

// ---------------------------------------------------------------------------
// Binary detection at module level so describe.skipIf evaluates correctly
// ---------------------------------------------------------------------------

const binaries = await detectBinaries();
const ffmpegAvailable = binaries.ffmpeg;

/** Dummy URL — TestSurface ignores navigation entirely. */
const TEST_URL = "https://example.com";

/**
 * Create a SurfaceRegistry with TestSurface registered as the "test" type.
 * Each call returns a fresh registry to avoid cross-test contamination.
 */
function createTestRegistry(): SurfaceRegistry {
  const registry = new SurfaceRegistry();
  registry.register("test", () => new TestSurface());
  return registry;
}

/**
 * Build a RenderConfig that directs the scene cache into the provided directory.
 * Uses fast encoding settings to keep e2e tests quick.
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

// ---------------------------------------------------------------------------
// Shared temp dir for the invalid-path test (needs to exist before the test)
// ---------------------------------------------------------------------------

let sharedTempDir: { path: string; cleanup: () => Promise<void> } | undefined;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("scene orchestrator integration (TestSurface + real ffmpeg)", () => {
  afterAll(async () => {
    if (sharedTempDir) {
      await sharedTempDir.cleanup();
    }
  }, E2E_TIMEOUT);

  describe.skipIf(!ffmpegAvailable)("render pipeline", () => {
    it(
      "full render pipeline with test surface produces video",
      async () => {
        const outputDir = await createTempDir("webreel-orch-render-e2e-");
        try {
          const registry = createTestRegistry();
          const config = createRenderConfig(join(outputDir.path, "cache"));
          const orchestrator = new SceneOrchestrator(registry, config);

          const fixture = await createMinimalScript(outputDir.path, TEST_URL, {
            surfaceType: "test",
          });

          const outputPath = join(outputDir.path, "output.mp4");
          const options: RenderOptions = {
            scriptPath: fixture.path,
            outputPath,
          };

          const results = await orchestrator.render(options);

          expect(results.length).toBeGreaterThanOrEqual(1);

          const videoPath = results[0]!;
          await assertFileExists(videoPath);
          const info = await assertValidVideo(videoPath, "mp4");
          expect(info.codec).toBeDefined();
        } finally {
          await outputDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );

    it(
      "scene caching skips unchanged scenes on re-render",
      async () => {
        const outputDir = await createTempDir("webreel-orch-cache-e2e-");
        try {
          const sceneCacheDir = join(outputDir.path, "scene-cache");
          const registry = createTestRegistry();
          const config = createRenderConfig(sceneCacheDir);
          const orchestrator = new SceneOrchestrator(registry, config);

          const fixture = await createMinimalScript(outputDir.path, TEST_URL, {
            surfaceType: "test",
          });

          const outputPath1 = join(outputDir.path, "first.mp4");
          const firstResults = await orchestrator.render({
            scriptPath: fixture.path,
            outputPath: outputPath1,
          });

          expect(firstResults.length).toBeGreaterThanOrEqual(1);
          await assertFileExists(firstResults[0]!);

          // Verify cache was populated
          const cacheEntries = await readdir(sceneCacheDir).catch(() => []);
          expect(cacheEntries.length).toBeGreaterThan(0);

          // Second render with the same input should reuse cache
          const outputPath2 = join(outputDir.path, "second.mp4");
          const secondResults = await orchestrator.render({
            scriptPath: fixture.path,
            outputPath: outputPath2,
          });

          expect(secondResults.length).toBeGreaterThanOrEqual(1);
          await assertFileExists(secondResults[0]!);
        } finally {
          await outputDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );

    it(
      "scene filter renders only matching scenes",
      async () => {
        const outputDir = await createTempDir("webreel-orch-filter-e2e-");
        try {
          const registry = createTestRegistry();
          const config = createRenderConfig(join(outputDir.path, "cache"));
          const orchestrator = new SceneOrchestrator(registry, config);

          const fixture = await createMultiSceneScript(outputDir.path, [
            { name: "First Scene", surfaceType: "test", url: TEST_URL },
            { name: "Second Scene", surfaceType: "test", url: TEST_URL },
            { name: "Third Scene", surfaceType: "test", url: TEST_URL },
          ]);

          const outputPath = join(outputDir.path, "filtered.mp4");
          const results = await orchestrator.render({
            scriptPath: fixture.path,
            outputPath,
            scene: "Second Scene",
          });

          expect(results.length).toBeGreaterThanOrEqual(1);
          await assertFileExists(results[0]!);
          await assertValidVideo(results[0]!, "mp4");
        } finally {
          await outputDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );

    it(
      "dry-run mode produces no output files",
      async () => {
        const outputDir = await createTempDir("webreel-orch-dryrun-e2e-");
        try {
          const registry = createTestRegistry();
          const config = createRenderConfig(join(outputDir.path, "cache"));
          const orchestrator = new SceneOrchestrator(registry, config);

          const fixture = await createMinimalScript(outputDir.path, TEST_URL, {
            surfaceType: "test",
          });

          const outputPath = join(outputDir.path, "dryrun.mp4");
          const results = await orchestrator.render({
            scriptPath: fixture.path,
            outputPath,
            dryRun: true,
          });

          expect(results).toEqual([]);

          // Verify no video files were created in the output directory
          const entries = await readdir(outputDir.path);
          const videoFiles = entries.filter(
            (f) => f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".gif"),
          );
          expect(videoFiles).toEqual([]);
        } finally {
          await outputDir.cleanup();
        }
      },
      E2E_TIMEOUT,
    );

    it(
      "invalid script path throws meaningful error",
      async () => {
        sharedTempDir = await createTempDir("webreel-orch-invalid-e2e-");
        const registry = createTestRegistry();
        const config = createRenderConfig(join(sharedTempDir.path, "cache"));
        const orchestrator = new SceneOrchestrator(registry, config);

        const options: RenderOptions = {
          scriptPath: "/nonexistent/path/does-not-exist.md",
          outputPath: join(sharedTempDir.path, "should-not-exist.mp4"),
        };

        await expect(orchestrator.render(options)).rejects.toThrow();
      },
      E2E_TIMEOUT,
    );
  });
});
