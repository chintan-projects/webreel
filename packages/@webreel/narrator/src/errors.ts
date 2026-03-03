import { WebReelError } from "@webreel/core";

/**
 * Base error for narration engine failures.
 */
export class NarrationError extends WebReelError {
  public readonly provider?: string;
  public readonly segmentText?: string;

  constructor(
    message: string,
    options: {
      provider?: string;
      segmentText?: string;
      cause?: Error;
    } = {},
  ) {
    super(message, { code: "NARRATION_ERROR", cause: options.cause });
    this.name = "NarrationError";
    this.provider = options.provider;
    this.segmentText = options.segmentText;
  }
}

/**
 * Error thrown when a requested TTS provider is not registered.
 */
export class TTSProviderNotFoundError extends NarrationError {
  constructor(provider: string) {
    super(
      `TTS provider "${provider}" is not registered. Register it via TTSProviderRegistry.register().`,
      { provider },
    );
    this.name = "TTSProviderNotFoundError";
  }
}

/**
 * Error thrown when TTS generation fails (model error, timeout, etc.).
 */
export class TTSGenerationError extends NarrationError {
  constructor(provider: string, text: string, cause?: Error) {
    super(`TTS generation failed for provider "${provider}"`, {
      provider,
      segmentText: text,
      cause,
    });
    this.name = "TTSGenerationError";
  }
}

/**
 * Error thrown when TTS model initialization fails (download, load, etc.).
 */
export class TTSInitializationError extends NarrationError {
  constructor(provider: string, message: string, cause?: Error) {
    super(`TTS provider "${provider}" initialization failed: ${message}`, {
      provider,
      cause,
    });
    this.name = "TTSInitializationError";
  }
}
