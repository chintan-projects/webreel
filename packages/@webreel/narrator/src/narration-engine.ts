/**
 * Main narration engine — orchestrates text preprocessing, TTS generation,
 * caching, and timeline assembly.
 *
 * Usage:
 * ```ts
 * const engine = new NarrationEngine(registry, config);
 * const timeline = await engine.generateTimeline(narrationBlocks);
 * // Later, after capturing dynamic values:
 * const resolved = await engine.resolveDeferred(timeline, { latency: "42ms" });
 * await engine.dispose();
 * ```
 */

import type { NarrationBlock } from "@webreel/director";

import { NarrationError, TTSGenerationError } from "./errors.js";
import type { TTSProviderRegistry } from "./registry.js";
import { preprocessNarration, type PreprocessedSegment } from "./text-preprocessor.js";
import { assembleTimeline, type GeneratedSegment } from "./timeline-assembler.js";
import { TTSCache } from "./tts-cache.js";
import type {
  NarrationTimeline,
  NarratorConfig,
  TTSProvider,
  TTSResult,
} from "./types.js";

/** Average speaking rate used for estimating deferred segment durations. */
const WORDS_PER_MINUTE = 150;

/**
 * Estimate audio duration from word count at average speaking rate.
 * Used for deferred segments where TTS cannot run yet.
 */
function estimateDurationMs(text: string): number {
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  return Math.round((wordCount / WORDS_PER_MINUTE) * 60 * 1000);
}

/**
 * Narration engine that coordinates text preprocessing, TTS generation,
 * disk caching, and timeline assembly into a single pipeline.
 *
 * The engine supports deferred segments containing [read_output:name]
 * references. These are estimated initially and resolved later when
 * the actual captured values are available.
 */
export class NarrationEngine {
  private readonly registry: TTSProviderRegistry;
  private readonly config: NarratorConfig;
  private readonly cache: TTSCache;
  private provider: TTSProvider | undefined;
  private initialized = false;

  constructor(registry: TTSProviderRegistry, config: NarratorConfig) {
    this.registry = registry;
    this.config = config;
    this.cache = new TTSCache(config.cacheDir, config.cacheEnabled);
  }

  /**
   * Generate a narration timeline from parsed narration blocks.
   *
   * 1. Preprocesses text into sentence-level segments.
   * 2. For non-deferred segments: checks cache, generates TTS, caches result.
   * 3. For deferred segments: estimates duration from word count.
   * 4. Assembles the final timeline with sequential offsets.
   *
   * @param blocks - Narration blocks from the parsed Demo Markdown scene.
   * @returns Complete narration timeline ready for scene orchestration.
   */
  async generateTimeline(blocks: readonly NarrationBlock[]): Promise<NarrationTimeline> {
    const preprocessed = preprocessNarration(blocks, this.config);
    const generated = await this.generateSegments(preprocessed);
    return assembleTimeline(generated, this.config);
  }

  /**
   * Resolve deferred segments in an existing timeline.
   *
   * Replaces [read_output:name] placeholders with actual captured values,
   * generates TTS for the resolved text, and recalculates timeline offsets.
   *
   * @param timeline - Timeline containing deferred segments.
   * @param values - Map of dynamic reference names to captured values.
   * @returns New timeline with deferred segments resolved and re-timed.
   */
  async resolveDeferred(
    timeline: NarrationTimeline,
    values: Readonly<Record<string, string>>,
  ): Promise<NarrationTimeline> {
    const resolvedSegments: GeneratedSegment[] = [];

    for (const segment of timeline.segments) {
      if (!segment.isDeferred) {
        resolvedSegments.push({
          audioBuffer: segment.audioBuffer,
          durationMs: segment.durationMs,
          text: segment.text,
          isDeferred: false,
          waitForNarration: segment.waitForNarration,
        });
        continue;
      }

      // Replace [read_output:name] placeholders with actual values
      let resolvedText = segment.text;
      for (const [name, value] of Object.entries(values)) {
        resolvedText = resolvedText.replace(
          new RegExp(`\\[read_output:${name}\\]`, "g"),
          value,
        );
      }

      const ttsResult = await this.generateTTS(resolvedText);
      resolvedSegments.push({
        audioBuffer: ttsResult.audio,
        durationMs: ttsResult.durationMs,
        text: resolvedText,
        isDeferred: false,
        waitForNarration: segment.waitForNarration,
      });
    }

    return assembleTimeline(resolvedSegments, this.config);
  }

  /**
   * Release TTS provider resources.
   * Should be called when the engine is no longer needed.
   */
  async dispose(): Promise<void> {
    if (this.provider) {
      await this.provider.dispose();
      this.provider = undefined;
      this.initialized = false;
    }
  }

  /**
   * Generate TTS audio for all preprocessed segments.
   * Handles cache lookups, pause segments, and deferred placeholders.
   */
  private async generateSegments(
    segments: readonly PreprocessedSegment[],
  ): Promise<GeneratedSegment[]> {
    const generated: GeneratedSegment[] = [];

    for (const segment of segments) {
      if (segment.isPause) {
        generated.push({
          audioBuffer: Buffer.alloc(0),
          durationMs: segment.pauseDurationMs ?? 0,
          text: "",
          isDeferred: false,
          waitForNarration: false,
        });
        continue;
      }

      if (segment.isDeferred) {
        generated.push({
          audioBuffer: Buffer.alloc(0),
          durationMs: estimateDurationMs(segment.text),
          text: segment.text,
          isDeferred: true,
          waitForNarration: segment.waitForNarration,
        });
        continue;
      }

      const ttsResult = await this.generateTTSCached(segment.text, segment.speed);
      generated.push({
        audioBuffer: ttsResult.audio,
        durationMs: ttsResult.durationMs,
        text: segment.text,
        isDeferred: false,
        waitForNarration: segment.waitForNarration,
      });
    }

    return generated;
  }

  /**
   * Generate TTS with cache lookup. Checks disk cache first,
   * falls back to provider generation, then caches the result.
   */
  private async generateTTSCached(text: string, speed?: number): Promise<TTSResult> {
    const voice = this.config.voice;
    const effectiveSpeed = speed ?? this.config.speed;
    const cacheKey = this.cache.getCacheKey(text, voice, effectiveSpeed);

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.generateTTS(text, speed);

    await this.cache.set(cacheKey, result, { voice, speed: effectiveSpeed, text });

    return result;
  }

  /**
   * Generate TTS audio via the configured provider.
   * Initializes the provider lazily on first call.
   */
  private async generateTTS(text: string, speed?: number): Promise<TTSResult> {
    const provider = await this.ensureProvider();
    const voice = this.config.voice;
    const effectiveSpeed = speed ?? this.config.speed;

    try {
      return await provider.generate(text, { voice, speed: effectiveSpeed });
    } catch (error) {
      if (error instanceof NarrationError) {
        throw error;
      }
      throw new TTSGenerationError(
        provider.name,
        text,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Ensure the TTS provider is created and initialized.
   * Lazy initialization: provider is created on first use.
   */
  private async ensureProvider(): Promise<TTSProvider> {
    if (this.provider && this.initialized) {
      return this.provider;
    }

    if (!this.provider) {
      this.provider = this.registry.create(this.config.provider);
    }

    await this.provider.initialize();
    this.initialized = true;

    return this.provider;
  }
}
