/**
 * Scene Cache — manages per-scene cached artifacts for incremental re-rendering.
 *
 * Cache layout:
 *   ~/.webreel/cache/scenes/{script_hash}/{scene_name}/
 *     scene.mp4      — rendered scene segment
 *     scene.wav      — narration audio (optional)
 *     timeline.json  — narration timeline (optional)
 *     hash.txt       — scene content hash for invalidation
 *
 * Writes are atomic: data goes to a temp file first, then renamed into place.
 * This prevents partial writes from corrupting the cache on interruption.
 */

import { mkdir, readFile, writeFile, readdir, rm, rename, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

/** Configuration for the scene cache. */
export interface SceneCacheConfig {
  /** Base directory for scene cache storage. */
  readonly cacheDir: string;
  /** Whether caching is enabled. */
  readonly enabled: boolean;
}

/** A cached scene's output paths and metadata. */
export interface CachedScene {
  /** Absolute path to the cached video segment. */
  readonly videoPath: string;
  /** Absolute path to the cached audio file, if any. */
  readonly audioPath?: string;
  /** Absolute path to the cached timeline JSON, if any. */
  readonly timelinePath?: string;
  /** The content hash stored with this cached scene. */
  readonly hash: string;
}

/** Data to write into the scene cache. */
export interface SceneCacheData {
  /** Rendered video segment buffer. */
  readonly video: Buffer;
  /** Narration audio buffer (optional). */
  readonly audio?: Buffer;
  /** Narration timeline JSON string (optional). */
  readonly timeline?: string;
  /** Scene content hash for later invalidation checks. */
  readonly hash: string;
}

const DEFAULT_CACHE_DIR = join(homedir(), ".webreel", "cache", "scenes");

/**
 * Manages per-scene cached artifacts for incremental re-rendering.
 *
 * Each script gets a directory keyed by script hash. Within that directory,
 * each scene gets its own subdirectory keyed by scene name.
 */
export class SceneCache {
  private readonly cacheDir: string;
  private readonly enabled: boolean;

  constructor(config?: Partial<SceneCacheConfig>) {
    this.cacheDir = config?.cacheDir ?? DEFAULT_CACHE_DIR;
    this.enabled = config?.enabled ?? true;
  }

  /** Get the cache directory for a specific script. */
  getCacheDir(scriptHash: string): string {
    return join(this.cacheDir, scriptHash);
  }

  /**
   * Check if a scene has valid cached output matching the given hash.
   *
   * @param scriptHash - Hash of the script (for directory isolation).
   * @param sceneName - Name of the scene.
   * @param currentHash - Current content hash to compare against.
   * @returns True if cache hit with matching hash, false otherwise.
   */
  async has(
    scriptHash: string,
    sceneName: string,
    currentHash: string,
  ): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const sceneDir = this.scenePath(scriptHash, sceneName);
      const hashPath = join(sceneDir, "hash.txt");
      const videoPath = join(sceneDir, "scene.mp4");

      const [storedHash, videoStat] = await Promise.all([
        readFile(hashPath, "utf-8").catch(() => ""),
        stat(videoPath).catch(() => null),
      ]);

      return storedHash.trim() === currentHash && videoStat !== null;
    } catch {
      return false;
    }
  }

  /**
   * Read cached scene output.
   *
   * @param scriptHash - Hash of the script.
   * @param sceneName - Name of the scene.
   * @returns The cached scene data, or undefined if not cached.
   */
  async read(scriptHash: string, sceneName: string): Promise<CachedScene | undefined> {
    if (!this.enabled) return undefined;

    const sceneDir = this.scenePath(scriptHash, sceneName);

    try {
      const hashContent = await readFile(join(sceneDir, "hash.txt"), "utf-8");
      const videoPath = join(sceneDir, "scene.mp4");

      // Verify the video file exists
      await stat(videoPath);

      const audioPath = join(sceneDir, "scene.wav");
      const timelinePath = join(sceneDir, "timeline.json");

      const hasAudio = await stat(audioPath)
        .then(() => true)
        .catch(() => false);
      const hasTimeline = await stat(timelinePath)
        .then(() => true)
        .catch(() => false);

      return {
        videoPath,
        audioPath: hasAudio ? audioPath : undefined,
        timelinePath: hasTimeline ? timelinePath : undefined,
        hash: hashContent.trim(),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Write scene output to cache with atomic write semantics.
   *
   * Uses write-to-temp + rename to prevent partial writes from
   * corrupting the cache on interruption.
   *
   * @param scriptHash - Hash of the script.
   * @param sceneName - Name of the scene.
   * @param data - Scene data to cache.
   */
  async write(
    scriptHash: string,
    sceneName: string,
    data: SceneCacheData,
  ): Promise<void> {
    if (!this.enabled) return;

    const sceneDir = this.scenePath(scriptHash, sceneName);
    const tempDir = join(tmpdir(), `webreel-cache-${randomUUID()}`);

    try {
      await mkdir(tempDir, { recursive: true });

      // Write all files to temp directory first
      await writeFile(join(tempDir, "scene.mp4"), data.video);
      await writeFile(join(tempDir, "hash.txt"), data.hash);

      if (data.audio) {
        await writeFile(join(tempDir, "scene.wav"), data.audio);
      }
      if (data.timeline) {
        await writeFile(join(tempDir, "timeline.json"), data.timeline);
      }

      // Ensure parent directory exists
      await mkdir(dirname(sceneDir), { recursive: true });

      // Remove existing cache entry, then atomically move temp into place
      await rm(sceneDir, { recursive: true, force: true });
      await rename(tempDir, sceneDir);
    } catch {
      // Clean up temp directory on failure
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * List all cached scene hashes for a script.
   *
   * @param scriptHash - Hash of the script.
   * @returns Map of scene name to content hash.
   */
  async listHashes(scriptHash: string): Promise<Map<string, string>> {
    const hashes = new Map<string, string>();
    if (!this.enabled) return hashes;

    const scriptDir = this.getCacheDir(scriptHash);

    try {
      const entries = await readdir(scriptDir, { withFileTypes: true });

      const hashReads = entries
        .filter((e) => e.isDirectory())
        .map(async (entry) => {
          try {
            const hashContent = await readFile(
              join(scriptDir, entry.name, "hash.txt"),
              "utf-8",
            );
            hashes.set(entry.name, hashContent.trim());
          } catch {
            // Skip entries without valid hash files
          }
        });

      await Promise.all(hashReads);
    } catch {
      // Directory doesn't exist yet — return empty map
    }

    return hashes;
  }

  /**
   * Remove cached data for a specific scene.
   *
   * @param scriptHash - Hash of the script.
   * @param sceneName - Name of the scene to invalidate.
   */
  async invalidate(scriptHash: string, sceneName: string): Promise<void> {
    const sceneDir = this.scenePath(scriptHash, sceneName);
    await rm(sceneDir, { recursive: true, force: true });
  }

  /**
   * Remove all cached data for a script.
   *
   * @param scriptHash - Hash of the script.
   */
  async invalidateAll(scriptHash: string): Promise<void> {
    const scriptDir = this.getCacheDir(scriptHash);
    await rm(scriptDir, { recursive: true, force: true });
  }

  /** Build the path to a specific scene's cache directory. */
  private scenePath(scriptHash: string, sceneName: string): string {
    // Sanitize scene name for filesystem safety
    const safeName = sceneName.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.cacheDir, scriptHash, safeName);
  }
}
