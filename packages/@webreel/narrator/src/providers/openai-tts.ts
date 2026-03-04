/**
 * OpenAI TTS provider implementation.
 *
 * Uses the OpenAI API for cloud-based speech synthesis. The OpenAI SDK
 * is dynamically imported in initialize() to avoid loading it until needed.
 * All audio is returned as WAV buffers with measured duration.
 */

import { TTSGenerationError, TTSInitializationError } from "../errors.js";
import type { TTSOptions, TTSProvider, TTSResult } from "../types.js";
import { wavDurationMs } from "./wav-utils.js";

/** Default OpenAI TTS model. */
const DEFAULT_MODEL = "tts-1";

/** Available OpenAI TTS voices. */
const OPENAI_VOICES: readonly string[] = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

/** Configuration for the OpenAI TTS provider. */
export interface OpenAITTSProviderConfig {
  readonly apiKey?: string;
  readonly model?: string;
}

/**
 * Lazily-imported OpenAI client type.
 * The full openai SDK is imported dynamically in initialize() to keep
 * the module lightweight until TTS is actually needed.
 */
interface OpenAIClient {
  audio: {
    speech: {
      create: (params: {
        model: string;
        voice: string;
        input: string;
        response_format: string;
      }) => Promise<OpenAISpeechResponse>;
    };
  };
}

/** Response from OpenAI audio.speech.create(). */
interface OpenAISpeechResponse {
  arrayBuffer: () => Promise<ArrayBuffer>;
}

/**
 * OpenAI TTS provider.
 *
 * Implements the TTSProvider interface for cloud-based speech synthesis
 * via the OpenAI audio API (tts-1 / tts-1-hd models).
 *
 * @example
 * ```ts
 * const provider = new OpenAITTSProvider({ apiKey: "sk-..." });
 * await provider.initialize();
 * const result = await provider.generate("Hello world", { voice: "alloy", speed: 1.0 });
 * ```
 */
export class OpenAITTSProvider implements TTSProvider {
  readonly name = "openai-tts";

  private client: OpenAIClient | undefined;
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(config?: OpenAITTSProviderConfig) {
    this.apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = config?.model ?? DEFAULT_MODEL;
  }

  /**
   * Initialize the OpenAI TTS client.
   * Dynamically imports the openai SDK and creates a client instance.
   * Subsequent calls are no-ops if already initialized.
   */
  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.apiKey) {
      throw new TTSInitializationError(
        this.name,
        "No API key provided. Set OPENAI_API_KEY environment variable or pass apiKey in config.",
      );
    }

    try {
      const openaiModule = await import("openai");
      const OpenAI = openaiModule.default ?? openaiModule;
      this.client = new OpenAI({ apiKey: this.apiKey }) as OpenAIClient;
    } catch (error) {
      throw new TTSInitializationError(
        this.name,
        'Failed to import openai SDK. Ensure "openai" package is installed.',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Generate speech audio from text using the OpenAI API.
   *
   * @param text - Input text to synthesize.
   * @param options - Voice and speed configuration.
   * @returns WAV audio buffer with measured duration.
   */
  async generate(text: string, options: TTSOptions): Promise<TTSResult> {
    const client = this.ensureInitialized();

    try {
      const response = await client.audio.speech.create({
        model: this.model,
        voice: options.voice,
        input: text,
        response_format: "wav",
      });

      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const durationMs = wavDurationMs(audio);

      return { audio, durationMs };
    } catch (error) {
      throw new TTSGenerationError(
        this.name,
        text,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * List available OpenAI TTS voices.
   * Returns the static set of voices supported by the OpenAI API.
   */
  async voices(): Promise<readonly string[]> {
    return OPENAI_VOICES;
  }

  /**
   * Release client resources.
   * After disposal, the provider must be re-initialized before use.
   */
  async dispose(): Promise<void> {
    this.client = undefined;
  }

  /**
   * Ensure the client is initialized, throwing if not.
   * Synchronous guard for methods that require the OpenAI client.
   */
  private ensureInitialized(): OpenAIClient {
    if (!this.client) {
      throw new TTSInitializationError(
        this.name,
        "Provider not initialized. Call initialize() before generate().",
      );
    }
    return this.client;
  }
}
