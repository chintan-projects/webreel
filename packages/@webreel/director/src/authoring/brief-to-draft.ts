/**
 * Brief-to-draft generation pipeline.
 *
 * Takes a Brief describing the desired demo and generates a complete
 * Demo Markdown script via an LLM provider.
 *
 * When the Brief includes discovery context (appContext), uses a
 * discovery-aware system prompt and injects real selectors, routes,
 * and commands into the user prompt so the LLM generates executable scripts.
 */

import type {
  LLMProvider,
  LLMOptions,
  Brief,
  GenerateResult,
  BriefAppContext,
  BriefWebProbe,
  BriefProjectScan,
  BriefDiscoveredPage,
} from "../types.js";
import { loadPrompt } from "../prompts/prompt-loader.js";
import { generateAndValidate } from "./generate-and-validate.js";

/**
 * Generate a Demo Markdown script from a brief description.
 *
 * Loads the demo-markdown-spec and brief-to-draft prompt templates,
 * formats the brief into a user prompt, and runs the self-healing
 * generate-and-validate pipeline.
 *
 * When `brief.appContext` is present, uses the discovery-aware system
 * prompt that instructs the LLM to use only real selectors and commands.
 *
 * @param provider - Initialized LLM provider instance.
 * @param brief - Description of the demo to generate.
 * @param options - LLM generation options (model, temperature, maxTokens).
 * @returns Parsed DemoScript, raw Markdown, and attempt count.
 * @throws {LLMError} if generation fails after all retries.
 */
export async function generateDraft(
  provider: LLMProvider,
  brief: Brief,
  options: LLMOptions,
): Promise<GenerateResult> {
  const spec = await loadPrompt("demo-markdown-spec");

  // Use discovery-aware prompt when app context is available
  const templateName = brief.appContext ? "brief-to-draft-discovery" : "brief-to-draft";

  const systemPrompt = await loadPrompt(templateName, {
    demo_markdown_spec: spec,
  });

  const userPrompt = formatBrief(brief);

  const llmOptions: LLMOptions = {
    ...options,
    systemPrompt,
  };

  return generateAndValidate(provider, userPrompt, llmOptions);
}

/**
 * Format a Brief into a structured user prompt for the LLM.
 *
 * When appContext is present, appends a detailed discovery section
 * with site map, interactive elements, and start commands.
 */
function formatBrief(brief: Brief): string {
  const lines: string[] = [
    `## Demo Brief\n`,
    `**Product:** ${brief.product}`,
    `**Audience:** ${brief.audience}`,
    `**Target Duration:** ${brief.duration}`,
  ];

  if (brief.productUrl) {
    lines.push(`**Live URL:** ${brief.productUrl}`);
  }

  if (brief.tone) {
    lines.push(`**Tone:** ${brief.tone}`);
  }

  lines.push(`\n**Key Messages:**`);
  for (const message of brief.keyMessages) {
    lines.push(`- ${message}`);
  }

  if (brief.assets) {
    lines.push(`\n**Available Assets / Repos:**\n${brief.assets}`);
  }

  if (brief.productContext) {
    lines.push(
      `\n## Product Context (from README / docs)\n\nUse the following real product information to generate accurate commands, URLs, and setup steps. Do NOT hallucinate URLs or commands — use only what is documented here.\n\n${brief.productContext}`,
    );
  }

  // Append discovery context when available
  if (brief.appContext) {
    lines.push(formatAppContext(brief.appContext));
  }

  return lines.join("\n");
}

/**
 * Format discovery context into a structured prompt section.
 */
function formatAppContext(context: BriefAppContext): string {
  const sections: string[] = [
    "\n## App Discovery Context (GROUND TRUTH)\n",
    "The following data was extracted from the live application and project files.",
    "**You MUST use this data for selectors, URLs, and commands. Do NOT invent alternatives.**\n",
  ];

  if (context.projectScan) {
    sections.push(formatProjectScan(context.projectScan));
  }

  if (context.webProbe) {
    sections.push(formatWebProbe(context.webProbe));
  }

  return sections.join("\n");
}

function formatProjectScan(scan: BriefProjectScan): string {
  const lines: string[] = ["### Project Configuration\n"];

  if (scan.framework) {
    lines.push(`**Framework:** ${scan.framework}`);
  }

  if (scan.startCommands.length > 0) {
    lines.push("\n**Start Commands:**");
    for (const cmd of scan.startCommands) {
      lines.push(`- \`${cmd.command}\` (from ${cmd.source})`);
    }
  }

  if (scan.ports.length > 0) {
    lines.push("\n**Ports:**");
    for (const port of scan.ports) {
      lines.push(`- ${port.port} (from ${port.source})`);
    }
  }

  return lines.join("\n");
}

function formatWebProbe(probe: BriefWebProbe): string {
  const lines: string[] = [`\n### Live App Discovery (probed from ${probe.entryUrl})\n`];

  // Site map
  if (probe.siteMap.length > 0) {
    lines.push("**Site Map:**");
    for (const entry of probe.siteMap) {
      lines.push(`- ${entry.url} — "${entry.title}"`);
    }
  }

  // Per-page element inventory
  for (const page of probe.pages) {
    lines.push(formatDiscoveredPage(page));
  }

  return lines.join("\n");
}

function formatDiscoveredPage(page: BriefDiscoveredPage): string {
  const lines: string[] = [`\n**Page: ${page.title}** (${page.url})`];

  if (page.elements.length === 0) {
    lines.push("  No interactive elements found.");
    return lines.join("\n");
  }

  lines.push("Interactive elements:");
  for (const el of page.elements) {
    const name = el.name ? ` "${el.name}"` : "";
    lines.push(`  - [${el.role}]${name} → selector: \`${el.selector}\``);
    if (el.textContent && el.textContent !== el.name) {
      lines.push(`    text: "${truncate(el.textContent, 80)}"`);
    }
  }

  if (page.links.length > 0) {
    lines.push("Navigation links:");
    for (const link of page.links.slice(0, 10)) {
      lines.push(`  - "${link.text}" → ${link.href}`);
    }
  }

  return lines.join("\n");
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
