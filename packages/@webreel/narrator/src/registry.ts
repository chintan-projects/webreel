import type { TTSProvider, TTSProviderFactory } from "./types.js";
import { TTSProviderNotFoundError } from "./errors.js";

/**
 * Registry of TTS provider factories. The narration engine uses this
 * to create provider instances from config — never importing concrete
 * implementations directly.
 *
 * Adding a new TTS provider = implement TTSProvider + register here.
 * Zero changes to the narration engine.
 *
 * @example
 * ```ts
 * const registry = new TTSProviderRegistry();
 * registry.register("kokoro", () => new KokoroProvider());
 * registry.register("piper", () => new PiperProvider());
 *
 * const provider = registry.create("kokoro");
 * await provider.initialize();
 * const result = await provider.generate("Hello world", { voice: "af_heart", speed: 1.0 });
 * ```
 */
export class TTSProviderRegistry {
  private readonly factories = new Map<string, TTSProviderFactory>();

  /**
   * Register a TTS provider factory.
   * Overwrites any existing factory for the same name.
   */
  register(name: string, factory: TTSProviderFactory): void {
    this.factories.set(name, factory);
  }

  /**
   * Create a TTS provider instance by name.
   * @throws {TTSProviderNotFoundError} if the provider is not registered.
   */
  create(name: string): TTSProvider {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new TTSProviderNotFoundError(name);
    }
    return factory();
  }

  /** Check if a TTS provider is registered. */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /** List all registered TTS provider names. */
  providers(): readonly string[] {
    return [...this.factories.keys()];
  }

  /** Remove a registered TTS provider. */
  unregister(name: string): boolean {
    return this.factories.delete(name);
  }
}
