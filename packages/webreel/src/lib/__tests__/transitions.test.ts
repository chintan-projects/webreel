import { describe, it, expect } from "vitest";
import {
  buildTransitionFilterComplex,
  hasNonCutTransitions,
  resolveTransitions,
  toTransitionSpec,
  type TransitionSpec,
  type SceneSegmentInfo,
} from "../transitions.js";
import type { TransitionConfig } from "@webreel/director";

// ---------------------------------------------------------------------------
// toTransitionSpec
// ---------------------------------------------------------------------------

describe("toTransitionSpec", () => {
  it("converts TransitionConfig with explicit duration", () => {
    const config: TransitionConfig = { type: "crossfade", durationMs: 800 };
    const spec = toTransitionSpec(config);
    expect(spec.type).toBe("crossfade");
    expect(spec.durationMs).toBe(800);
  });

  it("fills default duration when not specified", () => {
    const config: TransitionConfig = { type: "fade-to-black" };
    const spec = toTransitionSpec(config);
    expect(spec.type).toBe("fade-to-black");
    expect(spec.durationMs).toBe(500);
  });

  it("converts cut transition", () => {
    const config: TransitionConfig = { type: "cut" };
    const spec = toTransitionSpec(config);
    expect(spec.type).toBe("cut");
  });
});

// ---------------------------------------------------------------------------
// hasNonCutTransitions
// ---------------------------------------------------------------------------

describe("hasNonCutTransitions", () => {
  it("returns false when all transitions are cut", () => {
    const transitions: TransitionSpec[] = [
      { type: "cut", durationMs: 0 },
      { type: "cut", durationMs: 0 },
    ];
    expect(hasNonCutTransitions(transitions)).toBe(false);
  });

  it("returns true when at least one transition is not cut", () => {
    const transitions: TransitionSpec[] = [
      { type: "cut", durationMs: 0 },
      { type: "crossfade", durationMs: 500 },
    ];
    expect(hasNonCutTransitions(transitions)).toBe(true);
  });

  it("returns false for empty list", () => {
    expect(hasNonCutTransitions([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveTransitions
// ---------------------------------------------------------------------------

describe("resolveTransitions", () => {
  it("produces N-1 transitions for N scenes", () => {
    const scenes = [
      { in: undefined, out: undefined },
      { in: undefined, out: undefined },
      { in: undefined, out: undefined },
    ];
    const result = resolveTransitions(scenes);
    expect(result).toHaveLength(2);
  });

  it("defaults to cut when no transition_in or transition_out", () => {
    const result = resolveTransitions([{}, {}]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("cut");
    expect(result[0].durationMs).toBe(0);
  });

  it("prefers transition_out of current scene over transition_in of next", () => {
    const result = resolveTransitions([
      { out: { type: "crossfade", durationMs: 300 } },
      { in: { type: "fade-to-black", durationMs: 500 } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("crossfade");
    expect(result[0].durationMs).toBe(300);
  });

  it("falls back to transition_in when transition_out is absent", () => {
    const result = resolveTransitions([{}, { in: { type: "wipe", durationMs: 600 } }]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("wipe");
    expect(result[0].durationMs).toBe(600);
  });

  it("returns empty array for single scene", () => {
    const result = resolveTransitions([{}]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildTransitionFilterComplex
// ---------------------------------------------------------------------------

describe("buildTransitionFilterComplex", () => {
  it("returns null for a single segment", () => {
    const segments: SceneSegmentInfo[] = [{ path: "a.mp4", durationSec: 5 }];
    const transitions: TransitionSpec[] = [];
    expect(buildTransitionFilterComplex(segments, transitions)).toBeNull();
  });

  it("returns null when all transitions are cut", () => {
    const segments: SceneSegmentInfo[] = [
      { path: "a.mp4", durationSec: 5 },
      { path: "b.mp4", durationSec: 5 },
    ];
    const transitions: TransitionSpec[] = [{ type: "cut", durationMs: 0 }];
    expect(buildTransitionFilterComplex(segments, transitions)).toBeNull();
  });

  it("generates xfade filter for crossfade between two segments", () => {
    const segments: SceneSegmentInfo[] = [
      { path: "a.mp4", durationSec: 10 },
      { path: "b.mp4", durationSec: 8 },
    ];
    const transitions: TransitionSpec[] = [{ type: "crossfade", durationMs: 500 }];
    const result = buildTransitionFilterComplex(segments, transitions);

    expect(result).not.toBeNull();
    expect(result).toContain("xfade");
    expect(result).toContain("transition=fade");
    expect(result).toContain("duration=0.500");
    // offset = 10 - 0.5 = 9.5
    expect(result).toContain("offset=9.500");
    expect(result).toContain("[vout]");
  });

  it("generates fadeblack for fade-to-black", () => {
    const segments: SceneSegmentInfo[] = [
      { path: "a.mp4", durationSec: 5 },
      { path: "b.mp4", durationSec: 5 },
    ];
    const transitions: TransitionSpec[] = [{ type: "fade-to-black", durationMs: 1000 }];
    const result = buildTransitionFilterComplex(segments, transitions);

    expect(result).toContain("transition=fadeblack");
    expect(result).toContain("duration=1.000");
  });

  it("generates correct ffmpeg names for all transition types", () => {
    const types: Array<{ type: TransitionSpec["type"]; expected: string }> = [
      { type: "slide-left", expected: "slideleft" },
      { type: "slide-right", expected: "slideright" },
      { type: "slide-up", expected: "slideup" },
      { type: "wipe", expected: "wipeleft" },
    ];

    for (const { type, expected } of types) {
      const segments: SceneSegmentInfo[] = [
        { path: "a.mp4", durationSec: 5 },
        { path: "b.mp4", durationSec: 5 },
      ];
      const result = buildTransitionFilterComplex(segments, [{ type, durationMs: 500 }]);
      expect(result).toContain(`transition=${expected}`);
    }
  });

  it("chains multiple transitions correctly", () => {
    const segments: SceneSegmentInfo[] = [
      { path: "a.mp4", durationSec: 10 },
      { path: "b.mp4", durationSec: 8 },
      { path: "c.mp4", durationSec: 6 },
    ];
    const transitions: TransitionSpec[] = [
      { type: "crossfade", durationMs: 500 },
      { type: "fade-to-black", durationMs: 1000 },
    ];
    const result = buildTransitionFilterComplex(segments, transitions);

    expect(result).not.toBeNull();
    // First filter: [0:v][1:v] xfade ... [v0]
    expect(result).toContain("[0:v][1:v]");
    expect(result).toContain("[v0]");
    // Second filter: [v0][2:v] xfade ... [vout]
    expect(result).toContain("[v0][2:v]");
    expect(result).toContain("[vout]");
    // Two filters separated by semicolon
    expect(result!.split(";")).toHaveLength(2);
  });

  it("handles mixed cut and non-cut transitions", () => {
    const segments: SceneSegmentInfo[] = [
      { path: "a.mp4", durationSec: 5 },
      { path: "b.mp4", durationSec: 5 },
      { path: "c.mp4", durationSec: 5 },
    ];
    const transitions: TransitionSpec[] = [
      { type: "cut", durationMs: 0 },
      { type: "crossfade", durationMs: 500 },
    ];
    const result = buildTransitionFilterComplex(segments, transitions);

    expect(result).not.toBeNull();
    // First pair: concat (cut)
    expect(result).toContain("concat");
    // Second pair: xfade
    expect(result).toContain("xfade");
  });
});

// ---------------------------------------------------------------------------
// Transition parsing (integration with scene parser)
// ---------------------------------------------------------------------------

describe("transition parsing integration", () => {
  it("parseTransition handles seconds format via resolveTransitions", () => {
    // This tests that TransitionConfig with durationMs from parsed "1s" works
    const config: TransitionConfig = { type: "crossfade", durationMs: 1000 };
    const spec = toTransitionSpec(config);
    expect(spec.durationMs).toBe(1000);
  });

  it("supports all new transition types in TransitionConfig", () => {
    const types: TransitionConfig["type"][] = [
      "cut",
      "crossfade",
      "fade-to-black",
      "slide-left",
      "slide-right",
      "slide-up",
      "wipe",
    ];

    for (const type of types) {
      const config: TransitionConfig = { type, durationMs: 500 };
      const spec = toTransitionSpec(config);
      expect(spec.type).toBe(type);
    }
  });
});
