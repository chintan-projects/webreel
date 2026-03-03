import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { TTSCache } from "../tts-cache.js";

describe("TTSCache", () => {
  describe("cache key generation", () => {
    it("cache key is deterministic (same input produces same key)", () => {
      const cache = new TTSCache("/tmp/test-cache", false);
      const key1 = cache.getCacheKey("hello world", "af_heart", 1.0);
      const key2 = cache.getCacheKey("hello world", "af_heart", 1.0);

      expect(key1).toBe(key2);
      expect(key1.length).toBe(64); // sha256 hex is 64 chars
    });

    it("different inputs produce different cache keys", () => {
      const cache = new TTSCache("/tmp/test-cache", false);
      const key1 = cache.getCacheKey("hello", "af_heart", 1.0);
      const key2 = cache.getCacheKey("world", "af_heart", 1.0);
      const key3 = cache.getCacheKey("hello", "en_us", 1.0);
      const key4 = cache.getCacheKey("hello", "af_heart", 1.5);

      expect(key1).not.toBe(key2); // different text
      expect(key1).not.toBe(key3); // different voice
      expect(key1).not.toBe(key4); // different speed
    });
  });

  describe("disabled cache", () => {
    it("get() returns undefined when cache is disabled", async () => {
      const cache = new TTSCache("/tmp/test-cache", false);
      const key = cache.getCacheKey("test", "voice", 1.0);
      const result = await cache.get(key);

      expect(result).toBeUndefined();
    });

    it("set() is a no-op when cache is disabled", async () => {
      const cache = new TTSCache("/tmp/test-cache", false);
      const key = cache.getCacheKey("test", "voice", 1.0);

      // Should not throw and should not write any files
      await cache.set(
        key,
        {
          audio: Buffer.from("fake audio"),
          durationMs: 1000,
        },
        { voice: "voice", speed: 1.0, text: "test" },
      );

      const result = await cache.get(key);
      expect(result).toBeUndefined();
    });

    it("has() returns false when cache is disabled", async () => {
      const cache = new TTSCache("/tmp/test-cache", false);
      const key = cache.getCacheKey("test", "voice", 1.0);

      expect(await cache.has(key)).toBe(false);
    });
  });

  describe("enabled cache with temp directory", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "tts-cache-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("round-trips a cached entry (set then get)", async () => {
      const cache = new TTSCache(tempDir, true);
      const key = cache.getCacheKey("hello world", "af_heart", 1.0);
      const audioData = Buffer.from("fake wav audio data");

      await cache.set(
        key,
        {
          audio: audioData,
          durationMs: 2500,
        },
        { voice: "af_heart", speed: 1.0, text: "hello world" },
      );

      const result = await cache.get(key);
      expect(result).toBeDefined();
      expect(result!.durationMs).toBe(2500);
      expect(result!.audio).toEqual(audioData);
    });

    it("has() returns true for existing entries", async () => {
      const cache = new TTSCache(tempDir, true);
      const key = cache.getCacheKey("test entry", "voice", 1.0);

      expect(await cache.has(key)).toBe(false);

      await cache.set(
        key,
        {
          audio: Buffer.from("audio"),
          durationMs: 100,
        },
        { voice: "voice", speed: 1.0, text: "test entry" },
      );

      expect(await cache.has(key)).toBe(true);
    });

    it("get() returns undefined for non-existent keys", async () => {
      const cache = new TTSCache(tempDir, true);
      const result = await cache.get("nonexistent-key-abc123");

      expect(result).toBeUndefined();
    });
  });
});
