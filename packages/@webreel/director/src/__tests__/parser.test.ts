import { describe, it, expect } from "vitest";
import { parse, parseDuration, parseViewport } from "../parser.js";
import { parseSceneContent, extractDynamicRefs } from "../scene-parser.js";
import { validate } from "../validator.js";
import { ParseError, ValidationError } from "../errors.js";
import type { LineInfo } from "../parser.js";
import type { DemoScript } from "../types.js";

// ---------------------------------------------------------------------------
// Helper: build a minimal valid script string
// ---------------------------------------------------------------------------

function minimalScript(body: string): string {
  return `---
title: "Test Demo"
---
${body}`;
}

// ---------------------------------------------------------------------------
// 1. Front Matter Parsing
// ---------------------------------------------------------------------------

describe("parse — front matter", () => {
  it("parses minimal YAML front matter with title only", () => {
    const input = `---
title: "Hello World"
---
# Act One
## Scene One
> surface: terminal
`;
    const script = parse(input);
    expect(script.meta.title).toBe("Hello World");
    expect(script.meta.duration).toBeUndefined();
    expect(script.meta.voice).toBeUndefined();
  });

  it("parses full front matter with all fields", () => {
    const input = `---
title: "Full Demo"
duration: 2m30s
voice: "en-US-neural"
viewport: 1920x1080
theme: dark
output:
  format: mp4
  fps: 60
  quality: high
---
# Act One
## Scene One
> surface: browser
`;
    const script = parse(input);
    expect(script.meta.title).toBe("Full Demo");
    expect(script.meta.duration).toBe(150);
    expect(script.meta.voice).toBe("en-US-neural");
    expect(script.meta.viewport).toEqual({ width: 1920, height: 1080 });
    expect(script.meta.theme).toBe("dark");
    expect(script.meta.output).toEqual({
      format: "mp4",
      fps: 60,
      quality: "high",
    });
  });

  it("throws ParseError when front matter is missing", () => {
    expect(() => parse("# Act One\n## Scene\n> surface: terminal\n")).toThrow(ParseError);
  });

  it("throws ParseError when front matter is unclosed", () => {
    expect(() => parse("---\ntitle: Test\n# Act\n## Scene\n> surface: terminal")).toThrow(
      ParseError,
    );
  });

  it("throws ParseError when title is missing from front matter", () => {
    expect(() =>
      parse("---\nduration: 30s\n---\n# Act\n## Scene\n> surface: terminal"),
    ).toThrow(ParseError);
  });

  it("throws ParseError on empty input", () => {
    expect(() => parse("")).toThrow(ParseError);
  });

  it("throws ParseError on invalid YAML", () => {
    expect(() =>
      parse("---\ntitle: [invalid: yaml:\n---\n# A\n## S\n> surface: terminal"),
    ).toThrow(ParseError);
  });

  it("preserves arbitrary front matter fields", () => {
    const input = `---
title: "Custom"
author: "Test Author"
version: 2
---
# Act
## Scene
> surface: terminal
`;
    const script = parse(input);
    expect(script.meta.author).toBe("Test Author");
    expect(script.meta.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Heading Tree / Acts & Scenes
// ---------------------------------------------------------------------------

describe("parse — heading tree", () => {
  it("parses a single act with one scene", () => {
    const script = parse(
      minimalScript(`
# Getting Started
## Terminal Setup
> surface: terminal

"Welcome to the demo."

- run: "echo hello"
`),
    );
    expect(script.acts).toHaveLength(1);
    expect(script.acts[0].name).toBe("Getting Started");
    expect(script.acts[0].scenes).toHaveLength(1);
    expect(script.acts[0].scenes[0].name).toBe("Terminal Setup");
  });

  it("parses multiple acts with multiple scenes", () => {
    const script = parse(
      minimalScript(`
# Act One
## Scene A
> surface: terminal
"Narration A"

## Scene B
> surface: browser
"Narration B"

# Act Two
## Scene C
> surface: title
"Narration C"
`),
    );
    expect(script.acts).toHaveLength(2);
    expect(script.acts[0].name).toBe("Act One");
    expect(script.acts[0].scenes).toHaveLength(2);
    expect(script.acts[1].name).toBe("Act Two");
    expect(script.acts[1].scenes).toHaveLength(1);
  });

  it("auto-creates Main act when H2 appears without H1", () => {
    const script = parse(
      minimalScript(`
## Direct Scene
> surface: terminal
"Hello from a scene without an explicit act."
`),
    );
    expect(script.acts).toHaveLength(1);
    expect(script.acts[0].name).toBe("Main");
    expect(script.acts[0].scenes).toHaveLength(1);
    expect(script.acts[0].scenes[0].name).toBe("Direct Scene");
  });

  it("throws ParseError when no acts or scenes are found", () => {
    expect(() => parse(minimalScript("Just some text with no headings."))).toThrow(
      ParseError,
    );
  });

  it("extracts duration hints from act and scene headings", () => {
    const script = parse(
      minimalScript(`
# Introduction (1m30s)
## Greeting (15s)
> surface: terminal
"Hello"
`),
    );
    expect(script.acts[0].durationHint).toBe(90);
    expect(script.acts[0].scenes[0].durationHint).toBe(15);
  });

  it("skips horizontal rules in body content", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal

---

"Some narration after a horizontal rule."
`),
    );
    expect(script.acts[0].scenes[0].narration).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Scene Content Parsing
// ---------------------------------------------------------------------------

describe("parse — scene content", () => {
  it("parses surface type from blockquote config", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal
> shell: bash
> cwd: /home/user
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.surface.type).toBe("terminal");
    expect(scene.surface.options.shell).toBe("bash");
    expect(scene.surface.options.cwd).toBe("/home/user");
  });

  it("parses quoted narration blocks", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal

"This is the first narration block."

"This is the second narration block."
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.narration).toHaveLength(2);
    expect(scene.narration[0].text).toBe("This is the first narration block.");
    expect(scene.narration[1].text).toBe("This is the second narration block.");
  });

  it("parses multi-line quoted narration", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal

"This narration spans
multiple lines and should be
joined together."
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.narration).toHaveLength(1);
    expect(scene.narration[0].text).toBe(
      "This narration spans multiple lines and should be joined together.",
    );
  });

  it("parses plain text paragraphs as narration", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal

This is plain text narration without quotes.
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.narration).toHaveLength(1);
    expect(scene.narration[0].text).toBe("This is plain text narration without quotes.");
  });

  it("parses action directives from bullet lists", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal

- run: "npm install"
- wait: 2s
- type_command: "npm start"
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions).toHaveLength(3);
    expect(scene.actions[0].type).toBe("run");
    expect(scene.actions[0].params.command).toBe("npm install");
    expect(scene.actions[1].type).toBe("wait");
    expect(scene.actions[1].params.duration).toBe(2);
    expect(scene.actions[2].type).toBe("type_command");
    expect(scene.actions[2].params.text).toBe("npm start");
  });

  it("parses action with no params", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal
- clear
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions).toHaveLength(1);
    expect(scene.actions[0].type).toBe("clear");
    expect(scene.actions[0].params).toEqual({});
  });

  it("parses click action with selector", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: browser

- click: "#submit-button"
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions[0].type).toBe("click");
    expect(scene.actions[0].params.selector).toBe("#submit-button");
  });

  it("parses navigate action with url", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: browser

- navigate: "https://example.com"
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions[0].type).toBe("navigate");
    expect(scene.actions[0].params.url).toBe("https://example.com");
  });

  it("parses action with 'with' syntax for annotations", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: browser

- annotate: "#hero" with "Main heading" style=highlight
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions[0].type).toBe("annotate");
    expect(scene.actions[0].params.selector).toBe("#hero");
    expect(scene.actions[0].params.label).toBe("Main heading");
    expect(scene.actions[0].params.style).toBe("highlight");
  });

  it("parses director notes from blockquotes", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal
> note: This is a director note for planning context.

"Narration goes here."

> note: Another note after narration.
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.directorNotes).toHaveLength(2);
    expect(scene.directorNotes[0]).toBe("This is a director note for planning context.");
    expect(scene.directorNotes[1]).toBe("Another note after narration.");
  });

  it("parses transition config from blockquote", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal
> transition_in: crossfade 500ms
> transition_out: fade-to-black 300ms
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.transitions.in).toEqual({ type: "crossfade", durationMs: 500 });
    expect(scene.transitions.out).toEqual({ type: "fade-to-black", durationMs: 300 });
  });

  it("parses transition duration in seconds format", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal
> transition_in: crossfade 1s
> transition_out: fade-to-black 0.5s
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.transitions.in).toEqual({ type: "crossfade", durationMs: 1000 });
    expect(scene.transitions.out).toEqual({ type: "fade-to-black", durationMs: 500 });
  });

  it("parses new transition types (slide-left, slide-right, slide-up, wipe)", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene A
> surface: terminal
> transition_in: slide-left 300ms

## Scene B
> surface: terminal
> transition_in: slide-right 400ms

## Scene C
> surface: terminal
> transition_in: slide-up 500ms

## Scene D
> surface: terminal
> transition_in: wipe 600ms
`),
    );
    expect(script.acts[0].scenes[0].transitions.in).toEqual({
      type: "slide-left",
      durationMs: 300,
    });
    expect(script.acts[0].scenes[1].transitions.in).toEqual({
      type: "slide-right",
      durationMs: 400,
    });
    expect(script.acts[0].scenes[2].transitions.in).toEqual({
      type: "slide-up",
      durationMs: 500,
    });
    expect(script.acts[0].scenes[3].transitions.in).toEqual({
      type: "wipe",
      durationMs: 600,
    });
  });

  it("parses scroll action params", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: browser

- scroll: to "#footer"
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions[0].type).toBe("scroll");
    expect(scene.actions[0].params.target).toBe("#footer");
  });

  it("parses scroll direction syntax", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: browser

- scroll: down 500px
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions[0].type).toBe("scroll");
    expect(scene.actions[0].params.direction).toBe("down");
    expect(scene.actions[0].params.amount).toBe("500px");
  });

  it("parses key/send_key action", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal

- key: "Enter"
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions[0].type).toBe("key");
    expect(scene.actions[0].params.key).toBe("Enter");
  });

  it("parses drag action with from/to syntax", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: desktop

- drag: from "#source" to "#target"
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions[0].type).toBe("drag");
    expect(scene.actions[0].params.from).toBe("#source");
    expect(scene.actions[0].params.to).toBe("#target");
  });
});

// ---------------------------------------------------------------------------
// 4. Dynamic References & Captures
// ---------------------------------------------------------------------------

describe("parse — dynamic references", () => {
  it("extracts dynamic refs from narration text", () => {
    const refs = extractDynamicRefs(
      "The latency is [read_output:latency] and model is [read_output:model_name].",
    );
    expect(refs).toEqual(["latency", "model_name"]);
  });

  it("returns empty array when no dynamic refs", () => {
    expect(extractDynamicRefs("No references here.")).toEqual([]);
  });

  it("stores dynamic refs on narration blocks", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal

"The response time was [read_output:latency]ms."

- run: "curl https://api.example.com"
  capture:
    latency: regex("(\\d+)ms")
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.narration[0].dynamicRefs).toEqual(["latency"]);
  });

  it("parses capture specifications on action directives", () => {
    const script = parse(
      minimalScript(`
# Act
## Scene
> surface: terminal

- run: "curl https://api.example.com"
  capture:
    latency: regex("(\\d+)ms")
    status: regex("HTTP/(\\d+)")
`),
    );
    const scene = script.acts[0].scenes[0];
    expect(scene.actions[0].captures).toHaveLength(2);
    expect(scene.actions[0].captures![0].name).toBe("latency");
    expect(scene.actions[0].captures![0].pattern).toBe("(\\d+)ms");
    expect(scene.actions[0].captures![1].name).toBe("status");
  });
});

// ---------------------------------------------------------------------------
// 5. Validation
// ---------------------------------------------------------------------------

describe("validate", () => {
  it("throws ValidationError when scene has no surface type", () => {
    // Build IR directly to bypass parser's own validation
    const script: DemoScript = {
      meta: { title: "Test" },
      acts: [
        {
          name: "Act One",
          scenes: [
            {
              name: "Bad Scene",
              surface: { type: "", options: {} },
              narration: [],
              actions: [],
              transitions: {},
              directorNotes: [],
            },
          ],
        },
      ],
    };
    expect(() => validate(script)).toThrow(ValidationError);
  });

  it("throws ValidationError when act has no scenes", () => {
    const script: DemoScript = {
      meta: { title: "Test" },
      acts: [{ name: "Empty Act", scenes: [] }],
    };
    expect(() => validate(script)).toThrow(ValidationError);
  });

  it("throws ValidationError when script has no acts", () => {
    const script: DemoScript = {
      meta: { title: "Test" },
      acts: [],
    };
    expect(() => validate(script)).toThrow(ValidationError);
  });

  it("does not throw for a valid script", () => {
    const script: DemoScript = {
      meta: { title: "Test" },
      acts: [
        {
          name: "Act One",
          scenes: [
            {
              name: "Scene One",
              surface: { type: "terminal", options: {} },
              narration: [],
              actions: [],
              transitions: {},
              directorNotes: [],
            },
          ],
        },
      ],
    };
    expect(() => validate(script)).not.toThrow();
  });

  it("includes warning for unknown surface type but does not throw", () => {
    const script: DemoScript = {
      meta: { title: "Test" },
      acts: [
        {
          name: "Act",
          scenes: [
            {
              name: "Scene",
              surface: { type: "custom-surface", options: {} },
              narration: [],
              actions: [],
              transitions: {},
              directorNotes: [],
            },
          ],
        },
      ],
    };
    // Unknown surface type only produces a warning, not an error,
    // so validate should not throw
    expect(() => validate(script)).not.toThrow();
  });

  it("includes warning for unmatched dynamic refs", () => {
    const script: DemoScript = {
      meta: { title: "Test" },
      acts: [
        {
          name: "Act",
          scenes: [
            {
              name: "Scene",
              surface: { type: "terminal", options: {} },
              narration: [
                {
                  text: "Value is [read_output:missing_ref]",
                  dynamicRefs: ["missing_ref"],
                },
              ],
              actions: [],
              transitions: {},
              directorNotes: [],
            },
          ],
        },
      ],
    };
    // Unmatched dynamic refs are warnings, not errors
    expect(() => validate(script)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. Utility: parseDuration
// ---------------------------------------------------------------------------

describe("parseDuration", () => {
  it("parses seconds string", () => {
    expect(parseDuration("30s")).toBe(30);
  });

  it("parses fractional seconds", () => {
    expect(parseDuration("1.5s")).toBe(1.5);
  });

  it("parses minutes string", () => {
    expect(parseDuration("4m")).toBe(240);
  });

  it("parses minutes + seconds string", () => {
    expect(parseDuration("2m30s")).toBe(150);
  });

  it("parses raw number", () => {
    expect(parseDuration(60)).toBe(60);
  });

  it("parses numeric string", () => {
    expect(parseDuration("45")).toBe(45);
  });

  it("returns undefined for null/undefined", () => {
    expect(parseDuration(undefined)).toBeUndefined();
    expect(parseDuration(null)).toBeUndefined();
  });

  it("returns undefined for non-parseable string", () => {
    expect(parseDuration("not-a-duration")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. Utility: parseViewport
// ---------------------------------------------------------------------------

describe("parseViewport", () => {
  it("parses WxH string", () => {
    expect(parseViewport("1920x1080")).toEqual({ width: 1920, height: 1080 });
  });

  it("parses object with width and height", () => {
    expect(parseViewport({ width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("returns undefined for invalid string", () => {
    expect(parseViewport("invalid")).toBeUndefined();
  });

  it("returns undefined for falsy values", () => {
    expect(parseViewport(undefined)).toBeUndefined();
    expect(parseViewport(null)).toBeUndefined();
    expect(parseViewport("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. parseSceneContent (direct unit tests)
// ---------------------------------------------------------------------------

describe("parseSceneContent", () => {
  function toLines(text: string): LineInfo[] {
    return text.split("\n").map((t, i) => ({ text: t, line: i + 1 }));
  }

  it("handles scene with only surface config", () => {
    const lines = toLines("> surface: terminal\n> shell: zsh");
    const scene = parseSceneContent(lines, "Empty Scene");
    expect(scene.name).toBe("Empty Scene");
    expect(scene.surface.type).toBe("terminal");
    expect(scene.surface.options.shell).toBe("zsh");
    expect(scene.narration).toHaveLength(0);
    expect(scene.actions).toHaveLength(0);
  });

  it("passes duration hint through", () => {
    const lines = toLines("> surface: title");
    const scene = parseSceneContent(lines, "Intro", 30);
    expect(scene.durationHint).toBe(30);
  });

  it("infers boolean and numeric values in surface options", () => {
    const lines = toLines("> surface: browser\n> fullscreen: true\n> zoom: 1.5");
    const scene = parseSceneContent(lines, "Browser Scene");
    expect(scene.surface.options.fullscreen).toBe(true);
    expect(scene.surface.options.zoom).toBe(1.5);
  });

  it("handles mixed narration and actions in order", () => {
    const lines = toLines(`> surface: terminal

"First narration."

- run: "echo hello"

"Second narration."

- run: "echo world"`);
    const scene = parseSceneContent(lines, "Mixed");
    expect(scene.narration).toHaveLength(2);
    expect(scene.actions).toHaveLength(2);
    expect(scene.narration[0].text).toBe("First narration.");
    expect(scene.narration[1].text).toBe("Second narration.");
    expect(scene.actions[0].params.command).toBe("echo hello");
    expect(scene.actions[1].params.command).toBe("echo world");
  });
});

// ---------------------------------------------------------------------------
// 9. Integration: Full Script Parsing (structurally different scripts)
// ---------------------------------------------------------------------------

describe("parse — integration", () => {
  it("parses terminal-only script", () => {
    const input = `---
title: "Terminal Demo"
duration: 45s
---
# CLI Walkthrough
## Install Dependencies
> surface: terminal
> shell: bash

"Let's install the project dependencies."

- run: "npm install"
- wait: 3s

## Run Tests
> surface: terminal

"Now we'll verify everything works."

- run: "npm test"
- wait_for_output: "All tests passed"
`;
    const script = parse(input);
    expect(script.meta.title).toBe("Terminal Demo");
    expect(script.meta.duration).toBe(45);
    expect(script.acts).toHaveLength(1);
    expect(script.acts[0].scenes).toHaveLength(2);
    expect(script.acts[0].scenes[0].surface.type).toBe("terminal");
    expect(script.acts[0].scenes[0].actions).toHaveLength(2);
    expect(script.acts[0].scenes[1].actions[1].type).toBe("wait_for_output");
    expect(script.acts[0].scenes[1].actions[1].params.pattern).toBe("All tests passed");
  });

  it("parses browser-only script with annotations", () => {
    const input = `---
title: "Browser Demo"
viewport: 1280x720
---
# Web App Tour
## Landing Page
> surface: browser
> url: https://example.com

"Welcome to our web application."

- navigate: "https://example.com"
- click: "#get-started"
- annotate: "#hero" with "Hero section" style=highlight

## Dashboard
> surface: browser
> transition_in: crossfade 300ms

"Here's the main dashboard."

- hover: ".sidebar-menu"
- click: "#analytics"
- scroll: to "#chart-section"
`;
    const script = parse(input);
    expect(script.meta.viewport).toEqual({ width: 1280, height: 720 });
    expect(script.acts).toHaveLength(1);
    expect(script.acts[0].scenes).toHaveLength(2);

    const landing = script.acts[0].scenes[0];
    expect(landing.surface.type).toBe("browser");
    expect(landing.surface.options.url).toBe("https://example.com");
    expect(landing.actions).toHaveLength(3);
    expect(landing.actions[2].params.label).toBe("Hero section");

    const dashboard = script.acts[0].scenes[1];
    expect(dashboard.transitions.in).toEqual({ type: "crossfade", durationMs: 300 });
    expect(dashboard.actions[2].params.target).toBe("#chart-section");
  });

  it("parses multi-act script with dynamic refs", () => {
    const input = `---
title: "Full Feature Demo"
duration: 3m
voice: "en-US-neural"
---
# Setup (30s)
## Initialize Project
> surface: terminal
> note: Start with a clean terminal

"First, let's set up our project."

- run: "mkdir demo && cd demo"
- type_command: "npm init -y"

# API Demo (1m)
## Make Request
> surface: terminal

"Now let's call the API and check the response time: [read_output:latency]ms."

- run: "curl -w '%{time_total}' https://api.example.com"
  capture:
    latency: regex("(\\d+\\.\\d+)")

## Show Results
> surface: browser
> transition_in: crossfade 500ms

"The results are displayed in the dashboard."

- navigate: "https://dashboard.example.com"
- click: "#refresh"

# Conclusion (15s)
## Wrap Up
> surface: title

"Thanks for watching!"
`;
    const script = parse(input);
    expect(script.meta.duration).toBe(180);
    expect(script.acts).toHaveLength(3);

    // Act 1: Setup
    expect(script.acts[0].name).toBe("Setup");
    expect(script.acts[0].durationHint).toBe(30);
    expect(script.acts[0].scenes).toHaveLength(1);
    expect(script.acts[0].scenes[0].directorNotes).toContain(
      "Start with a clean terminal",
    );

    // Act 2: API Demo
    expect(script.acts[1].name).toBe("API Demo");
    expect(script.acts[1].durationHint).toBe(60);
    expect(script.acts[1].scenes).toHaveLength(2);

    const apiScene = script.acts[1].scenes[0];
    expect(apiScene.narration[0].dynamicRefs).toContain("latency");
    expect(apiScene.actions[0].captures).toHaveLength(1);
    expect(apiScene.actions[0].captures![0].name).toBe("latency");

    const resultsScene = script.acts[1].scenes[1];
    expect(resultsScene.surface.type).toBe("browser");
    expect(resultsScene.transitions.in?.type).toBe("crossfade");

    // Act 3: Conclusion
    expect(script.acts[2].name).toBe("Conclusion");
    expect(script.acts[2].durationHint).toBe(15);
    expect(script.acts[2].scenes[0].surface.type).toBe("title");
  });
});

// ---------------------------------------------------------------------------
// 10. Error Quality
// ---------------------------------------------------------------------------

describe("parse — error quality", () => {
  it("ParseError includes line number", () => {
    try {
      parse("---\ntitle: Test\n# Act\n## Scene\n> surface: terminal");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      const pe = e as ParseError;
      expect(pe.line).toBeDefined();
      expect(pe.line).toBeGreaterThan(0);
    }
  });

  it("ParseError includes suggestion for missing front matter", () => {
    try {
      parse("# No front matter\n## Scene\n> surface: terminal");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      const pe = e as ParseError;
      expect(pe.suggestion).toBeDefined();
      expect(pe.suggestion!.length).toBeGreaterThan(0);
    }
  });

  it("ValidationError includes all issues", () => {
    const script: DemoScript = {
      meta: { title: "Test" },
      acts: [
        { name: "Act1", scenes: [] },
        { name: "Act2", scenes: [] },
      ],
    };
    try {
      validate(script);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      const ve = e as ValidationError;
      // Two acts with no scenes = 2 errors
      expect(ve.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
