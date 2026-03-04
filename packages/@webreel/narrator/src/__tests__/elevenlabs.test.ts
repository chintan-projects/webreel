import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { TTSInitializationError } from "../errors.js";
import { ElevenLabsProvider } from "../providers/elevenlabs.js";

describe("ElevenLabsProvider", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ELEVENLABS_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ELEVENLABS_API_KEY = originalEnv;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  });

  it("has correct name", () => {
    const provider = new ElevenLabsProvider();
    expect(provider.name).toBe("elevenlabs");
  });

  it("voices() returns known voice IDs", async () => {
    const provider = new ElevenLabsProvider();
    const voices = await provider.voices();

    expect(voices).toContain("21m00Tcm4TlvDq8ikWAM"); // Rachel
    expect(voices).toContain("AZnzlk1XvdvUeBnXmlld"); // Domi
    expect(voices).toContain("EXAVITQu4vr4xnSDxMaL"); // Bella
    expect(voices).toHaveLength(6);
  });

  it("initialize() throws if no API key", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const provider = new ElevenLabsProvider();

    await expect(provider.initialize()).rejects.toThrow(TTSInitializationError);
    await expect(provider.initialize()).rejects.toThrow(/No API key provided/);
  });

  it("generate() throws TTSInitializationError if not initialized", async () => {
    const provider = new ElevenLabsProvider({ apiKey: "test-key" });

    await expect(
      provider.generate("Hello", { voice: "21m00Tcm4TlvDq8ikWAM", speed: 1.0 }),
    ).rejects.toThrow(TTSInitializationError);
  });
});
