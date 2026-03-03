/**
 * Anthropic LLM provider implementation.
 *
 * Uses `@anthropic-ai/sdk` via dynamic import to avoid hard dependency.
 * API key is read from the `ANTHROPIC_API_KEY` environment variable.
 */

import type { LLMProvider, LLMOptions, LLMResult } from "../types.js";
import { LLMError } from "../errors.js";

/** Name constant for this provider. */
const PROVIDER_NAME = "anthropic";

/** Environment variable name for the Anthropic API key. */
const API_KEY_ENV_VAR = "ANTHROPIC_API_KEY";

/**
 * LLM provider backed by the Anthropic Messages API.
 *
 * Requires `@anthropic-ai/sdk` as a peer dependency and
 * `ANTHROPIC_API_KEY` in the environment.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = PROVIDER_NAME;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic SDK type; resolved at runtime via dynamic import
  private client: any = null;

  /** Initialize the provider by validating the API key and loading the SDK. */
  async initialize(): Promise<void> {
    const apiKey = process.env[API_KEY_ENV_VAR];
    if (!apiKey) {
      throw new LLMError(
        PROVIDER_NAME,
        `Missing environment variable ${API_KEY_ENV_VAR}. Set it to your Anthropic API key.`,
      );
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic import returns untyped module
      const sdk = (await import("@anthropic-ai/sdk")) as any;
      const AnthropicClass = sdk.default ?? sdk.Anthropic ?? sdk;
      this.client = new AnthropicClass({ apiKey });
    } catch (cause: unknown) {
      throw new LLMError(
        PROVIDER_NAME,
        "Failed to load @anthropic-ai/sdk. Install it with: npm install @anthropic-ai/sdk",
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /** Generate a non-streaming completion. */
  async generate(prompt: string, options: LLMOptions): Promise<LLMResult> {
    this.ensureInitialized();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK response type resolved at runtime
      const response: any = await this.client.messages.create({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.systemPrompt && { system: options.systemPrompt }),
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK content block type
        .filter((block: any) => block.type === "text")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK content block type
        .map((block: any) => block.text as string)
        .join("");

      return {
        text,
        usage: response.usage
          ? {
              promptTokens: response.usage.input_tokens as number,
              completionTokens: response.usage.output_tokens as number,
            }
          : undefined,
      };
    } catch (cause: unknown) {
      throw new LLMError(
        PROVIDER_NAME,
        `Generation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /** Stream a completion, yielding text deltas. */
  async *stream(prompt: string, options: LLMOptions): AsyncIterable<string> {
    this.ensureInitialized();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK stream type resolved at runtime
      const stream: any = this.client.messages.stream({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        ...(options.temperature !== undefined && { temperature: options.temperature }),
        ...(options.systemPrompt && { system: options.systemPrompt }),
        messages: [{ role: "user", content: prompt }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          typeof event.delta.text === "string"
        ) {
          yield event.delta.text;
        }
      }
    } catch (cause: unknown) {
      throw new LLMError(
        PROVIDER_NAME,
        `Streaming failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /** Release provider resources. */
  async dispose(): Promise<void> {
    this.client = null;
  }

  /** Guard: throw if provider has not been initialized. */
  private ensureInitialized(): void {
    if (!this.client) {
      throw new LLMError(
        PROVIDER_NAME,
        "Provider not initialized. Call initialize() before using generate() or stream().",
      );
    }
  }
}
