import { describe, it, expect } from "vitest";

import { registerDefaultTTSProviders } from "../providers/register-defaults.js";
import { TTSProviderRegistry } from "../registry.js";

describe("registerDefaultTTSProviders", () => {
  it("registers all 4 built-in providers", () => {
    const registry = new TTSProviderRegistry();
    registerDefaultTTSProviders(registry);

    expect(registry.has("kokoro")).toBe(true);
    expect(registry.has("openai-tts")).toBe(true);
    expect(registry.has("elevenlabs")).toBe(true);
    expect(registry.has("piper")).toBe(true);
    expect(registry.providers()).toHaveLength(4);
  });

  it("registered providers can be created", () => {
    const registry = new TTSProviderRegistry();
    registerDefaultTTSProviders(registry);

    const kokoro = registry.create("kokoro");
    expect(kokoro.name).toBe("kokoro");

    const openai = registry.create("openai-tts");
    expect(openai.name).toBe("openai-tts");

    const elevenlabs = registry.create("elevenlabs");
    expect(elevenlabs.name).toBe("elevenlabs");

    const piper = registry.create("piper");
    expect(piper.name).toBe("piper");
  });

  it("re-registration overwrites existing", () => {
    const registry = new TTSProviderRegistry();
    registerDefaultTTSProviders(registry);

    const first = registry.create("kokoro");
    registerDefaultTTSProviders(registry);
    const second = registry.create("kokoro");

    // Both are KokoroProvider instances but different objects
    expect(first.name).toBe("kokoro");
    expect(second.name).toBe("kokoro");
    expect(first).not.toBe(second);

    // Still only 4 providers (not 8)
    expect(registry.providers()).toHaveLength(4);
  });
});
