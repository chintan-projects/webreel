/**
 * TTS provider resolution and auto-detection.
 *
 * Resolves the best TTS provider based on explicit configuration,
 * available environment variables, and registry contents. Priority:
 * explicit config > OPENAI_API_KEY > ELEVENLABS_API_KEY > PIPER_MODEL_PATH > kokoro > first available.
 */

import type { TTSProviderRegistry } from "../registry.js";

/** Configuration for provider resolution. */
export interface ResolveConfig {
  /** Explicitly requested provider name. */
  readonly provider?: string;
  /** Requested voice (currently unused in resolution, reserved for future voice-based routing). */
  readonly voice?: string;
}

/**
 * Resolve the best TTS provider name based on config and environment.
 *
 * Resolution priority:
 * 1. Explicit provider from config (if registered)
 * 2. Environment variable auto-detection (OPENAI_API_KEY, ELEVENLABS_API_KEY, PIPER_MODEL_PATH)
 * 3. Kokoro (default local provider)
 * 4. First registered provider
 *
 * @param config - Resolution configuration with optional explicit provider.
 * @param registry - The TTSProviderRegistry to check against.
 * @returns The resolved provider name.
 * @throws {Error} If no TTS providers are registered.
 */
export function resolveTTSProvider(
  config: ResolveConfig,
  registry: TTSProviderRegistry,
): string {
  // Explicit provider wins
  if (config.provider && registry.has(config.provider)) {
    return config.provider;
  }

  // Env var scan priority
  if (process.env.OPENAI_API_KEY && registry.has("openai-tts")) {
    return "openai-tts";
  }
  if (process.env.ELEVENLABS_API_KEY && registry.has("elevenlabs")) {
    return "elevenlabs";
  }
  if (process.env.PIPER_MODEL_PATH && registry.has("piper")) {
    return "piper";
  }

  // Default fallback
  if (registry.has("kokoro")) {
    return "kokoro";
  }

  // Return first available
  const available = registry.providers();
  if (available.length > 0) {
    return available[0]!;
  }

  throw new Error("No TTS providers registered. Register at least one provider.");
}
