import { describe, it, expect, vi, beforeEach } from "vitest";
import { refineScript, generateDiff } from "../../authoring/refinement.js";
import type { LLMProvider, LLMOptions, DemoScript } from "../../types.js";

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
  meta: { title: "Refined Demo" },
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
  temperature: 0.5,
};

beforeEach(() => {
  vi.clearAllMocks();
  // loadPrompt is called twice: once for spec, once for refinement template
  mockLoadPrompt.mockResolvedValueOnce("SPEC CONTENT");
  mockLoadPrompt.mockResolvedValueOnce("REFINEMENT SYSTEM PROMPT");
});

// ---------------------------------------------------------------------------
// generateDiff
// ---------------------------------------------------------------------------

describe("generateDiff", () => {
  it("marks added lines with +", () => {
    const diff = generateDiff("line1\nline2", "line1\nline2\nline3");
    expect(diff).toContain("+line3");
  });

  it("marks removed lines with -", () => {
    const diff = generateDiff("line1\nline2\nline3", "line1\nline3");
    expect(diff).toContain("-line2");
  });

  it("marks unchanged lines with space prefix", () => {
    const diff = generateDiff("same\nline", "same\nline");
    expect(diff).toContain(" same");
    expect(diff).toContain(" line");
  });

  it("handles completely different content", () => {
    const diff = generateDiff("old", "new");
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
  });

  it("handles empty old text", () => {
    const diff = generateDiff("", "added");
    expect(diff).toContain("+added");
  });

  it("handles empty new text", () => {
    const diff = generateDiff("removed", "");
    expect(diff).toContain("-removed");
  });
});

// ---------------------------------------------------------------------------
// refineScript
// ---------------------------------------------------------------------------

describe("refineScript", () => {
  it("loads spec and refinement templates", async () => {
    const provider = createMockProvider();
    const newMarkdown = "---\ntitle: Refined\n---\n# Act\n## Scene\n> surface: terminal";

    mockGenerateAndValidate.mockResolvedValue({
      script: VALID_SCRIPT,
      markdown: newMarkdown,
      attempts: 1,
    });

    await refineScript(
      provider,
      "---\ntitle: Original\n---",
      "Make it shorter",
      DEFAULT_OPTIONS,
    );

    expect(mockLoadPrompt).toHaveBeenCalledWith("demo-markdown-spec");
    expect(mockLoadPrompt).toHaveBeenCalledWith(
      "script-refinement",
      expect.objectContaining({
        demo_markdown_spec: "SPEC CONTENT",
        current_script: "---\ntitle: Original\n---",
        feedback: "Make it shorter",
      }),
    );
  });

  it("includes current script in substitution variables", async () => {
    const provider = createMockProvider();
    const currentMarkdown = "---\ntitle: Old\n---\n# Act\n## Scene\n> surface: browser";
    const newMarkdown = "---\ntitle: New\n---\n# Act\n## Scene\n> surface: terminal";

    mockGenerateAndValidate.mockResolvedValue({
      script: VALID_SCRIPT,
      markdown: newMarkdown,
      attempts: 1,
    });

    await refineScript(provider, currentMarkdown, "Switch to terminal", DEFAULT_OPTIONS);

    const templateVars = mockLoadPrompt.mock.calls[1][1] as Record<string, string>;
    expect(templateVars.current_script).toBe(currentMarkdown);
    expect(templateVars.feedback).toBe("Switch to terminal");
  });

  it("returns result with diff", async () => {
    const provider = createMockProvider();
    const oldMarkdown = "line1\nline2";
    const newMarkdown = "line1\nline3";

    mockGenerateAndValidate.mockResolvedValue({
      script: VALID_SCRIPT,
      markdown: newMarkdown,
      attempts: 1,
    });

    const result = await refineScript(
      provider,
      oldMarkdown,
      "Change line 2",
      DEFAULT_OPTIONS,
    );

    expect(result.script).toBe(VALID_SCRIPT);
    expect(result.markdown).toBe(newMarkdown);
    expect(result.diff).toContain("-line2");
    expect(result.diff).toContain("+line3");
    expect(result.attempts).toBe(1);
  });

  it("passes provider to generateAndValidate", async () => {
    const provider = createMockProvider();

    mockGenerateAndValidate.mockResolvedValue({
      script: VALID_SCRIPT,
      markdown: "updated",
      attempts: 2,
    });

    const result = await refineScript(provider, "original", "feedback", DEFAULT_OPTIONS);

    expect(mockGenerateAndValidate.mock.calls[0][0]).toBe(provider);
    expect(result.attempts).toBe(2);
  });
});
