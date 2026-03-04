import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LLMProviderRegistry } from "../../registry.js";
import { resolveProvider } from "../../providers/resolve-provider.js";
import { LLMError } from "../../errors.js";

// ---------------------------------------------------------------------------
// Mock SDK modules to prevent import errors during registry.create()
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {},
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));

import { registerDefaultProviders } from "../../providers/register-defaults.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveProvider", () => {
  let registry: LLMProviderRegistry;
  const originalEnv = process.env;

  beforeEach(() => {
    registry = new LLMProviderRegistry();
    registerDefaultProviders(registry);
    // Start with a clean environment (no API keys set)
    process.env = { ...originalEnv };
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["TOGETHER_API_KEY"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Explicit Config ───────────────────────────────────────────────────

  it("resolves explicit provider from config", () => {
    const result = resolveProvider({ provider: "anthropic" }, registry);
    expect(result.providerName).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("resolves explicit provider with model override", () => {
    const result = resolveProvider(
      { provider: "openai", model: "gpt-4-turbo" },
      registry,
    );
    expect(result.providerName).toBe("openai");
    expect(result.model).toBe("gpt-4-turbo");
  });

  it("throws LLMError for unregistered explicit provider", () => {
    expect(() => resolveProvider({ provider: "gemini" }, registry)).toThrow(LLMError);
    expect(() => resolveProvider({ provider: "gemini" }, registry)).toThrow(
      "not registered",
    );
  });

  // ── Env Var Auto-Detection ────────────────────────────────────────────

  it("auto-detects Anthropic from ANTHROPIC_API_KEY", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    const result = resolveProvider({}, registry);
    expect(result.providerName).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("auto-detects OpenAI from OPENAI_API_KEY", () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-test";
    const result = resolveProvider({}, registry);
    expect(result.providerName).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });

  it("auto-detects OpenRouter from OPENROUTER_API_KEY", () => {
    process.env["OPENROUTER_API_KEY"] = "or-test";
    const result = resolveProvider({}, registry);
    expect(result.providerName).toBe("openrouter");
    expect(result.model).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("auto-detects Together from TOGETHER_API_KEY", () => {
    process.env["TOGETHER_API_KEY"] = "tog-test";
    const result = resolveProvider({}, registry);
    expect(result.providerName).toBe("together");
    expect(result.model).toBe("meta-llama/Llama-3-70b-chat-hf");
  });

  it("respects env var priority: Anthropic before OpenAI", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    process.env["OPENAI_API_KEY"] = "sk-openai-test";
    const result = resolveProvider({}, registry);
    expect(result.providerName).toBe("anthropic");
  });

  it("respects env var priority: OpenAI before OpenRouter", () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-test";
    process.env["OPENROUTER_API_KEY"] = "or-test";
    const result = resolveProvider({}, registry);
    expect(result.providerName).toBe("openai");
  });

  it("uses model from config even with auto-detected provider", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    const result = resolveProvider({ model: "claude-3-haiku-20240307" }, registry);
    expect(result.providerName).toBe("anthropic");
    expect(result.model).toBe("claude-3-haiku-20240307");
  });

  // ── Ollama Fallback ───────────────────────────────────────────────────

  it("falls back to Ollama when no env vars are set", () => {
    const result = resolveProvider({}, registry);
    expect(result.providerName).toBe("ollama");
    expect(result.model).toBe("llama3.2");
  });

  it("falls back to Ollama with model override", () => {
    const result = resolveProvider({ model: "mistral" }, registry);
    expect(result.providerName).toBe("ollama");
    expect(result.model).toBe("mistral");
  });

  // ── Error: No Provider ────────────────────────────────────────────────

  it("throws LLMError when no provider is available (no ollama registered)", () => {
    const emptyRegistry = new LLMProviderRegistry();
    expect(() => resolveProvider({}, emptyRegistry)).toThrow(LLMError);
    expect(() => resolveProvider({}, emptyRegistry)).toThrow("No LLM provider found");
  });

  it("error message includes env var names", () => {
    const emptyRegistry = new LLMProviderRegistry();
    try {
      resolveProvider({}, emptyRegistry);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LLMError);
      const msg = (error as LLMError).message;
      expect(msg).toContain("ANTHROPIC_API_KEY");
      expect(msg).toContain("OPENAI_API_KEY");
      expect(msg).toContain("OPENROUTER_API_KEY");
      expect(msg).toContain("TOGETHER_API_KEY");
    }
  });

  // ── Edge Cases ────────────────────────────────────────────────────────

  it("skips env var detection when provider is not registered", () => {
    // Register only anthropic, set openai key
    const partialRegistry = new LLMProviderRegistry();
    partialRegistry.register("anthropic", () => ({
      name: "anthropic",
      generate: vi.fn(),
      stream: vi.fn() as unknown as () => AsyncIterable<string>,
      initialize: vi.fn(),
      dispose: vi.fn(),
    }));

    process.env["OPENAI_API_KEY"] = "sk-test";

    // No anthropic key set, openai not registered, no ollama — should throw
    expect(() => resolveProvider({}, partialRegistry)).toThrow(LLMError);
  });
});
