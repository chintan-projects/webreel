/**
 * Surface abstraction types for multi-surface recording.
 *
 * Every surface type (browser, terminal, application, desktop, title card)
 * implements the Surface interface. The recording pipeline is surface-agnostic:
 * setup → execute actions → capture frames → teardown.
 */

/** Known built-in surface types. */
export type SurfaceType =
  | "browser"
  | "terminal"
  | "application"
  | "desktop"
  | "title"
  | "composite";

/** Viewport dimensions for frame capture. */
export interface ViewportConfig {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor?: number;
}

/**
 * Configuration for a surface instance. Each surface type defines
 * its own options under the `options` field.
 *
 * Layered merge: package defaults → user config → front matter overrides.
 */
export interface SurfaceConfig {
  readonly type: SurfaceType;
  readonly viewport?: ViewportConfig;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * A resolved action to execute against a surface.
 * Mapped from the IR's ActionDirective by the scene orchestrator.
 */
export interface SurfaceAction {
  readonly type: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Result of executing a surface action. Captures hold named values
 * extracted during execution (e.g., terminal command stdout for
 * dynamic narration references).
 */
export interface ActionResult {
  readonly captures?: Readonly<Record<string, string>>;
  readonly durationMs: number;
}

/**
 * Runtime context passed to surfaces during action execution.
 * Provides scene-level metadata and an abort mechanism.
 */
export interface ExecutionContext {
  readonly sceneName: string;
  readonly actName: string;
  readonly captures: Readonly<Record<string, string>>;
  readonly verbose: boolean;
  readonly abortSignal?: AbortSignal;
}

/**
 * The core surface contract. Every surface implementation
 * (browser, terminal, application, desktop, title card) must
 * implement this interface.
 *
 * Lifecycle: setup() → [execute() + captureFrame()]* → teardown()
 *
 * Every setup() MUST have a matching teardown() for resource cleanup.
 */
export interface Surface {
  /** The surface type identifier. */
  readonly type: SurfaceType;

  /**
   * Initialize the surface.
   * - Browser: launch Chrome, connect CDP
   * - Terminal: spawn PTY process
   * - Application: verify app is running, get window handle
   * - Title: parse config (background, text, font)
   */
  setup(config: SurfaceConfig): Promise<void>;

  /**
   * Execute a single action against the surface.
   * Returns captured output values for dynamic narration.
   */
  execute(action: SurfaceAction, context: ExecutionContext): Promise<ActionResult>;

  /**
   * Capture the current visual state as a raw PNG frame buffer.
   * - Browser: CDP Page.captureScreenshot
   * - Terminal: render PTY buffer to image via sharp
   * - Application: platform screen capture API
   * - Title: generate static text frame
   */
  captureFrame(): Promise<Buffer>;

  /**
   * Clean up all resources. Kill processes, close connections,
   * restore window state. Must be safe to call multiple times.
   */
  teardown(): Promise<void>;
}

/** Factory function that creates a Surface from config. */
export type SurfaceFactory = (config: SurfaceConfig) => Surface;
