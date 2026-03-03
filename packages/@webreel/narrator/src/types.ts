/**
 * Narration engine types for TTS provider abstraction and timeline assembly.
 *
 * TTS providers implement the TTSProvider interface and are registered
 * via the TTSProviderRegistry. The narration engine generates timed audio
 * segments that the scene orchestrator uses for synchronization.
 */

/** Options for TTS generation. */
export interface TTSOptions {
  /** Voice identifier (provider-specific, e.g., "af_heart" for Kokoro). */
  readonly voice: string;
  /** Speech speed multiplier (1.0 = normal). */
  readonly speed: number;
  /** Output sample rate in Hz. */
  readonly sampleRate?: number;
}

/** Result of a single TTS generation call. */
export interface TTSResult {
  /** Raw audio data (WAV format for lossless internal processing). */
  readonly audio: Buffer;
  /** Measured duration of the generated audio in milliseconds. */
  readonly durationMs: number;
}

/**
 * TTS provider contract. Every provider (Kokoro, Piper, cloud APIs)
 * implements this interface.
 *
 * Adding a new TTS provider = implement this interface + register.
 * Zero changes to the narration engine.
 */
export interface TTSProvider {
  /** Provider identifier (e.g., "kokoro", "piper", "google-cloud"). */
  readonly name: string;

  /** Generate speech audio from text. */
  generate(text: string, options: TTSOptions): Promise<TTSResult>;

  /** List available voices for this provider. */
  voices(): Promise<readonly string[]>;

  /**
   * Initialize the provider (download models, warm up inference).
   * Called once before first generation.
   */
  initialize(): Promise<void>;

  /** Release provider resources (unload models, close connections). */
  dispose(): Promise<void>;
}

/** Factory function that creates a TTSProvider instance. */
export type TTSProviderFactory = () => TTSProvider;

/**
 * A single segment in the narration timeline.
 * Each segment corresponds to one TTS generation (sentence or phrase).
 */
export interface NarrationSegment {
  /** Raw audio data (WAV). */
  readonly audioBuffer: Buffer;
  /** Measured audio duration in milliseconds. */
  readonly durationMs: number;
  /** Original narration text (for subtitle generation). */
  readonly text: string;
  /** Absolute position in the scene timeline (ms from scene start). */
  readonly startOffsetMs: number;
  /** If true, the next action waits until this segment finishes playing. */
  readonly waitForNarration: boolean;
  /** Whether this segment was generated from a deferred dynamic reference. */
  readonly isDeferred: boolean;
}

/**
 * Complete narration timeline for a scene.
 * The scene orchestrator uses this to synchronize actions with audio.
 */
export interface NarrationTimeline {
  readonly segments: readonly NarrationSegment[];
  readonly totalDurationMs: number;
}

/**
 * Configuration for the narration engine.
 * Layered merge: package defaults → user config → front matter overrides.
 */
export interface NarratorConfig {
  /** TTS provider to use (must be registered). Defaults to "kokoro". */
  readonly provider: string;
  /** Default voice for TTS generation. */
  readonly voice: string;
  /** Default speech speed multiplier. */
  readonly speed: number;
  /** Gap between narration segments in milliseconds. */
  readonly interSegmentGapMs: number;
  /** Cache directory for generated audio. Defaults to ~/.webreel/cache/tts/. */
  readonly cacheDir: string;
  /** Whether to cache TTS output. */
  readonly cacheEnabled: boolean;
}

/** Default narration engine configuration. */
export const DEFAULT_NARRATOR_CONFIG: NarratorConfig = {
  provider: "kokoro",
  voice: "af_heart",
  speed: 1.0,
  interSegmentGapMs: 300,
  cacheDir: "~/.webreel/cache/tts",
  cacheEnabled: true,
};
