/**
 * Scene Hasher — deterministic content hashing for scene-level caching.
 *
 * Computes SHA-256 hashes of scene content to enable incremental re-rendering.
 * Only content that affects the rendered output is included in the hash:
 * surface config, narration text, and action directives. Scene position and
 * act name are excluded so that reordering scenes does not invalidate cache.
 */

import { createHash } from "node:crypto";
import type {
  DemoScript,
  Scene,
  ActionDirective,
  NarrationBlock,
  SceneSurfaceConfig,
} from "@webreel/director";

/** A scene whose content has changed relative to the cache. */
export interface ChangedScene {
  readonly sceneName: string;
  readonly actName: string;
  readonly reason: "new" | "modified" | "removed";
}

/**
 * Compute a deterministic SHA-256 hash for a scene's rendered content.
 *
 * Includes: surface config, narration text (with speed/dynamic refs),
 * action directives (type, params, captures), transitions, duration hint.
 * Excludes: act name, scene position (reordering is free).
 *
 * @param scene - The parsed scene IR node.
 * @returns A hex-encoded SHA-256 hash string.
 */
export function hashScene(scene: Scene): string {
  const hash = createHash("sha256");
  const content = serializeSceneContent(scene);
  hash.update(content);
  return hash.digest("hex");
}

/**
 * Compute a deterministic hash for the entire script structure.
 * Used for cache directory naming to isolate caches per script.
 *
 * @param script - The parsed DemoScript IR.
 * @returns A hex-encoded SHA-256 hash string.
 */
export function hashScript(script: DemoScript): string {
  const hash = createHash("sha256");
  const content = JSON.stringify({
    title: script.meta.title,
    viewport: script.meta.viewport,
    theme: script.meta.theme,
    output: script.meta.output,
  });
  hash.update(content);
  return hash.digest("hex");
}

/**
 * Compare current scene hashes against cached hashes to find changed scenes.
 *
 * Returns a list of scenes that need re-rendering along with the reason
 * (new, modified, or removed).
 *
 * @param script - The current parsed DemoScript IR.
 * @param cachedHashes - Map of scene name to cached content hash.
 * @returns Array of scenes that need re-rendering.
 */
export function detectChangedScenes(
  script: DemoScript,
  cachedHashes: Map<string, string>,
): readonly ChangedScene[] {
  const changes: ChangedScene[] = [];
  const currentSceneNames = new Set<string>();

  for (const act of script.acts) {
    for (const scene of act.scenes) {
      currentSceneNames.add(scene.name);
      const currentHash = hashScene(scene);
      const cachedHash = cachedHashes.get(scene.name);

      if (cachedHash === undefined) {
        changes.push({ sceneName: scene.name, actName: act.name, reason: "new" });
      } else if (cachedHash !== currentHash) {
        changes.push({ sceneName: scene.name, actName: act.name, reason: "modified" });
      }
    }
  }

  // Detect removed scenes
  for (const [sceneName] of cachedHashes) {
    if (!currentSceneNames.has(sceneName)) {
      changes.push({ sceneName, actName: "", reason: "removed" });
    }
  }

  return changes;
}

/**
 * Serialize scene content to a deterministic JSON string.
 * Keys are sorted to ensure consistent ordering regardless of parse order.
 */
function serializeSceneContent(scene: Scene): string {
  return stableStringify({
    surface: serializeSurface(scene.surface),
    narration: scene.narration.map(serializeNarration),
    actions: scene.actions.map(serializeAction),
    transitions: {
      in: scene.transitions.in
        ? { type: scene.transitions.in.type, durationMs: scene.transitions.in.durationMs }
        : null,
      out: scene.transitions.out
        ? {
            type: scene.transitions.out.type,
            durationMs: scene.transitions.out.durationMs,
          }
        : null,
    },
    durationHint: scene.durationHint ?? null,
  });
}

function serializeSurface(surface: SceneSurfaceConfig): {
  type: string;
  options: Record<string, unknown>;
} {
  return {
    type: surface.type,
    options: sortObject(surface.options),
  };
}

function serializeNarration(block: NarrationBlock): {
  text: string;
  dynamicRefs: readonly string[];
  speed: number | null;
} {
  return {
    text: block.text,
    dynamicRefs: [...block.dynamicRefs].sort(),
    speed: block.speed ?? null,
  };
}

function serializeAction(action: ActionDirective): {
  type: string;
  params: Record<string, unknown>;
  captures: unknown;
} {
  return {
    type: action.type,
    params: sortObject(action.params),
    captures: action.captures
      ? action.captures.map((c) => ({
          name: c.name,
          pattern: c.pattern,
          group: c.group ?? 0,
        }))
      : null,
  };
}

/**
 * JSON.stringify with sorted keys for deterministic output.
 * This ensures the same content always produces the same hash.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key: string, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return sortObject(val as Record<string, unknown>);
    }
    return val;
  });
}

/** Sort an object's keys alphabetically for deterministic serialization. */
function sortObject(obj: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}
