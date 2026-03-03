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
export { preprocessNarration } from "./text-preprocessor.js";
export { assembleTimeline } from "./timeline-assembler.js";
export type { PreprocessedSegment } from "./text-preprocessor.js";
export type { GeneratedSegment } from "./timeline-assembler.js";
