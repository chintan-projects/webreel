import { describe, it, expect } from "vitest";
import {
  extractChapters,
  generateFfmpegChapterMetadata,
  type ChapterMarker,
} from "../chapter-generator.js";
import type { DemoScript } from "@webreel/director";

// ---------------------------------------------------------------------------
// Helper: create a minimal DemoScript
// ---------------------------------------------------------------------------

function makeScript(
  acts: Array<{
    name: string;
    scenes: Array<{ name: string }>;
  }>,
): DemoScript {
  return {
    meta: { title: "Test Demo" },
    acts: acts.map((act) => ({
      name: act.name,
      scenes: act.scenes.map((scene) => ({
        name: scene.name,
        surface: { type: "terminal", options: {} },
        narration: [],
        actions: [],
        transitions: {},
        directorNotes: [],
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// extractChapters
// ---------------------------------------------------------------------------

describe("extractChapters", () => {
  it("creates one chapter per act", () => {
    const script = makeScript([
      { name: "Introduction", scenes: [{ name: "Welcome" }] },
      { name: "Installation", scenes: [{ name: "Setup" }] },
      { name: "Conclusion", scenes: [{ name: "Wrap Up" }] },
    ]);
    const durations = new Map<string, number>([
      ["Welcome", 10000],
      ["Setup", 20000],
      ["Wrap Up", 5000],
    ]);

    const chapters = extractChapters(script, durations);

    expect(chapters).toHaveLength(3);
    expect(chapters[0].title).toBe("Introduction");
    expect(chapters[0].startMs).toBe(0);
    expect(chapters[1].title).toBe("Installation");
    expect(chapters[1].startMs).toBe(10000);
    expect(chapters[2].title).toBe("Conclusion");
    expect(chapters[2].startMs).toBe(30000);
  });

  it("handles acts with multiple scenes", () => {
    const script = makeScript([
      {
        name: "Setup",
        scenes: [{ name: "Scene A" }, { name: "Scene B" }],
      },
      {
        name: "Demo",
        scenes: [{ name: "Scene C" }],
      },
    ]);
    const durations = new Map<string, number>([
      ["Scene A", 5000],
      ["Scene B", 8000],
      ["Scene C", 12000],
    ]);

    const chapters = extractChapters(script, durations);

    expect(chapters).toHaveLength(2);
    expect(chapters[0].startMs).toBe(0);
    // Setup act = Scene A (5000) + Scene B (8000) = 13000
    expect(chapters[1].startMs).toBe(13000);
  });

  it("handles missing scene durations gracefully", () => {
    const script = makeScript([
      { name: "Act 1", scenes: [{ name: "Missing" }] },
      { name: "Act 2", scenes: [{ name: "Present" }] },
    ]);
    const durations = new Map<string, number>([["Present", 10000]]);

    const chapters = extractChapters(script, durations);

    expect(chapters).toHaveLength(2);
    expect(chapters[0].startMs).toBe(0);
    // Missing scene duration defaults to 0
    expect(chapters[1].startMs).toBe(0);
  });

  it("returns single chapter for single act", () => {
    const script = makeScript([{ name: "Only Act", scenes: [{ name: "Scene" }] }]);
    const durations = new Map<string, number>([["Scene", 30000]]);

    const chapters = extractChapters(script, durations);

    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Only Act");
    expect(chapters[0].startMs).toBe(0);
  });

  it("returns empty array for empty script", () => {
    const script = makeScript([]);
    const chapters = extractChapters(script, new Map());
    expect(chapters).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// generateFfmpegChapterMetadata
// ---------------------------------------------------------------------------

describe("generateFfmpegChapterMetadata", () => {
  it("generates correct metadata header", () => {
    const metadata = generateFfmpegChapterMetadata([], 0);
    expect(metadata).toBe(";FFMETADATA1\n");
  });

  it("generates metadata for a single chapter", () => {
    const chapters: ChapterMarker[] = [{ title: "Introduction", startMs: 0 }];
    const metadata = generateFfmpegChapterMetadata(chapters, 30000);

    expect(metadata).toContain(";FFMETADATA1");
    expect(metadata).toContain("[CHAPTER]");
    expect(metadata).toContain("TIMEBASE=1/1000");
    expect(metadata).toContain("START=0");
    expect(metadata).toContain("END=30000");
    expect(metadata).toContain("title=Introduction");
  });

  it("generates metadata for multiple chapters", () => {
    const chapters: ChapterMarker[] = [
      { title: "Introduction", startMs: 0 },
      { title: "Installation", startMs: 30000 },
      { title: "Conclusion", startMs: 75000 },
    ];
    const metadata = generateFfmpegChapterMetadata(chapters, 90000);

    // Count [CHAPTER] sections
    const chapterCount = (metadata.match(/\[CHAPTER\]/g) ?? []).length;
    expect(chapterCount).toBe(3);

    // First chapter: 0 to 30000
    expect(metadata).toContain("START=0");
    expect(metadata).toContain("END=30000");

    // Second chapter: 30000 to 75000
    expect(metadata).toContain("START=30000");
    expect(metadata).toContain("END=75000");

    // Third chapter: 75000 to 90000 (total duration)
    expect(metadata).toContain("START=75000");
    expect(metadata).toContain("END=90000");
  });

  it("escapes special characters in chapter titles", () => {
    const chapters: ChapterMarker[] = [{ title: "Setup; Config = Ready", startMs: 0 }];
    const metadata = generateFfmpegChapterMetadata(chapters, 10000);

    expect(metadata).toContain("title=Setup\\; Config \\= Ready");
  });

  it("escapes hash and backslash in titles", () => {
    const chapters: ChapterMarker[] = [{ title: "# Step\\1", startMs: 0 }];
    const metadata = generateFfmpegChapterMetadata(chapters, 5000);

    expect(metadata).toContain("title=\\# Step\\\\1");
  });

  it("last chapter ends at total duration", () => {
    const chapters: ChapterMarker[] = [
      { title: "First", startMs: 0 },
      { title: "Second", startMs: 5000 },
    ];
    const metadata = generateFfmpegChapterMetadata(chapters, 15000);

    // The last [CHAPTER] should have END=15000
    const lines = metadata.split("\n");
    const endLines = lines.filter((l) => l.startsWith("END="));
    expect(endLines).toHaveLength(2);
    expect(endLines[1]).toBe("END=15000");
  });
});
