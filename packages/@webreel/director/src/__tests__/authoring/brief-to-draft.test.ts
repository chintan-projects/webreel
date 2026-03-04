import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateDraft } from "../../authoring/brief-to-draft.js";
import type { LLMProvider, LLMOptions, Brief, DemoScript } from "../../types.js";

// Mock dependencies
vi.mock("../../prompts/prompt-loader.js", () => ({
  loadPrompt: vi.fn(),
}));

vi.mock("../../authoring/generate-and-validate.js", () => ({
  generateAndValidate: vi.fn(),
}));

import { loadPrompt } from "../../prompts/prompt-loader.js";
import { generateAndValidate } from "../../authoring/generate-and-validate.js";

const mockLoadPrompt = vi.mocked(loadPrompt);
const mockGenerateAndValidate = vi.mocked(generateAndValidate);

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

function createMockProvider(): LLMProvider {
  return {
    name: "test-provider",
    generate: vi.fn(),
    stream: vi.fn(),
    initialize: vi.fn(),
    dispose: vi.fn(),
  };
}

const DEFAULT_OPTIONS: LLMOptions = {
  model: "test-model",
  temperature: 0.7,
};

const SAMPLE_BRIEF: Brief = {
  product: "MyApp CLI",
  audience: "Developers",
  keyMessages: ["Fast installation", "Simple API", "Great DX"],
  duration: "2 minutes",
  tone: "technical",
  assets: "https://github.com/example/myapp",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadPrompt.mockResolvedValueOnce("SPEC CONTENT");
  mockLoadPrompt.mockResolvedValueOnce("SYSTEM PROMPT WITH SPEC");
  mockGenerateAndValidate.mockResolvedValue({
    script: VALID_SCRIPT,
    markdown: "---\ntitle: Test\n---",
    attempts: 1,
  });
});

describe("generateDraft", () => {
  it("loads demo-markdown-spec and brief-to-draft templates", async () => {
    const provider = createMockProvider();

    await generateDraft(provider, SAMPLE_BRIEF, DEFAULT_OPTIONS);

    expect(mockLoadPrompt).toHaveBeenCalledTimes(2);
    expect(mockLoadPrompt).toHaveBeenCalledWith("demo-markdown-spec");
    expect(mockLoadPrompt).toHaveBeenCalledWith("brief-to-draft", {
      demo_markdown_spec: "SPEC CONTENT",
    });
  });

  it("formats brief fields into user prompt", async () => {
    const provider = createMockProvider();

    await generateDraft(provider, SAMPLE_BRIEF, DEFAULT_OPTIONS);

    const callArgs = mockGenerateAndValidate.mock.calls[0];
    const userPrompt = callArgs[1] as string;

    expect(userPrompt).toContain("MyApp CLI");
    expect(userPrompt).toContain("Developers");
    expect(userPrompt).toContain("2 minutes");
    expect(userPrompt).toContain("technical");
    expect(userPrompt).toContain("Fast installation");
    expect(userPrompt).toContain("Simple API");
    expect(userPrompt).toContain("Great DX");
    expect(userPrompt).toContain("https://github.com/example/myapp");
  });

  it("passes system prompt to generateAndValidate options", async () => {
    const provider = createMockProvider();

    await generateDraft(provider, SAMPLE_BRIEF, DEFAULT_OPTIONS);

    const callArgs = mockGenerateAndValidate.mock.calls[0];
    const llmOptions = callArgs[2] as LLMOptions;

    expect(llmOptions.systemPrompt).toBe("SYSTEM PROMPT WITH SPEC");
    expect(llmOptions.model).toBe("test-model");
    expect(llmOptions.temperature).toBe(0.7);
  });

  it("calls generateAndValidate with the provider", async () => {
    const provider = createMockProvider();

    const result = await generateDraft(provider, SAMPLE_BRIEF, DEFAULT_OPTIONS);

    expect(mockGenerateAndValidate).toHaveBeenCalledTimes(1);
    expect(mockGenerateAndValidate.mock.calls[0][0]).toBe(provider);
    expect(result.script).toBe(VALID_SCRIPT);
    expect(result.attempts).toBe(1);
  });

  it("handles brief without optional fields", async () => {
    const provider = createMockProvider();
    const minimalBrief: Brief = {
      product: "Widget",
      audience: "Everyone",
      keyMessages: ["It works"],
      duration: "30s",
    };

    await generateDraft(provider, minimalBrief, DEFAULT_OPTIONS);

    const callArgs = mockGenerateAndValidate.mock.calls[0];
    const userPrompt = callArgs[1] as string;

    expect(userPrompt).toContain("Widget");
    expect(userPrompt).toContain("Everyone");
    expect(userPrompt).not.toContain("Tone:");
    expect(userPrompt).not.toContain("Available Assets");
    expect(userPrompt).not.toContain("Live URL:");
    expect(userPrompt).not.toContain("Product Context");
  });

  it("includes productUrl and productContext in user prompt", async () => {
    const provider = createMockProvider();
    const richBrief: Brief = {
      product: "MyApp",
      audience: "Developers",
      keyMessages: ["Fast"],
      duration: "1 minute",
      productUrl: "https://myapp.dev",
      productContext:
        "# MyApp\n\nInstall: `npm install myapp`\n\nRun: `myapp serve --port 3000`",
    };

    await generateDraft(provider, richBrief, DEFAULT_OPTIONS);

    const callArgs = mockGenerateAndValidate.mock.calls[0];
    const userPrompt = callArgs[1] as string;

    expect(userPrompt).toContain("**Live URL:** https://myapp.dev");
    expect(userPrompt).toContain("Product Context (from README / docs)");
    expect(userPrompt).toContain("npm install myapp");
    expect(userPrompt).toContain("Do NOT hallucinate URLs or commands");
  });
});
