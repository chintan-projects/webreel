/**
 * Register all built-in LLM providers with a registry.
 *
 * Call this once at startup to make all default providers available
 * via `registry.create("anthropic")`, etc.
 */

import type { LLMProviderRegistry } from "../registry.js";
import {
  createAnthropicProvider,
  createOpenAIProvider,
  createOpenRouterProvider,
  createTogetherProvider,
  createOllamaProvider,
} from "./factories.js";

/**
 * Register all built-in LLM provider factories with the given registry.
 *
 * Registers: `anthropic`, `openai`, `openrouter`, `together`, `ollama`.
 */
export function registerDefaultProviders(registry: LLMProviderRegistry): void {
  registry.register("anthropic", createAnthropicProvider);
  registry.register("openai", createOpenAIProvider);
  registry.register("openrouter", createOpenRouterProvider);
  registry.register("together", createTogetherProvider);
  registry.register("ollama", createOllamaProvider);
}
