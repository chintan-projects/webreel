/**
 * Pacing analysis for Demo Markdown scripts.
 *
 * Combines rule-based checks (narration word count, action density,
 * duration hints) with optional LLM-augmented analysis for deeper
 * narrative flow evaluation.
 */

import type {
  DemoScript,
  Scene,
  PacingReport,
  PacingIssue,
  LLMProvider,
  LLMOptions,
} from "../types.js";
import { loadPrompt } from "../prompts/prompt-loader.js";

/** Target narration speed in words per minute. */
const WORDS_PER_MINUTE = 150;

/** Threshold for narration exceeding duration hint (20% over). */
const NARRATION_OVER_THRESHOLD = 1.2;

/** Threshold for total duration exceeding script meta duration (30% over). */
const TOTAL_DURATION_OVER_THRESHOLD = 1.3;

/** Title-like surfaces excluded from action density checks. */
const TITLE_SURFACES = new Set(["title"]);

/**
 * Analyze pacing of a DemoScript using rule-based checks only.
 *
 * Checks include:
 * - Narration duration vs scene/act duration hints
 * - Dead air detection (narration without actions on non-title surfaces)
 * - Low action density on non-title scenes
 * - Total estimated duration vs script meta duration
 *
 * @param script - Parsed DemoScript IR to analyze.
 * @returns PacingReport with issues, pass/fail status, and duration estimates.
 */
export function analyzePacing(script: DemoScript): PacingReport {
  const issues: PacingIssue[] = [];
  const sceneDurations: Record<string, number> = {};

  for (const act of script.acts) {
    let actEstimate = 0;

    for (const scene of act.scenes) {
      const estimate = estimateSceneDuration(scene);
      sceneDurations[scene.name] = estimate;
      actEstimate += estimate;

      checkNarrationDuration(scene, estimate, act.name, issues);
      checkDeadAir(scene, act.name, issues);
      checkActionDensity(scene, act.name, issues);
    }

    checkActDuration(act.name, act.durationHint, actEstimate, issues);
  }

  const totalDurationEstimate = Object.values(sceneDurations).reduce(
    (sum, d) => sum + d,
    0,
  );

  checkTotalDuration(script.meta.duration, totalDurationEstimate, issues);

  const passed = !issues.some((i) => i.severity === "error");

  return { issues, passed, sceneDurations, totalDurationEstimate };
}

/**
 * Analyze pacing with both rule-based checks and LLM-augmented suggestions.
 *
 * Starts with rule-based analysis, then augments with LLM-generated
 * narrative flow and engagement insights. Falls back to rule-based
 * results only if the LLM call fails.
 *
 * @param provider - Initialized LLM provider instance.
 * @param script - Parsed DemoScript IR to analyze.
 * @param scriptMarkdown - Raw Markdown text of the script.
 * @param options - LLM generation options.
 * @returns PacingReport combining rule-based and LLM issues.
 */
export async function analyzePacingWithLLM(
  provider: LLMProvider,
  script: DemoScript,
  scriptMarkdown: string,
  options: LLMOptions,
): Promise<PacingReport> {
  const ruleReport = analyzePacing(script);

  let llmIssues: PacingIssue[] = [];
  try {
    const ruleIssuesText =
      ruleReport.issues.length > 0
        ? ruleReport.issues.map((i) => `- [${i.severity}] ${i.message}`).join("\n")
        : "No rule-based issues detected.";

    const systemPrompt = await loadPrompt("pacing-analysis", {
      script: scriptMarkdown,
      rule_issues: ruleIssuesText,
    });

    const result = await provider.generate("Analyze the pacing of this demo script.", {
      ...options,
      systemPrompt,
    });

    llmIssues = parseLLMPacingIssues(result.text);
  } catch {
    // LLM failure — return rule-based report only
  }

  const combinedIssues: readonly PacingIssue[] = [...ruleReport.issues, ...llmIssues];
  const passed = !combinedIssues.some((i) => i.severity === "error");

  return {
    issues: combinedIssues,
    passed,
    sceneDurations: ruleReport.sceneDurations,
    totalDurationEstimate: ruleReport.totalDurationEstimate,
  };
}

/**
 * Estimate scene duration in seconds based on narration word count.
 * Returns at least the duration hint if one is provided.
 */
function estimateSceneDuration(scene: Scene): number {
  const wordCount = scene.narration.reduce((sum, block) => {
    return sum + countWords(block.text);
  }, 0);

  const narrationDuration = (wordCount / WORDS_PER_MINUTE) * 60;

  // Add estimated action time (rough: 2s per action for non-pause actions)
  const actionTime = scene.actions.reduce((sum, action) => {
    if (action.type === "pause" || action.type === "wait") {
      const duration = action.params.duration;
      return sum + (typeof duration === "number" ? duration : 2);
    }
    return sum + 2;
  }, 0);

  const estimate = Math.max(narrationDuration, actionTime);
  return scene.durationHint ? Math.max(estimate, scene.durationHint) : estimate;
}

/** Count words in a string. */
function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Check if narration duration exceeds the scene's duration hint. */
function checkNarrationDuration(
  scene: Scene,
  estimatedDuration: number,
  actName: string,
  issues: PacingIssue[],
): void {
  if (!scene.durationHint) return;

  if (estimatedDuration > scene.durationHint * NARRATION_OVER_THRESHOLD) {
    issues.push({
      severity: "warning",
      message:
        `Scene "${scene.name}" estimated at ${Math.round(estimatedDuration)}s ` +
        `but duration hint is ${scene.durationHint}s (>${Math.round(NARRATION_OVER_THRESHOLD * 100 - 100)}% over).`,
      sceneName: scene.name,
      actName,
      suggestion: "Reduce narration or increase the duration hint.",
    });
  }
}

/** Check for dead air: narration without any actions on non-title surfaces. */
function checkDeadAir(scene: Scene, actName: string, issues: PacingIssue[]): void {
  if (TITLE_SURFACES.has(scene.surface.type)) return;

  if (scene.narration.length > 0 && scene.actions.length === 0) {
    issues.push({
      severity: "warning",
      message:
        `Scene "${scene.name}" has narration but no actions — ` +
        `this may result in dead air on a ${scene.surface.type} surface.`,
      sceneName: scene.name,
      actName,
      suggestion: "Add actions to accompany the narration, or use a title surface.",
    });
  }
}

/** Check for low action density on non-title scenes. */
function checkActionDensity(scene: Scene, actName: string, issues: PacingIssue[]): void {
  if (TITLE_SURFACES.has(scene.surface.type)) return;

  if (scene.actions.length < 1) {
    issues.push({
      severity: "info",
      message:
        `Scene "${scene.name}" has no action directives. ` +
        `Non-title scenes typically need at least one action.`,
      sceneName: scene.name,
      actName,
      suggestion: "Add at least one action directive to drive the scene visually.",
    });
  }
}

/** Check if act estimated duration exceeds its hint. */
function checkActDuration(
  actName: string,
  durationHint: number | undefined,
  estimatedDuration: number,
  issues: PacingIssue[],
): void {
  if (!durationHint) return;

  if (estimatedDuration > durationHint * NARRATION_OVER_THRESHOLD) {
    issues.push({
      severity: "warning",
      message:
        `Act "${actName}" estimated at ${Math.round(estimatedDuration)}s ` +
        `but duration hint is ${durationHint}s.`,
      actName,
      suggestion: "Trim scene content or increase the act duration hint.",
    });
  }
}

/** Check if total estimated duration exceeds the script's target duration. */
function checkTotalDuration(
  targetDuration: number | undefined,
  estimatedDuration: number,
  issues: PacingIssue[],
): void {
  if (!targetDuration) return;

  if (estimatedDuration > targetDuration * TOTAL_DURATION_OVER_THRESHOLD) {
    issues.push({
      severity: "error",
      message:
        `Total estimated duration (${Math.round(estimatedDuration)}s) exceeds ` +
        `target duration (${targetDuration}s) by more than 30%.`,
      suggestion: "Remove scenes, reduce narration, or increase the target duration.",
    });
  }
}

/**
 * Parse LLM output as a JSON array of PacingIssue objects.
 * Returns an empty array if parsing fails.
 */
function parseLLMPacingIssues(text: string): PacingIssue[] {
  try {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");
    const parsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      )
      .map((item) => ({
        severity: validateSeverity(item.severity),
        message: typeof item.message === "string" ? item.message : "Unknown issue",
        sceneName: typeof item.sceneName === "string" ? item.sceneName : undefined,
        actName: typeof item.actName === "string" ? item.actName : undefined,
        suggestion: typeof item.suggestion === "string" ? item.suggestion : undefined,
      }));
  } catch {
    return [];
  }
}

/** Validate and normalize a severity string. */
function validateSeverity(value: unknown): "error" | "warning" | "info" {
  if (value === "error" || value === "warning" || value === "info") {
    return value;
  }
  return "info";
}
