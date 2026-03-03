/**
 * Desktop surface: captures the full screen or a region of the desktop.
 * Uses nut.js (dynamic import) for screen capture and window arrangement.
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
import { SurfaceError } from "./errors.js";
import {
  focusWindow,
  positionWindow,
  getWindowBounds,
  type WindowBounds,
} from "./window-manager.js";
import { loadNut, delay, type NutModule } from "./nut-helpers.js";

const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_VIEWPORT_HEIGHT = 1080;
const DEFAULT_TYPING_DELAY_MS = 50;

interface CaptureRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface DesktopOptions {
  readonly monitor: number;
  readonly region: CaptureRegion | null;
  readonly typingDelayMs: number;
}

interface WindowArrangement {
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface SavedWindowState {
  readonly title: string;
  readonly bounds: WindowBounds;
}

export class DesktopSurface implements Surface {
  readonly type: SurfaceType = "desktop";

  private nut: NutModule | null = null;
  private options: DesktopOptions | null = null;
  private viewportWidth = DEFAULT_VIEWPORT_WIDTH;
  private viewportHeight = DEFAULT_VIEWPORT_HEIGHT;
  private savedWindowStates: SavedWindowState[] = [];
  private tornDown = false;

  async setup(config: SurfaceConfig): Promise<void> {
    this.options = this.parseOptions(config);

    if (config.viewport) {
      this.viewportWidth = config.viewport.width;
      this.viewportHeight = config.viewport.height;
    }

    this.nut = await loadNut("desktop");
  }

  async execute(action: SurfaceAction, context: ExecutionContext): Promise<ActionResult> {
    this.ensureReady(action.type);
    const start = Date.now();
    const captures: Record<string, string> = {};

    switch (action.type) {
      case "arrange_windows":
        await this.executeArrangeWindows(action);
        break;
      case "switch_app":
        await this.executeSwitchApp(action);
        break;
      case "screenshot_region":
        await this.executeScreenshotRegion(action, captures);
        break;
      case "click_at":
        await this.executeClickAt(action);
        break;
      case "type_text":
      case "type":
        await this.executeTypeText(action);
        break;
      case "wait":
      case "pause": {
        const duration = (action.params["duration"] as number | undefined) ?? 1;
        await delay(duration * 1000);
        break;
      }
      default:
        throw new SurfaceError(`Unknown desktop action type: "${action.type}"`, {
          surfaceType: "desktop",
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
    const opts = this.options!;

    let region;
    if (opts.region) {
      region = new nut.Region(
        opts.region.x,
        opts.region.y,
        opts.region.width,
        opts.region.height,
      );
    } else {
      const screenW = await nut.screen.width();
      const screenH = await nut.screen.height();
      region = new nut.Region(0, 0, screenW, screenH);
    }

    const grabbed = await nut.screen.grabRegion(region);
    const rgb = await grabbed.toRGB();

    return sharp(rgb.data, {
      raw: { width: rgb.width, height: rgb.height, channels: 3 },
    })
      .resize(this.viewportWidth, this.viewportHeight)
      .png()
      .toBuffer();
  }

  async teardown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;

    for (const saved of this.savedWindowStates) {
      try {
        await positionWindow(saved.title, saved.bounds);
      } catch {
        // Best-effort restoration -- safe to ignore
      }
    }

    this.savedWindowStates = [];
    this.nut = null;
    this.options = null;
  }

  private parseOptions(config: SurfaceConfig): DesktopOptions {
    const raw = (config.options ?? {}) as Record<string, unknown>;
    const rawRegion = raw["region"] as Record<string, number> | undefined;

    let region: CaptureRegion | null = null;
    if (rawRegion) {
      region = {
        x: rawRegion["x"] ?? 0,
        y: rawRegion["y"] ?? 0,
        width: rawRegion["width"] ?? DEFAULT_VIEWPORT_WIDTH,
        height: rawRegion["height"] ?? DEFAULT_VIEWPORT_HEIGHT,
      };
    }

    return {
      monitor: (raw["monitor"] as number | undefined) ?? 0,
      region,
      typingDelayMs:
        (raw["typingDelayMs"] as number | undefined) ?? DEFAULT_TYPING_DELAY_MS,
    };
  }

  private ensureReady(action: string): void {
    if (!this.nut || !this.options) {
      throw new SurfaceError(
        `Desktop surface not initialized. Call setup() before ${action}.`,
        { surfaceType: "desktop", action },
      );
    }
  }

  private async executeArrangeWindows(action: SurfaceAction): Promise<void> {
    const windows = action.params["windows"] as readonly WindowArrangement[] | undefined;
    if (!windows || !Array.isArray(windows)) {
      throw new SurfaceError('arrange_windows requires a "windows" array parameter', {
        surfaceType: "desktop",
        action: "arrange_windows",
      });
    }

    for (const win of windows) {
      const currentBounds = await getWindowBounds(win.title);
      if (currentBounds) {
        this.savedWindowStates.push({ title: win.title, bounds: currentBounds });
      }
      await positionWindow(win.title, {
        x: win.x,
        y: win.y,
        width: win.width,
        height: win.height,
      });
    }

    await delay(300);
  }

  private async executeSwitchApp(action: SurfaceAction): Promise<void> {
    const appName = action.params["app"] as string | undefined;
    if (appName) {
      await focusWindow(appName);
      await delay(200);
      return;
    }

    const nut = this.nut!;
    const times = (action.params["times"] as number | undefined) ?? 1;
    for (let i = 0; i < times; i++) {
      await nut.keyboard.pressKey(nut.Key["LeftSuper"]!, nut.Key["Tab"]!);
      await delay(200);
    }
  }

  private async executeScreenshotRegion(
    action: SurfaceAction,
    captures: Record<string, string>,
  ): Promise<void> {
    const x = action.params["x"] as number;
    const y = action.params["y"] as number;
    const width = action.params["width"] as number;
    const height = action.params["height"] as number;
    const name = (action.params["name"] as string | undefined) ?? "region_capture";

    if (
      x === undefined ||
      y === undefined ||
      width === undefined ||
      height === undefined
    ) {
      throw new SurfaceError(
        'screenshot_region requires "x", "y", "width", and "height" parameters',
        { surfaceType: "desktop", action: "screenshot_region" },
      );
    }

    const nut = this.nut!;
    const region = new nut.Region(x, y, width, height);
    const grabbed = await nut.screen.grabRegion(region);
    const rgb = await grabbed.toRGB();

    captures[`${name}_width`] = String(rgb.width);
    captures[`${name}_height`] = String(rgb.height);
  }

  private async executeClickAt(action: SurfaceAction): Promise<void> {
    const x = action.params["x"] as number;
    const y = action.params["y"] as number;
    if (x === undefined || y === undefined) {
      throw new SurfaceError('click_at requires "x" and "y" parameters', {
        surfaceType: "desktop",
        action: "click_at",
      });
    }

    const nut = this.nut!;
    await nut.mouse.setPosition(new nut.Point(x, y));
    await nut.mouse.leftClick();
    await delay(100);
  }

  private async executeTypeText(action: SurfaceAction): Promise<void> {
    const text = action.params["text"] as string;
    if (!text) {
      throw new SurfaceError('type_text requires a "text" parameter', {
        surfaceType: "desktop",
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
}
