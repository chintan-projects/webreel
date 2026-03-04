import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LLMError } from "../../errors.js";
import type { ProviderConfig } from "../../types.js";

// ---------------------------------------------------------------------------
// Mock the openai module before importing the provider
// ---------------------------------------------------------------------------

const mockCompletionsCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCompletionsCreate,
        },
      };
    },
  };
});

// Import after mocking so the dynamic import resolves to our mock
import { OpenAICompatibleProvider } from "../../providers/openai-compatible.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const OPENAI_CONFIG: ProviderConfig = {
  name: "openai",
  baseURL: "https://api.openai.com/v1",
  apiKeyEnvVar: "OPENAI_API_KEY",
};

const KEYLESS_CONFIG: ProviderConfig = {
  name: "ollama",
  baseURL: "http://localhost:11434/v1",
};

const HEADERS_CONFIG: ProviderConfig = {
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKeyEnvVar: "OPENROUTER_API_KEY",
  defaultHeaders: {
    "HTTP-Referer": "https://webreel.dev",
    "X-Title": "webreel",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAICompatibleProvider", () => {
  let provider: OpenAICompatibleProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockCompletionsCreate.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Name ──────────────────────────────────────────────────────────────

  it("uses the name from config", () => {
    provider = new OpenAICompatibleProvider(OPENAI_CONFIG);
    expect(provider.name).toBe("openai");
  });

  it("uses custom name from config", () => {
    provider = new OpenAICompatibleProvider(KEYLESS_CONFIG);
    expect(provider.name).toBe("ollama");
  });

  // ── Initialize ────────────────────────────────────────────────────────

  it("throws LLMError when required env var is missing", async () => {
    provider = new OpenAICompatibleProvider(OPENAI_CONFIG);
    delete process.env["OPENAI_API_KEY"];
    await expect(provider.initialize()).rejects.toThrow(LLMError);
    await expect(provider.initialize()).rejects.toThrow("OPENAI_API_KEY");
  });

  it("initializes successfully when required env var is set", async () => {
    provider = new OpenAICompatibleProvider(OPENAI_CONFIG);
    process.env["OPENAI_API_KEY"] = "sk-test-123";
    await expect(provider.initialize()).resolves.toBeUndefined();
  });

  it("initializes successfully without env var for keyless providers", async () => {
    provider = new OpenAICompatibleProvider(KEYLESS_CONFIG);
    await expect(provider.initialize()).resolves.toBeUndefined();
  });

  it("initializes successfully with custom headers config", async () => {
    provider = new OpenAICompatibleProvider(HEADERS_CONFIG);
    process.env["OPENROUTER_API_KEY"] = "or-test-key";
    await expect(provider.initialize()).resolves.toBeUndefined();
  });

  // ── Generate ──────────────────────────────────────────────────────────

  it("throws LLMError when generate() is called without initialize()", async () => {
    provider = new OpenAICompatibleProvider(OPENAI_CONFIG);
    await expect(provider.generate("hello", { model: "gpt-4o" })).rejects.toThrow(
      LLMError,
    );
    await expect(provider.generate("hello", { model: "gpt-4o" })).rejects.toThrow(
      "not initialized",
    );
  });

  it("maps OpenAI response to LLMResult correctly", async () => {
    provider = new OpenAICompatibleProvider(OPENAI_CONFIG);
    process.env["OPENAI_API_KEY"] = "sk-test-123";
    await provider.initialize();

    mockCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: { content: "Generated text here" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 8,
      },
    });

    const result = await provider.generate("test prompt", {
      model: "gpt-4o",
      maxTokens: 2048,
      temperature: 0.3,
      systemPrompt: "Be concise.",
    });

    expect(result.text).toBe("Generated text here");
    expect(result.usage).toEqual({
      promptTokens: 15,
      completionTokens: 8,
    });

    // Verify messages array includes system prompt
    expect(mockCompletionsCreate).toHaveBeenCalledWith({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "test prompt" },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    });
  });

  it("builds messages without system prompt when not provided", async () => {
    provider = new OpenAICompatibleProvider(KEYLESS_CONFIG);
    await provider.initialize();

    mockCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "Response" } }],
    });

    await provider.generate("hello", { model: "llama3.2" });

    expect(mockCompletionsCreate).toHaveBeenCalledWith({
      model: "llama3.2",
      messages: [{ role: "user", content: "hello" }],
    });
  });

  it("handles response without usage data", async () => {
    provider = new OpenAICompatibleProvider(KEYLESS_CONFIG);
    await provider.initialize();

    mockCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: "No usage" } }],
    });

    const result = await provider.generate("test", { model: "llama3.2" });
    expect(result.text).toBe("No usage");
    expect(result.usage).toBeUndefined();
  });

  it("handles response with empty choices", async () => {
    provider = new OpenAICompatibleProvider(KEYLESS_CONFIG);
    await provider.initialize();

    mockCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const result = await provider.generate("test", { model: "llama3.2" });
    expect(result.text).toBe("");
  });

  it("wraps SDK errors in LLMError with correct provider name", async () => {
    provider = new OpenAICompatibleProvider(HEADERS_CONFIG);
    process.env["OPENROUTER_API_KEY"] = "or-test-key";
    await provider.initialize();

    const sdkError = new Error("API quota exceeded");
    mockCompletionsCreate.mockRejectedValue(sdkError);

    try {
      await provider.generate("test", { model: "gpt-4o" });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LLMError);
      expect((error as LLMError).provider).toBe("openrouter");
      expect((error as LLMError).cause).toBe(sdkError);
    }
  });

  // ── Stream ────────────────────────────────────────────────────────────

  it("throws LLMError when stream() is called without initialize()", async () => {
    provider = new OpenAICompatibleProvider(OPENAI_CONFIG);
    const collectStream = async (): Promise<string[]> => {
      const chunks: string[] = [];
      for await (const chunk of provider.stream("hello", { model: "gpt-4o" })) {
        chunks.push(chunk);
      }
      return chunks;
    };
    await expect(collectStream()).rejects.toThrow(LLMError);
  });

  it("yields content deltas from stream chunks", async () => {
    provider = new OpenAICompatibleProvider(OPENAI_CONFIG);
    process.env["OPENAI_API_KEY"] = "sk-test-123";
    await provider.initialize();

    const streamChunks = [
      { choices: [{ delta: { content: "Hello" } }] },
      { choices: [{ delta: { content: " there" } }] },
      { choices: [{ delta: { content: null } }] },
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: "!" } }] },
    ];

    mockCompletionsCreate.mockResolvedValue(
      (async function* () {
        for (const chunk of streamChunks) {
          yield chunk;
        }
      })(),
    );

    const chunks: string[] = [];
    for await (const chunk of provider.stream("test", {
      model: "gpt-4o",
      maxTokens: 100,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " there", "!"]);

    // Verify stream: true was passed
    expect(mockCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true }),
    );
  });

  it("wraps SDK errors in LLMError during stream", async () => {
    provider = new OpenAICompatibleProvider(OPENAI_CONFIG);
    process.env["OPENAI_API_KEY"] = "sk-test-123";
    await provider.initialize();

    mockCompletionsCreate.mockRejectedValue(new Error("Network error"));

    const collectStream = async (): Promise<string[]> => {
      const chunks: string[] = [];
      for await (const chunk of provider.stream("test", { model: "gpt-4o" })) {
        chunks.push(chunk);
      }
      return chunks;
    };

    await expect(collectStream()).rejects.toThrow(LLMError);
  });

  // ── Dispose ───────────────────────────────────────────────────────────

  it("clears client on dispose, subsequent calls throw", async () => {
    provider = new OpenAICompatibleProvider(KEYLESS_CONFIG);
    await provider.initialize();
    await provider.dispose();

    await expect(provider.generate("hello", { model: "llama3.2" })).rejects.toThrow(
      LLMError,
    );
  });
});
