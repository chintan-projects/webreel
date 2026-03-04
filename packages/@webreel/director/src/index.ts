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

// ─── Providers ────────────────────────────────────────────────────────

export { AnthropicProvider } from "./providers/anthropic.js";
export { OpenAICompatibleProvider } from "./providers/openai-compatible.js";
export {
  createAnthropicProvider,
  createOpenAIProvider,
  createOpenRouterProvider,
  createTogetherProvider,
  createOllamaProvider,
  createLocalProvider,
} from "./providers/factories.js";
export { registerDefaultProviders } from "./providers/register-defaults.js";
export { resolveProvider } from "./providers/resolve-provider.js";

// ─── Prompt System ────────────────────────────────────────────────────

export { loadPrompt, substituteVariables } from "./prompts/prompt-loader.js";

// ─── Authoring Pipeline ───────────────────────────────────────────────

export { generateAndValidate } from "./authoring/generate-and-validate.js";
export { generateDraft } from "./authoring/brief-to-draft.js";
export { refineScript } from "./authoring/refinement.js";
export { analyzePacing, analyzePacingWithLLM } from "./authoring/pacing-analysis.js";
export { reviewRender } from "./authoring/post-render-review.js";

// ─── Authoring Types ──────────────────────────────────────────────────

export type {
  ProviderConfig,
  Brief,
  BriefAppContext,
  BriefWebProbe,
  BriefDiscoveredPage,
  BriefDiscoveredElement,
  BriefProjectScan,
  GenerateResult,
  RefinementResult,
  PacingReport,
  PacingIssue,
  PacingSeverity,
  ReviewReport,
  ReviewSuggestion,
  RenderMetadata,
  ResolvedProvider,
} from "./types.js";
