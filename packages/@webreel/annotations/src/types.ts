/**
 * Annotation types for visual overlays in demo videos.
 *
 * Annotation renderers transform frame buffers by compositing
 * highlights, arrows, callouts, zoom effects, and redactions
 * onto captured PNG frames.
 */

/** Supported annotation types. */
export type AnnotationType =
  | "highlight"
  | "arrow"
  | "zoom"
  | "callout"
  | "redact"
  | "transition";

/** Target region for an annotation overlay (pixel coordinates). */
export interface AnnotationTarget {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Base annotation configuration shared by all types. */
export interface AnnotationConfig {
  readonly type: AnnotationType;
  readonly startMs: number;
  readonly durationMs: number;
  readonly target?: AnnotationTarget;
}

/** Highlight: dims the frame except for the target region. */
export interface HighlightConfig extends AnnotationConfig {
  readonly type: "highlight";
  /** Opacity for the dim overlay (0-1). Default: 0.6. */
  readonly dimOpacity?: number;
  /** Border color around the bright region (CSS color string). */
  readonly borderColor?: string;
  /** Border width in pixels. Default: 2. */
  readonly borderWidth?: number;
}

/** Arrow: draws a directional arrow pointing at the target. */
export interface ArrowConfig extends AnnotationConfig {
  readonly type: "arrow";
  /** Optional text label at the arrow origin. */
  readonly label?: string;
  /** Arrow color (CSS color string). Default: "#ff4444". */
  readonly color?: string;
  /** Arrow stroke thickness in pixels. Default: 3. */
  readonly thickness?: number;
  /** Edge from which the arrow originates. Default: "auto". */
  readonly from?: "left" | "right" | "top" | "bottom" | "auto";
}

/** Callout: a labeled box connected to the target by a line. */
export interface CalloutConfig extends AnnotationConfig {
  readonly type: "callout";
  /** Text content inside the callout box. */
  readonly text: string;
  /** Box background color (CSS color string). Default: "#333333". */
  readonly backgroundColor?: string;
  /** Text color inside the box (CSS color string). Default: "#ffffff". */
  readonly textColor?: string;
  /** Preferred callout box position relative to target. Default: "auto". */
  readonly position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "auto";
}

/** Zoom: Ken Burns smooth zoom into the target region. */
export interface ZoomConfig extends AnnotationConfig {
  readonly type: "zoom";
  /** Maximum zoom scale factor. Default: 2.0. */
  readonly maxScale?: number;
  /** Easing function for zoom interpolation. Default: "ease-in-out". */
  readonly easing?: "linear" | "ease-in-out";
}

/** Redact: obscures the target region with blur or pixelation. */
export interface RedactConfig extends AnnotationConfig {
  readonly type: "redact";
  /** Redaction mode. Default: "blur". */
  readonly mode?: "blur" | "pixelate";
  /** Intensity: blur sigma (default 10) or pixel block size (default 10). */
  readonly intensity?: number;
}

/** Union of all concrete annotation config types. */
export type AnyAnnotationConfig =
  | HighlightConfig
  | ArrowConfig
  | CalloutConfig
  | ZoomConfig
  | RedactConfig;

/**
 * An annotation renderer transforms a frame buffer by compositing
 * a visual overlay based on its config and current timestamp.
 */
export interface AnnotationRenderer {
  readonly type: AnnotationType;

  /**
   * Render the annotation onto a frame at the given timestamp.
   *
   * @param frame - Input PNG buffer.
   * @param config - Annotation config with target, timing, and style.
   * @param timestampMs - Current playback timestamp in milliseconds.
   * @returns New PNG buffer with the annotation composited.
   */
  render(frame: Buffer, config: AnnotationConfig, timestampMs: number): Promise<Buffer>;
}

/** Factory function that creates an annotation renderer instance. */
export type AnnotationRendererFactory = () => AnnotationRenderer;

/**
 * An annotation layer pairs a renderer with its config.
 * Used by the compositor to apply annotations in declaration order.
 */
export interface AnnotationLayer {
  readonly renderer: AnnotationRenderer;
  readonly config: AnnotationConfig;
}
