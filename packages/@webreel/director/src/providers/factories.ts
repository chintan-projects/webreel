/**
 * Pre-configured factory functions for all built-in LLM providers.
 *
 * Each factory returns a provider instance ready for `initialize()`.
 * These are the functions registered into the `LLMProviderRegistry`
 * by `registerDefaultProviders()`.
 */

import type { LLMProvider } from "../types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

/** Create an Anthropic Claude provider. Requires `ANTHROPIC_API_KEY`. */
export function createAnthropicProvider(): LLMProvider {
  return new AnthropicProvider();
}

/** Create an OpenAI provider. Requires `OPENAI_API_KEY`. */
export function createOpenAIProvider(): LLMProvider {
  return new OpenAICompatibleProvider({
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    apiKeyEnvVar: "OPENAI_API_KEY",
  });
}

/**
 * Create an OpenRouter provider. Requires `OPENROUTER_API_KEY`.
 *
 * Sends `HTTP-Referer` and `X-Title` headers per OpenRouter's
 * API guidelines for app identification.
 */
export function createOpenRouterProvider(): LLMProvider {
  return new OpenAICompatibleProvider({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    defaultHeaders: {
      "HTTP-Referer": "https://webreel.dev",
      "X-Title": "webreel",
    },
  });
}

/** Create a Together AI provider. Requires `TOGETHER_API_KEY`. */
export function createTogetherProvider(): LLMProvider {
  return new OpenAICompatibleProvider({
    name: "together",
    baseURL: "https://api.together.xyz/v1",
    apiKeyEnvVar: "TOGETHER_API_KEY",
  });
}

/**
 * Create an Ollama provider (local, keyless).
 *
 * Connects to `http://localhost:11434/v1` by default.
 * No API key required.
 */
export function createOllamaProvider(): LLMProvider {
  return new OpenAICompatibleProvider({
    name: "ollama",
    baseURL: "http://localhost:11434/v1",
  });
}

/**
 * Create a provider for any custom OpenAI-compatible endpoint.
 *
 * @param baseURL - The base URL of the API (e.g., "http://localhost:8080/v1").
 */
export function createLocalProvider(baseURL: string): LLMProvider {
  return new OpenAICompatibleProvider({
    name: "local",
    baseURL,
  });
}
