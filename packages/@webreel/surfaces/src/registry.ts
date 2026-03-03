import type { Surface, SurfaceConfig, SurfaceFactory } from "./types.js";
import { SurfaceNotFoundError } from "./errors.js";

/**
 * Registry of surface factories. The orchestrator uses this to create
 * surface instances from config — never importing concrete implementations directly.
 *
 * Adding a new surface = implement Surface interface + register here.
 * Zero changes to orchestrator.
 *
 * @example
 * ```ts
 * const registry = new SurfaceRegistry();
 * registry.register("terminal", (config) => new TerminalSurface(config));
 * registry.register("browser", (config) => new BrowserSurface(config));
 *
 * const surface = registry.create({ type: "terminal", viewport: { width: 1280, height: 720 } });
 * ```
 */
export class SurfaceRegistry {
  private readonly factories = new Map<string, SurfaceFactory>();

  /**
   * Register a surface factory for a given type.
   * Overwrites any existing factory for the same type.
   */
  register(type: string, factory: SurfaceFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * Create a surface instance from config.
   * @throws {SurfaceNotFoundError} if the surface type is not registered.
   */
  create(config: SurfaceConfig): Surface {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new SurfaceNotFoundError(config.type);
    }
    return factory(config);
  }

  /** Check if a surface type is registered. */
  has(type: string): boolean {
    return this.factories.has(type);
  }

  /** List all registered surface type names. */
  types(): readonly string[] {
    return [...this.factories.keys()];
  }

  /** Remove a registered surface type. */
  unregister(type: string): boolean {
    return this.factories.delete(type);
  }
}
