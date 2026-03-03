/**
 * Plan Formatter — renders ExecutionPlan and ValidationResult to terminal output.
 *
 * Produces human-readable, optionally colorized output showing the render plan
 * with timing estimates, prerequisites, and risk analysis.
 */

import type { ExecutionPlan, ActPlan, ScenePlan, Risk } from "./plan-generator.js";
import type { ValidationResult, PreflightCheck } from "./plan-validator.js";

/** Options for plan formatting. */
export interface FormatOptions {
  /** Show per-scene timing breakdown. */
  readonly showTiming?: boolean;
  /** Show validation results inline. */
  readonly showValidation?: boolean;
  /** Enable ANSI color output. */
  readonly color?: boolean;
}

/** ANSI color helpers (no-op when colors are disabled). */
interface Colors {
  green(s: string): string;
  yellow(s: string): string;
  red(s: string): string;
  dim(s: string): string;
  bold(s: string): string;
  cyan(s: string): string;
}

function createColors(enabled: boolean): Colors {
  if (!enabled) {
    const identity = (s: string): string => s;
    return {
      green: identity,
      yellow: identity,
      red: identity,
      dim: identity,
      bold: identity,
      cyan: identity,
    };
  }
  return {
    green: (s: string): string => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string): string => `\x1b[33m${s}\x1b[0m`,
    red: (s: string): string => `\x1b[31m${s}\x1b[0m`,
    dim: (s: string): string => `\x1b[2m${s}\x1b[0m`,
    bold: (s: string): string => `\x1b[1m${s}\x1b[0m`,
    cyan: (s: string): string => `\x1b[36m${s}\x1b[0m`,
  };
}

/**
 * Format an ExecutionPlan for terminal display.
 *
 * @param plan - The execution plan to format.
 * @param options - Formatting options.
 * @returns Formatted string for console output.
 */
export function formatPlan(plan: ExecutionPlan, options?: FormatOptions): string {
  const color = options?.color ?? true;
  const showTiming = options?.showTiming ?? false;
  const c = createColors(color);
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push(`  ${c.bold("Plan:")} ${c.cyan(`"${plan.scriptTitle}"`)}`);
  lines.push(
    `   ${plan.totalActs} acts, ${plan.totalScenes} scenes | Est. duration: ${formatDuration(plan.estimatedDurationSec)}`,
  );
  lines.push("");

  // Prerequisites
  lines.push(`  ${c.bold("Prerequisites:")}`);
  for (const prereq of plan.prerequisites) {
    const icon = prereq.required ? c.dim("[required]") : c.dim("[optional]");
    lines.push(`   - ${prereq.name} ${icon}`);
  }
  lines.push("");

  // Acts and scenes
  for (const act of plan.acts) {
    lines.push(...formatAct(act, showTiming, c));
  }

  // Risks
  if (plan.risks.length > 0) {
    lines.push(`  ${c.bold("Risks:")}`);
    for (const risk of plan.risks) {
      lines.push(formatRisk(risk, c));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format validation results for terminal display.
 *
 * @param result - The validation result to format.
 * @returns Formatted string for console output.
 */
export function formatValidation(result: ValidationResult): string {
  const c = createColors(true);
  const lines: string[] = [];

  lines.push("");
  const statusLabel = result.passed ? c.green("PASSED") : c.red("FAILED");
  lines.push(`  ${c.bold("Pre-flight Checks:")} ${statusLabel}`);
  lines.push("");

  for (const check of result.checks) {
    lines.push(formatCheck(check, c));
  }

  lines.push("");
  return lines.join("\n");
}

/** Format a single act with its scenes. */
function formatAct(act: ActPlan, showTiming: boolean, c: Colors): string[] {
  const lines: string[] = [];
  const timingSuffix = showTiming
    ? ` ${c.dim(`(Est. ${formatDuration(act.estimatedDurationSec)})`)}`
    : "";
  lines.push(`  ${c.bold(`Act: ${act.name}`)}${timingSuffix}`);

  for (const scene of act.scenes) {
    lines.push(formatScene(scene, showTiming, c));
  }

  lines.push("");
  return lines;
}

/** Format a single scene line. */
function formatScene(scene: ScenePlan, showTiming: boolean, c: Colors): string {
  const parts: string[] = [];
  parts.push(`   Scene: ${c.cyan(`"${scene.name}"`)}`);
  parts.push(`[${scene.surfaceType}]`);
  parts.push(`${scene.actionCount} actions`);

  if (scene.narrationWordCount > 0) {
    parts.push(`${scene.narrationWordCount} words narration`);
  }

  if (showTiming) {
    parts.push(c.dim(`(~${formatDuration(scene.estimatedDurationSec)})`));
  }

  let line = `   ${parts[0]} ${parts.slice(1).join(", ")}`;

  // Annotations on the next line
  const annotations: string[] = [];
  if (scene.hasAnnotations) annotations.push("annotations");
  if (scene.hasDynamicRefs) annotations.push("dynamic refs");
  if (scene.transitions.in) annotations.push(`transition_in: ${scene.transitions.in}`);
  if (scene.transitions.out) annotations.push(`transition_out: ${scene.transitions.out}`);

  if (annotations.length > 0) {
    line += `\n     ${c.dim(annotations.join(" | "))}`;
  }

  return line;
}

/** Format a risk entry. */
function formatRisk(risk: Risk, c: Colors): string {
  const severityColor =
    risk.severity === "high" ? c.red : risk.severity === "medium" ? c.yellow : c.dim;
  return `   ${severityColor(`[${risk.severity}]`)} ${risk.description}\n     ${c.dim(`Mitigation: ${risk.mitigation}`)}`;
}

/** Format a single pre-flight check. */
function formatCheck(check: PreflightCheck, c: Colors): string {
  const icons: Record<PreflightCheck["status"], string> = {
    pass: c.green("PASS"),
    fail: c.red("FAIL"),
    warn: c.yellow("WARN"),
    skip: c.dim("SKIP"),
  };

  const timing = c.dim(`(${check.durationMs}ms)`);
  return `   ${icons[check.status]} ${check.name}: ${check.message} ${timing}`;
}

/** Format seconds into a human-readable duration string. */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
