import { describe, it, expect } from "vitest";

import { assembleTimeline } from "../timeline-assembler.js";
import type { GeneratedSegment } from "../timeline-assembler.js";
import type { NarratorConfig } from "../types.js";
import { DEFAULT_NARRATOR_CONFIG } from "../types.js";

const config: NarratorConfig = {
  ...DEFAULT_NARRATOR_CONFIG,
  interSegmentGapMs: 200,
};

function segment(
  durationMs: number,
  text: string = "Test segment",
  opts?: Partial<GeneratedSegment>,
): GeneratedSegment {
  return {
    audioBuffer: Buffer.alloc(0),
    durationMs,
    text,
    isDeferred: false,
    waitForNarration: true,
    ...opts,
  };
}

describe("assembleTimeline", () => {
  it("single segment produces correct timeline", () => {
    const segments = [segment(1000, "Hello world.")];
    const timeline = assembleTimeline(segments, config);

    expect(timeline.segments).toHaveLength(1);
    expect(timeline.segments[0]!.startOffsetMs).toBe(0);
    expect(timeline.segments[0]!.durationMs).toBe(1000);
    expect(timeline.segments[0]!.text).toBe("Hello world.");
    expect(timeline.totalDurationMs).toBe(1000);
  });

  it("multiple segments have correct start offsets with gaps", () => {
    const segments = [
      segment(1000, "First."),
      segment(500, "Second."),
      segment(800, "Third."),
    ];
    const timeline = assembleTimeline(segments, config);

    expect(timeline.segments).toHaveLength(3);
    // First segment starts at 0
    expect(timeline.segments[0]!.startOffsetMs).toBe(0);
    // Second starts at 1000 (duration) + 200 (gap) = 1200
    expect(timeline.segments[1]!.startOffsetMs).toBe(1200);
    // Third starts at 1200 + 500 (duration) + 200 (gap) = 1900
    expect(timeline.segments[2]!.startOffsetMs).toBe(1900);
  });

  it("pause segments contribute duration but no extra gap", () => {
    const segments = [
      segment(1000, "Before pause."),
      // A pause segment: empty text, has duration
      segment(500, "", { waitForNarration: false }),
      segment(800, "After pause."),
    ];
    const timeline = assembleTimeline(segments, config);

    expect(timeline.segments).toHaveLength(3);
    // First: starts at 0
    expect(timeline.segments[0]!.startOffsetMs).toBe(0);
    // Pause: starts at 1000 + 200 (gap after non-pause first segment) = 1200
    expect(timeline.segments[1]!.startOffsetMs).toBe(1200);
    // After pause: starts at 1200 + 500 (pause duration, no gap after pause) = 1700
    expect(timeline.segments[2]!.startOffsetMs).toBe(1700);
  });

  it("total duration is sum of all segments + gaps", () => {
    const segments = [segment(1000, "First."), segment(500, "Second.")];
    const timeline = assembleTimeline(segments, config);

    // 1000 + 200 (gap) + 500 = 1700
    // No gap after last segment
    expect(timeline.totalDurationMs).toBe(1700);
  });

  it("empty segment list produces zero-duration timeline", () => {
    const timeline = assembleTimeline([], config);

    expect(timeline.segments).toHaveLength(0);
    expect(timeline.totalDurationMs).toBe(0);
  });

  it("preserves isDeferred and waitForNarration flags", () => {
    const segments = [
      segment(1000, "Deferred segment.", {
        isDeferred: true,
        waitForNarration: false,
      }),
    ];
    const timeline = assembleTimeline(segments, config);

    expect(timeline.segments[0]!.isDeferred).toBe(true);
    expect(timeline.segments[0]!.waitForNarration).toBe(false);
  });

  it("no gap is added after the last segment", () => {
    const segments = [segment(1000, "Only segment.")];
    const timeline = assembleTimeline(segments, config);

    // Total should be exactly the segment duration, no trailing gap
    expect(timeline.totalDurationMs).toBe(1000);
  });
});
