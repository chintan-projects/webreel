/**
 * Registry of annotation renderer factories.
 *
 * The compositor uses this to create renderer instances from config.
 * Adding a new annotation type = implement AnnotationRenderer + register here.
 * Zero changes to compositor.
 *
 * @example
 * ```ts
 * const registry = new AnnotationRegistry();
 * registry.register("highlight", () => new HighlightRenderer());
 * registry.register("arrow", () => new ArrowRenderer());
 *
 * const renderer = registry.create("highlight");
 * ```
 */

import type {
  AnnotationType,
  AnnotationRenderer,
  AnnotationRendererFactory,
} from "./types.js";
import { AnnotationNotFoundError } from "./errors.js";

export class AnnotationRegistry {
  private readonly factories = new Map<string, AnnotationRendererFactory>();

  /**
   * Register a renderer factory for a given annotation type.
   * Overwrites any existing factory for the same type.
   */
  register(type: AnnotationType | string, factory: AnnotationRendererFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * Create a renderer instance for the given annotation type.
   * @throws {AnnotationNotFoundError} if the type is not registered.
   */
  create(type: AnnotationType | string): AnnotationRenderer {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new AnnotationNotFoundError(type);
    }
    return factory();
  }

  /** Check if an annotation type is registered. */
  has(type: AnnotationType | string): boolean {
    return this.factories.has(type);
  }

  /** List all registered annotation type names. */
  types(): readonly string[] {
    return [...this.factories.keys()];
  }

  /** Remove a registered annotation type. */
  unregister(type: AnnotationType | string): boolean {
    return this.factories.delete(type);
  }
}
