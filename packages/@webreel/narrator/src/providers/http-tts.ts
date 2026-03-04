/**
 * Generic HTTP TTS provider implementation.
 *
 * Connects to any local or remote TTS server that exposes a REST API.
 * Supports configurable endpoints, audio formats, and voice discovery.
 * Useful for LFM2.5-Audio, custom models, or any HTTP-accessible TTS server.
 */

import { TTSGenerationError, TTSInitializationError } from "../errors.js";
import type { TTSOptions, TTSProvider, TTSResult } from "../types.js";
import { pcmToWav, wavDurationMs } from "./wav-utils.js";

/** Default TTS endpoint path. */
const DEFAULT_TTS_ENDPOINT = "/api/tts";

/** Default voices endpoint path. */
const DEFAULT_VOICES_ENDPOINT = "/api/voices";

/** Default audio format. */
const DEFAULT_AUDIO_FORMAT = "wav" as const;

/** Default sample rate for PCM audio in Hz. */
const DEFAULT_SAMPLE_RATE = 24000;

/** Default bit depth for PCM conversion. */
const DEFAULT_BIT_DEPTH = 16;

/** Default number of audio channels (mono). */
const DEFAULT_CHANNELS = 1;

/** Timeout for HTTP requests in milliseconds (30 seconds). */
const HTTP_TIMEOUT_MS = 30_000;

/** Configuration for the HTTP TTS provider. */
export interface HttpTTSProviderConfig {
  /** Base URL of the TTS server (e.g., "http://localhost:5000"). */
  readonly baseURL: string;
  /** Custom provider name. Defaults to "http-tts". */
  readonly name?: string;
  /** Endpoint path for voice listing. Defaults to "/api/voices". */
  readonly voicesEndpoint?: string;
  /** Endpoint path for TTS generation. Defaults to "/api/tts". */
  readonly ttsEndpoint?: string;
  /** Audio format returned by the server. Defaults to "wav". */
  readonly audioFormat?: "wav" | "pcm";
  /** Sample rate for PCM audio in Hz. Defaults to 24000. */
  readonly sampleRate?: number;
  /** Default voice to use if none specified in options. */
  readonly defaultVoice?: string;
  /** Static list of voices (skips server voice endpoint). */
  readonly staticVoices?: readonly string[];
}

/**
 * Generic HTTP TTS provider.
 *
 * Implements the TTSProvider interface for any TTS server that exposes
 * a REST API. Configurable endpoints, audio formats, and voice discovery
 * make this provider adaptable to many different server implementations.
 *
 * @example
 * ```ts
 * const provider = new HttpTTSProvider({
 *   baseURL: "http://localhost:5000",
 *   audioFormat: "pcm",
 *   sampleRate: 22050,
 * });
 * await provider.initialize();
 * const result = await provider.generate("Hello", { voice: "default", speed: 1.0 });
 * ```
 */
export class HttpTTSProvider implements TTSProvider {
  readonly name: string;

  private initialized = false;
  private readonly baseURL: string;
  private readonly ttsEndpoint: string;
  private readonly voicesEndpoint: string;
  private readonly audioFormat: "wav" | "pcm";
  private readonly sampleRate: number;
  private readonly defaultVoice: string | undefined;
  private readonly staticVoices: readonly string[] | undefined;

  constructor(config: HttpTTSProviderConfig) {
    this.name = config.name ?? "http-tts";
    this.baseURL = config.baseURL.replace(/\/+$/, "");
    this.ttsEndpoint = config.ttsEndpoint ?? DEFAULT_TTS_ENDPOINT;
    this.voicesEndpoint = config.voicesEndpoint ?? DEFAULT_VOICES_ENDPOINT;
    this.audioFormat = config.audioFormat ?? DEFAULT_AUDIO_FORMAT;
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.defaultVoice = config.defaultVoice;
    this.staticVoices = config.staticVoices;
  }

  /**
   * Initialize the HTTP TTS provider.
   * Performs a health check by fetching the server's base URL or health endpoint.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const healthURL = `${this.baseURL}/api/health`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

      try {
        const response = await fetch(healthURL, {
          method: "GET",
          signal: controller.signal,
        });

        // Accept any 2xx or 404 (health endpoint might not exist)
        if (!response.ok && response.status !== 404) {
          throw new Error(
            `Server health check returned ${response.status}: ${response.statusText}`,
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof TTSInitializationError) {
        throw error;
      }
      throw new TTSInitializationError(
        this.name,
        `Cannot reach TTS server at "${this.baseURL}". Ensure the server is running.`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    this.initialized = true;
  }

  /**
   * Generate speech audio from text using the HTTP TTS server.
   *
   * @param text - Input text to synthesize.
   * @param options - Voice and speed configuration.
   * @returns WAV audio buffer with measured duration.
   */
  async generate(text: string, options: TTSOptions): Promise<TTSResult> {
    this.ensureInitialized();

    const url = `${this.baseURL}${this.ttsEndpoint}`;
    const voice = options.voice || this.defaultVoice || "default";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`TTS server returned ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      let audio: Buffer = Buffer.from(arrayBuffer);

      // Convert PCM to WAV if needed
      if (this.audioFormat === "pcm") {
        audio = pcmToWav(audio, this.sampleRate, DEFAULT_CHANNELS, DEFAULT_BIT_DEPTH);
      }

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
   * List available voices from the TTS server.
   * Returns static voices if configured, otherwise queries the server's voice endpoint.
   */
  async voices(): Promise<readonly string[]> {
    if (this.staticVoices) {
      return this.staticVoices;
    }

    const url = `${this.baseURL}${this.voicesEndpoint}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return [];
      }

      const data: unknown = await response.json();
      if (Array.isArray(data)) {
        return data.filter((v): v is string => typeof v === "string");
      }
      return [];
    } catch {
      return [];
    }
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
