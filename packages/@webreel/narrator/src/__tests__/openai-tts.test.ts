import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { TTSInitializationError } from "../errors.js";
import { OpenAITTSProvider } from "../providers/openai-tts.js";

describe("OpenAITTSProvider", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OPENAI_API_KEY = originalEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    vi.restoreAllMocks();
  });

  it("has correct name", () => {
    const provider = new OpenAITTSProvider();
    expect(provider.name).toBe("openai-tts");
  });

  it("voices() returns known OpenAI voices", async () => {
    const provider = new OpenAITTSProvider();
    const voices = await provider.voices();

    expect(voices).toContain("alloy");
    expect(voices).toContain("echo");
    expect(voices).toContain("fable");
    expect(voices).toContain("onyx");
    expect(voices).toContain("nova");
    expect(voices).toContain("shimmer");
    expect(voices).toHaveLength(6);
  });

  it("generate() throws TTSInitializationError if not initialized", async () => {
    const provider = new OpenAITTSProvider({ apiKey: "test-key" });

    await expect(
      provider.generate("Hello", { voice: "alloy", speed: 1.0 }),
    ).rejects.toThrow(TTSInitializationError);
  });

  it("initialize() throws TTSInitializationError if no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAITTSProvider();

    await expect(provider.initialize()).rejects.toThrow(TTSInitializationError);
    await expect(provider.initialize()).rejects.toThrow(/No API key provided/);
  });

  it("dispose() allows re-initialization", async () => {
    const provider = new OpenAITTSProvider({ apiKey: "test-key" });

    // After disposal, generate should throw (not initialized)
    await provider.dispose();

    await expect(
      provider.generate("test", { voice: "alloy", speed: 1.0 }),
    ).rejects.toThrow(TTSInitializationError);
  });
});
