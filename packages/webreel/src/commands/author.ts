/**
 * CLI command: `webreel author`
 *
 * LLM-powered authoring of Demo Markdown scripts. Supports three modes:
 * - Brief mode: Generate a script from a YAML brief file.
 * - Refine mode: Iteratively refine an existing script with feedback.
 * - Interactive mode: Prompt for brief fields, then generate.
 *
 * Delegates to @webreel/director's authoring pipeline for LLM calls.
 */

import { resolve, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Command } from "commander";
import type { LLMProvider, Brief, PacingReport } from "@webreel/director";

/** CLI option shape parsed by commander. */
interface AuthorCommandOptions {
  readonly brief?: string;
  readonly script?: string;
  readonly output?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly analyze?: boolean;
  readonly verbose?: boolean;
}

const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;

/**
 * Create the `webreel author` subcommand.
 *
 * @returns A configured Commander command for LLM-powered script authoring.
 */
export function createAuthorCommand(): Command {
  const cmd = new Command("author")
    .description(
      "Author a Demo Markdown script using LLM (from brief, refinement, or interactive)",
    )
    .option("--brief <path>", "Path to brief YAML file")
    .option("--script <path>", "Path to existing script to refine")
    .option("-o, --output <path>", "Output file path")
    .option("--provider <name>", "LLM provider override")
    .option("--model <name>", "Model override")
    .option("--analyze", "Run pacing analysis after generation")
    .option("--verbose", "Show detailed progress")
    .action(async (opts: AuthorCommandOptions) => {
      try {
        const {
          LLMProviderRegistry,
          registerDefaultProviders,
          resolveProvider,
          DEFAULT_DIRECTOR_CONFIG,
        } = await import("@webreel/director");

        const registry = new LLMProviderRegistry();
        registerDefaultProviders(registry);

        const config = {
          ...DEFAULT_DIRECTOR_CONFIG,
          ...(opts.provider ? { provider: opts.provider } : {}),
          ...(opts.model ? { model: opts.model } : {}),
        };

        const resolved = resolveProvider(config, registry);
        const provider = registry.create(resolved.providerName);

        if (opts.verbose) {
          console.log(
            `  ${dim("Provider:")} ${resolved.providerName} ${dim("Model:")} ${resolved.model}`,
          );
        }

        await provider.initialize();

        let outputMarkdown: string;
        let outputPath: string;

        try {
          if (opts.brief) {
            outputMarkdown = await handleBriefMode(provider, opts, resolved.model);
            const briefName = basename(opts.brief, ".yaml").replace(/\.yml$/, "");
            outputPath = opts.output ?? `${briefName}.generated.md`;
          } else if (opts.script) {
            const resolvedScript = resolve(opts.script);
            const scriptContent = await readFile(resolvedScript, "utf-8");
            outputMarkdown = await runRefinementLoop(
              provider,
              scriptContent,
              resolved.model,
              opts,
            );
            const scriptName = basename(opts.script, ".md");
            outputPath = opts.output ?? `${scriptName}.refined.md`;
          } else {
            outputMarkdown = await handleInteractiveMode(provider, opts, resolved.model);
            outputPath = opts.output ?? "script.generated.md";
          }

          if (opts.analyze) {
            const { analyzePacing, parse } = await import("@webreel/director");
            const script = parse(outputMarkdown);
            const report = analyzePacing(script);
            displayPacingReport(report);
          }

          const resolvedOutput = resolve(outputPath);
          await writeFile(resolvedOutput, outputMarkdown, "utf-8");
          console.log(`\n  ${green("done")} Written to ${dim(resolvedOutput)}\n`);
        } finally {
          await provider.dispose();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n  ${red("error")} Author failed: ${message}\n`);
        if (opts.verbose && err instanceof Error && err.stack) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    });

  return cmd;
}

/** Prompt the user interactively for brief fields. */
async function promptForBrief(): Promise<Brief> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log(`\n  ${cyan("Interactive Brief Builder")}\n`);

    const product = await rl.question(`  ${dim("Product/feature:")} `);
    const audience = await rl.question(`  ${dim("Target audience:")} `);
    const messagesRaw = await rl.question(`  ${dim("Key messages (comma-separated):")} `);
    const duration = await rl.question(`  ${dim("Target duration (e.g., 2 minutes):")} `);
    const tone = await rl.question(
      `  ${dim("Tone (technical/marketing/casual, optional):")} `,
    );
    const assets = await rl.question(`  ${dim("Available assets/repos (optional):")} `);

    const keyMessages = messagesRaw
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    return {
      product: product || "Demo Product",
      audience: audience || "Developers",
      keyMessages: keyMessages.length > 0 ? keyMessages : ["Product overview"],
      duration: duration || "2 minutes",
      tone: tone || undefined,
      assets: assets || undefined,
    };
  } finally {
    rl.close();
  }
}

/** Display a pacing report with color-coded severity. */
function displayPacingReport(report: PacingReport): void {
  const status = report.passed ? green("PASSED") : red("FAILED");
  console.log(`\n  ${cyan("Pacing Analysis")} ${status}`);
  console.log(
    `  ${dim("Estimated duration:")} ${report.totalDurationEstimate.toFixed(1)}s`,
  );

  for (const [scene, dur] of Object.entries(report.sceneDurations)) {
    console.log(`    ${dim(scene)}: ${dur.toFixed(1)}s`);
  }

  if (report.issues.length > 0) {
    console.log(`\n  ${dim("Issues:")}`);
    for (const issue of report.issues) {
      const color =
        issue.severity === "error" ? red : issue.severity === "warning" ? yellow : dim;
      const prefix = issue.sceneName ? `[${issue.sceneName}] ` : "";
      console.log(`    ${color(issue.severity)} ${prefix}${issue.message}`);
      if (issue.suggestion) {
        console.log(`      ${dim(`> ${issue.suggestion}`)}`);
      }
    }
  }
}

/** Run the refinement loop: display script, prompt for feedback, apply changes. */
async function runRefinementLoop(
  provider: LLMProvider,
  initialMarkdown: string,
  model: string,
  opts: AuthorCommandOptions,
): Promise<string> {
  const { refineScript } = await import("@webreel/director");
  const rl = createInterface({ input: stdin, output: stdout });
  let currentMarkdown = initialMarkdown;

  try {
    console.log(`\n  ${cyan("Refinement Mode")}`);
    console.log(
      `  ${dim("Enter feedback to refine the script. Type 'done' or 'quit' to finish.")}\n`,
    );

    const lines = currentMarkdown.split("\n");
    const preview = lines.slice(0, 15).join("\n");
    console.log(dim(preview));
    if (lines.length > 15) {
      console.log(dim(`  ... (${lines.length - 15} more lines)`));
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      const feedback = await rl.question(`\n  ${cyan("feedback>")} `);
      const trimmed = feedback.trim().toLowerCase();

      if (trimmed === "done" || trimmed === "quit" || trimmed === "exit") {
        break;
      }

      if (!trimmed) {
        console.log(`  ${dim("Empty feedback, skipping.")}`);
        continue;
      }

      if (opts.verbose) {
        console.log(`  ${dim("Refining...")}`);
      }

      const result = await refineScript(provider, currentMarkdown, feedback, { model });

      currentMarkdown = result.markdown;
      console.log(`  ${green("Refined")} (${result.attempts} attempt(s))`);

      if (result.diff) {
        console.log(`\n${dim(result.diff)}`);
      }
    }
  } finally {
    rl.close();
  }

  return currentMarkdown;
}

/** Handle brief mode: parse YAML brief, generate a draft script. */
async function handleBriefMode(
  provider: LLMProvider,
  opts: AuthorCommandOptions,
  model: string,
): Promise<string> {
  const { parse: parseYaml } = await import("yaml");
  const { generateDraft } = await import("@webreel/director");

  const briefPath = resolve(opts.brief!);
  const briefContent = await readFile(briefPath, "utf-8");
  const brief = parseYaml(briefContent) as Brief;

  if (opts.verbose) {
    console.log(`  ${dim("Brief:")} ${briefPath}`);
    console.log(`  ${dim("Product:")} ${brief.product}`);
    console.log(`  ${dim("Audience:")} ${brief.audience}`);
  }

  console.log(`  ${dim("Generating draft...")}`);
  const result = await generateDraft(provider, brief, { model });

  console.log(
    `  ${green("Generated")} (${result.attempts} attempt(s), ${result.script.acts.length} act(s))`,
  );

  return result.markdown;
}

/** Handle interactive mode: prompt for brief fields, then generate. */
async function handleInteractiveMode(
  provider: LLMProvider,
  opts: AuthorCommandOptions,
  model: string,
): Promise<string> {
  const { generateDraft } = await import("@webreel/director");

  const brief = await promptForBrief();

  if (opts.verbose) {
    console.log(`  ${dim("Product:")} ${brief.product}`);
    console.log(`  ${dim("Audience:")} ${brief.audience}`);
  }

  console.log(`\n  ${dim("Generating draft...")}`);
  const result = await generateDraft(provider, brief, { model });

  console.log(
    `  ${green("Generated")} (${result.attempts} attempt(s), ${result.script.acts.length} act(s))`,
  );

  return result.markdown;
}
