import {
  launchChrome,
  connectCDP,
  RecordingContext,
  navigate,
  waitForSelector,
  waitForText,
  findElementByText,
  findElementBySelector,
  moveCursorTo,
  clickAt,
  pressKey,
  typeText,
  dragFromTo,
  pause,
  InteractionTimeline,
  type ChromeInstance,
  type CDPClient,
} from "@webreel/core";

import type {
  Surface,
  SurfaceType,
  SurfaceConfig,
  SurfaceAction,
  ActionResult,
  ExecutionContext,
} from "./types.js";
import { SurfaceError, SurfaceSetupError } from "./errors.js";

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const DEFAULT_DEVICE_SCALE_FACTOR = 2;

/** Annotation types deferred to Phase 2. Store state but no rendering yet. */
const ANNOTATION_ACTIONS = new Set([
  "annotate",
  "callout",
  "highlight",
  "zoom",
  "redact",
  "remove_annotation",
]);

/**
 * Browser surface: wraps @webreel/core's Chrome management and CDP interaction.
 *
 * Launches headless Chrome, connects via CDP, executes Demo Markdown actions
 * (click, type, navigate, scroll, etc.) by delegating to core functions,
 * and captures frames via CDP Page.captureScreenshot.
 */
export class BrowserSurface implements Surface {
  readonly type: SurfaceType = "browser";

  private chrome: ChromeInstance | null = null;
  private client: CDPClient | null = null;
  private recordingContext: RecordingContext | null = null;
  private viewportWidth = DEFAULT_VIEWPORT_WIDTH;
  private viewportHeight = DEFAULT_VIEWPORT_HEIGHT;
  private deviceScaleFactor = DEFAULT_DEVICE_SCALE_FACTOR;
  private tornDown = false;

  async setup(config: SurfaceConfig): Promise<void> {
    if (config.viewport) {
      this.viewportWidth = config.viewport.width;
      this.viewportHeight = config.viewport.height;
      this.deviceScaleFactor =
        config.viewport.deviceScaleFactor ?? DEFAULT_DEVICE_SCALE_FACTOR;
    }

    try {
      this.chrome = await launchChrome({ headless: true });
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SurfaceSetupError(
        "browser",
        `Failed to launch Chrome: ${cause.message}`,
        cause,
      );
    }

    try {
      this.client = await connectCDP(this.chrome.port);
    } catch (err: unknown) {
      this.chrome.kill();
      this.chrome = null;
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SurfaceSetupError(
        "browser",
        `Failed to connect CDP: ${cause.message}`,
        cause,
      );
    }

    try {
      await this.client.Page.enable();
      await this.client.Runtime.enable();
      await this.client.DOM.enable();
      await this.client.Emulation.setDeviceMetricsOverride({
        width: this.viewportWidth,
        height: this.viewportHeight,
        deviceScaleFactor: this.deviceScaleFactor,
        mobile: false,
      });
    } catch (err: unknown) {
      await this.cleanupResources();
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SurfaceSetupError(
        "browser",
        `Failed to configure CDP: ${cause.message}`,
        cause,
      );
    }

    this.recordingContext = new RecordingContext();
    const timeline = new InteractionTimeline();
    this.recordingContext.setTimeline(timeline);

    // Navigate to initial URL if provided
    const rawOptions = (config.options ?? {}) as Record<string, unknown>;
    const initialUrl = rawOptions["url"] as string | undefined;
    if (initialUrl) {
      try {
        await navigate(this.client, initialUrl);
        // Allow the page to settle after navigation
        await pause(500);
      } catch (err: unknown) {
        const cause = err instanceof Error ? err : new Error(String(err));
        throw new SurfaceSetupError(
          "browser",
          `Failed to navigate to initial URL "${initialUrl}": ${cause.message}`,
          cause,
        );
      }
    }
  }

  async execute(action: SurfaceAction, context: ExecutionContext): Promise<ActionResult> {
    this.ensureReady(action.type);
    const client = this.client!;
    const ctx = this.recordingContext!;
    const start = Date.now();

    try {
      await this.dispatchAction(action, client, ctx);
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SurfaceError(`Browser action "${action.type}" failed: ${cause.message}`, {
        surfaceType: "browser",
        action: action.type,
        sceneName: context.sceneName,
        cause,
      });
    }

    return { durationMs: Date.now() - start };
  }

  async captureFrame(): Promise<Buffer> {
    this.ensureReady("captureFrame");
    const { data } = await this.client!.Page.captureScreenshot({ format: "png" });
    return Buffer.from(data, "base64");
  }

  async teardown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;
    await this.cleanupResources();
  }

  /**
   * Dispatch a single action to the appropriate core function.
   * Each action type maps directly to an @webreel/core export.
   */
  private async dispatchAction(
    action: SurfaceAction,
    client: CDPClient,
    ctx: RecordingContext,
  ): Promise<void> {
    const params = action.params;

    switch (action.type) {
      case "navigate": {
        const url = params["url"] as string;
        if (!url) throw new Error('navigate action requires a "url" parameter');
        await navigate(client, url);
        await pause(300);
        break;
      }

      case "click": {
        const box = await this.resolveElement(client, params);
        if (!box) {
          throw new Error(`Could not find element for click: ${JSON.stringify(params)}`);
        }
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const modifiers = params["modifiers"] as string[] | undefined;
        await clickAt(ctx, client, cx, cy, modifiers);
        break;
      }

      case "type":
      case "type_text": {
        const text = params["text"] as string;
        if (!text) throw new Error('type action requires a "text" parameter');
        const delayMs = params["delay"] as number | undefined;
        await typeText(ctx, client, text, delayMs);
        break;
      }

      case "hover": {
        const box = await this.resolveElement(client, params);
        if (!box) {
          throw new Error(`Could not find element for hover: ${JSON.stringify(params)}`);
        }
        const hx = box.x + box.width / 2;
        const hy = box.y + box.height / 2;
        await moveCursorTo(ctx, client, hx, hy);
        break;
      }

      case "scroll": {
        const scrollX = (params["x"] as number | undefined) ?? 0;
        const scrollY = (params["y"] as number | undefined) ?? 0;
        const selector = params["selector"] as string | undefined;
        const scrollExpr = selector
          ? `document.querySelector(${JSON.stringify(selector)})?.scrollBy(${scrollX}, ${scrollY})`
          : `window.scrollBy(${scrollX}, ${scrollY})`;
        await client.Runtime.evaluate({ expression: scrollExpr });
        await pause(300);
        break;
      }

      case "wait":
      case "pause": {
        const duration = (params["duration"] as number | undefined) ?? 1;
        await pause(duration * 1000);
        break;
      }

      case "wait_for_selector": {
        const selector = params["selector"] as string;
        if (!selector)
          throw new Error('wait_for_selector requires a "selector" parameter');
        const timeout = (params["timeout"] as number | undefined) ?? 30;
        await waitForSelector(client, selector, timeout * 1000);
        break;
      }

      case "wait_for_text": {
        const text = params["text"] as string;
        if (!text) throw new Error('wait_for_text requires a "text" parameter');
        const within = params["within"] as string | undefined;
        const timeout = (params["timeout"] as number | undefined) ?? 30;
        await waitForText(client, text, within, timeout * 1000);
        break;
      }

      case "key":
      case "send_key": {
        const key = params["key"] as string;
        if (!key) throw new Error('key action requires a "key" parameter');
        const label = params["label"] as string | undefined;
        await pressKey(ctx, client, key, label);
        break;
      }

      case "select": {
        const box = await this.resolveElement(client, params);
        if (!box) {
          throw new Error(`Could not find element for select: ${JSON.stringify(params)}`);
        }
        const sx = box.x + box.width / 2;
        const sy = box.y + box.height / 2;
        await clickAt(ctx, client, sx, sy);
        break;
      }

      case "drag": {
        const fromSelector = params["from"] as string | undefined;
        const toSelector = params["to"] as string | undefined;
        if (!fromSelector || !toSelector) {
          throw new Error('drag action requires "from" and "to" selector parameters');
        }
        const fromBox = await findElementBySelector(client, fromSelector);
        const toBox = await findElementBySelector(client, toSelector);
        if (!fromBox || !toBox) {
          throw new Error(
            `Could not resolve drag elements: from="${fromSelector}", to="${toSelector}"`,
          );
        }
        await dragFromTo(ctx, client, fromBox, toBox);
        break;
      }

      default: {
        // Annotation actions are stored for Phase 2 -- no-op for now
        if (ANNOTATION_ACTIONS.has(action.type)) {
          break;
        }
        // Unknown actions are silently ignored to support forward-compatible scripts
        break;
      }
    }
  }

  /**
   * Resolve an element from action params. Supports:
   *   - selector: CSS selector
   *   - text: find by visible text content
   */
  private async resolveElement(
    client: CDPClient,
    params: Readonly<Record<string, unknown>>,
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const selector = params["selector"] as string | undefined;
    const text = params["text"] as string | undefined;
    const within = params["within"] as string | undefined;

    if (selector) {
      return findElementBySelector(client, selector, within);
    }
    if (text) {
      return findElementByText(client, text, within);
    }
    return null;
  }

  private ensureReady(action: string): void {
    if (!this.client || !this.chrome || !this.recordingContext) {
      throw new SurfaceError(
        `Browser surface not initialized. Call setup() before ${action}.`,
        { surfaceType: "browser", action },
      );
    }
  }

  /** Clean up all browser resources. Safe to call multiple times. */
  private async cleanupResources(): Promise<void> {
    // Brief drain delay — lets in-flight CDP operations settle before close
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // CDP connection may already be closed -- safe to ignore
      }
      this.client = null;
    }

    if (this.chrome) {
      try {
        this.chrome.kill();
      } catch {
        // Chrome process may already be dead -- safe to ignore
      }
      this.chrome = null;
    }

    this.recordingContext = null;
  }
}
