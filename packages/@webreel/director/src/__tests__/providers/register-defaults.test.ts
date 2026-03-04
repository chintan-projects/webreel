import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock SDK modules to avoid real dependency resolution
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {},
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));

import { LLMProviderRegistry } from "../../registry.js";
import { registerDefaultProviders } from "../../providers/register-defaults.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerDefaultProviders", () => {
  it("registers all 5 default providers", () => {
    const registry = new LLMProviderRegistry();
    registerDefaultProviders(registry);

    const registered = registry.providers();
    expect(registered).toHaveLength(5);
  });

  it("registers the expected provider names", () => {
    const registry = new LLMProviderRegistry();
    registerDefaultProviders(registry);

    const expected = ["anthropic", "openai", "openrouter", "together", "ollama"];
    for (const name of expected) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it("creates functional provider instances from registry", () => {
    const registry = new LLMProviderRegistry();
    registerDefaultProviders(registry);

    const anthropic = registry.create("anthropic");
    expect(anthropic.name).toBe("anthropic");

    const openai = registry.create("openai");
    expect(openai.name).toBe("openai");

    const openrouter = registry.create("openrouter");
    expect(openrouter.name).toBe("openrouter");

    const together = registry.create("together");
    expect(together.name).toBe("together");

    const ollama = registry.create("ollama");
    expect(ollama.name).toBe("ollama");
  });

  it("does not register unexpected providers", () => {
    const registry = new LLMProviderRegistry();
    registerDefaultProviders(registry);

    expect(registry.has("local")).toBe(false);
    expect(registry.has("gemini")).toBe(false);
    expect(registry.has("cohere")).toBe(false);
  });

  it("overwrites existing registrations without error", () => {
    const registry = new LLMProviderRegistry();
    registerDefaultProviders(registry);
    // Calling again should not throw — it just overwrites
    expect(() => registerDefaultProviders(registry)).not.toThrow();
    expect(registry.providers()).toHaveLength(5);
  });
});
