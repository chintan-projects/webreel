/**
 * Execution Plan Generator — analyzes a DemoScript to produce a structured
 * plan with prerequisites, timing estimates, and risk analysis.
 *
 * Used by the `webreel plan` command to show what a render will do before
 * committing resources. Also serves as documentation for CI/CD pipelines.
 */

import type {
  DemoScript,
  Scene,
  Act,
  ActionDirective,
  NarrationBlock,
} from "@webreel/director";

/** The complete execution plan for a script render. */
export interface ExecutionPlan {
  readonly scriptTitle: string;
  readonly totalScenes: number;
  readonly totalActs: number;
  readonly estimatedDurationSec: number;
  readonly prerequisites: readonly Prerequisite[];
  readonly acts: readonly ActPlan[];
  readonly risks: readonly Risk[];
}

/** Plan for a single act. */
export interface ActPlan {
  readonly name: string;
  readonly scenes: readonly ScenePlan[];
  readonly estimatedDurationSec: number;
}

/** Plan for a single scene within an act. */
export interface ScenePlan {
  readonly name: string;
  readonly surfaceType: string;
  readonly actionCount: number;
  readonly narrationWordCount: number;
  readonly estimatedDurationSec: number;
  readonly hasAnnotations: boolean;
  readonly hasDynamicRefs: boolean;
  readonly transitions: { readonly in?: string; readonly out?: string };
}

/** A prerequisite binary, URL, app, or env var required for rendering. */
export interface Prerequisite {
  readonly name: string;
  readonly type: "binary" | "url" | "app" | "env";
  readonly value: string;
  readonly required: boolean;
}

/** A potential risk identified during plan analysis. */
export interface Risk {
  readonly severity: "low" | "medium" | "high";
  readonly description: string;
  readonly mitigation: string;
}

/** Words per minute for narration duration estimation. */
const NARRATION_WPM = 150;

/** Minimum scene duration in seconds (even with no narration). */
const MIN_SCENE_DURATION_SEC = 2;

/**
 * Generate an execution plan from a parsed DemoScript.
 *
 * Analyzes the script structure to extract prerequisites, estimate timing,
 * and identify potential risks before rendering begins.
 *
 * @param script - The parsed DemoScript IR.
 * @returns A structured execution plan.
 */
export function generatePlan(script: DemoScript): ExecutionPlan {
  const prerequisites = extractPrerequisites(script);
  const risks: Risk[] = [];
  const actPlans: ActPlan[] = [];

  for (const act of script.acts) {
    const scenePlans = act.scenes.map((scene) => buildScenePlan(scene));
    const actDuration = scenePlans.reduce((sum, s) => sum + s.estimatedDurationSec, 0);

    actPlans.push({
      name: act.name,
      scenes: scenePlans,
      estimatedDurationSec: actDuration,
    });

    // Collect risks per scene
    for (const scene of act.scenes) {
      risks.push(...identifySceneRisks(scene, act.name));
    }
  }

  const totalScenes = actPlans.reduce((sum, a) => sum + a.scenes.length, 0);
  const estimatedDurationSec = actPlans.reduce(
    (sum, a) => sum + a.estimatedDurationSec,
    0,
  );

  return {
    scriptTitle: script.meta.title,
    totalScenes,
    totalActs: actPlans.length,
    estimatedDurationSec,
    prerequisites,
    acts: actPlans,
    risks: deduplicateRisks(risks),
  };
}

/** Build a ScenePlan from a Scene IR node. */
function buildScenePlan(scene: Scene): ScenePlan {
  const narrationWordCount = countNarrationWords(scene.narration);
  const hasAnnotations = scene.actions.some((a) => a.type === "annotate");
  const hasDynamicRefs = scene.narration.some((n) => n.dynamicRefs.length > 0);

  const narrationDurationSec =
    narrationWordCount > 0 ? (narrationWordCount / NARRATION_WPM) * 60 : 0;
  const durationFromHint = scene.durationHint ?? 0;
  const estimatedDurationSec = Math.max(
    durationFromHint,
    narrationDurationSec,
    MIN_SCENE_DURATION_SEC,
  );

  return {
    name: scene.name,
    surfaceType: scene.surface.type,
    actionCount: scene.actions.length,
    narrationWordCount,
    estimatedDurationSec: Math.round(estimatedDurationSec * 10) / 10,
    hasAnnotations,
    hasDynamicRefs,
    transitions: {
      in: scene.transitions.in
        ? `${scene.transitions.in.type} ${scene.transitions.in.durationMs ?? 0}ms`
        : undefined,
      out: scene.transitions.out
        ? `${scene.transitions.out.type} ${scene.transitions.out.durationMs ?? 0}ms`
        : undefined,
    },
  };
}

/** Count total words across all narration blocks. */
function countNarrationWords(blocks: readonly NarrationBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    const words = block.text.trim().split(/\s+/);
    total += words[0] === "" ? 0 : words.length;
  }
  return total;
}

/** Extract all prerequisites from the script. */
function extractPrerequisites(script: DemoScript): Prerequisite[] {
  const prereqs: Prerequisite[] = [];
  const seenKeys = new Set<string>();

  const add = (prereq: Prerequisite): void => {
    const key = `${prereq.type}:${prereq.value}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      prereqs.push(prereq);
    }
  };

  // ffmpeg is always required
  add({ name: "ffmpeg", type: "binary", value: "ffmpeg", required: true });

  for (const act of script.acts) {
    for (const scene of act.scenes) {
      // Surface-specific prerequisites
      if (scene.surface.type === "browser") {
        add({
          name: "Google Chrome",
          type: "binary",
          value: "google-chrome",
          required: true,
        });
      }
      if (scene.surface.type === "terminal") {
        add({
          name: "node-pty",
          type: "binary",
          value: "node-pty",
          required: true,
        });
      }
      if (scene.surface.type === "application") {
        const appName = extractAppName(scene);
        if (appName) {
          add({ name: appName, type: "app", value: appName, required: true });
        }
      }

      // Navigate actions imply URLs
      for (const action of scene.actions) {
        const url = extractUrlFromAction(action);
        if (url) {
          add({ name: url, type: "url", value: url, required: false });
        }
      }
    }
  }

  return prereqs;
}

/** Extract application name from a scene's surface options. */
function extractAppName(scene: Scene): string | undefined {
  const opts = scene.surface.options;
  if (typeof opts.app === "string") return opts.app;
  if (typeof opts.application === "string") return opts.application;
  return undefined;
}

/** Extract URL from a navigate action. */
function extractUrlFromAction(action: ActionDirective): string | undefined {
  if (action.type === "navigate" && typeof action.params.url === "string") {
    return action.params.url;
  }
  return undefined;
}

/** Identify risks for a given scene. */
function identifySceneRisks(scene: Scene, actName: string): Risk[] {
  const risks: Risk[] = [];

  // Dynamic refs with no apparent capture source
  for (const narration of scene.narration) {
    for (const ref of narration.dynamicRefs) {
      const hasCaptureSource = scene.actions.some(
        (a) => a.captures?.some((c) => c.name === ref) ?? false,
      );
      if (!hasCaptureSource) {
        risks.push({
          severity: "medium",
          description: `Scene "${scene.name}" in "${actName}" has dynamic ref [read_output:${ref}] with no capture source in the same scene`,
          mitigation: "Ensure a capture is defined in a preceding action or scene",
        });
      }
    }
  }

  // External URLs might be unavailable
  for (const action of scene.actions) {
    const url = extractUrlFromAction(action);
    if (url && isExternalUrl(url)) {
      risks.push({
        severity: "low",
        description: `Scene "${scene.name}" navigates to external URL: ${url}`,
        mitigation: "Ensure the URL is accessible from the render environment",
      });
    }
  }

  // Unknown surface types
  const knownSurfaces = new Set([
    "browser",
    "terminal",
    "title",
    "application",
    "desktop",
    "composite",
  ]);
  if (!knownSurfaces.has(scene.surface.type)) {
    risks.push({
      severity: "high",
      description: `Scene "${scene.name}" uses unknown surface type: "${scene.surface.type}"`,
      mitigation: "Register a custom surface factory or use a built-in surface type",
    });
  }

  return risks;
}

/** Check if a URL is external (not localhost/file). */
function isExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

/** Remove duplicate risks with the same description. */
function deduplicateRisks(risks: Risk[]): Risk[] {
  const seen = new Set<string>();
  return risks.filter((risk) => {
    if (seen.has(risk.description)) return false;
    seen.add(risk.description);
    return true;
  });
}
