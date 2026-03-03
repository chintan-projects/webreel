/**
 * Prompt template loader with {{variable}} substitution.
 *
 * Resolution order:
 *   1. User override: ~/.webreel/prompts/{name}.md
 *   2. Bundled default: src/prompts/templates/{name}.md
 *
 * Templates are plain Markdown files with {{variable}} placeholders.
 * Unmatched placeholders are left as-is so callers can detect missing vars.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "templates");
const USER_PROMPTS_DIR = join(homedir(), ".webreel", "prompts");

/** Regex matching {{variableName}} placeholders (non-greedy). */
const VARIABLE_RE = /\{\{(\w+)\}\}/g;

/**
 * Load a prompt template by name, applying variable substitution.
 *
 * Looks for `~/.webreel/prompts/{name}.md` first (user override),
 * then falls back to the bundled `templates/{name}.md`.
 *
 * @param templateName - Template file name without extension (e.g., "brief-to-draft").
 * @param variables - Key-value pairs to substitute for {{key}} placeholders.
 * @returns The resolved template string.
 * @throws {Error} if the template file cannot be found in either location.
 */
export async function loadPrompt(
  templateName: string,
  variables: Readonly<Record<string, string>> = {},
): Promise<string> {
  const fileName = `${templateName}.md`;
  let template: string | undefined;

  // Try user override first
  try {
    template = await readFile(join(USER_PROMPTS_DIR, fileName), "utf-8");
  } catch {
    // User override not found — fall through to bundled
  }

  // Fall back to bundled template
  if (template === undefined) {
    try {
      template = await readFile(join(TEMPLATES_DIR, fileName), "utf-8");
    } catch {
      throw new Error(
        `Prompt template "${templateName}" not found in ${USER_PROMPTS_DIR} or ${TEMPLATES_DIR}.`,
      );
    }
  }

  return substituteVariables(template, variables);
}

/**
 * Replace `{{key}}` placeholders in a template string with values from the
 * provided variables map. Unmatched placeholders are left as-is.
 *
 * @param template - Raw template string containing {{key}} placeholders.
 * @param variables - Key-value map of substitutions.
 * @returns The template with matched placeholders replaced.
 */
export function substituteVariables(
  template: string,
  variables: Readonly<Record<string, string>>,
): string {
  return template.replace(VARIABLE_RE, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}
