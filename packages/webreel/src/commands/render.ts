/**
 * CLI command: `webreel render`
 *
 * Renders a Demo Markdown script to video by delegating to the SceneOrchestrator.
 * Supports scene/act filtering, dry-run mode, format selection, caching control,
 * and verbose output.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import { watchAndRerun } from "../lib/file-watcher.js";
import { SceneOrchestrator } from "../lib/scene-orchestrator.js";
import { createDefaultSurfaceRegistry } from "../lib/default-surfaces.js";
import { detectCI, getCIConfig, formatCIInfo } from "../lib/ci-config.js";
import type { CIEnvironment } from "../lib/ci-config.js";

/** CLI option shape parsed by commander. */
interface RenderCommandOptions {
  readonly output?: string;
  readonly scene?: string;
  readonly act?: string;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly format?: string;
  readonly voice?: string;
  readonly fps?: string;
  readonly crf?: string;
  readonly noCache?: boolean;
  readonly subtitles?: boolean;
  readonly chapters?: boolean;
  readonly watch?: boolean;
  readonly ci?: boolean;
}

/**
 * Create the `webreel render` subcommand.
 *
 * @returns A configured Commander command for rendering Demo Markdown scripts.
 */
export function createRenderCommand(): Command {
  const cmd = new Command("render")
    .description("Render a Demo Markdown script to video")
    .argument("<script>", "Path to Demo Markdown file (.md)")
    .option("-o, --output <path>", "Output file path")
    .option(
      "--scene <name>",
      "Render only this scene (others loaded from cache if available)",
    )
    .option("--act <name>", "Render only this act")
    .option(
      "--dry-run",
      "Parse and show plan without rendering (shows cache hit/miss status)",
    )
    .option("--verbose", "Show detailed progress")
    .option(
      "--format <format>",
      "Output format(s), comma-separated (e.g., mp4, webm, gif, or mp4,webm,gif)",
      "mp4",
    )
    .option("--voice <voice>", "Override TTS voice")
    .option("--fps <number>", "Frame rate (default: 30)")
    .option("--crf <number>", "Video quality (0-51, lower = better, default: 23)")
    .option("--no-cache", "Disable scene caching, force full re-render")
    .option("--subtitles", "Generate .srt and .vtt subtitle files alongside output")
    .option("--chapters", "Embed chapter markers in MP4 output (default: true for mp4)")
    .option("--watch", "Watch script file and re-render on changes")
    .option("--ci", "Enable CI mode (auto-detected, or forced with this flag)")
    .action(async (scriptPath: string, opts: RenderCommandOptions) => {
      const resolvedScript = resolve(scriptPath);
      const registry = createDefaultSurfaceRegistry();

      // Detect CI environment (auto-detect or forced via --ci flag)
      const ciEnv: CIEnvironment = opts.ci
        ? { isCI: true, provider: "forced" }
        : detectCI();

      if (ciEnv.isCI) {
        const ciConfig = getCIConfig();
        if (opts.verbose) {
          const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
          console.log(`\n  ${formatCIInfo(ciEnv)}`);
          console.log(`  ${dim(`timeout multiplier: ${ciConfig.timeoutMultiplier}x`)}`);
          console.log(
            `  ${dim(`viewport: ${ciConfig.viewport.width}x${ciConfig.viewport.height}`)}`,
          );
          console.log(
            `  ${dim(`chrome flags: ${ciConfig.chromeFlags.length} flags applied`)}`,
          );
        }
      }

      // In CI mode, default to no-cache since CI caches are often ephemeral
      const effectiveNoCache = opts.noCache ?? ciEnv.isCI;

      const renderConfig = {
        fps: opts.fps ? parseInt(opts.fps, 10) : undefined,
        crf: opts.crf ? parseInt(opts.crf, 10) : undefined,
      };

      const orchestrator = new SceneOrchestrator(registry, renderConfig);

      try {
        const outputPaths = await orchestrator.render({
          scriptPath: resolvedScript,
          outputPath: opts.output ?? "",
          scene: opts.scene,
          act: opts.act,
          dryRun: opts.dryRun,
          verbose: opts.verbose,
          format: opts.format,
          voice: opts.voice,
          noCache: effectiveNoCache,
          subtitles: opts.subtitles,
          chapters: opts.chapters,
        });

        if (outputPaths.length > 0) {
          const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
          const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
          console.log("");
          for (const p of outputPaths) {
            console.log(`  ${green("done")} Rendered to ${dim(p)}`);
          }
          console.log("");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
        console.error(`\n  ${red("error")} Render failed: ${message}\n`);
        if (opts.verbose && err instanceof Error && err.stack) {
          console.error(err.stack);
        }
        if (!opts.watch) {
          process.exit(1);
        }
      }

      if (opts.watch) {
        console.log("\nWatching for changes...");
        const watchPaths = [resolvedScript];

        watchAndRerun(watchPaths, async () => {
          console.log("\nRe-rendering...");
          try {
            const reOutputPaths = await orchestrator.render({
              scriptPath: resolvedScript,
              outputPath: opts.output ?? "",
              scene: opts.scene,
              act: opts.act,
              dryRun: opts.dryRun,
              verbose: opts.verbose,
              format: opts.format,
              voice: opts.voice,
              noCache: effectiveNoCache,
              subtitles: opts.subtitles,
              chapters: opts.chapters,
            });

            if (reOutputPaths.length > 0) {
              const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
              const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
              console.log("");
              for (const p of reOutputPaths) {
                console.log(`  ${green("done")} Rendered to ${dim(p)}`);
              }
              console.log("");
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`\nRe-render failed: ${message}`);
          }
        });
      }
    });

  return cmd;
}
