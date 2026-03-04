/**
 * Factory functions for all built-in TTS providers.
 *
 * Each factory returns a TTSProviderFactory (a function that creates
 * a new provider instance). Heavy SDK imports (openai, kokoro-js) happen
 * inside each provider's initialize() method, not in the factory.
 */

import type { TTSProviderFactory } from "../types.js";
import { ElevenLabsProvider } from "./elevenlabs.js";
import type { HttpTTSProviderConfig } from "./http-tts.js";
import { HttpTTSProvider } from "./http-tts.js";
import { KokoroProvider } from "./kokoro.js";
import { OpenAITTSProvider } from "./openai-tts.js";
import { PiperProvider } from "./piper.js";

/** Configuration for the OpenAI TTS provider factory. */
export interface OpenAITTSConfig {
  readonly apiKey?: string;
  readonly model?: string;
}

/** Configuration for the ElevenLabs TTS provider factory. */
export interface ElevenLabsConfig {
  readonly apiKey?: string;
  readonly modelId?: string;
}

/** Configuration for the Piper TTS provider factory. */
export interface PiperConfig {
  readonly modelPath?: string;
  readonly piperPath?: string;
}

/** Re-export HttpTTSProviderConfig as HttpTTSConfig for convenience. */
export type HttpTTSConfig = HttpTTSProviderConfig;

/**
 * Create a factory for the Kokoro local TTS provider.
 *
 * @param modelId - Optional Hugging Face model identifier. Defaults to Kokoro-82M-v1.0-ONNX.
 * @returns A TTSProviderFactory that creates KokoroProvider instances.
 */
export function createKokoroProvider(modelId?: string): TTSProviderFactory {
  return () => new KokoroProvider(modelId);
}

/**
 * Create a factory for the OpenAI TTS provider.
 *
 * @param config - Optional API key and model configuration.
 * @returns A TTSProviderFactory that creates OpenAITTSProvider instances.
 */
export function createOpenAITTSProvider(config?: OpenAITTSConfig): TTSProviderFactory {
  return () => new OpenAITTSProvider(config);
}

/**
 * Create a factory for the ElevenLabs TTS provider.
 *
 * @param config - Optional API key and model configuration.
 * @returns A TTSProviderFactory that creates ElevenLabsProvider instances.
 */
export function createElevenLabsProvider(config?: ElevenLabsConfig): TTSProviderFactory {
  return () => new ElevenLabsProvider(config);
}

/**
 * Create a factory for the Piper local TTS provider.
 *
 * @param config - Optional model path and binary path configuration.
 * @returns A TTSProviderFactory that creates PiperProvider instances.
 */
export function createPiperProvider(config?: PiperConfig): TTSProviderFactory {
  return () => new PiperProvider(config);
}

/**
 * Create a factory for the generic HTTP TTS provider.
 *
 * @param config - Server URL, endpoints, and format configuration (baseURL is required).
 * @returns A TTSProviderFactory that creates HttpTTSProvider instances.
 */
export function createHttpTTSProvider(config: HttpTTSConfig): TTSProviderFactory {
  return () => new HttpTTSProvider(config);
}
