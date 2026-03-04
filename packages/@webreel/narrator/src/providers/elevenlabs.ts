/**
 * ElevenLabs TTS provider implementation.
 *
 * Uses the ElevenLabs REST API directly via fetch() for cloud-based
 * speech synthesis. No SDK dependency required. All audio is returned
 * as WAV buffers with measured duration.
 */

import { TTSGenerationError, TTSInitializationError } from "../errors.js";
import type { TTSOptions, TTSProvider, TTSResult } from "../types.js";
import { wavDurationMs } from "./wav-utils.js";

/** ElevenLabs API base URL. */
const API_BASE = "https://api.elevenlabs.io/v1";

/** Default ElevenLabs model identifier. */
const DEFAULT_MODEL_ID = "eleven_monolingual_v1";

/**
 * Default ElevenLabs voice IDs.
 * Rachel, Domi, Bella, Elli, Callum, Josh.
 */
const DEFAULT_VOICES: readonly string[] = [
  "21m00Tcm4TlvDq8ikWAM",
  "AZnzlk1XvdvUeBnXmlld",
  "EXAVITQu4vr4xnSDxMaL",
  "ErXwobaYiN019PkySvjV",
  "MF3mGyEYCl7XYWbV9V6O",
  "TxGEqnHWrfWFTfGW9XjX",
] as const;

/** Configuration for the ElevenLabs TTS provider. */
export interface ElevenLabsProviderConfig {
  readonly apiKey?: string;
  readonly modelId?: string;
}

/**
 * ElevenLabs TTS provider.
 *
 * Implements the TTSProvider interface for cloud-based speech synthesis
 * via the ElevenLabs REST API. Uses raw fetch() with no SDK dependency.
 *
 * @example
 * ```ts
 * const provider = new ElevenLabsProvider({ apiKey: "sk_..." });
 * await provider.initialize();
 * const result = await provider.generate("Hello world", {
 *   voice: "21m00Tcm4TlvDq8ikWAM",
 *   speed: 1.0,
 * });
 * ```
 */
export class ElevenLabsProvider implements TTSProvider {
  readonly name = "elevenlabs";

  private initialized = false;
  private readonly apiKey: string | undefined;
  private readonly modelId: string;

  constructor(config?: ElevenLabsProviderConfig) {
    this.apiKey = config?.apiKey ?? process.env.ELEVENLABS_API_KEY;
    this.modelId = config?.modelId ?? DEFAULT_MODEL_ID;
  }

  /**
   * Initialize the ElevenLabs provider.
   * Validates that an API key is available. No network call is needed
   * since the ElevenLabs API uses per-request authentication.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.apiKey) {
      throw new TTSInitializationError(
        this.name,
        "No API key provided. Set ELEVENLABS_API_KEY environment variable or pass apiKey in config.",
      );
    }

    this.initialized = true;
  }

  /**
   * Generate speech audio from text using the ElevenLabs API.
   *
   * @param text - Input text to synthesize.
   * @param options - Voice ID and speed configuration.
   * @returns WAV audio buffer with measured duration.
   */
  async generate(text: string, options: TTSOptions): Promise<TTSResult> {
    this.ensureInitialized();

    const url = `${API_BASE}/text-to-speech/${options.voice}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey!,
          "Content-Type": "application/json",
          Accept: "audio/wav",
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `ElevenLabs API returned ${response.status}: ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const durationMs = wavDurationMs(audio);

      return { audio, durationMs };
    } catch (error) {
      if (error instanceof TTSGenerationError) {
        throw error;
      }
      throw new TTSGenerationError(
        this.name,
        text,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * List available ElevenLabs voice IDs.
   * Returns a static default list of well-known voice identifiers.
   */
  async voices(): Promise<readonly string[]> {
    return DEFAULT_VOICES;
  }

  /**
   * Release provider resources.
   * After disposal, the provider must be re-initialized before use.
   */
  async dispose(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Ensure the provider is initialized, throwing if not.
   * Synchronous guard for methods that require initialization.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new TTSInitializationError(
        this.name,
        "Provider not initialized. Call initialize() before generate().",
      );
    }
  }
}
