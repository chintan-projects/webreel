import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { registerDefaultTTSProviders } from "../providers/register-defaults.js";
import { resolveTTSProvider } from "../providers/resolve-provider.js";
import { TTSProviderRegistry } from "../registry.js";

describe("resolveTTSProvider", () => {
  let originalOpenAI: string | undefined;
  let originalElevenLabs: string | undefined;
  let originalPiper: string | undefined;

  beforeEach(() => {
    originalOpenAI = process.env.OPENAI_API_KEY;
    originalElevenLabs = process.env.ELEVENLABS_API_KEY;
    originalPiper = process.env.PIPER_MODEL_PATH;

    // Clear all env vars for clean test state
    delete process.env.OPENAI_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.PIPER_MODEL_PATH;
  });

  afterEach(() => {
    if (originalOpenAI !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAI;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalElevenLabs !== undefined) {
      process.env.ELEVENLABS_API_KEY = originalElevenLabs;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
    if (originalPiper !== undefined) {
      process.env.PIPER_MODEL_PATH = originalPiper;
    } else {
      delete process.env.PIPER_MODEL_PATH;
    }
  });

  it("returns explicit provider from config", () => {
    const registry = new TTSProviderRegistry();
    registerDefaultTTSProviders(registry);

    const result = resolveTTSProvider({ provider: "elevenlabs" }, registry);
    expect(result).toBe("elevenlabs");
  });

  it("falls back to openai-tts when OPENAI_API_KEY set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key";

    const registry = new TTSProviderRegistry();
    registerDefaultTTSProviders(registry);

    const result = resolveTTSProvider({}, registry);
    expect(result).toBe("openai-tts");
  });

  it("falls back to elevenlabs when ELEVENLABS_API_KEY set", () => {
    process.env.ELEVENLABS_API_KEY = "sk-test-key";

    const registry = new TTSProviderRegistry();
    registerDefaultTTSProviders(registry);

    const result = resolveTTSProvider({}, registry);
    expect(result).toBe("elevenlabs");
  });

  it("falls back to kokoro as last resort", () => {
    const registry = new TTSProviderRegistry();
    registerDefaultTTSProviders(registry);

    const result = resolveTTSProvider({}, registry);
    expect(result).toBe("kokoro");
  });

  it("throws if no providers registered", () => {
    const registry = new TTSProviderRegistry();

    expect(() => resolveTTSProvider({}, registry)).toThrow(/No TTS providers registered/);
  });
});
