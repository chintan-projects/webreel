import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SceneCache } from "../scene-cache.js";

let testCacheDir: string;

beforeEach(async () => {
  testCacheDir = await mkdtemp(join(tmpdir(), "webreel-cache-test-"));
});

afterEach(async () => {
  await rm(testCacheDir, { recursive: true, force: true });
});

function createCache(enabled = true): SceneCache {
  return new SceneCache({ cacheDir: testCacheDir, enabled });
}

describe("SceneCache", () => {
  describe("getCacheDir", () => {
    it("returns the correct path for a script hash", () => {
      const cache = createCache();
      const dir = cache.getCacheDir("abc123");
      expect(dir).toBe(join(testCacheDir, "abc123"));
    });
  });

  describe("write and read round-trip", () => {
    it("writes and reads back video data", async () => {
      const cache = createCache();
      const scriptHash = "test-script-hash";
      const sceneName = "test-scene";
      const videoData = Buffer.from("fake video content");

      await cache.write(scriptHash, sceneName, {
        video: videoData,
        hash: "scene-hash-123",
      });

      const cached = await cache.read(scriptHash, sceneName);
      expect(cached).toBeDefined();
      expect(cached!.hash).toBe("scene-hash-123");
      expect(cached!.videoPath).toContain("scene.mp4");

      const readData = await readFile(cached!.videoPath);
      expect(readData.toString()).toBe("fake video content");
    });

    it("writes and reads back audio and timeline", async () => {
      const cache = createCache();
      const scriptHash = "test-script";
      const sceneName = "with-audio";

      await cache.write(scriptHash, sceneName, {
        video: Buffer.from("video"),
        audio: Buffer.from("audio data"),
        timeline: '{"segments":[]}',
        hash: "hash-with-audio",
      });

      const cached = await cache.read(scriptHash, sceneName);
      expect(cached).toBeDefined();
      expect(cached!.audioPath).toBeDefined();
      expect(cached!.timelinePath).toBeDefined();

      const audioData = await readFile(cached!.audioPath!);
      expect(audioData.toString()).toBe("audio data");

      const timelineData = await readFile(cached!.timelinePath!);
      expect(timelineData.toString()).toBe('{"segments":[]}');
    });
  });

  describe("has", () => {
    it("returns true for valid cached scene with matching hash", async () => {
      const cache = createCache();
      const scriptHash = "has-test";
      const sceneName = "scene-one";

      await cache.write(scriptHash, sceneName, {
        video: Buffer.from("data"),
        hash: "correct-hash",
      });

      const result = await cache.has(scriptHash, sceneName, "correct-hash");
      expect(result).toBe(true);
    });

    it("returns false for hash mismatch", async () => {
      const cache = createCache();
      const scriptHash = "has-test";
      const sceneName = "scene-two";

      await cache.write(scriptHash, sceneName, {
        video: Buffer.from("data"),
        hash: "old-hash",
      });

      const result = await cache.has(scriptHash, sceneName, "new-hash");
      expect(result).toBe(false);
    });

    it("returns false for non-existent scene", async () => {
      const cache = createCache();
      const result = await cache.has("no-script", "no-scene", "any-hash");
      expect(result).toBe(false);
    });

    it("returns false when caching is disabled", async () => {
      const cache = createCache(false);
      const result = await cache.has("test", "scene", "hash");
      expect(result).toBe(false);
    });
  });

  describe("listHashes", () => {
    it("lists all cached scene hashes for a script", async () => {
      const cache = createCache();
      const scriptHash = "list-test";

      await cache.write(scriptHash, "scene-a", {
        video: Buffer.from("a"),
        hash: "hash-a",
      });
      await cache.write(scriptHash, "scene-b", {
        video: Buffer.from("b"),
        hash: "hash-b",
      });

      const hashes = await cache.listHashes(scriptHash);
      expect(hashes.size).toBe(2);
      expect(hashes.get("scene-a")).toBe("hash-a");
      expect(hashes.get("scene-b")).toBe("hash-b");
    });

    it("returns empty map for non-existent script", async () => {
      const cache = createCache();
      const hashes = await cache.listHashes("does-not-exist");
      expect(hashes.size).toBe(0);
    });

    it("returns empty map when disabled", async () => {
      const cache = createCache(false);
      const hashes = await cache.listHashes("any");
      expect(hashes.size).toBe(0);
    });
  });

  describe("invalidate", () => {
    it("removes a specific scene from cache", async () => {
      const cache = createCache();
      const scriptHash = "invalidate-test";

      await cache.write(scriptHash, "keep-this", {
        video: Buffer.from("keep"),
        hash: "keep-hash",
      });
      await cache.write(scriptHash, "remove-this", {
        video: Buffer.from("remove"),
        hash: "remove-hash",
      });

      await cache.invalidate(scriptHash, "remove-this");

      const hashes = await cache.listHashes(scriptHash);
      expect(hashes.size).toBe(1);
      expect(hashes.has("keep-this")).toBe(true);
      expect(hashes.has("remove-this")).toBe(false);
    });
  });

  describe("invalidateAll", () => {
    it("removes all cached data for a script", async () => {
      const cache = createCache();
      const scriptHash = "invalidate-all-test";

      await cache.write(scriptHash, "scene-1", {
        video: Buffer.from("1"),
        hash: "h1",
      });
      await cache.write(scriptHash, "scene-2", {
        video: Buffer.from("2"),
        hash: "h2",
      });

      await cache.invalidateAll(scriptHash);

      const hashes = await cache.listHashes(scriptHash);
      expect(hashes.size).toBe(0);
    });
  });

  describe("disabled cache", () => {
    it("write is a no-op when disabled", async () => {
      const cache = createCache(false);
      // Should not throw
      await cache.write("script", "scene", {
        video: Buffer.from("data"),
        hash: "hash",
      });

      const result = await cache.read("script", "scene");
      expect(result).toBeUndefined();
    });

    it("read returns undefined when disabled", async () => {
      const cache = createCache(false);
      const result = await cache.read("script", "scene");
      expect(result).toBeUndefined();
    });
  });

  describe("scene name sanitization", () => {
    it("handles scene names with special characters", async () => {
      const cache = createCache();
      const scriptHash = "sanitize-test";
      const sceneName = "My Scene: Part 1/2 (final)";

      await cache.write(scriptHash, sceneName, {
        video: Buffer.from("data"),
        hash: "hash-special",
      });

      const result = await cache.has(scriptHash, sceneName, "hash-special");
      expect(result).toBe(true);
    });
  });
});
