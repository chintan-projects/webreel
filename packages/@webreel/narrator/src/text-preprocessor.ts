/**
 * Text preprocessing for narration blocks.
 *
 * Splits narration text into sentence-level segments, handles [pause Ns]
 * directives (silent gaps), and [read_output:name] dynamic references
 * (deferred segments resolved at runtime). Strips markdown formatting
 * so TTS receives clean plaintext.
 */

import type { NarrationBlock } from "@webreel/director";
import type { NarratorConfig } from "./types.js";

/** A preprocessed narration segment ready for TTS generation or deferral. */
export interface PreprocessedSegment {
  /** Clean text for TTS (empty string for pause segments). */
  readonly text: string;
  /** Whether this segment contains unresolved dynamic references. */
  readonly isDeferred: boolean;
  /** Names of dynamic references in this segment (e.g., ["latency"]). */
  readonly dynamicRefs: readonly string[];
  /** Whether this segment is a silent pause. */
  readonly isPause: boolean;
  /** Duration in milliseconds (only set for pause segments). */
  readonly pauseDurationMs?: number;
  /** Per-segment speed override (from the source NarrationBlock). */
  readonly speed?: number;
  /** Whether the next action should wait for this narration to finish. */
  readonly waitForNarration: boolean;
}

/** Pattern matching [pause Ns] directives (e.g., "[pause 2s]", "[pause 0.5s]"). */
const PAUSE_PATTERN = /\[pause\s+([\d.]+)s\]/gi;

/** Pattern matching [read_output:name] dynamic references. */
const DYNAMIC_REF_PATTERN = /\[read_output:(\w+)\]/g;

/** Sentence boundary: period, question mark, or exclamation followed by whitespace. */
const SENTENCE_BOUNDARY = /(?<=[.?!])\s+/;

/**
 * Strip markdown inline formatting from text for clean TTS input.
 * Removes bold (**text**), italic (*text* or _text_), inline code (`text`),
 * and links ([text](url) -> text).
 */
function stripMarkdown(text: string): string {
  return (
    text
      // Links: [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Bold: **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      // Italic: *text* or _text_ (single markers)
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1")
      // Inline code: `text`
      .replace(/`(.+?)`/g, "$1")
      // Clean up extra whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Extract dynamic reference names from text.
 * Returns an array of reference names (e.g., ["latency", "model_name"]).
 */
function extractDynamicRefs(text: string): readonly string[] {
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(DYNAMIC_REF_PATTERN.source, "g");
  while ((match = pattern.exec(text)) !== null) {
    refs.push(match[1]!);
  }
  return refs;
}

/**
 * Preprocess narration blocks into segments ready for TTS generation.
 *
 * 1. Splits text at sentence boundaries.
 * 2. Extracts [pause Ns] directives into silent segments.
 * 3. Identifies [read_output:name] references for deferred generation.
 * 4. Strips markdown formatting from TTS text.
 *
 * @param blocks - Narration blocks from the parsed Demo Markdown scene.
 * @param _config - Narrator configuration (reserved for future preprocessing options).
 * @returns Array of preprocessed segments in sequential order.
 */
export function preprocessNarration(
  blocks: readonly NarrationBlock[],
  _config: NarratorConfig,
): PreprocessedSegment[] {
  const segments: PreprocessedSegment[] = [];

  for (const block of blocks) {
    const blockSpeed = block.speed;
    const parts = splitWithPauses(block.text);

    for (const part of parts) {
      const pauseMatch = /^\[pause\s+([\d.]+)s\]$/i.exec(part.trim());
      if (pauseMatch) {
        const durationSec = parseFloat(pauseMatch[1]!);
        segments.push({
          text: "",
          isDeferred: false,
          dynamicRefs: [],
          isPause: true,
          pauseDurationMs: Math.round(durationSec * 1000),
          speed: blockSpeed,
          waitForNarration: false,
        });
        continue;
      }

      const cleaned = stripMarkdown(part);
      if (cleaned.length === 0) {
        continue;
      }

      const sentences = cleaned
        .split(SENTENCE_BOUNDARY)
        .filter((s) => s.trim().length > 0);

      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        const refs = extractDynamicRefs(trimmed);
        const isDeferred = refs.length > 0;

        segments.push({
          text: trimmed,
          isDeferred,
          dynamicRefs: refs,
          isPause: false,
          speed: blockSpeed,
          waitForNarration: true,
        });
      }
    }
  }

  return segments;
}

/**
 * Split text around [pause Ns] directives, preserving the directives
 * as separate parts so they can become silent segments.
 */
function splitWithPauses(text: string): string[] {
  const parts: string[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(PAUSE_PATTERN.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before.length > 0) {
      parts.push(before);
    }
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}
