import { describe, it, expect, vi, afterEach } from "vitest";

import { TTSInitializationError } from "../errors.js";
import { HttpTTSProvider } from "../providers/http-tts.js";

describe("HttpTTSProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has correct name (default and custom)", () => {
    const defaultProvider = new HttpTTSProvider({
      baseURL: "http://localhost:5000",
    });
    expect(defaultProvider.name).toBe("http-tts");

    const customProvider = new HttpTTSProvider({
      baseURL: "http://localhost:5000",
      name: "my-tts-server",
    });
    expect(customProvider.name).toBe("my-tts-server");
  });

  it("voices() returns staticVoices if configured", async () => {
    const provider = new HttpTTSProvider({
      baseURL: "http://localhost:5000",
      staticVoices: ["voice-a", "voice-b", "voice-c"],
    });

    const voices = await provider.voices();
    expect(voices).toEqual(["voice-a", "voice-b", "voice-c"]);
  });

  it("initialize() throws TTSInitializationError if server unreachable", async () => {
    const provider = new HttpTTSProvider({
      baseURL: "http://localhost:19999",
    });

    await expect(provider.initialize()).rejects.toThrow(TTSInitializationError);
    await expect(provider.initialize()).rejects.toThrow(/Cannot reach TTS server/);
  });

  it("generate() throws TTSInitializationError if not initialized", async () => {
    const provider = new HttpTTSProvider({
      baseURL: "http://localhost:5000",
    });

    await expect(
      provider.generate("Hello", { voice: "default", speed: 1.0 }),
    ).rejects.toThrow(TTSInitializationError);
  });
});
