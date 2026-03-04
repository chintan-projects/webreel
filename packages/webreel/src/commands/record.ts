import { Command } from "commander";
import { resolve } from "node:path";
import {
  loadWebreelConfig,
  resolveConfigPath,
  getConfigDir,
  filterVideosByName,
} from "../lib/config.js";
import { watchAndRerun } from "../lib/file-watcher.js";
import { runVideo } from "../lib/runner.js";
import type { WebreelConfig } from "../lib/types.js";

export function collectIncludePaths(config: WebreelConfig, configPath: string): string[] {
  const configDir = getConfigDir(configPath);
  const paths: string[] = [];
  const topIncludes = config.include ?? [];
  for (const inc of topIncludes) {
    paths.push(resolve(configDir, inc));
  }
  for (const video of config.videos) {
    for (const inc of video.include ?? []) {
      paths.push(resolve(configDir, inc));
    }
  }
  return [...new Set(paths)];
}

function printResolvedConfig(config: WebreelConfig): void {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

  console.log(bold("\nResolved configuration:\n"));

  if (config.baseUrl) console.log(`  baseUrl:      ${config.baseUrl}`);
  if (config.outDir) console.log(`  outDir:       ${config.outDir}`);
  if (config.viewport)
    console.log(`  viewport:     ${config.viewport.width}x${config.viewport.height}`);
  if (config.defaultDelay !== undefined)
    console.log(`  defaultDelay: ${config.defaultDelay}ms`);

  console.log(`\n  ${bold(`${config.videos.length} video(s):`)}\n`);

  for (const video of config.videos) {
    console.log(`  ${cyan(video.name)}`);
    console.log(`    url:      ${video.url}`);
    if (video.viewport)
      console.log(`    viewport: ${video.viewport.width}x${video.viewport.height}`);
    if (video.zoom) console.log(`    zoom:     ${video.zoom}x`);
    if (video.waitFor) console.log(`    waitFor:  ${video.waitFor}`);
    if (video.output) console.log(`    output:   ${video.output}`);

    console.log(`    steps:    ${video.steps.length} step(s)`);
    for (let i = 0; i < video.steps.length; i++) {
      const step = video.steps[i];
      const parts: string[] = [`${step.action}`];
      if ("text" in step && step.text && step.action !== "type")
        parts.push(`text="${step.text}"`);
      if ("selector" in step && step.selector) parts.push(`selector="${step.selector}"`);
      if ("key" in step && step.key) parts.push(`"${step.key}"`);
      if ("ms" in step && step.ms !== undefined) parts.push(`${step.ms}ms`);
      if ("url" in step && step.url && step.action === "navigate") parts.push(step.url);
      const desc =
        "description" in step && step.description ? dim(`: ${step.description}`) : "";
      console.log(`      ${dim(`${i}:`)} ${parts.join(" ")}${desc}`);
    }
    console.log();
  }
}

export const recordCommand = new Command("record")
  .description("Record videos")
  .argument("[videos...]", "Video names to record (default: all)")
  .option("-c, --config <path>", "Path to config file (default: webreel.config.json)")
  .option("--verbose", "Log each step as it executes")
  .option("--watch", "Re-record when config files change")
  .option("--dry-run", "Print the resolved config and step list without recording")
  .option("--frames", "Save raw frames as JPEGs in .webreel/frames/")
  .action(
    async (
      videoNames: string[],
      opts: {
        config?: string;
        verbose?: boolean;
        watch?: boolean;
        dryRun?: boolean;
        frames?: boolean;
      },
    ) => {
      const configPath = resolveConfigPath(opts.config);
      const configDir = getConfigDir(configPath);
      const verbose = opts.verbose ?? false;

      const webreelConfig = await loadWebreelConfig(configPath);
      const videos = filterVideosByName(webreelConfig.videos, videoNames);

      if (opts.dryRun) {
        const filtered = { ...webreelConfig, videos };
        printResolvedConfig(filtered);
        return;
      }

      for (const video of videos) {
        await runVideo(video, { record: true, verbose, configDir, frames: opts.frames });
      }

      if (opts.watch) {
        console.log("\nWatching for changes...");
        const watchPaths = [
          configPath,
          ...collectIncludePaths(webreelConfig, configPath),
        ];

        const handle = watchAndRerun(watchPaths, async () => {
          console.log("\nRe-recording...");
          const latestConfig = await loadWebreelConfig(configPath);
          const updatedVideos = filterVideosByName(latestConfig.videos, videoNames);
          for (const video of updatedVideos) {
            await runVideo(video, {
              record: true,
              verbose,
              configDir,
              frames: opts.frames,
            });
          }
          // Update watched paths in case config changed includes
          handle.updatePaths([
            configPath,
            ...collectIncludePaths(latestConfig, configPath),
          ]);
        });
      }
    },
  );
