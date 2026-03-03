// --- Types ---
export type {
  AnnotationType,
  AnnotationConfig,
  AnnotationTarget,
  AnnotationRenderer,
  AnnotationRendererFactory,
  AnnotationLayer,
  HighlightConfig,
  ArrowConfig,
  CalloutConfig,
  ZoomConfig,
  RedactConfig,
  AnyAnnotationConfig,
} from "./types.js";

// --- Errors ---
export {
  AnnotationError,
  AnnotationNotFoundError,
  AnnotationRenderError,
  AnnotationTargetError,
} from "./errors.js";

// --- Registry ---
export { AnnotationRegistry } from "./registry.js";

// --- Renderers ---
export { HighlightRenderer } from "./renderers/highlight.js";
export { ArrowRenderer } from "./renderers/arrow.js";
export { CalloutRenderer } from "./renderers/callout.js";
export { ZoomRenderer } from "./renderers/zoom.js";
export { RedactRenderer } from "./renderers/redact.js";

// --- Compositor ---
export { composeAnnotations, isAnnotationActive } from "./compositor.js";

// --- Defaults ---
export { createDefaultAnnotationRegistry } from "./defaults.js";
