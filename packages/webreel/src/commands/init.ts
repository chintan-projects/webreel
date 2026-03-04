import { Command } from "commander";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG_FILE } from "../lib/config.js";
import { getTemplate, listTemplates, TEMPLATE_NAMES } from "../lib/templates/index.js";

const INIT_TEMPLATE = `{
  // JSON Schema for IDE autocompletion (VS Code, Cursor, JetBrains).
  // Full docs: https://webreel.dev/configuration
  "$schema": "https://webreel.dev/schema/v1.json",

  // Output directory for recorded videos (relative to this file).
  "outDir": "./videos",

  // Default delay (ms) after each step. Override per-step with "delay".
  "defaultDelay": 500,

  "videos": {
    "VIDEO_NAME": {
      "url": "VIDEO_URL",
      "viewport": { "width": 1920, "height": 1080 },

      // Optional: wait for an element before starting.
      // "waitFor": "[data-ready]",

      // Steps are executed in order. Each step is an action.
      // Use "pause" for explicit waits; use "delay" on any step for post-step waits.
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "text": "Get Started" },
        { "action": "key", "key": "mod+a", "delay": 1000 }
      ]
    }
  }
}
`;

const DEFAULT_DEMO_FILE = "demo.md";

interface InitOptions {
  readonly name: string;
  readonly url: string;
  readonly output?: string;
  readonly template?: string;
  readonly listTemplates?: boolean;
}

export const initCommand = new Command("init")
  .description("Scaffold a new webreel config or Demo Markdown script")
  .option("--name <name>", "video name", "my-video")
  .option("--url <url>", "starting URL", "https://example.com")
  .option("-o, --output <file>", "output file path")
  .option("--template <name>", `Demo Markdown template (${TEMPLATE_NAMES.join(", ")})`)
  .option("--list-templates", "List available templates")
  .action((opts: InitOptions) => {
    if (opts.listTemplates) {
      console.log("\nAvailable templates:\n");
      for (const t of listTemplates()) {
        console.log(`  ${t.name.padEnd(24)} ${t.description}`);
      }
      console.log("");
      return;
    }

    if (opts.template) {
      const fileName = opts.output ?? DEFAULT_DEMO_FILE;
      const filePath = resolve(process.cwd(), fileName);

      if (existsSync(filePath)) {
        throw new Error(`File already exists: ${fileName}`);
      }

      const content = getTemplate(opts.template, {
        title: opts.name,
        url: opts.url,
      });
      writeFileSync(filePath, content);
      console.log(`Created ${fileName} (template: ${opts.template})`);
      return;
    }

    // Default: JSON config (backward compat)
    const fileName = opts.output ?? DEFAULT_CONFIG_FILE;
    const filePath = resolve(process.cwd(), fileName);

    if (existsSync(filePath)) {
      throw new Error(`File already exists: ${fileName}`);
    }

    const content = INIT_TEMPLATE.replace("VIDEO_NAME", opts.name).replace(
      "VIDEO_URL",
      opts.url,
    );

    writeFileSync(filePath, content);
    console.log(`Created ${fileName}`);
  });
