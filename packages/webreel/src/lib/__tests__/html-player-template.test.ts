import { describe, it, expect } from "vitest";
import {
  generateHtmlPlayer,
  escapeHtml,
  type HtmlPlayerOptions,
  type HtmlChapter,
  type HtmlSubtitle,
} from "../html-player-template.js";

// ---------------------------------------------------------------------------
// Helper: create default options
// ---------------------------------------------------------------------------

function makeOptions(overrides?: Partial<HtmlPlayerOptions>): HtmlPlayerOptions {
  return {
    videoBase64: "AAAA",
    mimeType: "video/mp4",
    title: "Test Demo",
    chapters: [],
    subtitles: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateHtmlPlayer
// ---------------------------------------------------------------------------

describe("generateHtmlPlayer", () => {
  it("generates a valid HTML document", () => {
    const html = generateHtmlPlayer(makeOptions());
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
  });

  it("includes the video data URI", () => {
    const html = generateHtmlPlayer(
      makeOptions({ videoBase64: "dGVzdHZpZGVv", mimeType: "video/mp4" }),
    );
    expect(html).toContain("data:video/mp4;base64,dGVzdHZpZGVv");
  });

  it("escapes HTML in the title", () => {
    const html = generateHtmlPlayer(
      makeOptions({ title: '<script>alert("xss")</script>' }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert");
  });

  it("includes chapter list when chapters are provided", () => {
    const chapters: HtmlChapter[] = [
      { title: "Introduction", startMs: 0 },
      { title: "Setup", startMs: 10000 },
      { title: "Conclusion", startMs: 25000 },
    ];
    const html = generateHtmlPlayer(makeOptions({ chapters }));
    expect(html).toContain("chapterList");
    expect(html).toContain("Introduction");
    expect(html).toContain("Setup");
    expect(html).toContain("Conclusion");
    expect(html).toContain('data-time="0"');
    expect(html).toContain('data-time="10"');
    expect(html).toContain('data-time="25"');
  });

  it("omits chapter section when chapters array is empty", () => {
    const html = generateHtmlPlayer(makeOptions({ chapters: [] }));
    expect(html).not.toContain('id="chapterList"');
    expect(html).not.toContain("<h2>Chapters</h2>");
  });

  it("includes subtitle data in the script", () => {
    const subtitles: HtmlSubtitle[] = [
      { startMs: 0, endMs: 3000, text: "Welcome to the demo" },
      { startMs: 3000, endMs: 6000, text: "Let us get started" },
    ];
    const html = generateHtmlPlayer(makeOptions({ subtitles }));
    expect(html).toContain("Welcome to the demo");
    expect(html).toContain("Let us get started");
    expect(html).toContain('"startMs":0');
    expect(html).toContain('"endMs":3000');
  });

  it("includes keyboard shortcut hints", () => {
    const html = generateHtmlPlayer(makeOptions());
    expect(html).toContain("Play/Pause");
    expect(html).toContain("Seek 5s");
    expect(html).toContain("Fullscreen");
    expect(html).toContain("<kbd>");
  });

  it("includes play/pause button", () => {
    const html = generateHtmlPlayer(makeOptions());
    expect(html).toContain('id="playBtn"');
    expect(html).toContain("Play/Pause");
  });

  it("includes progress bar", () => {
    const html = generateHtmlPlayer(makeOptions());
    expect(html).toContain('id="progressBar"');
    expect(html).toContain('id="progressFill"');
    expect(html).toContain("progress-bar");
  });

  it("works with empty subtitles array", () => {
    const html = generateHtmlPlayer(makeOptions({ subtitles: [] }));
    expect(html).toContain("var subtitles = []");
  });

  it("escapes HTML in chapter titles within the list", () => {
    const chapters: HtmlChapter[] = [{ title: "Step <1> & Done", startMs: 0 }];
    const html = generateHtmlPlayer(makeOptions({ chapters }));
    // The rendered <li> elements should have escaped HTML
    expect(html).toContain("Step &lt;1&gt; &amp; Done");
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("returns unchanged plain text", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});
