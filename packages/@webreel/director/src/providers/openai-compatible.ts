/**
 * OpenAI-compatible LLM provider implementation.
 *
 * A single provider class that handles any OpenAI-compatible API endpoint:
 * OpenAI, OpenRouter, Together AI, Ollama, or any custom endpoint.
 *
 * Uses the `openai` SDK via dynamic import to avoid hard dependency.
 * Configuration (base URL, API key env var, default headers) is passed
 * via `ProviderConfig` at construction time.
 */

import type { LLMProvider, LLMOptions, LLMResult, ProviderConfig } from "../types.js";
import { LLMError } from "../errors.js";

/**
 * LLM provider for any OpenAI-compatible chat completions API.
 *
 * Supports OpenAI, OpenRouter, Together AI, Ollama, and any endpoint
 * that implements the `/v1/chat/completions` contract.
 *
 * @example
 * ```ts
 * const provider = new OpenAICompatibleProvider({
 *   name: "openai",
 *   baseURL: "https://api.openai.com/v1",
 *   apiKeyEnvVar: "OPENAI_API_KEY",
 * });
 * await provider.initialize();
 * const result = await provider.generate("Hello", { model: "gpt-4o" });
 * ```
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;

  private readonly config: ProviderConfig;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic SDK type; resolved at runtime via dynamic import
  private client: any = null;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
  }

  /** Initialize the provider by validating the API key and loading the SDK. */
  async initialize(): Promise<void> {
    let apiKey: string | undefined;

    if (this.config.apiKeyEnvVar) {
      apiKey = process.env[this.config.apiKeyEnvVar];
      if (!apiKey) {
        throw new LLMError(
          this.name,
          `Missing environment variable ${this.config.apiKeyEnvVar}. ` +
            `Set it to your ${this.name} API key.`,
        );
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic import returns untyped module
      const sdk = (await import("openai")) as any;
      const OpenAIClass = sdk.default ?? sdk.OpenAI ?? sdk;
      this.client = new OpenAIClass({
        apiKey: apiKey ?? "not-needed",
        baseURL: this.config.baseURL,
        ...(this.config.defaultHeaders && {
          defaultHeaders: this.config.defaultHeaders,
        }),
      });
    } catch (cause: unknown) {
      throw new LLMError(
        this.name,
        "Failed to load openai SDK. Install it with: npm install openai",
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /** Generate a non-streaming completion. */
  async generate(prompt: string, options: LLMOptions): Promise<LLMResult> {
    this.ensureInitialized();

    const messages = this.buildMessages(prompt, options.systemPrompt);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK response type resolved at runtime
      const response: any = await this.client.chat.completions.create({
        model: options.model,
        messages,
        ...(options.maxTokens !== undefined && { max_tokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
      });

      const choice = response.choices?.[0];
      const text: string = choice?.message?.content ?? "";

      return {
        text,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens as number,
              completionTokens: response.usage.completion_tokens as number,
            }
          : undefined,
      };
    } catch (cause: unknown) {
      throw new LLMError(
        this.name,
        `Generation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /** Stream a completion, yielding text deltas. */
  async *stream(prompt: string, options: LLMOptions): AsyncIterable<string> {
    this.ensureInitialized();

    const messages = this.buildMessages(prompt, options.systemPrompt);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK stream type resolved at runtime
      const stream: any = await this.client.chat.completions.create({
        model: options.model,
        messages,
        ...(options.maxTokens !== undefined && { max_tokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        stream: true,
      });

      for await (const chunk of stream) {
        const delta: string | undefined | null = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string") {
          yield delta;
        }
      }
    } catch (cause: unknown) {
      throw new LLMError(
        this.name,
        `Streaming failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /** Release provider resources. */
  async dispose(): Promise<void> {
    this.client = null;
  }

  /** Build the messages array for the chat completions API. */
  private buildMessages(
    prompt: string,
    systemPrompt?: string,
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });
    return messages;
  }

  /** Guard: throw if provider has not been initialized. */
  private ensureInitialized(): void {
    if (!this.client) {
      throw new LLMError(
        this.name,
        "Provider not initialized. Call initialize() before using generate() or stream().",
      );
    }
  }
}
