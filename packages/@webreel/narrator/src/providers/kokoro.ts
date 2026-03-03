/**
 * Kokoro TTS provider implementation.
 *
 * Uses kokoro-js (ONNX-based) for local TTS generation. The model is
 * downloaded lazily on first use via `KokoroTTS.from_pretrained()`.
 * All audio is returned as WAV buffers with measured duration.
 */

import { TTSGenerationError, TTSInitializationError } from "../errors.js";
import type { TTSOptions, TTSProvider, TTSResult } from "../types.js";

/** Default Kokoro model identifier on Hugging Face Hub. */
const DEFAULT_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

/** ONNX quantization format for model inference. */
const DEFAULT_DTYPE = "q8" as const;

/**
 * Known Kokoro voice identifiers.
 * This list is used as a static fallback when the model is not yet loaded.
 */
const KNOWN_VOICES: readonly string[] = [
  "af_heart",
  "af_alloy",
  "af_aoede",
  "af_bella",
  "af_jessica",
  "af_kore",
  "af_nicole",
  "af_nova",
  "af_river",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_echo",
  "am_eric",
  "am_fenrir",
  "am_liam",
  "am_michael",
  "am_onyx",
  "am_puck",
  "am_santa",
  "bf_emma",
  "bf_isabella",
  "bf_alice",
  "bf_lily",
  "bm_george",
  "bm_lewis",
  "bm_daniel",
  "bm_fable",
] as const;

/**
 * Lazy-imported kokoro-js module type.
 * We use dynamic import to avoid loading the heavy ONNX runtime
 * until TTS is actually needed.
 */
interface KokoroModule {
  KokoroTTS: {
    from_pretrained: (
      modelId: string,
      options: { dtype: string },
    ) => Promise<KokoroInstance>;
  };
}

/** Runtime KokoroTTS instance after model loading. */
interface KokoroInstance {
  generate: (
    text: string,
    options: { voice: string; speed?: number },
  ) => Promise<KokoroAudio>;
  voices: Readonly<Record<string, unknown>>;
}

/** Audio output from kokoro-js generate(). */
interface KokoroAudio {
  audio: Float32Array;
  sampling_rate: number;
  toWav: () => ArrayBuffer;
}

/**
 * Kokoro TTS provider.
 *
 * Implements the TTSProvider interface for local ONNX-based speech synthesis.
 * The model is downloaded from Hugging Face Hub on first initialization.
 *
 * @example
 * ```ts
 * const provider = new KokoroProvider();
 * await provider.initialize();
 * const result = await provider.generate("Hello world", { voice: "af_heart", speed: 1.0 });
 * ```
 */
export class KokoroProvider implements TTSProvider {
  readonly name = "kokoro";

  private instance: KokoroInstance | undefined;
  private readonly modelId: string;

  constructor(modelId: string = DEFAULT_MODEL_ID) {
    this.modelId = modelId;
  }

  /**
   * Initialize the Kokoro TTS model.
   * Downloads the model on first use via `KokoroTTS.from_pretrained()`.
   * Subsequent calls are no-ops if already initialized.
   */
  async initialize(): Promise<void> {
    if (this.instance) {
      return;
    }

    try {
      const kokoroModule = (await import("kokoro-js")) as KokoroModule;
      this.instance = await kokoroModule.KokoroTTS.from_pretrained(this.modelId, {
        dtype: DEFAULT_DTYPE,
      });
    } catch (error) {
      throw new TTSInitializationError(
        this.name,
        `Failed to load Kokoro model "${this.modelId}". ` +
          "Ensure you have network access for initial model download.",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Generate speech audio from text.
   *
   * @param text - Input text to synthesize.
   * @param options - Voice and speed configuration.
   * @returns WAV audio buffer with measured duration.
   */
  async generate(text: string, options: TTSOptions): Promise<TTSResult> {
    const instance = this.ensureInitialized();

    try {
      const audio = await instance.generate(text, {
        voice: options.voice,
        speed: options.speed,
      });

      const wavArrayBuffer = audio.toWav();
      const wavBuffer = Buffer.from(wavArrayBuffer);

      // Calculate duration from sample count and rate
      const durationMs = Math.round((audio.audio.length / audio.sampling_rate) * 1000);

      return { audio: wavBuffer, durationMs };
    } catch (error) {
      throw new TTSGenerationError(
        this.name,
        text,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * List available Kokoro voices.
   * Returns voice keys from the loaded model, falling back to the
   * static known voices list if the model is not yet initialized.
   */
  async voices(): Promise<readonly string[]> {
    if (this.instance) {
      return Object.keys(this.instance.voices);
    }
    return KNOWN_VOICES;
  }

  /**
   * Release model resources.
   * After disposal, the provider must be re-initialized before use.
   */
  async dispose(): Promise<void> {
    this.instance = undefined;
  }

  /**
   * Ensure the model is initialized, throwing if not.
   * This is a synchronous guard for methods that require the model.
   */
  private ensureInitialized(): KokoroInstance {
    if (!this.instance) {
      throw new TTSInitializationError(
        this.name,
        "Provider not initialized. Call initialize() before generate().",
      );
    }
    return this.instance;
  }
}
