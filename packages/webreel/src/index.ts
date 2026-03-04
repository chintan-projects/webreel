#!/usr/bin/env node

import "dotenv/config";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { recordCommand } from "./commands/record.js";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { previewCommand } from "./commands/preview.js";
import { compositeCommand } from "./commands/composite.js";
import { createAuthorCommand } from "./commands/author.js";
import { createRenderCommand } from "./commands/render.js";
import { createPlanCommand } from "./commands/plan.js";

let version = "0.0.0";
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
  version = pkg.version;
} catch (err) {
  console.warn(
    "Could not read package.json for version info:",
    err instanceof Error ? err.message : String(err),
  );
}

const program = new Command();

program
  .name("webreel")
  .description("Record scripted browser demos as MP4 videos")
  .version(version);

program.addCommand(recordCommand);
program.addCommand(initCommand);
program.addCommand(validateCommand);
program.addCommand(previewCommand);
program.addCommand(compositeCommand);
program.addCommand(createAuthorCommand());
program.addCommand(createRenderCommand());
program.addCommand(createPlanCommand());

program.parseAsync().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
