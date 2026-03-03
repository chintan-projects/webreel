/**
 * Script refinement pipeline.
 *
 * Takes an existing Demo Markdown script and feedback, then generates
 * a refined version via an LLM provider. Returns the updated script
 * along with a simple line-level diff.
 */

import type { LLMProvider, LLMOptions, RefinementResult } from "../types.js";
import { loadPrompt } from "../prompts/prompt-loader.js";
import { generateAndValidate } from "./generate-and-validate.js";

/**
 * Refine an existing Demo Markdown script based on feedback.
 *
 * Loads the script-refinement prompt template, substitutes the current
 * script and feedback, and runs the self-healing generate-and-validate
 * pipeline. Returns the updated script with a unified-style diff.
 *
 * @param provider - Initialized LLM provider instance.
 * @param currentMarkdown - The current Demo Markdown script text.
 * @param feedback - Human or automated feedback describing desired changes.
 * @param options - LLM generation options (model, temperature, maxTokens).
 * @returns Updated script IR, raw Markdown, diff, and attempt count.
 * @throws {LLMError} if generation fails after all retries.
 */
export async function refineScript(
  provider: LLMProvider,
  currentMarkdown: string,
  feedback: string,
  options: LLMOptions,
): Promise<RefinementResult> {
  const spec = await loadPrompt("demo-markdown-spec");
  const systemPrompt = await loadPrompt("script-refinement", {
    demo_markdown_spec: spec,
    current_script: currentMarkdown,
    feedback,
  });

  const userPrompt = `Apply the feedback to the current script and output the updated Demo Markdown.`;

  const llmOptions: LLMOptions = {
    ...options,
    systemPrompt,
  };

  const result = await generateAndValidate(provider, userPrompt, llmOptions);
  const diff = generateDiff(currentMarkdown, result.markdown);

  return {
    script: result.script,
    markdown: result.markdown,
    diff,
    attempts: result.attempts,
  };
}

/**
 * Generate a simple line-level diff between two strings.
 *
 * Uses `+` for added lines and `-` for removed lines.
 * Lines present in both are prefixed with a space.
 *
 * @param oldText - Original text.
 * @param newText - Updated text.
 * @returns Diff string with +/- markers.
 */
export function generateDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const output: string[] = [];

  // Track consumed old lines for ordering
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length) {
      if (oldLines[oldIdx] === newLines[newIdx]) {
        output.push(` ${oldLines[oldIdx]}`);
        oldIdx++;
        newIdx++;
      } else if (!newSet.has(oldLines[oldIdx])) {
        output.push(`-${oldLines[oldIdx]}`);
        oldIdx++;
      } else if (!oldSet.has(newLines[newIdx])) {
        output.push(`+${newLines[newIdx]}`);
        newIdx++;
      } else {
        // Both lines exist elsewhere — treat as removal then addition
        output.push(`-${oldLines[oldIdx]}`);
        oldIdx++;
      }
    } else if (oldIdx < oldLines.length) {
      output.push(`-${oldLines[oldIdx]}`);
      oldIdx++;
    } else {
      output.push(`+${newLines[newIdx]}`);
      newIdx++;
    }
  }

  return output.join("\n");
}
