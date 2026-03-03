/**
 * Self-healing LLM generation pipeline.
 *
 * Generates Demo Markdown via an LLM provider, parses and validates the
 * output, and retries with error feedback on failure.
 */

import type { LLMProvider, LLMOptions, DemoScript, GenerateResult } from "../types.js";
import { LLMError } from "../errors.js";
import { parse } from "../parser.js";

/** Default maximum generation attempts before giving up. */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Generate a Demo Markdown script via an LLM, parse it, validate it,
 * and retry with error feedback if the output is invalid.
 *
 * @param provider - Initialized LLM provider instance.
 * @param prompt - User prompt describing what to generate.
 * @param options - LLM generation options (model, temperature, systemPrompt, etc.).
 * @param maxRetries - Maximum number of generation attempts (default: 3).
 * @returns Parsed DemoScript, raw Markdown, and attempt count.
 * @throws {LLMError} if all attempts fail.
 */
export async function generateAndValidate(
  provider: LLMProvider,
  prompt: string,
  options: LLMOptions,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<GenerateResult> {
  const errors: string[] = [];
  let currentPrompt = prompt;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await provider.generate(currentPrompt, options);
    const markdown = extractMarkdown(result.text);

    try {
      const script: DemoScript = parse(markdown);
      return { script, markdown, attempts: attempt };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Attempt ${attempt}: ${errorMessage}`);

      // Build retry prompt with error feedback
      currentPrompt = buildRetryPrompt(prompt, markdown, errorMessage);
    }
  }

  throw new LLMError(
    provider.name,
    `Failed to generate valid Demo Markdown after ${maxRetries} attempts.\n` +
      errors.join("\n"),
  );
}

/**
 * Extract Markdown content from LLM output, stripping code fences
 * if the LLM wrapped the output in ```markdown ... ``` blocks.
 *
 * @param text - Raw LLM output text.
 * @returns Clean Markdown string.
 */
export function extractMarkdown(text: string): string {
  const trimmed = text.trim();

  // Match ```markdown ... ``` or ``` ... ``` wrapping
  const fenceMatch = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i.exec(trimmed);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  return trimmed;
}

/**
 * Build a retry prompt that includes the original request, the failed output,
 * and the error message so the LLM can self-correct.
 */
function buildRetryPrompt(
  originalPrompt: string,
  failedMarkdown: string,
  errorMessage: string,
): string {
  return (
    `${originalPrompt}\n\n` +
    `## Previous Attempt (FAILED)\n\n` +
    `The following output was generated but failed validation:\n\n` +
    `\`\`\`markdown\n${failedMarkdown}\n\`\`\`\n\n` +
    `## Error\n\n${errorMessage}\n\n` +
    `Please fix the error and output a corrected Demo Markdown script.`
  );
}
