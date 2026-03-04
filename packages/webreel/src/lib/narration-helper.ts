/**
 * Narration helper — bridges script front matter config to the NarrationEngine.
 *
 * Provides factory functions for building NarratorConfig from ScriptMeta,
 * creating a NarrationEngine with graceful degradation (null if TTS unavailable),
 * and generating per-scene narration timelines.
 */

import type { ScriptMeta, Scene } from "@webreel/director";
import {
  NarrationEngine,
  TTSProviderRegistry,
  registerDefaultTTSProviders,
  resolveTTSProvider,
  DEFAULT_NARRATOR_CONFIG,
} from "@webreel/narrator";
import type { NarratorConfig, NarrationTimeline } from "@webreel/narrator";

/**
 * Build a NarratorConfig by merging defaults with script front matter.
 *
 * Merge priority: DEFAULT_NARRATOR_CONFIG ← script.meta.narrator ← script.meta.voice.
 *
 * @param meta - Script front matter metadata.
 * @returns Resolved NarratorConfig for the narration engine.
 */
export function buildNarratorConfig(meta: ScriptMeta): NarratorConfig {
  const narrator = (meta.narrator ?? {}) as Partial<NarratorConfig>;
  return {
    provider: narrator.provider ?? DEFAULT_NARRATOR_CONFIG.provider,
    voice: meta.voice ?? narrator.voice ?? DEFAULT_NARRATOR_CONFIG.voice,
    speed: narrator.speed ?? DEFAULT_NARRATOR_CONFIG.speed,
    interSegmentGapMs:
      narrator.interSegmentGapMs ?? DEFAULT_NARRATOR_CONFIG.interSegmentGapMs,
    cacheDir: narrator.cacheDir ?? DEFAULT_NARRATOR_CONFIG.cacheDir,
    cacheEnabled: narrator.cacheEnabled ?? DEFAULT_NARRATOR_CONFIG.cacheEnabled,
  };
}

/**
 * Create a NarrationEngine with all built-in TTS providers registered.
 *
 * Uses resolveTTSProvider() to auto-detect the best available provider
 * based on env vars (OPENAI_API_KEY, ELEVENLABS_API_KEY, etc.).
 *
 * Returns null if no TTS provider can be resolved — this is graceful
 * degradation, not an error. The video will be produced without audio.
 *
 * @param config - NarratorConfig with provider/voice preferences.
 * @returns NarrationEngine instance, or null if TTS unavailable.
 */
export function createNarrationEngine(config: NarratorConfig): NarrationEngine | null {
  try {
    const registry = new TTSProviderRegistry();
    registerDefaultTTSProviders(registry);

    const resolvedProvider = resolveTTSProvider(
      { provider: config.provider, voice: config.voice },
      registry,
    );

    const resolvedConfig: NarratorConfig = {
      ...config,
      provider: resolvedProvider,
    };

    return new NarrationEngine(registry, resolvedConfig);
  } catch {
    // No TTS provider available — graceful degradation
    return null;
  }
}

/**
 * Generate a narration timeline for a scene.
 *
 * Returns null if the engine is null (TTS unavailable) or the scene
 * has no narration blocks.
 *
 * @param engine - NarrationEngine instance (or null for no-TTS mode).
 * @param scene - Scene with narration blocks from the parsed script.
 * @returns NarrationTimeline with WAV segments, or null.
 */
export async function generateSceneNarration(
  engine: NarrationEngine | null,
  scene: Scene,
): Promise<NarrationTimeline | null> {
  if (!engine) return null;
  if (scene.narration.length === 0) return null;

  try {
    return await engine.generateTimeline(scene.narration);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[webreel] Narration generation failed for scene "${scene.name}": ${message}. ` +
        "Continuing without audio.",
    );
    return null;
  }
}
