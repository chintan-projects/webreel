/**
 * Post-render review pipeline.
 *
 * Analyzes a rendered demo using the original script and render metadata
 * to produce quality improvement suggestions via an LLM provider.
 */

import type {
  LLMProvider,
  LLMOptions,
  DemoScript,
  RenderMetadata,
  ReviewReport,
  ReviewSuggestion,
} from "../types.js";
import { loadPrompt } from "../prompts/prompt-loader.js";

/** Empty report returned on graceful failure. */
const EMPTY_REPORT: ReviewReport = {
  suggestions: [],
  summary: "Review could not be completed.",
  sceneNotes: {},
};

/**
 * Review a rendered demo video using the original script and render metadata.
 *
 * Sends the script and metadata to an LLM for quality analysis. Returns
 * actionable suggestions for improving the demo. Falls back to an empty
 * report on LLM or parse failure.
 *
 * @param provider - Initialized LLM provider instance.
 * @param script - The original DemoScript IR.
 * @param scriptMarkdown - Raw Markdown text of the script.
 * @param renderMetadata - Metadata about the rendered output.
 * @param options - LLM generation options.
 * @returns ReviewReport with suggestions, summary, and per-scene notes.
 */
export async function reviewRender(
  provider: LLMProvider,
  script: DemoScript,
  scriptMarkdown: string,
  renderMetadata: RenderMetadata,
  options: LLMOptions,
): Promise<ReviewReport> {
  try {
    const metadataText = formatRenderMetadata(renderMetadata);
    const systemPrompt = await loadPrompt("post-render-review", {
      script: scriptMarkdown,
      render_metadata: metadataText,
    });

    const result = await provider.generate(
      "Review the rendered demo and provide improvement suggestions.",
      { ...options, systemPrompt },
    );

    return parseReviewResponse(result.text);
  } catch {
    return EMPTY_REPORT;
  }
}

/**
 * Format render metadata into a human-readable string for the LLM prompt.
 */
function formatRenderMetadata(metadata: RenderMetadata): string {
  const lines: string[] = [
    `**Total Duration:** ${Math.round(metadata.totalDurationMs / 1000)}s`,
    `**Output:** ${metadata.outputPath}`,
    `**Scenes:**`,
  ];

  for (const scene of metadata.scenes) {
    lines.push(
      `- ${scene.sceneName} (Act: ${scene.actName}): ` +
        `${Math.round(scene.durationMs / 1000)}s, ` +
        `${scene.frameCount} frames, ${scene.actionCount} actions`,
    );
  }

  return lines.join("\n");
}

/**
 * Parse the LLM response into a ReviewReport.
 * Returns EMPTY_REPORT on malformed JSON.
 */
function parseReviewResponse(text: string): ReviewReport {
  try {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");
    const parsed: unknown = JSON.parse(cleaned);

    if (typeof parsed !== "object" || parsed === null) {
      return EMPTY_REPORT;
    }

    const obj = parsed as Record<string, unknown>;

    const suggestions = parseSuggestions(obj.suggestions);
    const summary =
      typeof obj.summary === "string" ? obj.summary : "No summary provided.";
    const sceneNotes = parseSceneNotes(obj.sceneNotes);

    return { suggestions, summary, sceneNotes };
  } catch {
    return EMPTY_REPORT;
  }
}

/** Parse suggestions array from raw JSON. */
function parseSuggestions(value: unknown): ReviewSuggestion[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      sceneName: typeof item.sceneName === "string" ? item.sceneName : "Unknown",
      message: typeof item.message === "string" ? item.message : "No description.",
      action: typeof item.action === "string" ? item.action : undefined,
      priority: validatePriority(item.priority),
    }));
}

/** Parse scene notes map from raw JSON. */
function parseSceneNotes(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === "string") {
      result[key] = val;
    }
  }
  return result;
}

/** Validate and normalize a priority string. */
function validatePriority(value: unknown): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}
