export type {
  TTSProvider,
  TTSProviderFactory,
  TTSOptions,
  TTSResult,
  NarrationTimeline,
  NarrationSegment,
  NarratorConfig,
} from "./types.js";

export { DEFAULT_NARRATOR_CONFIG } from "./types.js";

export { TTSProviderRegistry } from "./registry.js";

export {
  NarrationError,
  TTSProviderNotFoundError,
  TTSGenerationError,
  TTSInitializationError,
} from "./errors.js";

export { NarrationEngine } from "./narration-engine.js";
export { TTSCache } from "./tts-cache.js";
export { KokoroProvider } from "./providers/kokoro.js";
export { OpenAITTSProvider } from "./providers/openai-tts.js";
export { ElevenLabsProvider } from "./providers/elevenlabs.js";
export { PiperProvider } from "./providers/piper.js";
export { HttpTTSProvider } from "./providers/http-tts.js";
export { pcmToWav, wavDurationMs } from "./providers/wav-utils.js";
export {
  createKokoroProvider,
  createOpenAITTSProvider,
  createElevenLabsProvider,
  createPiperProvider,
  createHttpTTSProvider,
} from "./providers/factories.js";
export type {
  OpenAITTSConfig,
  ElevenLabsConfig,
  PiperConfig,
  HttpTTSConfig,
} from "./providers/factories.js";
export { registerDefaultTTSProviders } from "./providers/register-defaults.js";
export { resolveTTSProvider } from "./providers/resolve-provider.js";
export type { ResolveConfig } from "./providers/resolve-provider.js";
export { preprocessNarration } from "./text-preprocessor.js";
export { assembleTimeline } from "./timeline-assembler.js";
export type { PreprocessedSegment } from "./text-preprocessor.js";
export type { GeneratedSegment } from "./timeline-assembler.js";
