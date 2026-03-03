import { describe, it, expect } from "vitest";
import { formatPlan, formatValidation } from "../plan-formatter.js";
import type { ExecutionPlan } from "../plan-generator.js";
import type { ValidationResult } from "../plan-validator.js";

function makePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    scriptTitle: overrides.scriptTitle ?? "Test Demo",
    totalScenes: overrides.totalScenes ?? 3,
    totalActs: overrides.totalActs ?? 1,
    estimatedDurationSec: overrides.estimatedDurationSec ?? 120,
    prerequisites: overrides.prerequisites ?? [
      { name: "ffmpeg", type: "binary", value: "ffmpeg", required: true },
    ],
    acts: overrides.acts ?? [
      {
        name: "Introduction",
        estimatedDurationSec: 60,
        scenes: [
          {
            name: "Welcome",
            surfaceType: "title",
            actionCount: 0,
            narrationWordCount: 20,
            estimatedDurationSec: 8,
            hasAnnotations: false,
            hasDynamicRefs: false,
            transitions: {},
          },
          {
            name: "Overview",
            surfaceType: "browser",
            actionCount: 5,
            narrationWordCount: 45,
            estimatedDurationSec: 18,
            hasAnnotations: true,
            hasDynamicRefs: false,
            transitions: { in: "crossfade 500ms" },
          },
        ],
      },
    ],
    risks: overrides.risks ?? [],
  };
}

describe("formatPlan", () => {
  it("includes the script title", () => {
    const plan = makePlan({ scriptTitle: "My Great Demo" });
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("My Great Demo");
  });

  it("includes act and scene counts", () => {
    const plan = makePlan({ totalActs: 2, totalScenes: 5 });
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("2 acts");
    expect(output).toContain("5 scenes");
  });

  it("includes estimated duration", () => {
    const plan = makePlan({ estimatedDurationSec: 260 });
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("4m 20s");
  });

  it("lists prerequisites", () => {
    const plan = makePlan({
      prerequisites: [
        { name: "ffmpeg", type: "binary", value: "ffmpeg", required: true },
        { name: "Google Chrome", type: "binary", value: "google-chrome", required: true },
      ],
    });
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("ffmpeg");
    expect(output).toContain("Google Chrome");
  });

  it("shows act names", () => {
    const plan = makePlan();
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("Introduction");
  });

  it("shows scene details", () => {
    const plan = makePlan();
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("Welcome");
    expect(output).toContain("title");
    expect(output).toContain("Overview");
    expect(output).toContain("browser");
    expect(output).toContain("5 actions");
  });

  it("shows timing when enabled", () => {
    const plan = makePlan();
    const output = formatPlan(plan, { showTiming: true, color: false });
    expect(output).toContain("Est.");
  });

  it("does not show timing when disabled", () => {
    const plan = makePlan();
    const output = formatPlan(plan, { showTiming: false, color: false });
    // The main heading still shows Est. duration, but per-scene doesn't
    const lines = output.split("\n");
    const sceneLines = lines.filter((l) => l.includes("Welcome"));
    for (const line of sceneLines) {
      expect(line).not.toContain("~");
    }
  });

  it("shows transition info", () => {
    const plan = makePlan();
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("crossfade 500ms");
  });

  it("shows risks when present", () => {
    const plan = makePlan({
      risks: [
        {
          severity: "high",
          description: 'Unknown surface type "hologram"',
          mitigation: "Register a custom surface",
        },
      ],
    });
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("[high]");
    expect(output).toContain("hologram");
    expect(output).toContain("Mitigation:");
  });

  it("works with color enabled", () => {
    const plan = makePlan();
    const output = formatPlan(plan, { color: true });
    // ANSI codes should be present
    expect(output).toContain("\x1b[");
  });

  it("works with color disabled", () => {
    const plan = makePlan();
    const output = formatPlan(plan, { color: false });
    // No ANSI codes
    expect(output).not.toContain("\x1b[");
  });

  it("formats seconds-only durations correctly", () => {
    const plan = makePlan({ estimatedDurationSec: 45 });
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("45s");
  });

  it("formats multi-minute durations correctly", () => {
    const plan = makePlan({ estimatedDurationSec: 180 });
    const output = formatPlan(plan, { color: false });
    expect(output).toContain("3m");
  });
});

describe("formatValidation", () => {
  it("shows PASSED for successful validation", () => {
    const result: ValidationResult = {
      passed: true,
      checks: [{ name: "ffmpeg", status: "pass", message: "Found", durationMs: 5 }],
    };
    const output = formatValidation(result);
    expect(output).toContain("PASSED");
    expect(output).toContain("ffmpeg");
  });

  it("shows FAILED for failed validation", () => {
    const result: ValidationResult = {
      passed: false,
      checks: [{ name: "Chrome", status: "fail", message: "Not found", durationMs: 10 }],
    };
    const output = formatValidation(result);
    expect(output).toContain("FAILED");
    expect(output).toContain("FAIL");
  });

  it("shows timing for each check", () => {
    const result: ValidationResult = {
      passed: true,
      checks: [{ name: "ffmpeg", status: "pass", message: "OK", durationMs: 42 }],
    };
    const output = formatValidation(result);
    expect(output).toContain("42ms");
  });

  it("shows warnings", () => {
    const result: ValidationResult = {
      passed: true,
      checks: [
        { name: "node-pty", status: "warn", message: "Not installed", durationMs: 3 },
      ],
    };
    const output = formatValidation(result);
    expect(output).toContain("WARN");
    expect(output).toContain("node-pty");
  });

  it("shows skipped checks", () => {
    const result: ValidationResult = {
      passed: true,
      checks: [{ name: "app", status: "skip", message: "Not supported", durationMs: 0 }],
    };
    const output = formatValidation(result);
    expect(output).toContain("SKIP");
  });
});
