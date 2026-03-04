/**
 * Demo Markdown fixture factory — generates valid test scripts programmatically.
 *
 * All generated scripts are valid Demo Markdown parseable by @webreel/director.
 * Each returns the content string and writes it to a temp dir for orchestrator use.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Result of creating a fixture script. */
export interface FixtureResult {
  /** The raw Demo Markdown content. */
  readonly content: string;
  /** Absolute path to the written .md file. */
  readonly path: string;
}

/** Options for minimal script generation. */
interface MinimalScriptOptions {
  readonly title?: string;
  readonly viewport?: { width: number; height: number };
  readonly fps?: number;
  readonly format?: string;
  readonly surfaceType?: string;
}

/**
 * Create the simplest valid Demo Markdown script (1 act, 1 scene, pause only).
 * Uses `browser` surface by default.
 */
export async function createMinimalScript(
  tempDir: string,
  url: string,
  options: MinimalScriptOptions = {},
): Promise<FixtureResult> {
  const title = options.title ?? "Minimal Test";
  const viewport = options.viewport ?? { width: 320, height: 240 };
  const fps = options.fps ?? 15;
  const format = options.format ?? "mp4";
  const surface = options.surfaceType ?? "browser";

  const content = [
    "---",
    `title: ${title}`,
    `viewport: { width: ${viewport.width}, height: ${viewport.height} }`,
    `output: { format: ${format}, fps: ${fps} }`,
    "---",
    "",
    "# Act 1 — Test",
    "",
    "## Scene 1",
    `> surface: ${surface}`,
    `> url: ${url}`,
    "",
    "- pause: 1s",
    "",
  ].join("\n");

  const path = join(tempDir, "minimal.md");
  await writeFile(path, content, "utf-8");

  return { content, path };
}

/** Step definition for browser scripts. */
interface BrowserStep {
  readonly action: string;
  readonly value: string;
}

/**
 * Create a browser surface script with custom steps.
 */
export async function createBrowserScript(
  tempDir: string,
  url: string,
  steps: readonly BrowserStep[],
  filename = "browser-test.md",
): Promise<FixtureResult> {
  const stepLines = steps.map((s) => `- ${s.action}: ${s.value}`);

  const content = [
    "---",
    "title: Browser Test",
    "viewport: { width: 320, height: 240 }",
    "output: { format: mp4, fps: 15 }",
    "---",
    "",
    "# Act 1 — Test",
    "",
    "## Browser Scene",
    "> surface: browser",
    `> url: ${url}`,
    "",
    ...stepLines,
    "",
  ].join("\n");

  const path = join(tempDir, filename);
  await writeFile(path, content, "utf-8");

  return { content, path };
}

/** Scene definition for multi-scene scripts. */
interface SceneDefinition {
  readonly name: string;
  readonly surfaceType?: string;
  readonly url?: string;
  readonly steps?: readonly BrowserStep[];
  readonly narration?: string;
  readonly transitionIn?: string;
  readonly transitionOut?: string;
}

/**
 * Create a multi-scene script with configurable scenes and transitions.
 */
export async function createMultiSceneScript(
  tempDir: string,
  scenes: readonly SceneDefinition[],
  filename = "multi-scene.md",
): Promise<FixtureResult> {
  const lines: string[] = [
    "---",
    "title: Multi-Scene Test",
    "viewport: { width: 320, height: 240 }",
    "output: { format: mp4, fps: 15 }",
    "---",
    "",
    "# Act 1 — Test",
    "",
  ];

  for (const scene of scenes) {
    lines.push(`## ${scene.name}`);
    lines.push(`> surface: ${scene.surfaceType ?? "browser"}`);
    if (scene.url) lines.push(`> url: ${scene.url}`);
    if (scene.transitionIn) lines.push(`> transition_in: ${scene.transitionIn}`);
    if (scene.transitionOut) lines.push(`> transition_out: ${scene.transitionOut}`);
    lines.push("");

    if (scene.steps) {
      for (const step of scene.steps) {
        lines.push(`- ${step.action}: ${step.value}`);
      }
      lines.push("");
    } else {
      lines.push("- pause: 1s");
      lines.push("");
    }

    if (scene.narration) {
      lines.push(`"${scene.narration}"`);
      lines.push("");
    }
  }

  const content = lines.join("\n");
  const path = join(tempDir, filename);
  await writeFile(path, content, "utf-8");

  return { content, path };
}

/**
 * Create a script with narration blocks for subtitle testing.
 */
export async function createNarrationScript(
  tempDir: string,
  url: string,
  narrationBlocks: readonly string[],
  filename = "narration-test.md",
): Promise<FixtureResult> {
  const narrationLines = narrationBlocks.flatMap((text) => [
    `"${text}"`,
    "",
    "- pause: 1s",
    "",
  ]);

  const content = [
    "---",
    "title: Narration Test",
    "viewport: { width: 320, height: 240 }",
    "output: { format: mp4, fps: 15 }",
    "---",
    "",
    "# Act 1 — Narrated",
    "",
    "## Narrated Scene",
    "> surface: browser",
    `> url: ${url}`,
    "",
    ...narrationLines,
  ].join("\n");

  const path = join(tempDir, filename);
  await writeFile(path, content, "utf-8");

  return { content, path };
}
