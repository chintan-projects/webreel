/**
 * Format parsing utilities for multi-format output support.
 *
 * Parses comma-separated format strings (e.g., "mp4,webm,gif") into
 * validated format arrays. Used by the render pipeline to produce
 * multiple output files from a single render pass.
 */

/** Supported output formats. */
const SUPPORTED_FORMATS = new Set(["mp4", "webm", "gif", "html"]);

/**
 * Parse a format string into an array of format identifiers.
 *
 * Accepts a single format ("mp4") or comma-separated list ("mp4,webm,gif").
 * Trims whitespace, filters empty entries, and deduplicates.
 *
 * @param formatStr - Raw format string from CLI or config (e.g., "mp4,webm,gif").
 * @param defaultFormat - Fallback format when formatStr is undefined. Defaults to "mp4".
 * @returns Deduplicated array of format strings.
 *
 * @example
 * ```ts
 * parseFormats("mp4,webm,gif");       // ["mp4", "webm", "gif"]
 * parseFormats(undefined);             // ["mp4"]
 * parseFormats(undefined, "webm");     // ["webm"]
 * parseFormats("mp4, webm , gif");     // ["mp4", "webm", "gif"]
 * parseFormats("mp4,,gif");            // ["mp4", "gif"]
 * parseFormats("mp4,mp4,webm");        // ["mp4", "webm"]
 * ```
 */
export function parseFormats(
  formatStr: string | undefined,
  defaultFormat?: string,
): readonly string[] {
  const raw = formatStr || defaultFormat || "mp4";
  const formats = raw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const f of formats) {
    if (!seen.has(f)) {
      seen.add(f);
      deduped.push(f);
    }
  }

  return deduped;
}

/**
 * Validate that all formats in the array are supported output formats.
 *
 * @param formats - Array of format strings to validate.
 * @returns Array of unsupported format strings, empty if all are valid.
 */
export function validateFormats(formats: readonly string[]): readonly string[] {
  return formats.filter((f) => !SUPPORTED_FORMATS.has(f));
}
