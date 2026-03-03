/**
 * Demo Markdown parser — transforms a Markdown string with YAML front matter
 * into a typed DemoScript IR (Scene Graph).
 *
 * Parsing stages:
 *   1. Front matter extraction (YAML between --- fences)
 *   2. Heading tree construction (H1 = acts, H2 = scenes)
 *   3. Scene block parsing (blockquotes, narration, actions, notes)
 *   4. Dynamic reference extraction
 *   5. Validation
 *
 * Design: simple line-by-line parser — no full Markdown AST library.
 */

import { parse as parseYaml } from "yaml";
import type { DemoScript, ScriptMeta, Act, Scene } from "./types.js";
import { ParseError } from "./errors.js";
import { parseSceneContent } from "./scene-parser.js";
import { validate } from "./validator.js";

/** A line of text with its 1-based line number in the source. */
export interface LineInfo {
  readonly text: string;
  readonly line: number;
}

/**
 * Parse a Demo Markdown string into a DemoScript IR.
 *
 * @throws {ParseError} on malformed input with line numbers.
 * @throws {ValidationError} on structural issues (missing surface, etc.).
 */
export function parse(input: string): DemoScript {
  const rawLines = input.split("\n");
  const lines: LineInfo[] = rawLines.map((text, i) => ({ text, line: i + 1 }));

  const { meta, bodyLines } = extractFrontMatter(lines);
  const acts = buildHeadingTree(bodyLines);
  const script: DemoScript = { meta, acts };
  validate(script);
  return script;
}

// ---------------------------------------------------------------------------
// Stage 1: Front Matter Extraction
// ---------------------------------------------------------------------------

interface FrontMatterResult {
  meta: ScriptMeta;
  bodyLines: LineInfo[];
}

function extractFrontMatter(lines: LineInfo[]): FrontMatterResult {
  const firstNonEmpty = lines.findIndex((l) => l.text.trim() !== "");
  if (firstNonEmpty === -1) {
    throw new ParseError("Empty script — no content found.", { line: 1 });
  }

  if (lines[firstNonEmpty].text.trim() !== "---") {
    throw new ParseError("Script must start with YAML front matter (--- fence).", {
      line: lines[firstNonEmpty].line,
      suggestion: "Add a --- line at the top followed by YAML metadata and another ---.",
    });
  }

  const fenceStart = firstNonEmpty;
  let fenceEnd = -1;
  for (let i = fenceStart + 1; i < lines.length; i++) {
    if (lines[i].text.trim() === "---") {
      fenceEnd = i;
      break;
    }
  }

  if (fenceEnd === -1) {
    throw new ParseError("Unclosed front matter — missing closing --- fence.", {
      line: lines[fenceStart].line,
      suggestion: "Add a --- line after the YAML metadata block.",
    });
  }

  const yamlText = lines
    .slice(fenceStart + 1, fenceEnd)
    .map((l) => l.text)
    .join("\n");

  let rawMeta: Record<string, unknown>;
  try {
    rawMeta = (parseYaml(yamlText) as Record<string, unknown>) ?? {};
  } catch (e) {
    throw new ParseError(`Invalid YAML in front matter: ${(e as Error).message}`, {
      line: lines[fenceStart + 1].line,
      cause: e instanceof Error ? e : undefined,
    });
  }

  const meta = parseMeta(rawMeta, lines[fenceStart + 1].line);
  const bodyLines = lines.slice(fenceEnd + 1);
  return { meta, bodyLines };
}

function parseMeta(raw: Record<string, unknown>, startLine: number): ScriptMeta {
  const title = typeof raw.title === "string" ? raw.title : "";
  if (!title) {
    throw new ParseError("Front matter must include a 'title' field.", {
      line: startLine,
      suggestion: 'Add: title: "My Demo Title"',
    });
  }

  return {
    ...raw,
    title,
    duration: parseDuration(raw.duration),
    voice: typeof raw.voice === "string" ? raw.voice : undefined,
    viewport: parseViewport(raw.viewport),
    theme: typeof raw.theme === "string" ? raw.theme : undefined,
    output: parseOutputConfig(raw.output),
  };
}

// ---------------------------------------------------------------------------
// Stage 2: Heading Tree Construction
// ---------------------------------------------------------------------------

const H1_RE = /^#\s+(.+)$/;
const H2_RE = /^##\s+(.+)$/;
const DURATION_HINT_RE = /\((\d+(?:\.\d+)?(?:m|s|m\d+s))\)\s*$/;

function buildHeadingTree(bodyLines: LineInfo[]): Act[] {
  const acts: Act[] = [];
  let currentAct: {
    name: string;
    durationHint?: number;
    scenes: Scene[];
    line: number;
  } | null = null;
  let currentSceneLines: LineInfo[] = [];
  let currentSceneHeading: { name: string; durationHint?: number; line: number } | null =
    null;

  const flushScene = (): void => {
    if (currentSceneHeading && currentAct) {
      const scene = parseSceneContent(
        currentSceneLines,
        currentSceneHeading.name,
        currentSceneHeading.durationHint,
      );
      currentAct.scenes.push(scene);
    }
    currentSceneLines = [];
    currentSceneHeading = null;
  };

  const flushAct = (): void => {
    flushScene();
    if (currentAct) {
      acts.push({
        name: currentAct.name,
        durationHint: currentAct.durationHint,
        scenes: currentAct.scenes,
      });
    }
    currentAct = null;
  };

  for (const lineInfo of bodyLines) {
    const trimmed = lineInfo.text.trim();

    // Skip horizontal rules
    if (trimmed === "---") continue;

    const h1Match = H1_RE.exec(trimmed);
    if (h1Match) {
      flushAct();
      const { name, durationHint } = extractDurationHint(h1Match[1]);
      currentAct = { name, durationHint, scenes: [], line: lineInfo.line };
      continue;
    }

    const h2Match = H2_RE.exec(trimmed);
    if (h2Match) {
      flushScene();
      if (!currentAct) {
        // Auto-create a default act for scripts without explicit H1
        currentAct = { name: "Main", scenes: [], line: lineInfo.line };
      }
      const { name, durationHint } = extractDurationHint(h2Match[1]);
      currentSceneHeading = { name, durationHint, line: lineInfo.line };
      continue;
    }

    if (currentSceneHeading) {
      currentSceneLines.push(lineInfo);
    }
  }

  flushAct();

  if (acts.length === 0) {
    throw new ParseError(
      "Script must contain at least one act (# heading) or scene (## heading).",
      {
        line: bodyLines.length > 0 ? bodyLines[0].line : 1,
      },
    );
  }

  return acts;
}

function extractDurationHint(heading: string): { name: string; durationHint?: number } {
  const match = DURATION_HINT_RE.exec(heading);
  if (!match) return { name: heading.trim() };

  const name = heading.slice(0, match.index).trim();
  const durationHint = parseDuration(match[1]);
  return { name, durationHint };
}

// ---------------------------------------------------------------------------
// Utility: Duration & Viewport Parsing
// ---------------------------------------------------------------------------

/** Parse duration strings like "30s", "4m", "2m30s", or raw numbers. */
export function parseDuration(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;

  const str = value.trim();
  const minsMatch = /^(\d+)m(?:(\d+)s)?$/.exec(str);
  if (minsMatch) {
    const mins = parseInt(minsMatch[1], 10);
    const secs = minsMatch[2] ? parseInt(minsMatch[2], 10) : 0;
    return mins * 60 + secs;
  }

  const secsMatch = /^(\d+(?:\.\d+)?)s$/.exec(str);
  if (secsMatch) return parseFloat(secsMatch[1]);

  const num = parseFloat(str);
  return isNaN(num) ? undefined : num;
}

/** Parse viewport strings like "1920x1080" or objects. */
export function parseViewport(
  value: unknown,
): { readonly width: number; readonly height: number } | undefined {
  if (!value) return undefined;

  if (typeof value === "string") {
    const match = /^(\d+)x(\d+)$/.exec(value.trim());
    if (match) return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    return undefined;
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const w = typeof obj.width === "number" ? obj.width : undefined;
    const h = typeof obj.height === "number" ? obj.height : undefined;
    if (w && h) return { width: w, height: h };
  }

  return undefined;
}

function parseOutputConfig(
  value: unknown,
):
  | { readonly format?: string; readonly fps?: number; readonly quality?: string }
  | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  return {
    format: typeof obj.format === "string" ? obj.format : undefined,
    fps: typeof obj.fps === "number" ? obj.fps : undefined,
    quality: typeof obj.quality === "string" ? obj.quality : undefined,
  };
}
