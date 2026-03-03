/**
 * Annotation-specific error types.
 *
 * Hierarchy:
 *   WebReelError (@webreel/core)
 *   └── AnnotationError
 *       ├── AnnotationNotFoundError  — unknown annotation type
 *       ├── AnnotationRenderError    — rendering failure
 *       └── AnnotationTargetError    — invalid target region
 */

import { WebReelError } from "@webreel/core";
import type { AnnotationType, AnnotationTarget } from "./types.js";

/**
 * Base error for annotation operations.
 */
export class AnnotationError extends WebReelError {
  public readonly annotationType: string;

  constructor(
    message: string,
    options: {
      annotationType: string;
      cause?: Error;
    },
  ) {
    super(message, { code: "ANNOTATION_ERROR", cause: options.cause });
    this.name = "AnnotationError";
    this.annotationType = options.annotationType;
  }
}

/**
 * Thrown when an annotation type is not registered in the registry.
 */
export class AnnotationNotFoundError extends AnnotationError {
  constructor(annotationType: AnnotationType | string) {
    super(
      `Annotation type "${annotationType}" is not registered. ` +
        `Register it via AnnotationRegistry.register() before use.`,
      { annotationType },
    );
    this.name = "AnnotationNotFoundError";
  }
}

/**
 * Thrown when annotation rendering fails (sharp error, invalid input, etc.).
 */
export class AnnotationRenderError extends AnnotationError {
  constructor(annotationType: string, message: string, cause?: Error) {
    super(`Render failed for "${annotationType}" annotation: ${message}`, {
      annotationType,
      cause,
    });
    this.name = "AnnotationRenderError";
  }
}

/**
 * Thrown when the annotation target region is invalid
 * (outside frame bounds, zero-size, negative dimensions).
 */
export class AnnotationTargetError extends AnnotationError {
  public readonly target: AnnotationTarget;

  constructor(annotationType: string, target: AnnotationTarget, message: string) {
    super(
      `Invalid target for "${annotationType}" annotation: ${message} ` +
        `(x=${target.x}, y=${target.y}, w=${target.width}, h=${target.height})`,
      { annotationType },
    );
    this.name = "AnnotationTargetError";
    this.target = target;
  }
}
