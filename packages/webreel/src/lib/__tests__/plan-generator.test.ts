import { describe, it, expect } from "vitest";
import { generatePlan } from "../plan-generator.js";
import type { DemoScript, Scene, Act } from "@webreel/director";

/** Helper to create a minimal Scene. */
function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    name: overrides.name ?? "Test Scene",
    surface: overrides.surface ?? { type: "browser", options: {} },
    narration: overrides.narration ?? [],
    actions: overrides.actions ?? [],
    transitions: overrides.transitions ?? {},
    directorNotes: overrides.directorNotes ?? [],
    durationHint: overrides.durationHint,
  };
}

/** Helper to create a minimal DemoScript. */
function makeScript(acts: Act[], title = "Test Demo"): DemoScript {
  return {
    meta: { title },
    acts,
  };
}

describe("generatePlan", () => {
  it("generates a plan with correct counts", () => {
    const script = makeScript([
      {
        name: "Act 1",
        scenes: [makeScene({ name: "S1" }), makeScene({ name: "S2" })],
      },
      {
        name: "Act 2",
        scenes: [makeScene({ name: "S3" })],
      },
    ]);

    const plan = generatePlan(script);
    expect(plan.scriptTitle).toBe("Test Demo");
    expect(plan.totalActs).toBe(2);
    expect(plan.totalScenes).toBe(3);
    expect(plan.acts).toHaveLength(2);
    expect(plan.acts[0].scenes).toHaveLength(2);
    expect(plan.acts[1].scenes).toHaveLength(1);
  });

  describe("prerequisite extraction", () => {
    it("always includes ffmpeg", () => {
      const script = makeScript([{ name: "Act", scenes: [makeScene()] }]);
      const plan = generatePlan(script);
      const ffmpeg = plan.prerequisites.find((p) => p.name === "ffmpeg");
      expect(ffmpeg).toBeDefined();
      expect(ffmpeg!.type).toBe("binary");
      expect(ffmpeg!.required).toBe(true);
    });

    it("includes Chrome for browser surfaces", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [makeScene({ surface: { type: "browser", options: {} } })],
        },
      ]);
      const plan = generatePlan(script);
      const chrome = plan.prerequisites.find((p) => p.name === "Google Chrome");
      expect(chrome).toBeDefined();
      expect(chrome!.required).toBe(true);
    });

    it("includes node-pty for terminal surfaces", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [makeScene({ surface: { type: "terminal", options: {} } })],
        },
      ]);
      const plan = generatePlan(script);
      const pty = plan.prerequisites.find((p) => p.name === "node-pty");
      expect(pty).toBeDefined();
    });

    it("extracts URLs from navigate actions", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              actions: [{ type: "navigate", params: { url: "https://example.com" } }],
            }),
          ],
        },
      ]);
      const plan = generatePlan(script);
      const url = plan.prerequisites.find((p) => p.type === "url");
      expect(url).toBeDefined();
      expect(url!.value).toBe("https://example.com");
      expect(url!.required).toBe(false);
    });

    it("deduplicates prerequisites", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({ surface: { type: "browser", options: {} } }),
            makeScene({ surface: { type: "browser", options: {} } }),
          ],
        },
      ]);
      const plan = generatePlan(script);
      const chromePrereqs = plan.prerequisites.filter((p) => p.name === "Google Chrome");
      expect(chromePrereqs).toHaveLength(1);
    });
  });

  describe("duration estimation", () => {
    it("estimates duration from narration word count", () => {
      // 150 words should be ~60 seconds of narration
      const words = Array.from({ length: 150 }, (_, i) => `word${i}`).join(" ");
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              narration: [{ text: words, dynamicRefs: [] }],
            }),
          ],
        },
      ]);

      const plan = generatePlan(script);
      // 150 WPM = 60s
      expect(plan.estimatedDurationSec).toBeCloseTo(60, 0);
    });

    it("uses duration hint when larger than narration estimate", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [makeScene({ durationHint: 30 })],
        },
      ]);

      const plan = generatePlan(script);
      expect(plan.estimatedDurationSec).toBe(30);
    });

    it("enforces minimum scene duration", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [makeScene()], // no narration, no hint
        },
      ]);

      const plan = generatePlan(script);
      expect(plan.estimatedDurationSec).toBeGreaterThanOrEqual(2);
    });
  });

  describe("scene plan details", () => {
    it("detects annotations", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              actions: [{ type: "annotate", params: { text: "Look here" } }],
            }),
          ],
        },
      ]);

      const plan = generatePlan(script);
      expect(plan.acts[0].scenes[0].hasAnnotations).toBe(true);
    });

    it("detects dynamic refs", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              narration: [
                { text: "The value is [read_output:val]", dynamicRefs: ["val"] },
              ],
            }),
          ],
        },
      ]);

      const plan = generatePlan(script);
      expect(plan.acts[0].scenes[0].hasDynamicRefs).toBe(true);
    });

    it("includes transition info", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              transitions: {
                in: { type: "crossfade", durationMs: 500 },
              },
            }),
          ],
        },
      ]);

      const plan = generatePlan(script);
      expect(plan.acts[0].scenes[0].transitions.in).toBe("crossfade 500ms");
    });
  });

  describe("risk identification", () => {
    it("flags dynamic refs without capture source", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              name: "Risky",
              narration: [
                { text: "Value: [read_output:missing]", dynamicRefs: ["missing"] },
              ],
              actions: [{ type: "click", params: {} }], // no captures
            }),
          ],
        },
      ]);

      const plan = generatePlan(script);
      const risk = plan.risks.find((r) => r.description.includes("missing"));
      expect(risk).toBeDefined();
      expect(risk!.severity).toBe("medium");
    });

    it("flags external URLs", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              name: "External",
              actions: [
                { type: "navigate", params: { url: "https://external-api.com" } },
              ],
            }),
          ],
        },
      ]);

      const plan = generatePlan(script);
      const risk = plan.risks.find((r) => r.description.includes("external URL"));
      expect(risk).toBeDefined();
      expect(risk!.severity).toBe("low");
    });

    it("flags unknown surface types", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              name: "Unknown",
              surface: { type: "hologram", options: {} },
            }),
          ],
        },
      ]);

      const plan = generatePlan(script);
      const risk = plan.risks.find((r) => r.description.includes("hologram"));
      expect(risk).toBeDefined();
      expect(risk!.severity).toBe("high");
    });

    it("does not flag localhost URLs as external", () => {
      const script = makeScript([
        {
          name: "Act",
          scenes: [
            makeScene({
              actions: [{ type: "navigate", params: { url: "http://localhost:3000" } }],
            }),
          ],
        },
      ]);

      const plan = generatePlan(script);
      const risk = plan.risks.find((r) => r.description.includes("external URL"));
      expect(risk).toBeUndefined();
    });
  });
});
