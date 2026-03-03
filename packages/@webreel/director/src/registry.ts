import type { LLMProvider, LLMProviderFactory } from "./types.js";
import { LLMError } from "./errors.js";

/**
 * Registry of LLM provider factories. The director uses this to create
 * provider instances from config — never importing concrete implementations.
 *
 * Adding a new LLM provider = implement LLMProvider + register here.
 * Zero changes to the authoring pipeline.
 *
 * @example
 * ```ts
 * const registry = new LLMProviderRegistry();
 * registry.register("anthropic", () => new AnthropicProvider());
 * registry.register("local", () => new LocalProvider());
 *
 * const provider = registry.create("anthropic");
 * await provider.initialize();
 * const result = await provider.generate("Write a demo script", { model: "claude-sonnet-4-20250514" });
 * ```
 */
export class LLMProviderRegistry {
  private readonly factories = new Map<string, LLMProviderFactory>();

  /**
   * Register an LLM provider factory.
   * Overwrites any existing factory for the same name.
   */
  register(name: string, factory: LLMProviderFactory): void {
    this.factories.set(name, factory);
  }

  /**
   * Create an LLM provider instance by name.
   * @throws {LLMError} if the provider is not registered.
   */
  create(name: string): LLMProvider {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new LLMError(
        name,
        `LLM provider "${name}" is not registered. Register it via LLMProviderRegistry.register().`,
      );
    }
    return factory();
  }

  /** Check if an LLM provider is registered. */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /** List all registered LLM provider names. */
  providers(): readonly string[] {
    return [...this.factories.keys()];
  }

  /** Remove a registered LLM provider. */
  unregister(name: string): boolean {
    return this.factories.delete(name);
  }
}
