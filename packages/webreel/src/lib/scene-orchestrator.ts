/**
 * Scene Orchestrator — the central render pipeline.
 *
 * Reads a parsed DemoScript IR, creates surfaces via registry, executes
 * scripted actions, captures frames, and assembles the final video via ffmpeg.
 *
 * Supports per-scene caching: unchanged scenes are loaded from cache,
 * only modified scenes are re-rendered.
 *
 * Lifecycle per scene: check cache -> (hit: load | miss: create surface ->
 * setup -> execute actions -> capture frames -> teardown -> write cache).
 */

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  type SurfaceRegistry,
  type SurfaceConfig,
  SurfaceError,
} from "@webreel/surfaces";
import { parse, type DemoScript, type Scene, type Act } from "@webreel/director";
import { ensureFfmpeg, WebReelError } from "@webreel/core";

import { SceneCache, type SceneCacheConfig } from "./scene-cache.js";
import { hashScene, hashScript, detectChangedScenes } from "./scene-hasher.js";
import { buildFfmpegArgs, runFfmpeg } from "./ffmpeg-runner.js";
import {
  assembleVideo as assembleVideoWithFeatures,
  type AssemblerSceneResult,
} from "./video-assembler.js";

/** Options controlling what and how to render. */
interface RenderOptions {
  readonly scriptPath: string;
  readonly outputPath: string;
  readonly scene?: string;
  readonly act?: string;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly format?: string;
  readonly voice?: string;
  readonly noCache?: boolean;
  readonly subtitles?: boolean;
  readonly chapters?: boolean;
}

/** Result of rendering a single scene (frames + timing). */
interface SceneResult {
  readonly sceneName: string;
  readonly actName: string;
  readonly frames: readonly Buffer[];
  readonly durationMs: number;
  readonly fromCache: boolean;
  /** Scene IR reference for transition and narration access. */
  readonly scene: Scene;
}

/** Configuration for the render pipeline. */
interface RenderConfig {
  readonly fps?: number;
  readonly crf?: number;
  readonly preset?: string;
  readonly cache?: Partial<SceneCacheConfig>;
}

const DEFAULT_FPS = 30;
const DEFAULT_CRF = 23;
const DEFAULT_PRESET = "fast";
const HOLD_FRAMES = 30;

/**
 * Central orchestrator that wires parser, surfaces, and compositor together.
 * Supports per-scene caching for incremental re-rendering.
 */
class SceneOrchestrator {
  private readonly surfaceRegistry: SurfaceRegistry;
  private readonly renderConfig: RenderConfig;
  private readonly sceneCache: SceneCache;

  constructor(surfaceRegistry: SurfaceRegistry, renderConfig: RenderConfig) {
    this.surfaceRegistry = surfaceRegistry;
    this.renderConfig = renderConfig;
    this.sceneCache = new SceneCache(renderConfig.cache);
  }

  /**
   * Render a Demo Markdown script to video.
   *
   * @param options - Render options (script path, output path, filters, flags).
   * @returns The absolute path to the rendered output file, or empty string for dry-run.
   */
  async render(options: RenderOptions): Promise<string> {
    const scriptContent = await readFile(options.scriptPath, "utf-8");
    const script = parse(scriptContent);
    const scriptHash = hashScript(script);
    const cacheEnabled = !options.noCache;

    if (options.dryRun) {
      await this.printPlan(script, scriptHash, cacheEnabled);
      return "";
    }

    const ffmpegPath = await ensureFfmpeg();
    const cachedHashes = cacheEnabled
      ? await this.sceneCache.listHashes(scriptHash)
      : new Map<string, string>();

    const sceneResults: SceneResult[] = [];
    for (const act of script.acts) {
      if (options.act && act.name !== options.act) continue;

      for (const scene of act.scenes) {
        if (options.scene && scene.name !== options.scene) continue;

        const result = await this.renderOrLoadScene(
          scene,
          act.name,
          script,
          options,
          scriptHash,
          cachedHashes,
          cacheEnabled,
        );
        sceneResults.push(result);
        if (options.verbose) {
          this.logSceneComplete(result);
        }
      }
    }

    if (sceneResults.length === 0) {
      throw new WebReelError("No scenes matched the given filters.", {
        code: "NO_SCENES_MATCHED",
      });
    }

    return this.assembleVideo(sceneResults, script, options, ffmpegPath);
  }

  /**
   * Render a scene or load it from cache if unchanged.
   */
  private async renderOrLoadScene(
    scene: Scene,
    actName: string,
    script: DemoScript,
    options: RenderOptions,
    scriptHash: string,
    cachedHashes: Map<string, string>,
    cacheEnabled: boolean,
  ): Promise<SceneResult> {
    const sceneHash = hashScene(scene);

    // Try cache first
    if (cacheEnabled) {
      const cached = cachedHashes.get(scene.name);
      if (cached === sceneHash) {
        const cachedScene = await this.sceneCache.read(scriptHash, scene.name);
        if (cachedScene) {
          const videoData = await readFile(cachedScene.videoPath);
          return {
            sceneName: scene.name,
            actName,
            frames: [videoData],
            durationMs: 0,
            fromCache: true,
            scene,
          };
        }
      }
    }

    // Cache miss — render the scene
    const result = await this.renderScene(scene, actName, script, options);

    // Write to cache
    if (cacheEnabled && result.frames.length > 0) {
      const tempDir = await mkdtemp(join(tmpdir(), "webreel-scene-cache-"));
      try {
        const sceneFfmpegPath = await ensureFfmpeg();
        let frameIndex = 0;
        for (const frame of result.frames) {
          const framePath = join(
            tempDir,
            `frame_${String(frameIndex).padStart(6, "0")}.png`,
          );
          await writeFile(framePath, frame);
          frameIndex++;
        }
        const fps = this.renderConfig.fps ?? script.meta.output?.fps ?? DEFAULT_FPS;
        const sceneVideoPath = join(tempDir, "scene.mp4");
        const args = buildFfmpegArgs(
          join(tempDir, "frame_%06d.png"),
          sceneVideoPath,
          fps,
          "mp4",
          DEFAULT_CRF,
          DEFAULT_PRESET,
        );
        await runFfmpeg(sceneFfmpegPath, args, false);
        const videoBuffer = await readFile(sceneVideoPath);
        await this.sceneCache.write(scriptHash, scene.name, {
          video: videoBuffer,
          hash: sceneHash,
        });
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }

    return result;
  }

  /**
   * Render a single scene: setup surface, execute actions, capture frames, teardown.
   */
  private async renderScene(
    scene: Scene,
    actName: string,
    script: DemoScript,
    options: RenderOptions,
  ): Promise<SceneResult> {
    const viewport = script.meta.viewport ?? { width: 1280, height: 720 };
    const surfaceConfig: SurfaceConfig = {
      type: scene.surface.type as SurfaceConfig["type"],
      viewport,
      options: { ...scene.surface.options, title: scene.name },
    };

    let surface;
    try {
      surface = this.surfaceRegistry.create(surfaceConfig);
    } catch (err: unknown) {
      throw new WebReelError(
        `Failed to create surface for scene "${scene.name}": ${errorMessage(err)}`,
        { code: "SURFACE_CREATE_FAILED", cause: toError(err) },
      );
    }

    const frames: Buffer[] = [];
    const startTime = Date.now();

    try {
      await surface.setup(surfaceConfig);
      frames.push(await surface.captureFrame());

      const captures: Record<string, string> = {};
      for (let i = 0; i < scene.actions.length; i++) {
        const action = scene.actions[i]!;
        try {
          const result = await surface.execute(
            { type: action.type, params: action.params },
            {
              sceneName: scene.name,
              actName,
              captures,
              verbose: options.verbose ?? false,
            },
          );
          if (result.captures) {
            Object.assign(captures, result.captures);
          }
        } catch (err: unknown) {
          throw new WebReelError(
            `Action ${i} ("${action.type}") failed in scene "${scene.name}": ${errorMessage(err)}`,
            { code: "ACTION_FAILED", cause: toError(err) },
          );
        }
        frames.push(await surface.captureFrame());
      }

      const finalFrame = await surface.captureFrame();
      for (let i = 0; i < HOLD_FRAMES; i++) {
        frames.push(finalFrame);
      }

      return {
        sceneName: scene.name,
        actName,
        frames,
        durationMs: Date.now() - startTime,
        fromCache: false,
        scene,
      };
    } catch (err: unknown) {
      if (err instanceof WebReelError || err instanceof SurfaceError) throw err;
      throw new WebReelError(`Scene "${scene.name}" failed: ${errorMessage(err)}`, {
        code: "SCENE_FAILED",
        cause: toError(err),
      });
    } finally {
      await surface.teardown();
    }
  }

  /** Assemble captured frames into a video file via ffmpeg. */
  private async assembleVideo(
    results: readonly SceneResult[],
    script: DemoScript,
    options: RenderOptions,
    ffmpegPath: string,
  ): Promise<string> {
    const fps = this.renderConfig.fps ?? script.meta.output?.fps ?? DEFAULT_FPS;
    const crf = this.renderConfig.crf ?? DEFAULT_CRF;
    const preset = this.renderConfig.preset ?? DEFAULT_PRESET;

    // Delegate to video-assembler which handles transitions, chapters, subtitles
    const assemblerResults: AssemblerSceneResult[] = results.map((r) => ({
      sceneName: r.sceneName,
      actName: r.actName,
      frames: r.frames,
      durationMs: r.durationMs,
      scene: r.scene,
    }));

    return assembleVideoWithFeatures(
      assemblerResults,
      script,
      {
        scriptPath: options.scriptPath,
        outputPath: options.outputPath,
        format: options.format,
        verbose: options.verbose,
        subtitles: options.subtitles,
        chapters: options.chapters,
      },
      { fps, crf, preset },
      ffmpegPath,
    );
  }

  /** Print a human-readable render plan (dry-run mode) with cache status. */
  private async printPlan(
    script: DemoScript,
    scriptHash: string,
    cacheEnabled: boolean,
  ): Promise<void> {
    const totalScenes = script.acts.reduce(
      (sum: number, a: Act) => sum + a.scenes.length,
      0,
    );
    const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
    const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
    const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;

    const cachedHashes = cacheEnabled
      ? await this.sceneCache.listHashes(scriptHash)
      : new Map<string, string>();
    const changes = cacheEnabled ? detectChangedScenes(script, cachedHashes) : [];
    const changedNames = new Set(changes.map((c) => c.sceneName));

    console.log(`\n  Demo: ${script.meta.title}`);
    console.log(
      `  Duration hint: ${script.meta.duration ? `${script.meta.duration}s` : "not specified"}`,
    );
    console.log(`  Acts: ${script.acts.length}`);
    console.log(`  Total scenes: ${totalScenes}\n`);

    for (const act of script.acts) {
      const hint = act.durationHint ? ` (${act.durationHint}s)` : "";
      console.log(`  # ${act.name}${hint}`);
      for (const scene of act.scenes) {
        const actionCount = scene.actions.length;
        const narrationCount = scene.narration.length;
        const cacheStatus = cacheEnabled
          ? changedNames.has(scene.name)
            ? yellow(" [re-render]")
            : green(" [cached]")
          : dim(" [no-cache]");
        console.log(
          `    ## ${scene.name} [${scene.surface.type}] — ${actionCount} actions, ${narrationCount} narration blocks${cacheStatus}`,
        );
      }
    }
    console.log("");
  }

  private logSceneComplete(result: SceneResult): void {
    const tag = result.fromCache ? " (cached)" : "";
    console.log(
      `  [${result.actName}/${result.sceneName}] ${result.frames.length} frames in ${result.durationMs}ms${tag}`,
    );
  }
}

/** Extract error message from an unknown thrown value. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Coerce an unknown thrown value to Error. */
function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export { SceneOrchestrator, type RenderOptions, type SceneResult, type RenderConfig };
