/**
 * Base error class for all webreel errors.
 *
 * Provides a typed error hierarchy:
 *   WebReelError
 *   ├── SurfaceError       (@webreel/surfaces)
 *   ├── NarrationError     (@webreel/narrator)
 *   ├── DirectorError      (@webreel/director — standalone, no core dep)
 *   └── AnnotationError    (@webreel/annotations)
 *
 * All errors include a machine-readable code for programmatic handling
 * and support the standard `cause` chain for root-cause analysis.
 */
export class WebReelError extends Error {
  public readonly code: string;

  constructor(
    message: string,
    options: { code: string; cause?: Error } = { code: "WEBREEL_ERROR" },
  ) {
    super(message, { cause: options.cause });
    this.name = "WebReelError";
    this.code = options.code;
  }
}
