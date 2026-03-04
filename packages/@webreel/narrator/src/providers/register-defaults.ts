/**
 * Default TTS provider registration.
 *
 * Registers all built-in TTS providers with a TTSProviderRegistry instance.
 * Called during narration engine initialization to make the standard
 * providers (kokoro, openai-tts, elevenlabs, piper) available.
 */

import type { TTSProviderRegistry } from "../registry.js";
import {
  createElevenLabsProvider,
  createKokoroProvider,
  createOpenAITTSProvider,
  createPiperProvider,
} from "./factories.js";

/**
 * Register all built-in TTS providers with the given registry.
 *
 * Registers: kokoro, openai-tts, elevenlabs, piper.
 * Each provider uses default configuration (env vars for API keys,
 * default model paths). Custom configuration can be applied by
 * registering providers manually.
 *
 * @param registry - The TTSProviderRegistry to register providers with.
 */
export function registerDefaultTTSProviders(registry: TTSProviderRegistry): void {
  registry.register("kokoro", createKokoroProvider());
  registry.register("openai-tts", createOpenAITTSProvider());
  registry.register("elevenlabs", createElevenLabsProvider());
  registry.register("piper", createPiperProvider());
}
