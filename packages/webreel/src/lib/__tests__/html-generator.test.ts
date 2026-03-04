import { describe, it, expect, vi } from "vitest";
import type { DemoScript } from "@webreel/director";
import type { SubtitleSegment } from "../subtitle-generator.js";

// Mock node:fs/promises to avoid real file I/O
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake-video-data")),
}));

// Import after mock setup
const { generateInteractiveHTML } = await import("../html-generator.js");

// ---------------------------------------------------------------------------
// Helper: create a minimal DemoScript
// ---------------------------------------------------------------------------

function makeScript(
  title: string,
  acts: Array<{ name: string; scenes: Array<{ name: string }> }>,
): DemoScript {
  return {
    meta: { title },
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
// generateInteractiveHTML
// ---------------------------------------------------------------------------

describe("generateInteractiveHTML", () => {
  it("produces a valid HTML document from a mock video file", async () => {
    const script = makeScript("My Demo", [
      { name: "Intro", scenes: [{ name: "Welcome" }] },
    ]);
    const html = await generateInteractiveHTML({
      videoPath: "/tmp/fake.mp4",
      script,
      sceneDurations: new Map([["Welcome", 10000]]),
    });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("</html>");
    expect(html).toContain("data:video/mp4;base64,");
  });

  it("uses the script title in the output", async () => {
    const script = makeScript("Product Tour", [
      { name: "Act 1", scenes: [{ name: "Scene 1" }] },
    ]);
    const html = await generateInteractiveHTML({
      videoPath: "/tmp/fake.mp4",
      script,
      sceneDurations: new Map([["Scene 1", 5000]]),
    });
    expect(html).toContain("Product Tour");
  });

  it("includes chapter markers from acts", async () => {
    const script = makeScript("Chapters Demo", [
      { name: "Getting Started", scenes: [{ name: "S1" }] },
      { name: "Advanced Usage", scenes: [{ name: "S2" }] },
    ]);
    const html = await generateInteractiveHTML({
      videoPath: "/tmp/fake.mp4",
      script,
      sceneDurations: new Map([
        ["S1", 15000],
        ["S2", 20000],
      ]),
    });
    expect(html).toContain("Getting Started");
    expect(html).toContain("Advanced Usage");
    expect(html).toContain("chapterList");
  });

  it("works with empty subtitles", async () => {
    const script = makeScript("No Subs", [
      { name: "Act 1", scenes: [{ name: "Scene A" }] },
    ]);
    const html = await generateInteractiveHTML({
      videoPath: "/tmp/fake.mp4",
      script,
      sceneDurations: new Map([["Scene A", 8000]]),
      subtitleSegments: [],
    });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("var subtitles = []");
  });

  it("includes subtitle segments when provided", async () => {
    const script = makeScript("Subtitled Demo", [
      { name: "Act", scenes: [{ name: "S" }] },
    ]);
    const subs: SubtitleSegment[] = [
      { index: 1, startMs: 0, endMs: 2000, text: "Hello world" },
      { index: 2, startMs: 2000, endMs: 4000, text: "Goodbye" },
    ];
    const html = await generateInteractiveHTML({
      videoPath: "/tmp/fake.mp4",
      script,
      sceneDurations: new Map([["S", 5000]]),
      subtitleSegments: subs,
    });
    expect(html).toContain("Hello world");
    expect(html).toContain("Goodbye");
  });
});
