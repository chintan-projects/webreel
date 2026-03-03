/**
 * Application surface: captures a native application window via nut.js.
 *
 * Uses nut.js for screen region capture and input simulation, combined
 * with the window-manager module for cross-platform window discovery
 * and positioning. nut.js is loaded via dynamic import so the surface
 * fails gracefully in environments without the native addon.
 *
 * Lifecycle: setup() → [execute() + captureFrame()]* → teardown()
 */

import type {
  Surface,
  SurfaceType,
  SurfaceConfig,
  SurfaceAction,
  ActionResult,
  ExecutionContext,
} from "./types.js";
import { SurfaceError, SurfaceSetupError, SurfaceTimeoutError } from "./errors.js";
import {
  findWindow,
  focusWindow,
  positionWindow,
  getWindowBounds,
  type WindowInfo,
  type WindowBounds,
} from "./window-manager.js";
import { loadNut, resolveNutKey, delay, type NutModule } from "./nut-helpers.js";

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
const DEFAULT_TYPING_DELAY_MS = 50;
const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_POLL_MS = 200;

/** Options parsed from SurfaceConfig.options. */
interface ApplicationOptions {
  readonly app: string;
  readonly typingDelayMs: number;
  readonly actionTimeoutMs: number;
}

/** Application surface: captures and controls a native app window. */
export class ApplicationSurface implements Surface {
  readonly type: SurfaceType = "application";

  private nut: NutModule | null = null;
  private windowInfo: WindowInfo | null = null;
  private originalBounds: WindowBounds | null = null;
  private options: ApplicationOptions | null = null;
  private viewportWidth = DEFAULT_VIEWPORT_WIDTH;
  private viewportHeight = DEFAULT_VIEWPORT_HEIGHT;
  private tornDown = false;

  async setup(config: SurfaceConfig): Promise<void> {
    this.options = this.parseOptions(config);

    if (config.viewport) {
      this.viewportWidth = config.viewport.width;
      this.viewportHeight = config.viewport.height;
    }

    this.nut = await loadNut("application");

    const info = await findWindow(this.options.app);
    if (!info) {
      throw new SurfaceSetupError(
        "application",
        `Could not find window matching "${this.options.app}". ` +
          "Ensure the application is running.",
      );
    }
    this.windowInfo = info;
    this.originalBounds = info.bounds;

    try {
      await positionWindow(this.options.app, {
        x: 0,
        y: 0,
        width: this.viewportWidth,
        height: this.viewportHeight,
      });
      await focusWindow(this.options.app);
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SurfaceSetupError(
        "application",
        `Failed to position window: ${cause.message}`,
        cause,
      );
    }

    await delay(300);
  }

  async execute(action: SurfaceAction, context: ExecutionContext): Promise<ActionResult> {
    this.ensureReady(action.type);
    const start = Date.now();
    const captures: Record<string, string> = {};

    switch (action.type) {
      case "focus_window":
        await this.executeFocusWindow();
        break;
      case "click_at":
        await this.executeClickAt(action);
        break;
      case "type_text":
      case "type":
        await this.executeTypeText(action);
        break;
      case "send_shortcut":
        await this.executeSendShortcut(action);
        break;
      case "wait_for_window":
        await this.executeWaitForWindow(action);
        break;
      case "wait":
      case "pause": {
        const duration = (action.params["duration"] as number | undefined) ?? 1;
        await delay(duration * 1000);
        break;
      }
      default:
        throw new SurfaceError(`Unknown application action type: "${action.type}"`, {
          surfaceType: "application",
          action: action.type,
          sceneName: context.sceneName,
        });
    }

    return { captures, durationMs: Date.now() - start };
  }

  async captureFrame(): Promise<Buffer> {
    this.ensureReady("captureFrame");
    const nut = this.nut!;
    const sharp = (await import("sharp")).default;

    const bounds = await getWindowBounds(this.options!.app);
    const region = bounds
      ? new nut.Region(bounds.x, bounds.y, bounds.width, bounds.height)
      : new nut.Region(0, 0, this.viewportWidth, this.viewportHeight);

    const grabbed = await nut.screen.grabRegion(region);
    const rgb = await grabbed.toRGB();

    return sharp(rgb.data, {
      raw: { width: rgb.width, height: rgb.height, channels: 3 },
    })
      .png()
      .toBuffer();
  }

  async teardown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;

    if (this.originalBounds && this.options) {
      try {
        await positionWindow(this.options.app, this.originalBounds);
      } catch {
        // Best-effort restoration -- safe to ignore
      }
    }

    this.nut = null;
    this.windowInfo = null;
    this.originalBounds = null;
    this.options = null;
  }

  private parseOptions(config: SurfaceConfig): ApplicationOptions {
    const raw = (config.options ?? {}) as Record<string, unknown>;
    const app =
      (raw["app"] as string | undefined) ?? (raw["window_title"] as string | undefined);
    if (!app) {
      throw new SurfaceSetupError(
        "application",
        'ApplicationSurface requires an "app" or "window_title" option.',
      );
    }
    return {
      app,
      typingDelayMs:
        (raw["typingDelayMs"] as number | undefined) ?? DEFAULT_TYPING_DELAY_MS,
      actionTimeoutMs:
        (raw["actionTimeoutMs"] as number | undefined) ?? DEFAULT_ACTION_TIMEOUT_MS,
    };
  }

  private ensureReady(action: string): void {
    if (!this.nut || !this.options) {
      throw new SurfaceError(
        `Application surface not initialized. Call setup() before ${action}.`,
        { surfaceType: "application", action },
      );
    }
  }

  private async executeFocusWindow(): Promise<void> {
    await focusWindow(this.options!.app);
    await delay(200);
  }

  private async executeClickAt(action: SurfaceAction): Promise<void> {
    const nut = this.nut!;
    const x = action.params["x"] as number;
    const y = action.params["y"] as number;
    if (x === undefined || y === undefined) {
      throw new SurfaceError('click_at requires "x" and "y" parameters', {
        surfaceType: "application",
        action: "click_at",
      });
    }

    const bounds = await getWindowBounds(this.options!.app);
    const offsetX = bounds ? bounds.x + x : x;
    const offsetY = bounds ? bounds.y + y : y;

    await nut.mouse.setPosition(new nut.Point(offsetX, offsetY));
    await nut.mouse.leftClick();
    await delay(100);
  }

  private async executeTypeText(action: SurfaceAction): Promise<void> {
    const text = action.params["text"] as string;
    if (!text) {
      throw new SurfaceError('type_text requires a "text" parameter', {
        surfaceType: "application",
        action: "type_text",
      });
    }

    const nut = this.nut!;
    const delayMs =
      (action.params["delayMs"] as number | undefined) ?? this.options!.typingDelayMs;

    for (const ch of text) {
      await nut.keyboard.type(ch);
      await delay(delayMs);
    }
  }

  private async executeSendShortcut(action: SurfaceAction): Promise<void> {
    const shortcut = action.params["shortcut"] as string;
    if (!shortcut) {
      throw new SurfaceError('send_shortcut requires a "shortcut" parameter', {
        surfaceType: "application",
        action: "send_shortcut",
      });
    }

    const nut = this.nut!;
    const keys = shortcut.split("+").map((k) => resolveNutKey(nut.Key, k.trim()));
    await nut.keyboard.pressKey(...keys);
    await delay(50);
  }

  private async executeWaitForWindow(action: SurfaceAction): Promise<void> {
    const expectedTitle = action.params["title"] as string;
    if (!expectedTitle) {
      throw new SurfaceError('wait_for_window requires a "title" parameter', {
        surfaceType: "application",
        action: "wait_for_window",
      });
    }

    const timeout =
      (action.params["timeout"] as number | undefined) ?? this.options!.actionTimeoutMs;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const info = await findWindow(expectedTitle);
      if (info) return;
      await delay(DEFAULT_WAIT_POLL_MS);
    }

    throw new SurfaceTimeoutError("application", "wait_for_window", timeout);
  }
}
