import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateAndValidate,
  extractMarkdown,
} from "../../authoring/generate-and-validate.js";
import type { LLMProvider, LLMOptions, DemoScript } from "../../types.js";
import { LLMError } from "../../errors.js";

// Mock the parser module
vi.mock("../../parser.js", () => ({
  parse: vi.fn(),
}));

import { parse } from "../../parser.js";

const mockParse = vi.mocked(parse);

/** Create a minimal mock LLM provider. */
function createMockProvider(generateFn: LLMProvider["generate"] = vi.fn()): LLMProvider {
  return {
    name: "test-provider",
    generate: generateFn,
    stream: vi.fn(),
    initialize: vi.fn(),
    dispose: vi.fn(),
  };
}

/** A valid DemoScript IR for test assertions. */
const VALID_SCRIPT: DemoScript = {
  meta: { title: "Test Demo" },
  acts: [
    {
      name: "Act One",
      scenes: [
        {
          name: "Scene One",
          surface: { type: "terminal", options: {} },
          narration: [],
          actions: [],
          transitions: {},
          directorNotes: [],
        },
      ],
    },
  ],
};

const DEFAULT_OPTIONS: LLMOptions = {
  model: "test-model",
  temperature: 0.7,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// extractMarkdown
// ---------------------------------------------------------------------------

describe("extractMarkdown", () => {
  it("strips ```markdown ... ``` fences", () => {
    const input =
      '```markdown\n---\ntitle: "Test"\n---\n# Act\n## Scene\n> surface: terminal\n```';
    const result = extractMarkdown(input);
    expect(result).toBe('---\ntitle: "Test"\n---\n# Act\n## Scene\n> surface: terminal');
  });

  it("strips ``` ... ``` fences without language", () => {
    const input = '```\n---\ntitle: "Test"\n---\n```';
    const result = extractMarkdown(input);
    expect(result).toBe('---\ntitle: "Test"\n---');
  });

  it("strips ```md ... ``` fences", () => {
    const input = "```md\ncontent here\n```";
    const result = extractMarkdown(input);
    expect(result).toBe("content here");
  });

  it("returns text as-is when no fences present", () => {
    const input = '---\ntitle: "Test"\n---\n# Act\n## Scene\n> surface: terminal';
    expect(extractMarkdown(input)).toBe(input);
  });

  it("trims whitespace", () => {
    const input = "  \n  content  \n  ";
    expect(extractMarkdown(input)).toBe("content");
  });
});

// ---------------------------------------------------------------------------
// generateAndValidate
// ---------------------------------------------------------------------------

describe("generateAndValidate", () => {
  it("returns on successful first attempt", async () => {
    const rawMarkdown = '---\ntitle: "Test"\n---\n# Act\n## Scene\n> surface: terminal';
    const provider = createMockProvider(vi.fn().mockResolvedValue({ text: rawMarkdown }));
    mockParse.mockReturnValue(VALID_SCRIPT);

    const result = await generateAndValidate(
      provider,
      "Generate a demo",
      DEFAULT_OPTIONS,
    );

    expect(result.script).toBe(VALID_SCRIPT);
    expect(result.markdown).toBe(rawMarkdown);
    expect(result.attempts).toBe(1);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("retries on parse error and succeeds on second attempt", async () => {
    const provider = createMockProvider(
      vi.fn().mockResolvedValueOnce({ text: "bad markdown" }).mockResolvedValueOnce({
        text: '---\ntitle: "Fixed"\n---\n# Act\n## Scene\n> surface: terminal',
      }),
    );

    mockParse
      .mockImplementationOnce(() => {
        throw new Error("Parse failed: no front matter");
      })
      .mockReturnValueOnce(VALID_SCRIPT);

    const result = await generateAndValidate(
      provider,
      "Generate a demo",
      DEFAULT_OPTIONS,
    );

    expect(result.attempts).toBe(2);
    expect(result.script).toBe(VALID_SCRIPT);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("retries on validation error and succeeds on second attempt", async () => {
    const provider = createMockProvider(
      vi
        .fn()
        .mockResolvedValueOnce({ text: "missing surface" })
        .mockResolvedValueOnce({ text: "fixed script" }),
    );

    mockParse
      .mockImplementationOnce(() => {
        throw new Error("Validation: scene has no surface type");
      })
      .mockReturnValueOnce(VALID_SCRIPT);

    const result = await generateAndValidate(
      provider,
      "Generate a demo",
      DEFAULT_OPTIONS,
    );

    expect(result.attempts).toBe(2);
    expect(result.script).toBe(VALID_SCRIPT);
  });

  it("includes error context in retry prompt", async () => {
    const generateFn = vi
      .fn()
      .mockResolvedValueOnce({ text: "bad output" })
      .mockResolvedValueOnce({ text: "fixed output" });

    const provider = createMockProvider(generateFn);

    mockParse
      .mockImplementationOnce(() => {
        throw new Error("Missing title field");
      })
      .mockReturnValueOnce(VALID_SCRIPT);

    await generateAndValidate(provider, "Original prompt", DEFAULT_OPTIONS);

    // Second call should include error feedback
    const retryPrompt = generateFn.mock.calls[1][0] as string;
    expect(retryPrompt).toContain("Original prompt");
    expect(retryPrompt).toContain("Previous Attempt (FAILED)");
    expect(retryPrompt).toContain("Missing title field");
  });

  it("throws LLMError after max retries exceeded", async () => {
    const provider = createMockProvider(
      vi.fn().mockResolvedValue({ text: "always bad" }),
    );

    mockParse.mockImplementation(() => {
      throw new Error("Parse failed");
    });

    await expect(
      generateAndValidate(provider, "Generate", DEFAULT_OPTIONS, 2),
    ).rejects.toThrow(LLMError);

    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it("LLMError includes all attempt error details", async () => {
    const provider = createMockProvider(vi.fn().mockResolvedValue({ text: "bad" }));

    mockParse.mockImplementation(() => {
      throw new Error("Still broken");
    });

    try {
      await generateAndValidate(provider, "Generate", DEFAULT_OPTIONS, 3);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError);
      const llmErr = err as LLMError;
      expect(llmErr.message).toContain("3 attempts");
      expect(llmErr.message).toContain("Attempt 1");
      expect(llmErr.message).toContain("Attempt 2");
      expect(llmErr.message).toContain("Attempt 3");
    }
  });

  it("strips code fences before parsing", async () => {
    const wrappedMarkdown =
      '```markdown\n---\ntitle: "Test"\n---\n# Act\n## Scene\n> surface: terminal\n```';
    const provider = createMockProvider(
      vi.fn().mockResolvedValue({ text: wrappedMarkdown }),
    );
    mockParse.mockReturnValue(VALID_SCRIPT);

    await generateAndValidate(provider, "Generate", DEFAULT_OPTIONS);

    // parse should receive unwrapped markdown
    expect(mockParse).toHaveBeenCalledWith(
      '---\ntitle: "Test"\n---\n# Act\n## Scene\n> surface: terminal',
    );
  });
});
