/**
 * Auto-detection and resolution of LLM providers.
 *
 * Resolution order:
 * 1. Explicit `provider` in config (if set).
 * 2. Scan environment variables in priority order.
 * 3. Fall back to Ollama (local, keyless).
 * 4. Error with guidance on valid env vars.
 */

import type { DirectorConfig, ResolvedProvider } from "../types.js";
import type { LLMProviderRegistry } from "../registry.js";
import { LLMError } from "../errors.js";

/** Environment variable scan order for auto-detection. */
const ENV_SCAN_ORDER: ReadonlyArray<{ envVar: string; providerName: string }> = [
  { envVar: "ANTHROPIC_API_KEY", providerName: "anthropic" },
  { envVar: "OPENAI_API_KEY", providerName: "openai" },
  { envVar: "OPENROUTER_API_KEY", providerName: "openrouter" },
  { envVar: "TOGETHER_API_KEY", providerName: "together" },
];

/** Default model for each provider when no model is explicitly configured. */
const DEFAULT_MODELS: Readonly<Record<string, string>> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  openrouter: "anthropic/claude-sonnet-4-20250514",
  together: "meta-llama/Llama-3-70b-chat-hf",
  ollama: "llama3.2",
};

/**
 * Resolve which LLM provider to use based on config and environment.
 *
 * Resolution strategy:
 * - If `config.provider` is set, use that provider directly.
 * - Otherwise, scan environment variables in priority order.
 * - If no env vars are found, fall back to Ollama (local, keyless).
 * - If the resolved provider is not registered, throw with guidance.
 *
 * @param config - Director configuration (may have explicit provider/model).
 * @param registry - The LLM provider registry to validate against.
 * @returns Resolved provider name and default model.
 */
export function resolveProvider(
  config: Partial<DirectorConfig>,
  registry: LLMProviderRegistry,
): ResolvedProvider {
  // 1. Explicit provider in config
  if (config.provider) {
    if (!registry.has(config.provider)) {
      throw new LLMError(
        config.provider,
        `Provider "${config.provider}" is not registered. ` +
          `Available providers: ${registry.providers().join(", ")}`,
      );
    }

    return {
      providerName: config.provider,
      model: config.model ?? DEFAULT_MODELS[config.provider] ?? "default",
    };
  }

  // 2. Scan environment variables in priority order
  for (const { envVar, providerName } of ENV_SCAN_ORDER) {
    if (process.env[envVar] && registry.has(providerName)) {
      return {
        providerName,
        model: config.model ?? DEFAULT_MODELS[providerName] ?? "default",
      };
    }
  }

  // 3. Fall back to Ollama (local, keyless)
  if (registry.has("ollama")) {
    return {
      providerName: "ollama",
      model: config.model ?? DEFAULT_MODELS["ollama"] ?? "llama3.2",
    };
  }

  // 4. No provider found — error with guidance
  const envVarList = ENV_SCAN_ORDER.map(
    ({ envVar, providerName }) => `  ${envVar} (${providerName})`,
  ).join("\n");

  throw new LLMError(
    "unknown",
    `No LLM provider found. Set one of these environment variables:\n${envVarList}\n\n` +
      `Or install Ollama for local inference: https://ollama.ai`,
  );
}
