/**
 * Validation pass for the DemoScript IR.
 *
 * Checks structural correctness after parsing:
 * - Every scene has a surface type
 * - Every act has at least one scene
 * - Dynamic narration references have corresponding captures
 * - Surface types are recognized
 *
 * @throws {ValidationError} with collected issues if validation fails.
 */

import type { DemoScript, Scene, ActionDirective } from "./types.js";
import { ValidationError, type ValidationIssue } from "./errors.js";

/** Known built-in surface types. */
const KNOWN_SURFACE_TYPES = new Set([
  "browser",
  "terminal",
  "application",
  "desktop",
  "title",
  "composite",
]);

/**
 * Validate a parsed DemoScript IR.
 * @throws {ValidationError} if structural issues are found.
 */
export function validate(script: DemoScript): void {
  const issues: ValidationIssue[] = [];

  if (script.acts.length === 0) {
    issues.push({ severity: "error", message: "Script has no acts." });
  }

  for (const act of script.acts) {
    if (act.scenes.length === 0) {
      issues.push({
        severity: "error",
        message: `Act "${act.name}" has no scenes.`,
        path: act.name,
      });
    }

    for (const scene of act.scenes) {
      validateScene(scene, `${act.name} > ${scene.name}`, issues);
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new ValidationError(issues);
  }
}

function validateScene(scene: Scene, path: string, issues: ValidationIssue[]): void {
  // Every scene must have a surface type
  if (!scene.surface.type) {
    issues.push({
      severity: "error",
      message: `Scene "${scene.name}" has no surface type. Add a blockquote with "> surface: terminal" (or browser, title, etc.).`,
      path,
    });
  }

  // Warn if surface type is not recognized (may be a custom registered type)
  if (scene.surface.type && !KNOWN_SURFACE_TYPES.has(scene.surface.type)) {
    issues.push({
      severity: "warning",
      message: `Scene "${scene.name}" uses unknown surface type "${scene.surface.type}". Ensure it is registered in the SurfaceRegistry.`,
      path,
    });
  }

  // Check dynamic narration references have corresponding captures
  validateDynamicRefs(scene, path, issues);
}

/**
 * Check that every [read_output:name] in narration has a corresponding
 * capture specification in one of the scene's actions.
 */
function validateDynamicRefs(
  scene: Scene,
  path: string,
  issues: ValidationIssue[],
): void {
  const allRefs = new Set<string>();
  for (const block of scene.narration) {
    for (const ref of block.dynamicRefs) {
      allRefs.add(ref);
    }
  }

  if (allRefs.size === 0) return;

  const availableCaptures = collectCaptures(scene.actions);

  for (const ref of allRefs) {
    if (!availableCaptures.has(ref)) {
      issues.push({
        severity: "warning",
        message: `Dynamic reference [read_output:${ref}] in "${scene.name}" has no matching capture specification. Add a capture block to an action in this scene.`,
        path,
      });
    }
  }
}

function collectCaptures(actions: readonly ActionDirective[]): Set<string> {
  const names = new Set<string>();
  for (const action of actions) {
    if (action.captures) {
      for (const cap of action.captures) {
        names.add(cap.name);
      }
    }
  }
  return names;
}
