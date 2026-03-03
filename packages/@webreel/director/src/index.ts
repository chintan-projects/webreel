export type {
  DemoScript,
  Act,
  Scene,
  NarrationBlock,
  ActionDirective,
  ScriptMeta,
  SceneSurfaceConfig,
  TransitionConfig,
  CaptureSpec,
  LLMProvider,
  LLMProviderFactory,
  LLMOptions,
  LLMResult,
  DirectorConfig,
} from "./types.js";

export { DEFAULT_DIRECTOR_CONFIG } from "./types.js";

export { LLMProviderRegistry } from "./registry.js";

export type { ValidationIssue } from "./errors.js";

export { DirectorError, ParseError, ValidationError, LLMError } from "./errors.js";

export { parse, parseDuration, parseViewport } from "./parser.js";
export type { LineInfo } from "./parser.js";

export { parseSceneContent, extractDynamicRefs } from "./scene-parser.js";

export { validate } from "./validator.js";
