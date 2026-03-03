/**
 * CLI command: `webreel plan`
 *
 * Analyzes a Demo Markdown script and displays an execution plan showing
 * acts, scenes, prerequisites, timing estimates, and risks. Optionally
 * runs pre-flight validation checks.
 */

import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { parse } from "@webreel/director";
import { generatePlan } from "../lib/plan-generator.js";
import { validatePrerequisites } from "../lib/plan-validator.js";
import { formatPlan, formatValidation } from "../lib/plan-formatter.js";

/** CLI option shape parsed by commander. */
interface PlanCommandOptions {
  readonly validate?: boolean;
  readonly timing?: boolean;
  readonly json?: boolean;
  readonly color?: boolean;
}

/**
 * Create the `webreel plan` subcommand.
 *
 * @returns A configured Commander command for script analysis.
 */
export function createPlanCommand(): Command {
  const cmd = new Command("plan")
    .description("Analyze a Demo Markdown script and show the execution plan")
    .argument("<script>", "Path to Demo Markdown file (.md)")
    .option("--validate", "Run pre-flight checks (binary availability, URL reachability)")
    .option("--timing", "Show per-scene duration estimates")
    .option("--json", "Output plan as JSON for programmatic use")
    .option("--no-color", "Disable colored output")
    .action(async (scriptPath: string, opts: PlanCommandOptions) => {
      const resolvedScript = resolve(scriptPath);

      try {
        const scriptContent = await readFile(resolvedScript, "utf-8");
        const script = parse(scriptContent);
        const plan = generatePlan(script);

        if (opts.json) {
          console.log(JSON.stringify(plan, null, 2));
          return;
        }

        const output = formatPlan(plan, {
          showTiming: opts.timing,
          showValidation: opts.validate,
          color: opts.color ?? true,
        });
        console.log(output);

        if (opts.validate) {
          const validation = await validatePrerequisites(plan);
          const validationOutput = formatValidation(validation);
          console.log(validationOutput);

          if (!validation.passed) {
            process.exit(1);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
        console.error(`\n  ${red("error")} Plan failed: ${message}\n`);
        if (err instanceof Error && err.stack) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    });

  return cmd;
}
