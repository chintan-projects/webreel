/**
 * TTS caching layer for narration audio.
 *
 * Caches generated audio on disk keyed by sha256(text + voice + speed)
 * to avoid redundant TTS calls. Each entry is stored as a WAV file
 * with a companion JSON metadata file containing the measured duration.
 *
 * When caching is disabled, all operations are no-ops.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { TTSResult } from "./types.js";

/** Metadata stored alongside each cached WAV file. */
interface CacheMetadata {
  readonly durationMs: number;
  readonly voice: string;
  readonly speed: number;
  readonly textLength: number;
  readonly createdAt: string;
}

/**
 * Disk-backed TTS audio cache.
 *
 * Cache files are stored as `{cacheDir}/{key}.wav` with a companion
 * `{key}.json` containing duration metadata. The cache directory is
 * created lazily on first write.
 */
export class TTSCache {
  private readonly cacheDir: string;
  private readonly enabled: boolean;
  private dirCreated = false;

  constructor(cacheDir: string, enabled: boolean) {
    this.cacheDir = cacheDir;
    this.enabled = enabled;
  }

  /**
   * Compute a deterministic cache key from TTS input parameters.
   * Uses sha256 to produce a fixed-length, filesystem-safe key.
   */
  getCacheKey(text: string, voice: string, speed: number): string {
    const input = JSON.stringify({ text, voice, speed });
    return createHash("sha256").update(input).digest("hex");
  }

  /**
   * Look up a cached TTS result by key.
   * Returns undefined if caching is disabled or the entry does not exist.
   */
  async get(key: string): Promise<TTSResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }

    const wavPath = join(this.cacheDir, `${key}.wav`);
    const metaPath = join(this.cacheDir, `${key}.json`);

    try {
      const [audio, metaRaw] = await Promise.all([
        readFile(wavPath),
        readFile(metaPath, "utf-8"),
      ]);
      const meta = JSON.parse(metaRaw) as CacheMetadata;
      return { audio, durationMs: meta.durationMs };
    } catch {
      return undefined;
    }
  }

  /**
   * Store a TTS result in the disk cache.
   * Creates the cache directory on first write if it does not exist.
   * No-op when caching is disabled.
   */
  async set(
    key: string,
    result: TTSResult,
    params: { voice: string; speed: number; text: string },
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.ensureDir();

    const wavPath = join(this.cacheDir, `${key}.wav`);
    const metaPath = join(this.cacheDir, `${key}.json`);

    const meta: CacheMetadata = {
      durationMs: result.durationMs,
      voice: params.voice,
      speed: params.speed,
      textLength: params.text.length,
      createdAt: new Date().toISOString(),
    };

    await Promise.all([
      writeFile(wavPath, result.audio),
      writeFile(metaPath, JSON.stringify(meta)),
    ]);
  }

  /**
   * Check whether a cache entry exists on disk.
   * Returns false when caching is disabled.
   */
  async has(key: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    const wavPath = join(this.cacheDir, `${key}.wav`);
    try {
      await stat(wavPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create the cache directory if it does not already exist.
   * Only runs once per TTSCache instance.
   */
  private async ensureDir(): Promise<void> {
    if (this.dirCreated) {
      return;
    }
    await mkdir(this.cacheDir, { recursive: true });
    this.dirCreated = true;
  }
}
