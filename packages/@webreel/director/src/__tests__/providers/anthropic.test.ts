import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LLMError } from "../../errors.js";

// ---------------------------------------------------------------------------
// Mock the @anthropic-ai/sdk module before importing the provider
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
        stream: mockStream,
      };
    },
  };
});

// Import after mocking so the dynamic import resolves to our mock
import { AnthropicProvider } from "../../providers/anthropic.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    provider = new AnthropicProvider();
    process.env = { ...originalEnv };
    mockCreate.mockReset();
    mockStream.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Name ──────────────────────────────────────────────────────────────

  it("has the name 'anthropic'", () => {
    expect(provider.name).toBe("anthropic");
  });

  // ── Initialize ────────────────────────────────────────────────────────

  it("throws LLMError when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    await expect(provider.initialize()).rejects.toThrow(LLMError);
    await expect(provider.initialize()).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  it("initializes successfully when ANTHROPIC_API_KEY is set", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    await expect(provider.initialize()).resolves.toBeUndefined();
  });

  // ── Generate ──────────────────────────────────────────────────────────

  it("throws LLMError when generate() is called without initialize()", async () => {
    await expect(
      provider.generate("hello", { model: "claude-sonnet-4-20250514" }),
    ).rejects.toThrow(LLMError);
    await expect(
      provider.generate("hello", { model: "claude-sonnet-4-20250514" }),
    ).rejects.toThrow("not initialized");
  });

  it("maps Anthropic response to LLMResult correctly", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    await provider.initialize();

    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world!" },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
      },
    });

    const result = await provider.generate("test prompt", {
      model: "claude-sonnet-4-20250514",
      maxTokens: 1024,
      temperature: 0.5,
      systemPrompt: "You are helpful.",
    });

    expect(result.text).toBe("Hello world!");
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
    });

    // Verify the SDK was called with correct parameters
    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      temperature: 0.5,
      system: "You are helpful.",
      messages: [{ role: "user", content: "test prompt" }],
    });
  });

  it("handles response without usage data", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    await provider.initialize();

    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "No usage info" }],
    });

    const result = await provider.generate("test", { model: "claude-sonnet-4-20250514" });
    expect(result.text).toBe("No usage info");
    expect(result.usage).toBeUndefined();
  });

  it("wraps SDK errors in LLMError during generate", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    await provider.initialize();

    const sdkError = new Error("Rate limit exceeded");
    mockCreate.mockRejectedValue(sdkError);

    await expect(
      provider.generate("test", { model: "claude-sonnet-4-20250514" }),
    ).rejects.toThrow(LLMError);

    try {
      await provider.generate("test", { model: "claude-sonnet-4-20250514" });
    } catch (error) {
      expect(error).toBeInstanceOf(LLMError);
      expect((error as LLMError).provider).toBe("anthropic");
      expect((error as LLMError).cause).toBe(sdkError);
    }
  });

  // ── Stream ────────────────────────────────────────────────────────────

  it("throws LLMError when stream() is called without initialize()", async () => {
    const collectStream = async (): Promise<string[]> => {
      const chunks: string[] = [];
      for await (const chunk of provider.stream("hello", {
        model: "claude-sonnet-4-20250514",
      })) {
        chunks.push(chunk);
      }
      return chunks;
    };
    await expect(collectStream()).rejects.toThrow(LLMError);
  });

  it("yields text deltas from content_block_delta events", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    await provider.initialize();

    const events = [
      { type: "message_start", message: {} },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: " world" } },
      {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: "{}" },
      },
      { type: "message_stop" },
    ];

    mockStream.mockReturnValue(
      (async function* () {
        for (const event of events) {
          yield event;
        }
      })(),
    );

    const chunks: string[] = [];
    for await (const chunk of provider.stream("test", {
      model: "claude-sonnet-4-20250514",
      maxTokens: 512,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("wraps SDK errors in LLMError during stream", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    await provider.initialize();

    mockStream.mockReturnValue(
      (async function* () {
        yield* []; // empty iterator — throw immediately
        throw new Error("Connection reset");
      })(),
    );

    const collectStream = async (): Promise<string[]> => {
      const chunks: string[] = [];
      for await (const chunk of provider.stream("test", {
        model: "claude-sonnet-4-20250514",
      })) {
        chunks.push(chunk);
      }
      return chunks;
    };

    await expect(collectStream()).rejects.toThrow(LLMError);
  });

  // ── Dispose ───────────────────────────────────────────────────────────

  it("clears client on dispose, subsequent calls throw", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-123";
    await provider.initialize();
    await provider.dispose();

    await expect(
      provider.generate("hello", { model: "claude-sonnet-4-20250514" }),
    ).rejects.toThrow(LLMError);
  });
});
