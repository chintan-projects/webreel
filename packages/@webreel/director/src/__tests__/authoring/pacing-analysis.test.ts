import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzePacing, analyzePacingWithLLM } from "../../authoring/pacing-analysis.js";
import type { DemoScript, Scene, LLMProvider, LLMOptions } from "../../types.js";

// Mock prompt loader for LLM tests
vi.mock("../../prompts/prompt-loader.js", () => ({
  loadPrompt: vi.fn().mockResolvedValue("PACING PROMPT"),
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

/** Helper to build a scene. */
function buildScene(overrides: Partial<Scene> = {}): Scene {
  return {
    name: "Test Scene",
    surface: { type: "terminal", options: {} },
    narration: [],
    actions: [],
    transitions: {},
    directorNotes: [],
    ...overrides,
  };
}

/** Helper to build a minimal DemoScript. */
function buildScript(
  scenes: Scene[],
  meta: Partial<DemoScript["meta"]> = {},
): DemoScript {
  return {
    meta: { title: "Test", ...meta },
    acts: [{ name: "Main", scenes }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// analyzePacing (rule-based)
// ---------------------------------------------------------------------------

describe("analyzePacing", () => {
  it("detects narration/duration mismatch when narration exceeds hint", () => {
    // 150 WPM = 2.5 words per second. A 10s hint with 50 words of narration
    // = 20s estimated. 20 > 10 * 1.2 = 12 -> warning
    const longNarration = Array(50).fill("word").join(" ");
    const scene = buildScene({
      name: "Verbose Scene",
      narration: [{ text: longNarration, dynamicRefs: [] }],
      durationHint: 10,
    });

    const report = analyzePacing(buildScript([scene]));

    const mismatch = report.issues.find((i) => i.message.includes("Verbose Scene"));
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe("warning");
  });

  it("detects dead air (narration without actions on non-title surface)", () => {
    const scene = buildScene({
      name: "Dead Air Scene",
      surface: { type: "browser", options: {} },
      narration: [{ text: "Narration with nothing happening.", dynamicRefs: [] }],
      actions: [],
    });

    const report = analyzePacing(buildScript([scene]));

    const deadAir = report.issues.find((i) => i.message.includes("dead air"));
    expect(deadAir).toBeDefined();
    expect(deadAir!.severity).toBe("warning");
    expect(deadAir!.sceneName).toBe("Dead Air Scene");
  });

  it("detects low action density on non-title scenes", () => {
    const scene = buildScene({
      name: "No Actions",
      surface: { type: "terminal", options: {} },
      narration: [],
      actions: [],
    });

    const report = analyzePacing(buildScript([scene]));

    const lowAction = report.issues.find((i) =>
      i.message.includes("no action directives"),
    );
    expect(lowAction).toBeDefined();
    expect(lowAction!.severity).toBe("info");
  });

  it("does not flag title card scenes for dead air or low action density", () => {
    const scene = buildScene({
      name: "Title Card",
      surface: { type: "title", options: {} },
      narration: [{ text: "Welcome to the demo.", dynamicRefs: [] }],
      actions: [],
    });

    const report = analyzePacing(buildScript([scene]));

    const titleIssues = report.issues.filter((i) => i.sceneName === "Title Card");
    expect(titleIssues).toHaveLength(0);
  });

  it("detects total duration exceeding target by more than 30%", () => {
    // 60 words at 150 WPM = 24s narration. Target is 10s.
    // 24 > 10 * 1.3 = 13 -> error
    const longNarration = Array(60).fill("word").join(" ");
    const scene = buildScene({
      name: "Long Scene",
      narration: [{ text: longNarration, dynamicRefs: [] }],
    });

    const report = analyzePacing(buildScript([scene], { duration: 10 }));

    const totalIssue = report.issues.find((i) =>
      i.message.includes("Total estimated duration"),
    );
    expect(totalIssue).toBeDefined();
    expect(totalIssue!.severity).toBe("error");
  });

  it("returns passed=true when no errors are found", () => {
    const scene = buildScene({
      name: "Good Scene",
      surface: { type: "terminal", options: {} },
      narration: [{ text: "Brief narration.", dynamicRefs: [] }],
      actions: [{ type: "run", params: { command: "echo hello" } }],
    });

    const report = analyzePacing(buildScript([scene]));
    expect(report.passed).toBe(true);
  });

  it("returns passed=false when errors are present", () => {
    const longNarration = Array(60).fill("word").join(" ");
    const scene = buildScene({
      narration: [{ text: longNarration, dynamicRefs: [] }],
    });

    const report = analyzePacing(buildScript([scene], { duration: 10 }));
    expect(report.passed).toBe(false);
  });

  it("calculates scene durations", () => {
    const scene = buildScene({
      name: "Timed Scene",
      narration: [{ text: "A few words here.", dynamicRefs: [] }],
      actions: [
        { type: "run", params: { command: "ls" } },
        { type: "pause", params: { duration: 3 } },
      ],
    });

    const report = analyzePacing(buildScript([scene]));

    expect(report.sceneDurations["Timed Scene"]).toBeGreaterThan(0);
    expect(report.totalDurationEstimate).toBeGreaterThan(0);
  });

  it("does not flag when narration fits within duration hint", () => {
    // 15 words at 150 WPM = 6s narration. Hint of 30s -> no issue
    const scene = buildScene({
      name: "Comfortable Scene",
      narration: [{ text: "This is a short narration for the scene.", dynamicRefs: [] }],
      actions: [{ type: "run", params: { command: "echo ok" } }],
      durationHint: 30,
    });

    const report = analyzePacing(buildScript([scene]));

    const sceneIssues = report.issues.filter((i) => i.sceneName === "Comfortable Scene");
    expect(sceneIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// analyzePacingWithLLM
// ---------------------------------------------------------------------------

describe("analyzePacingWithLLM", () => {
  it("combines rule-based and LLM issues", async () => {
    const scene = buildScene({
      name: "Test Scene",
      surface: { type: "browser", options: {} },
      narration: [{ text: "Some narration.", dynamicRefs: [] }],
      actions: [],
    });

    const llmResponse = JSON.stringify([
      {
        severity: "info",
        message: "Consider adding a transition between scenes.",
        sceneName: "Test Scene",
        actName: "Main",
        suggestion: "Add a crossfade transition.",
      },
    ]);

    const provider = createMockProvider(vi.fn().mockResolvedValue({ text: llmResponse }));

    const report = await analyzePacingWithLLM(
      provider,
      buildScript([scene]),
      "script markdown",
      DEFAULT_OPTIONS,
    );

    // Should have both rule-based (dead air, low action) and LLM issues
    expect(report.issues.length).toBeGreaterThanOrEqual(2);
    const llmIssue = report.issues.find((i) => i.message.includes("transition"));
    expect(llmIssue).toBeDefined();
  });

  it("falls back to rule-based only when LLM fails", async () => {
    const scene = buildScene({
      name: "Test Scene",
      surface: { type: "browser", options: {} },
      narration: [{ text: "Narration.", dynamicRefs: [] }],
      actions: [],
    });

    const provider = createMockProvider(
      vi.fn().mockRejectedValue(new Error("API timeout")),
    );

    const report = await analyzePacingWithLLM(
      provider,
      buildScript([scene]),
      "script markdown",
      DEFAULT_OPTIONS,
    );

    // Should still have rule-based issues
    expect(report.issues.length).toBeGreaterThan(0);
    const deadAir = report.issues.find((i) => i.message.includes("dead air"));
    expect(deadAir).toBeDefined();
  });

  it("handles malformed LLM JSON gracefully", async () => {
    const scene = buildScene({
      name: "Scene",
      surface: { type: "terminal", options: {} },
      narration: [{ text: "Text.", dynamicRefs: [] }],
      actions: [{ type: "run", params: { command: "ls" } }],
    });

    const provider = createMockProvider(
      vi.fn().mockResolvedValue({ text: "not valid json at all" }),
    );

    const report = await analyzePacingWithLLM(
      provider,
      buildScript([scene]),
      "script markdown",
      DEFAULT_OPTIONS,
    );

    // Should only have rule-based issues (LLM JSON parse failed silently)
    expect(report).toBeDefined();
    expect(report.sceneDurations).toBeDefined();
  });
});
