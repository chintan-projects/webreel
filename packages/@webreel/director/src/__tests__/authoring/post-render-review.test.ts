import { describe, it, expect, vi, beforeEach } from "vitest";
import { reviewRender } from "../../authoring/post-render-review.js";
import type { LLMProvider, LLMOptions, DemoScript, RenderMetadata } from "../../types.js";

// Mock prompt loader
vi.mock("../../prompts/prompt-loader.js", () => ({
  loadPrompt: vi.fn().mockResolvedValue("REVIEW PROMPT"),
}));

function createMockProvider(generateFn: LLMProvider["generate"] = vi.fn()): LLMProvider {
  return {
    name: "test-provider",
    generate: generateFn,
    stream: vi.fn(),
    initialize: vi.fn(),
    dispose: vi.fn(),
  };
}

const DEFAULT_OPTIONS: LLMOptions = {
  model: "test-model",
  temperature: 0.3,
};

const SAMPLE_SCRIPT: DemoScript = {
  meta: { title: "Test Demo" },
  acts: [
    {
      name: "Act One",
      scenes: [
        {
          name: "Setup",
          surface: { type: "terminal", options: {} },
          narration: [{ text: "Setting up.", dynamicRefs: [] }],
          actions: [{ type: "run", params: { command: "npm install" } }],
          transitions: {},
          directorNotes: [],
        },
      ],
    },
  ],
};

const SAMPLE_METADATA: RenderMetadata = {
  totalDurationMs: 45000,
  outputPath: "/output/demo.mp4",
  scenes: [
    {
      sceneName: "Setup",
      actName: "Act One",
      durationMs: 15000,
      frameCount: 450,
      actionCount: 1,
    },
    {
      sceneName: "Demo",
      actName: "Act One",
      durationMs: 30000,
      frameCount: 900,
      actionCount: 3,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reviewRender", () => {
  it("parses valid JSON response into ReviewReport", async () => {
    const llmResponse = JSON.stringify({
      suggestions: [
        {
          sceneName: "Setup",
          message: "Add a pause after npm install completes.",
          action: "Add a 2s pause after the run action.",
          priority: "medium",
        },
      ],
      summary: "Overall, the demo pacing is good with minor improvements possible.",
      sceneNotes: {
        Setup: "Installation step could use a brief pause for readability.",
      },
    });

    const provider = createMockProvider(vi.fn().mockResolvedValue({ text: llmResponse }));

    const report = await reviewRender(
      provider,
      SAMPLE_SCRIPT,
      "script markdown",
      SAMPLE_METADATA,
      DEFAULT_OPTIONS,
    );

    expect(report.suggestions).toHaveLength(1);
    expect(report.suggestions[0].sceneName).toBe("Setup");
    expect(report.suggestions[0].priority).toBe("medium");
    expect(report.summary).toContain("pacing is good");
    expect(report.sceneNotes["Setup"]).toContain("pause");
  });

  it("returns empty report on LLM failure", async () => {
    const provider = createMockProvider(
      vi.fn().mockRejectedValue(new Error("API error")),
    );

    const report = await reviewRender(
      provider,
      SAMPLE_SCRIPT,
      "script markdown",
      SAMPLE_METADATA,
      DEFAULT_OPTIONS,
    );

    expect(report.suggestions).toHaveLength(0);
    expect(report.summary).toBe("Review could not be completed.");
    expect(report.sceneNotes).toEqual({});
  });

  it("returns empty report on malformed JSON", async () => {
    const provider = createMockProvider(
      vi.fn().mockResolvedValue({ text: "This is not JSON" }),
    );

    const report = await reviewRender(
      provider,
      SAMPLE_SCRIPT,
      "script markdown",
      SAMPLE_METADATA,
      DEFAULT_OPTIONS,
    );

    expect(report.suggestions).toHaveLength(0);
    expect(report.summary).toBe("Review could not be completed.");
  });

  it("handles JSON wrapped in code fences", async () => {
    const llmResponse =
      "```json\n" +
      JSON.stringify({
        suggestions: [
          {
            sceneName: "Demo",
            message: "Too fast.",
            priority: "high",
          },
        ],
        summary: "Needs pacing adjustment.",
        sceneNotes: {},
      }) +
      "\n```";

    const provider = createMockProvider(vi.fn().mockResolvedValue({ text: llmResponse }));

    const report = await reviewRender(
      provider,
      SAMPLE_SCRIPT,
      "script markdown",
      SAMPLE_METADATA,
      DEFAULT_OPTIONS,
    );

    expect(report.suggestions).toHaveLength(1);
    expect(report.suggestions[0].sceneName).toBe("Demo");
    expect(report.summary).toBe("Needs pacing adjustment.");
  });

  it("normalizes invalid priority values to medium", async () => {
    const llmResponse = JSON.stringify({
      suggestions: [
        {
          sceneName: "Scene",
          message: "Issue",
          priority: "critical",
        },
      ],
      summary: "Summary",
      sceneNotes: {},
    });

    const provider = createMockProvider(vi.fn().mockResolvedValue({ text: llmResponse }));

    const report = await reviewRender(
      provider,
      SAMPLE_SCRIPT,
      "script markdown",
      SAMPLE_METADATA,
      DEFAULT_OPTIONS,
    );

    expect(report.suggestions[0].priority).toBe("medium");
  });

  it("handles response with missing optional fields", async () => {
    const llmResponse = JSON.stringify({
      suggestions: [
        {
          sceneName: "Scene",
          message: "Simple issue",
        },
      ],
      summary: "OK.",
    });

    const provider = createMockProvider(vi.fn().mockResolvedValue({ text: llmResponse }));

    const report = await reviewRender(
      provider,
      SAMPLE_SCRIPT,
      "script markdown",
      SAMPLE_METADATA,
      DEFAULT_OPTIONS,
    );

    expect(report.suggestions[0].action).toBeUndefined();
    expect(report.suggestions[0].priority).toBe("medium");
    expect(report.sceneNotes).toEqual({});
  });
});
