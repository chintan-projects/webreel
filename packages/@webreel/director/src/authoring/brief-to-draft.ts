/**
 * Brief-to-draft generation pipeline.
 *
 * Takes a Brief describing the desired demo and generates a complete
 * Demo Markdown script via an LLM provider.
 */

import type { LLMProvider, LLMOptions, Brief, GenerateResult } from "../types.js";
import { loadPrompt } from "../prompts/prompt-loader.js";
import { generateAndValidate } from "./generate-and-validate.js";

/**
 * Generate a Demo Markdown script from a brief description.
 *
 * Loads the demo-markdown-spec and brief-to-draft prompt templates,
 * formats the brief into a user prompt, and runs the self-healing
 * generate-and-validate pipeline.
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
  const systemPrompt = await loadPrompt("brief-to-draft", {
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

  return lines.join("\n");
}
