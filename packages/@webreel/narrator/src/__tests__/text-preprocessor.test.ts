import { describe, it, expect } from "vitest";

import { preprocessNarration } from "../text-preprocessor.js";
import type { NarrationBlock } from "@webreel/director";
import type { NarratorConfig } from "../types.js";
import { DEFAULT_NARRATOR_CONFIG } from "../types.js";

const config: NarratorConfig = DEFAULT_NARRATOR_CONFIG;

function block(text: string, opts?: Partial<NarrationBlock>): NarrationBlock {
  return {
    text,
    dynamicRefs: opts?.dynamicRefs ?? [],
    speed: opts?.speed,
  };
}

describe("preprocessNarration", () => {
  it("splits text at sentence boundaries", () => {
    const blocks = [block("First sentence. Second sentence. Third sentence.")];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(3);
    expect(segments[0]!.text).toBe("First sentence.");
    expect(segments[1]!.text).toBe("Second sentence.");
    expect(segments[2]!.text).toBe("Third sentence.");
  });

  it("handles [pause 2s] directives", () => {
    const blocks = [block("Before pause. [pause 2s] After pause.")];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(3);
    expect(segments[0]!.text).toBe("Before pause.");
    expect(segments[0]!.isPause).toBe(false);

    expect(segments[1]!.isPause).toBe(true);
    expect(segments[1]!.pauseDurationMs).toBe(2000);
    expect(segments[1]!.text).toBe("");

    expect(segments[2]!.text).toBe("After pause.");
    expect(segments[2]!.isPause).toBe(false);
  });

  it("detects [read_output:name] dynamic references", () => {
    const blocks = [
      block("The latency is [read_output:latency] milliseconds.", {
        dynamicRefs: ["latency"],
      }),
    ];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.isDeferred).toBe(true);
    expect(segments[0]!.dynamicRefs).toContain("latency");
  });

  it("strips markdown formatting (bold, italic, code)", () => {
    const blocks = [block("This is **bold** and *italic* and `code` text.")];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.text).toBe("This is bold and italic and code text.");
  });

  it("handles empty narration blocks", () => {
    const blocks: NarrationBlock[] = [];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(0);
  });

  it("handles narration block with only whitespace", () => {
    const blocks = [block("   ")];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(0);
  });

  it("handles multiple dynamic refs in one segment", () => {
    const blocks = [
      block("Got [read_output:status] with latency [read_output:latency]ms.", {
        dynamicRefs: ["status", "latency"],
      }),
    ];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.isDeferred).toBe(true);
    expect(segments[0]!.dynamicRefs).toContain("status");
    expect(segments[0]!.dynamicRefs).toContain("latency");
  });

  it("speed override is passed through", () => {
    const blocks = [block("Fast narration.", { speed: 1.5 })];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.speed).toBe(1.5);
  });

  it("handles [pause] with fractional seconds", () => {
    const blocks = [block("[pause 0.5s]")];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.isPause).toBe(true);
    expect(segments[0]!.pauseDurationMs).toBe(500);
  });

  it("strips markdown links, keeping only the text", () => {
    const blocks = [block("Visit [our website](https://example.com) for more info.")];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.text).toBe("Visit our website for more info.");
  });

  it("handles question marks and exclamation marks as sentence boundaries", () => {
    const blocks = [block("Is it working? Yes! It works.")];
    const segments = preprocessNarration(blocks, config);

    expect(segments).toHaveLength(3);
    expect(segments[0]!.text).toBe("Is it working?");
    expect(segments[1]!.text).toBe("Yes!");
    expect(segments[2]!.text).toBe("It works.");
  });
});
