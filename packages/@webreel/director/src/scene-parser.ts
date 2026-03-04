/**
 * Scene content parser — extracts surface config, narration blocks,
 * action directives, transitions, and director notes from the lines
 * within a single scene (between H2 headings).
 */

import type {
  Scene,
  SceneSurfaceConfig,
  NarrationBlock,
  ActionDirective,
  TransitionConfig,
  CaptureSpec,
} from "./types.js";
import type { LineInfo } from "./parser.js";
const BLOCKQUOTE_RE = /^>\s*(.*)/;
const BULLET_RE = /^-\s+(.*)/;
const CAPTURE_INDENT_RE = /^\s{2,}(\w+):\s*regex\("(.+?)"\)/;
const DYNAMIC_REF_RE = /\[read_output:(\w+)\]/g;

/**
 * Parse the content lines of a single scene into a Scene IR node.
 */
export function parseSceneContent(
  lines: LineInfo[],
  sceneName: string,
  durationHint?: number,
): Scene {
  const surface = { type: "", options: {} as Record<string, unknown> };
  const narration: NarrationBlock[] = [];
  const actions: ActionDirective[] = [];
  const directorNotes: string[] = [];
  let transitionIn: TransitionConfig | undefined;
  let transitionOut: TransitionConfig | undefined;

  let i = 0;

  // --- Phase 1: Parse leading blockquote (surface config) ---
  i = parseBlockquoteConfig(lines, i, surface, directorNotes, (key, val) => {
    if (key === "transition_in") transitionIn = parseTransition(val);
    else if (key === "transition_out") transitionOut = parseTransition(val);
  });

  // --- Phase 2: Parse remaining content (narration + actions) ---
  while (i < lines.length) {
    const { text, line: lineNum } = lines[i];
    const trimmed = text.trim();

    // Skip blank lines
    if (trimmed === "") {
      i++;
      continue;
    }

    // Skip horizontal rules
    if (trimmed === "---") {
      i++;
      continue;
    }

    // Blockquote lines after surface config: director notes or additional config
    const bqMatch = BLOCKQUOTE_RE.exec(trimmed);
    if (bqMatch) {
      const bqContent = bqMatch[1].trim();
      if (bqContent.toLowerCase().startsWith("note:")) {
        directorNotes.push(bqContent.slice(5).trim());
      }
      i++;
      continue;
    }

    // Action directive (bullet list)
    const bulletMatch = BULLET_RE.exec(trimmed);
    if (bulletMatch) {
      const { action, nextIndex } = parseActionDirective(
        bulletMatch[1],
        lineNum,
        lines,
        i,
      );
      actions.push(action);
      i = nextIndex;
      continue;
    }

    // Quoted narration: "text..."
    if (trimmed.startsWith('"')) {
      const { block, nextIndex } = parseQuotedNarration(lines, i);
      narration.push(block);
      i = nextIndex;
      continue;
    }

    // Plain text paragraph → narration
    const { block, nextIndex } = parsePlainNarration(lines, i);
    narration.push(block);
    i = nextIndex;
  }

  return {
    name: sceneName,
    surface: surface as SceneSurfaceConfig,
    narration,
    actions,
    transitions: { in: transitionIn, out: transitionOut },
    directorNotes,
    durationHint,
  };
}

// ---------------------------------------------------------------------------
// Blockquote Config Parsing
// ---------------------------------------------------------------------------

function parseBlockquoteConfig(
  lines: LineInfo[],
  startIdx: number,
  surface: { type: string; options: Record<string, unknown> },
  directorNotes: string[],
  onSpecialKey: (key: string, value: string) => void,
): number {
  let i = startIdx;

  // Skip leading blank lines
  while (i < lines.length && lines[i].text.trim() === "") i++;

  while (i < lines.length) {
    const trimmed = lines[i].text.trim();
    const bqMatch = BLOCKQUOTE_RE.exec(trimmed);
    if (!bqMatch) break;

    const content = bqMatch[1].trim();

    // Director notes
    if (content.toLowerCase().startsWith("note:")) {
      directorNotes.push(content.slice(5).trim());
      i++;
      continue;
    }

    // Key-value pair
    const colonIdx = content.indexOf(":");
    if (colonIdx > 0) {
      const key = content.slice(0, colonIdx).trim().toLowerCase();
      const value = content.slice(colonIdx + 1).trim();

      if (key === "surface") {
        surface.type = value;
      } else if (key === "transition_in" || key === "transition_out") {
        onSpecialKey(key, value);
      } else {
        surface.options[key] = inferValue(value);
      }
    }

    i++;
  }

  return i;
}

// ---------------------------------------------------------------------------
// Narration Parsing
// ---------------------------------------------------------------------------

function parseQuotedNarration(
  lines: LineInfo[],
  startIdx: number,
): {
  block: NarrationBlock;
  nextIndex: number;
} {
  let i = startIdx;
  const firstLine = lines[i].text.trim();

  // Remove opening quote
  let text = firstLine.startsWith('"') ? firstLine.slice(1) : firstLine;

  // Check if closing quote is on the same line
  if (text.endsWith('"')) {
    text = text.slice(0, -1);
    return { block: buildNarrationBlock(text.trim()), nextIndex: i + 1 };
  }

  // Multi-line: collect until closing quote
  i++;
  while (i < lines.length) {
    const line = lines[i].text.trim();
    if (line.endsWith('"')) {
      text += " " + line.slice(0, -1);
      i++;
      break;
    }
    if (line === "") {
      // Paragraph break — treat as end of narration
      break;
    }
    text += " " + line;
    i++;
  }

  return { block: buildNarrationBlock(text.trim()), nextIndex: i };
}

function parsePlainNarration(
  lines: LineInfo[],
  startIdx: number,
): {
  block: NarrationBlock;
  nextIndex: number;
} {
  let text = "";
  let i = startIdx;

  while (i < lines.length) {
    const trimmed = lines[i].text.trim();
    // Stop at blank line, bullet, blockquote, or heading
    if (
      trimmed === "" ||
      trimmed.startsWith("-") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("#")
    ) {
      break;
    }
    text += (text ? " " : "") + trimmed;
    i++;
  }

  return { block: buildNarrationBlock(text.trim()), nextIndex: i };
}

function buildNarrationBlock(text: string): NarrationBlock {
  const dynamicRefs: string[] = [];
  let match: RegExpExecArray | null;
  const refRe = new RegExp(DYNAMIC_REF_RE.source, "g");
  while ((match = refRe.exec(text)) !== null) {
    dynamicRefs.push(match[1]);
  }

  return { text, dynamicRefs };
}

// ---------------------------------------------------------------------------
// Action Directive Parsing
// ---------------------------------------------------------------------------

function parseActionDirective(
  bulletContent: string,
  lineNum: number,
  lines: LineInfo[],
  currentIdx: number,
): { action: ActionDirective; nextIndex: number } {
  const colonIdx = bulletContent.indexOf(":");
  if (colonIdx === -1) {
    // Action with no params (e.g., "- clear")
    return {
      action: { type: bulletContent.trim(), params: {}, sourceLine: lineNum },
      nextIndex: currentIdx + 1,
    };
  }

  const type = bulletContent.slice(0, colonIdx).trim();
  const rawValue = bulletContent.slice(colonIdx + 1).trim();
  const params = parseActionParams(type, rawValue);

  // Check for indented capture block on following lines
  let nextIdx = currentIdx + 1;
  const captures: CaptureSpec[] = [];

  // Look for "  capture:" line
  if (nextIdx < lines.length && /^\s+capture:\s*$/.test(lines[nextIdx].text)) {
    nextIdx++;
    while (nextIdx < lines.length) {
      const capMatch = CAPTURE_INDENT_RE.exec(lines[nextIdx].text);
      if (!capMatch) break;
      captures.push({ name: capMatch[1], pattern: capMatch[2] });
      nextIdx++;
    }
  }

  const action: ActionDirective = {
    type,
    params,
    sourceLine: lineNum,
    ...(captures.length > 0 ? { captures } : {}),
  };

  return { action, nextIndex: nextIdx };
}

function parseActionParams(type: string, rawValue: string): Record<string, unknown> {
  if (!rawValue) return {};

  // Parse "with" and key=value syntax: `"#sel" with "label" style=highlight`
  const withIdx = rawValue.indexOf(" with ");
  if (withIdx !== -1) {
    const selector = unquote(rawValue.slice(0, withIdx).trim());
    const rest = rawValue.slice(withIdx + 6).trim();
    const kvPairs = parseKeyValuePairs(rest);
    return { selector, ...kvPairs };
  }

  // Parse "from ... to ..." syntax for drag actions
  const fromToMatch = /^from\s+(.+?)\s+to\s+(.+)$/.exec(rawValue);
  if (fromToMatch) {
    return { from: unquote(fromToMatch[1].trim()), to: unquote(fromToMatch[2].trim()) };
  }

  // Duration-based actions (wait, pause)
  if (type === "wait" || type === "pause") {
    const durMatch = /^([\d.]+)s?$/.exec(rawValue);
    if (durMatch) return { duration: parseFloat(durMatch[1]) };
  }

  // Default: map type-appropriate key name
  const value = unquote(rawValue);
  switch (type) {
    case "run":
      return { command: value };
    case "type_command":
    case "type":
    case "type_text":
      return { text: value };
    case "wait_for_output":
      return { pattern: value };
    case "highlight_output":
      return parseKeyValuePairs(rawValue);
    case "click":
    case "hover":
    case "remove_annotation":
    case "focus_window":
      return { selector: value };
    case "annotate":
    case "zoom":
    case "callout":
    case "redact":
      return parseAnnotationParams(type, rawValue);
    case "navigate":
      return { url: value };
    case "key":
    case "send_key":
    case "send_shortcut":
      return { key: value };
    case "select":
      return { selector: value };
    case "scroll":
      return parseScrollParams(rawValue);
    default:
      return { value };
  }
}

// ---------------------------------------------------------------------------
// Annotation Action Parsing
// ---------------------------------------------------------------------------

/**
 * Parse annotation action parameters from raw bullet text.
 *
 * Supported syntaxes:
 *   - annotate: "#selector" with "label" style=highlight
 *   - zoom: "#selector" scale=2x duration=1s
 *   - callout: "#selector" text="Look here" position=top-right
 *   - redact: "#selector" mode=blur intensity=10
 */
function parseAnnotationParams(type: string, rawValue: string): Record<string, unknown> {
  // Split: selector (first quoted or unquoted token) + remaining key=value pairs
  const selectorMatch = /^"([^"]+)"(.*)$/.exec(rawValue) ?? /^(\S+)(.*)$/.exec(rawValue);
  if (!selectorMatch) {
    return { selector: rawValue.trim() };
  }

  const selector = selectorMatch[1];
  const rest = selectorMatch[2].trim();
  const params: Record<string, unknown> = { selector };

  if (!rest) {
    return params;
  }

  // Extract text="..." (quoted value with spaces) before key=value parsing
  const textMatch = /text="([^"]*)"/.exec(rest);
  if (textMatch) {
    params.text = textMatch[1];
  }

  // Parse key=value pairs from the rest
  const kvRe = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = kvRe.exec(rest)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3];
    if (key === "text" && textMatch) continue; // already handled
    params[key] = inferAnnotationValue(key, val);
  }

  return params;
}

/**
 * Infer typed values for annotation-specific parameters.
 * Handles scale=2x, duration=1s, and standard value types.
 */
function inferAnnotationValue(key: string, value: string): unknown {
  // Scale values like "2x" or "1.5x"
  if (key === "scale") {
    const scaleMatch = /^([\d.]+)x$/.exec(value);
    if (scaleMatch) return parseFloat(scaleMatch[1]);
  }

  // Duration values like "1s", "500ms", "2.5s"
  if (key === "duration") {
    const msMatch = /^(\d+)ms$/.exec(value);
    if (msMatch) return parseInt(msMatch[1], 10) / 1000;
    const secMatch = /^([\d.]+)s$/.exec(value);
    if (secMatch) return parseFloat(secMatch[1]);
  }

  // Standard type inference
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") return num;
  return unquote(value);
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function parseTransition(value: string): TransitionConfig {
  const parts = value.trim().split(/\s+/);
  const type = (parts[0] ?? "cut") as TransitionConfig["type"];
  let durationMs: number | undefined;

  if (parts.length > 1) {
    const msMatch = /^(\d+)ms$/.exec(parts[1]);
    if (msMatch) {
      durationMs = parseInt(msMatch[1], 10);
    } else {
      const secMatch = /^([\d.]+)s$/.exec(parts[1]);
      if (secMatch) {
        durationMs = Math.round(parseFloat(secMatch[1]) * 1000);
      }
    }
  }

  return { type, durationMs };
}

function parseKeyValuePairs(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Extract quoted string first (label)
  const quotedMatch = /^"([^"]*)"(.*)/.exec(text);
  if (quotedMatch) {
    result.label = quotedMatch[1];
    text = quotedMatch[2].trim();
  }
  // Parse remaining key=value pairs
  const kvRe = /(\w+)=(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = kvRe.exec(text)) !== null) {
    result[match[1]] = inferValue(match[2]);
  }
  return result;
}

function parseScrollParams(rawValue: string): Record<string, unknown> {
  const toMatch = /^to\s+(.+)$/.exec(rawValue);
  if (toMatch) return { target: unquote(toMatch[1].trim()) };

  const parts = rawValue.split(/\s+/);
  return {
    direction: parts[0],
    ...(parts[1] ? { amount: parts[1] } : {}),
  };
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function inferValue(s: string): unknown {
  if (s === "true") return true;
  if (s === "false") return false;
  const num = Number(s);
  if (!isNaN(num) && s.trim() !== "") return num;
  return unquote(s);
}

/** Extract dynamic references from narration text (exported for testing). */
export function extractDynamicRefs(text: string): string[] {
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(DYNAMIC_REF_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}
