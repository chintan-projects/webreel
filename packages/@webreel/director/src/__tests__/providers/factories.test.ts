import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock SDK modules so factory-created providers can be inspected
// without real dependencies
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {},
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));

import {
  createAnthropicProvider,
  createOpenAIProvider,
  createOpenRouterProvider,
  createTogetherProvider,
  createOllamaProvider,
  createLocalProvider,
} from "../../providers/factories.js";
import { AnthropicProvider } from "../../providers/anthropic.js";
import { OpenAICompatibleProvider } from "../../providers/openai-compatible.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Factory functions", () => {
  it("createAnthropicProvider returns an AnthropicProvider", () => {
    const provider = createAnthropicProvider();
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe("anthropic");
  });

  it("createOpenAIProvider returns an OpenAICompatibleProvider with name 'openai'", () => {
    const provider = createOpenAIProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("openai");
  });

  it("createOpenRouterProvider returns an OpenAICompatibleProvider with name 'openrouter'", () => {
    const provider = createOpenRouterProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("openrouter");
  });

  it("createTogetherProvider returns an OpenAICompatibleProvider with name 'together'", () => {
    const provider = createTogetherProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("together");
  });

  it("createOllamaProvider returns an OpenAICompatibleProvider with name 'ollama'", () => {
    const provider = createOllamaProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("ollama");
  });

  it("createLocalProvider returns an OpenAICompatibleProvider with name 'local'", () => {
    const provider = createLocalProvider("http://localhost:8080/v1");
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("local");
  });

  it("createLocalProvider accepts a custom base URL", () => {
    const provider = createLocalProvider("http://gpu-server:9000/v1");
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("local");
  });

  it("each factory returns a new instance on each call", () => {
    const a = createAnthropicProvider();
    const b = createAnthropicProvider();
    expect(a).not.toBe(b);
  });
});
