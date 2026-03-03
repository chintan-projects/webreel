/**
 * Default annotation registry with all built-in renderers registered.
 *
 * Usage:
 * ```ts
 * const registry = createDefaultAnnotationRegistry();
 * const renderer = registry.create("highlight");
 * ```
 */

import { AnnotationRegistry } from "./registry.js";
import { HighlightRenderer } from "./renderers/highlight.js";
import { ArrowRenderer } from "./renderers/arrow.js";
import { CalloutRenderer } from "./renderers/callout.js";
import { ZoomRenderer } from "./renderers/zoom.js";
import { RedactRenderer } from "./renderers/redact.js";

/**
 * Create an AnnotationRegistry pre-populated with all built-in
 * annotation renderers: highlight, arrow, callout, zoom, redact.
 */
export function createDefaultAnnotationRegistry(): AnnotationRegistry {
  const registry = new AnnotationRegistry();

  registry.register("highlight", () => new HighlightRenderer());
  registry.register("arrow", () => new ArrowRenderer());
  registry.register("callout", () => new CalloutRenderer());
  registry.register("zoom", () => new ZoomRenderer());
  registry.register("redact", () => new RedactRenderer());

  return registry;
}
