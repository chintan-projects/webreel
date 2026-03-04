/**
 * Scene Graph IR types — the canonical intermediate representation
 * produced by the Demo Markdown parser.
 *
 * The IR is the contract between the parser and all downstream systems
 * (orchestrator, narrator, validators). It is machine-friendly and
 * unambiguous: the parser resolves all Markdown ambiguity once.
 *
 * All types here are IR-level descriptions of what the script says.
 * Runtime types (Surface, TTSProvider) live in their own packages.
 */

/**
 * Front matter metadata extracted from the Demo Markdown YAML header.
 */
export interface ScriptMeta {
  /** Demo title. */
  readonly title: string;
  /** Target total duration in seconds (hint, not enforced). */
  readonly duration?: number;
  /** Default TTS voice identifier. */
  readonly voice?: string;
  /** Default viewport dimensions. */
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  /** Narrator configuration for TTS provider, voice, and speed. */
  readonly narrator?: {
    readonly provider?: string;
    readonly voice?: string;
    readonly speed?: number;
  };
  /** Visual theme for annotations and overlays. */
  readonly theme?: string;
  /** Output format preferences. */
  readonly output?: {
    readonly format?: string;
    readonly fps?: number;
    readonly quality?: string;
  };
  /** Arbitrary additional front matter fields. */
  readonly [key: string]: unknown;
}

/**
 * Surface configuration as declared in the Demo Markdown script.
 * This is an IR-level description — the scene orchestrator maps it
 * to runtime SurfaceConfig when creating actual surface instances.
 */
export interface SceneSurfaceConfig {
  /** Surface type name (e.g., "terminal", "browser", "title"). */
  readonly type: string;
  /** Surface-specific options from the script's blockquote config. */
  readonly options: Readonly<Record<string, unknown>>;
}

/** Transition configuration between scenes. */
export interface TransitionConfig {
  readonly type:
    | "cut"
    | "crossfade"
    | "fade-to-black"
    | "slide-left"
    | "slide-right"
    | "slide-up"
    | "wipe";
  readonly durationMs?: number;
}

/**
 * A capture specification for extracting values from action results.
 * Used for dynamic narration references (e.g., [read_output:latency]).
 */
export interface CaptureSpec {
  /** Name used to reference the captured value (e.g., "latency"). */
  readonly name: string;
  /** Regex pattern to extract the value from output. */
  readonly pattern: string;
  /** Which capture group to use (default: 0 = full match). */
  readonly group?: number;
}

/**
 * A narration block parsed from quoted text in the Demo Markdown.
 * Contains the raw text and any dynamic references found within it.
 */
export interface NarrationBlock {
  /** Raw narration text (may contain [read_output:name] placeholders). */
  readonly text: string;
  /** Dynamic reference names found in the text (e.g., ["latency", "model_name"]). */
  readonly dynamicRefs: readonly string[];
  /** Per-block speed override (from inline directives). */
  readonly speed?: number;
}

/**
 * A single action directive parsed from a bullet list item.
 * The type determines how the action is executed against a surface.
 */
export interface ActionDirective {
  /** Action type (e.g., "run", "click", "type_command", "wait_for_output", "annotate"). */
  readonly type: string;
  /** Action-specific parameters parsed from the bullet text. */
  readonly params: Readonly<Record<string, unknown>>;
  /** Output capture rules for this action. */
  readonly captures?: readonly CaptureSpec[];
  /** Source line number in the original Markdown (for error reporting). */
  readonly sourceLine?: number;
}

/**
 * A scene — the fundamental unit of execution.
 * Each scene targets one surface and contains narration + actions.
 */
export interface Scene {
  /** Scene name from the H2 heading. */
  readonly name: string;
  /** Surface configuration from blockquote config. */
  readonly surface: SceneSurfaceConfig;
  /** Narration blocks (quoted text). */
  readonly narration: readonly NarrationBlock[];
  /** Action directives (bullet list items). */
  readonly actions: readonly ActionDirective[];
  /** Transition config for scene entry/exit. */
  readonly transitions: {
    readonly in?: TransitionConfig;
    readonly out?: TransitionConfig;
  };
  /** Director notes — not rendered, used for planning context. */
  readonly directorNotes: readonly string[];
  /** Duration hint from heading (e.g., "(30s)"). */
  readonly durationHint?: number;
}

/**
 * An act — a top-level narrative grouping containing scenes.
 */
export interface Act {
  /** Act name from the H1 heading. */
  readonly name: string;
  /** Target duration in seconds (from heading hint). */
  readonly durationHint?: number;
  /** Scenes within this act. */
  readonly scenes: readonly Scene[];
}

/**
 * The complete parsed Demo Markdown script — the root IR node.
 * Produced by the parser, consumed by the orchestrator.
 */
export interface DemoScript {
  /** Front matter metadata. */
  readonly meta: ScriptMeta;
  /** Acts (H1-level groupings). */
  readonly acts: readonly Act[];
}

/**
 * LLM provider interface for authoring and review features.
 * Providers are registered via the LLMProviderRegistry.
 */
export interface LLMProvider {
  /** Provider name (e.g., "anthropic", "openai", "local"). */
  readonly name: string;
  /** Generate a completion from a prompt. */
  generate(prompt: string, options: LLMOptions): Promise<LLMResult>;
  /** Stream a completion from a prompt. */
  stream(prompt: string, options: LLMOptions): AsyncIterable<string>;
  /** Initialize the provider (validate API key, test connection). */
  initialize(): Promise<void>;
  /** Release provider resources. */
  dispose(): Promise<void>;
}

/** Options for LLM generation. */
export interface LLMOptions {
  /** Model identifier (provider-specific). */
  readonly model: string;
  /** Maximum tokens in the response. */
  readonly maxTokens?: number;
  /** Temperature for sampling (0 = deterministic, 1 = creative). */
  readonly temperature?: number;
  /** System prompt/instructions. */
  readonly systemPrompt?: string;
}

/** Result of an LLM generation call. */
export interface LLMResult {
  /** Generated text content. */
  readonly text: string;
  /** Token usage statistics. */
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
}

/** Factory function for creating LLM provider instances. */
export type LLMProviderFactory = () => LLMProvider;

/**
 * Director configuration for LLM-powered features.
 * Layered merge: package defaults → user config → env vars.
 */
export interface DirectorConfig {
  /** LLM provider to use (must be registered). */
  readonly provider: string;
  /** Model to use for generation. */
  readonly model: string;
  /** Temperature for generation. */
  readonly temperature: number;
  /** Maximum tokens per generation. */
  readonly maxTokens: number;
}

/** Default director configuration. */
export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  temperature: 0.7,
  maxTokens: 4096,
};

// ─── Provider Configuration ───────────────────────────────────────────

/**
 * Configuration for an OpenAI-compatible provider instance.
 * Passed to the OpenAICompatibleProvider constructor.
 */
export interface ProviderConfig {
  /** Human-readable provider name (e.g., "openai", "openrouter"). */
  readonly name: string;
  /** Base URL for the API endpoint. */
  readonly baseURL: string;
  /** Environment variable name holding the API key (undefined for keyless local endpoints). */
  readonly apiKeyEnvVar?: string;
  /** Additional HTTP headers (e.g., X-Title for OpenRouter). */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
}

// ─── Authoring Types ──────────────────────────────────────────────────

/**
 * A brief describing the demo to be authored.
 * Input to the brief-to-draft generation pipeline.
 */
export interface Brief {
  /** Target audience description. */
  readonly audience: string;
  /** Product or feature being demoed. */
  readonly product: string;
  /** Key messages to convey. */
  readonly keyMessages: readonly string[];
  /** Target duration (e.g., "4 minutes", "90s"). */
  readonly duration: string;
  /** Desired tone (e.g., "technical", "marketing", "casual"). */
  readonly tone?: string;
  /** Available assets or repos to reference. */
  readonly assets?: string;
  /** Live product URL (if deployed). */
  readonly productUrl?: string;
  /** Product context extracted from README or docs (auto-populated). */
  readonly productContext?: string;
}

/** Result of the generate-and-validate pipeline. */
export interface GenerateResult {
  /** Parsed Demo Markdown script IR. */
  readonly script: DemoScript;
  /** Raw Markdown text produced by the LLM. */
  readonly markdown: string;
  /** Number of generation attempts (1 = first try succeeded). */
  readonly attempts: number;
}

/** Result of a script refinement pass. */
export interface RefinementResult {
  /** Updated script IR. */
  readonly script: DemoScript;
  /** Updated raw Markdown. */
  readonly markdown: string;
  /** Unified diff of old vs new Markdown. */
  readonly diff: string;
  /** Number of generation attempts. */
  readonly attempts: number;
}

/** Severity of a pacing issue. */
export type PacingSeverity = "error" | "warning" | "info";

/** A single pacing issue found during analysis. */
export interface PacingIssue {
  /** Issue severity. */
  readonly severity: PacingSeverity;
  /** Human-readable description of the issue. */
  readonly message: string;
  /** Scene name where the issue occurs. */
  readonly sceneName?: string;
  /** Act name where the issue occurs. */
  readonly actName?: string;
  /** Suggested fix. */
  readonly suggestion?: string;
}

/** Result of pacing analysis. */
export interface PacingReport {
  /** All detected pacing issues. */
  readonly issues: readonly PacingIssue[];
  /** Whether the script passes pacing checks (no errors). */
  readonly passed: boolean;
  /** Per-scene estimated durations in seconds. */
  readonly sceneDurations: Readonly<Record<string, number>>;
  /** Total estimated duration in seconds. */
  readonly totalDurationEstimate: number;
}

/** A suggestion from post-render review. */
export interface ReviewSuggestion {
  /** Scene this suggestion applies to. */
  readonly sceneName: string;
  /** What to improve. */
  readonly message: string;
  /** Suggested action (e.g., "add annotation", "reduce narration"). */
  readonly action?: string;
  /** Priority: higher = more impactful. */
  readonly priority: "high" | "medium" | "low";
}

/** Result of post-render review. */
export interface ReviewReport {
  /** All review suggestions. */
  readonly suggestions: readonly ReviewSuggestion[];
  /** Overall quality assessment. */
  readonly summary: string;
  /** Per-scene notes. */
  readonly sceneNotes: Readonly<Record<string, string>>;
}

/** Metadata about a rendered video, used for post-render review. */
export interface RenderMetadata {
  /** Per-scene render info. */
  readonly scenes: readonly {
    readonly sceneName: string;
    readonly actName: string;
    readonly durationMs: number;
    readonly frameCount: number;
    readonly actionCount: number;
  }[];
  /** Total video duration in milliseconds. */
  readonly totalDurationMs: number;
  /** Output file path. */
  readonly outputPath: string;
}

/** Resolved provider information from auto-detection. */
export interface ResolvedProvider {
  /** Provider name (registered in the LLMProviderRegistry). */
  readonly providerName: string;
  /** Default model for this provider. */
  readonly model: string;
}
