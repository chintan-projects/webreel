import { describe, it, expect } from "vitest";
import {
  generateSRT,
  generateVTT,
  timelineToSubtitles,
  mergeSubtitleSegments,
  type SubtitleSegment,
} from "../subtitle-generator.js";
import type { NarrationTimeline } from "@webreel/narrator";

// ---------------------------------------------------------------------------
// Helper: create a minimal NarrationTimeline
// ---------------------------------------------------------------------------

function makeTimeline(
  segments: Array<{
    text: string;
    startOffsetMs: number;
    durationMs: number;
  }>,
): NarrationTimeline {
  const totalDurationMs =
    segments.length > 0
      ? Math.max(...segments.map((s) => s.startOffsetMs + s.durationMs))
      : 0;

  return {
    segments: segments.map((s) => ({
      audioBuffer: Buffer.alloc(0),
      durationMs: s.durationMs,
      text: s.text,
      startOffsetMs: s.startOffsetMs,
      waitForNarration: false,
      isDeferred: false,
    })),
    totalDurationMs,
  };
}

// ---------------------------------------------------------------------------
// SRT Timestamp Format
// ---------------------------------------------------------------------------

describe("generateSRT — timestamp format", () => {
  it("uses comma as decimal separator", () => {
    const segments: SubtitleSegment[] = [
      { index: 1, startMs: 1000, endMs: 4500, text: "Hello" },
    ];
    const srt = generateSRT(segments);
    expect(srt).toContain("00:00:01,000 --> 00:00:04,500");
  });

  it("pads hours, minutes, seconds, and milliseconds", () => {
    const segments: SubtitleSegment[] = [
      { index: 1, startMs: 0, endMs: 500, text: "Start" },
    ];
    const srt = generateSRT(segments);
    expect(srt).toContain("00:00:00,000 --> 00:00:00,500");
  });

  it("handles timestamps over an hour", () => {
    const segments: SubtitleSegment[] = [
      { index: 1, startMs: 3661234, endMs: 3665000, text: "Late" },
    ];
    const srt = generateSRT(segments);
    // 3661234ms = 1h 1m 1s 234ms
    expect(srt).toContain("01:01:01,234 --> 01:01:05,000");
  });
});

// ---------------------------------------------------------------------------
// VTT Timestamp Format
// ---------------------------------------------------------------------------

describe("generateVTT — timestamp format", () => {
  it("uses period as decimal separator", () => {
    const segments: SubtitleSegment[] = [
      { index: 1, startMs: 1000, endMs: 4500, text: "Hello" },
    ];
    const vtt = generateVTT(segments);
    expect(vtt).toContain("00:00:01.000 --> 00:00:04.500");
  });

  it("starts with WEBVTT header", () => {
    const segments: SubtitleSegment[] = [
      { index: 1, startMs: 0, endMs: 1000, text: "Hello" },
    ];
    const vtt = generateVTT(segments);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SRT Format Structure
// ---------------------------------------------------------------------------

describe("generateSRT — format structure", () => {
  it("generates correct SRT with multiple segments", () => {
    const segments: SubtitleSegment[] = [
      { index: 1, startMs: 1000, endMs: 4500, text: "First narration segment text" },
      { index: 2, startMs: 5200, endMs: 8800, text: "Second narration segment text" },
    ];
    const srt = generateSRT(segments);
    const lines = srt.split("\n");

    // First entry
    expect(lines[0]).toBe("1");
    expect(lines[1]).toBe("00:00:01,000 --> 00:00:04,500");
    expect(lines[2]).toBe("First narration segment text");

    // Blank line between entries
    expect(lines[3]).toBe("");

    // Second entry
    expect(lines[4]).toBe("2");
    expect(lines[5]).toBe("00:00:05,200 --> 00:00:08,800");
    expect(lines[6]).toBe("Second narration segment text");
  });

  it("returns empty string for empty segments", () => {
    expect(generateSRT([])).toBe("");
  });

  it("handles single segment correctly", () => {
    const segments: SubtitleSegment[] = [
      { index: 1, startMs: 0, endMs: 3000, text: "Only subtitle" },
    ];
    const srt = generateSRT(segments);
    expect(srt).toContain("1\n");
    expect(srt).toContain("Only subtitle");
    expect(srt.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// VTT Format Structure
// ---------------------------------------------------------------------------

describe("generateVTT — format structure", () => {
  it("generates correct VTT with multiple segments", () => {
    const segments: SubtitleSegment[] = [
      { index: 1, startMs: 1000, endMs: 4500, text: "First" },
      { index: 2, startMs: 5200, endMs: 8800, text: "Second" },
    ];
    const vtt = generateVTT(segments);

    expect(vtt).toContain("WEBVTT");
    expect(vtt).toContain("1\n00:00:01.000 --> 00:00:04.500\nFirst");
    expect(vtt).toContain("2\n00:00:05.200 --> 00:00:08.800\nSecond");
  });

  it("returns WEBVTT header only for empty segments", () => {
    const vtt = generateVTT([]);
    expect(vtt.trim()).toBe("WEBVTT");
  });
});

// ---------------------------------------------------------------------------
// timelineToSubtitles
// ---------------------------------------------------------------------------

describe("timelineToSubtitles", () => {
  it("converts narration segments to subtitle segments", () => {
    const timeline = makeTimeline([
      { text: "Hello world", startOffsetMs: 0, durationMs: 3000 },
      { text: "Second part", startOffsetMs: 3500, durationMs: 2000 },
    ]);
    const subs = timelineToSubtitles(timeline);

    expect(subs).toHaveLength(2);
    expect(subs[0].index).toBe(1);
    expect(subs[0].startMs).toBe(0);
    expect(subs[0].endMs).toBe(3000);
    expect(subs[0].text).toBe("Hello world");

    expect(subs[1].index).toBe(2);
    expect(subs[1].startMs).toBe(3500);
    expect(subs[1].endMs).toBe(5500);
    expect(subs[1].text).toBe("Second part");
  });

  it("applies scene offset to all timestamps", () => {
    const timeline = makeTimeline([
      { text: "Offset test", startOffsetMs: 1000, durationMs: 2000 },
    ]);
    const subs = timelineToSubtitles(timeline, 5000);

    expect(subs[0].startMs).toBe(6000);
    expect(subs[0].endMs).toBe(8000);
  });

  it("skips segments with empty text", () => {
    const timeline = makeTimeline([
      { text: "Keep this", startOffsetMs: 0, durationMs: 1000 },
      { text: "", startOffsetMs: 1000, durationMs: 500 },
      { text: "  ", startOffsetMs: 1500, durationMs: 500 },
      { text: "Also keep", startOffsetMs: 2000, durationMs: 1000 },
    ]);
    const subs = timelineToSubtitles(timeline);

    expect(subs).toHaveLength(2);
    expect(subs[0].text).toBe("Keep this");
    expect(subs[1].text).toBe("Also keep");
  });

  it("returns empty array for empty timeline", () => {
    const timeline: NarrationTimeline = { segments: [], totalDurationMs: 0 };
    const subs = timelineToSubtitles(timeline);
    expect(subs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// mergeSubtitleSegments
// ---------------------------------------------------------------------------

describe("mergeSubtitleSegments", () => {
  it("merges multiple scene subtitles and re-indexes", () => {
    const scene1: SubtitleSegment[] = [
      { index: 1, startMs: 0, endMs: 3000, text: "Scene 1 sub 1" },
      { index: 2, startMs: 3000, endMs: 6000, text: "Scene 1 sub 2" },
    ];
    const scene2: SubtitleSegment[] = [
      { index: 1, startMs: 10000, endMs: 13000, text: "Scene 2 sub 1" },
    ];
    const merged = mergeSubtitleSegments([scene1, scene2]);

    expect(merged).toHaveLength(3);
    expect(merged[0].index).toBe(1);
    expect(merged[1].index).toBe(2);
    expect(merged[2].index).toBe(3);
    expect(merged[2].text).toBe("Scene 2 sub 1");
  });

  it("sorts by start time across scenes", () => {
    const scene1: SubtitleSegment[] = [
      { index: 1, startMs: 5000, endMs: 8000, text: "Later" },
    ];
    const scene2: SubtitleSegment[] = [
      { index: 1, startMs: 1000, endMs: 3000, text: "Earlier" },
    ];
    const merged = mergeSubtitleSegments([scene1, scene2]);

    expect(merged[0].text).toBe("Earlier");
    expect(merged[1].text).toBe("Later");
  });

  it("returns empty array for empty input", () => {
    const merged = mergeSubtitleSegments([]);
    expect(merged).toHaveLength(0);
  });

  it("handles single scene with single segment", () => {
    const merged = mergeSubtitleSegments([
      [{ index: 1, startMs: 0, endMs: 1000, text: "Only" }],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].index).toBe(1);
  });
});
