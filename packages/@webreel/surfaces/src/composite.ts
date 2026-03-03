/**
 * Composite surface: combines child surfaces into a single composited frame.
 * Layouts: split-horizontal, split-vertical, picture-in-picture.
 * Lifecycle: setup() → [execute() + captureFrame()]* → teardown()
 */

import sharp from "sharp";

import type {
  Surface,
  SurfaceType,
  SurfaceConfig,
  SurfaceAction,
  ActionResult,
  ExecutionContext,
} from "./types.js";
import type { SurfaceRegistry } from "./registry.js";
import { SurfaceError, SurfaceSetupError } from "./errors.js";

export type CompositeLayout =
  | "split-horizontal"
  | "split-vertical"
  | "picture-in-picture";

export interface CompositeRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type SlotName = "left" | "right" | "top" | "bottom" | "main" | "pip";

const DEFAULT_VIEWPORT_WIDTH = 1920;
const DEFAULT_VIEWPORT_HEIGHT = 1080;
const PIP_SCALE = 0.25;
const PIP_MARGIN = 20;

export class CompositeSurface implements Surface {
  readonly type: SurfaceType = "composite";

  private readonly registry: SurfaceRegistry;
  private children: Map<string, Surface> = new Map();
  private regions: Map<string, CompositeRegion> = new Map();
  private layout: CompositeLayout = "split-horizontal";
  private viewportWidth = DEFAULT_VIEWPORT_WIDTH;
  private viewportHeight = DEFAULT_VIEWPORT_HEIGHT;
  private tornDown = false;

  constructor(registry: SurfaceRegistry) {
    this.registry = registry;
  }

  async setup(config: SurfaceConfig): Promise<void> {
    if (config.viewport) {
      this.viewportWidth = config.viewport.width;
      this.viewportHeight = config.viewport.height;
    }

    const raw = (config.options ?? {}) as Record<string, unknown>;
    this.layout = (raw["layout"] as CompositeLayout | undefined) ?? "split-horizontal";

    // Compute regions based on layout
    this.regions = this.computeRegions();

    // Create child surfaces based on layout
    const childConfigs = this.resolveChildConfigs(raw);

    // Setup all children, rolling back on partial failure
    const setupChildren: string[] = [];
    try {
      for (const [slot, childConfig] of childConfigs) {
        const child = this.registry.create(childConfig);
        this.children.set(slot, child);
        await child.setup(childConfig);
        setupChildren.push(slot);
      }
    } catch (err: unknown) {
      // Teardown any children that were successfully set up
      await this.teardownChildren(setupChildren);
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SurfaceSetupError(
        "composite",
        `Failed to setup child surface: ${cause.message}`,
        cause,
      );
    }
  }

  async execute(action: SurfaceAction, context: ExecutionContext): Promise<ActionResult> {
    this.ensureReady(action.type);
    const start = Date.now();
    const allCaptures: Record<string, string> = {};

    const target = action.params["target"] as string | undefined;

    if (target) {
      // Route to specific child
      const child = this.children.get(target);
      if (!child) {
        throw new SurfaceError(
          `Composite target "${target}" not found. Available: ${[...this.children.keys()].join(", ")}`,
          { surfaceType: "composite", action: action.type, sceneName: context.sceneName },
        );
      }

      // Strip "target" from params before delegating
      const childParams = { ...action.params };
      delete (childParams as Record<string, unknown>)["target"];
      const childAction: SurfaceAction = { type: action.type, params: childParams };

      const result = await child.execute(childAction, context);
      if (result.captures) {
        Object.assign(allCaptures, result.captures);
      }
    } else {
      // No target specified: execute on all children (useful for wait/pause)
      for (const [, child] of this.children) {
        const result = await child.execute(action, context);
        if (result.captures) {
          Object.assign(allCaptures, result.captures);
        }
      }
    }

    return { captures: allCaptures, durationMs: Date.now() - start };
  }

  async captureFrame(): Promise<Buffer> {
    this.ensureReady("captureFrame");

    // Create the base canvas
    let composite = sharp({
      create: {
        width: this.viewportWidth,
        height: this.viewportHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    }).png();

    // Capture frames from all children and build composite inputs
    const inputs: Array<{ input: Buffer; left: number; top: number }> = [];
    for (const [slot, child] of this.children) {
      const region = this.regions.get(slot);
      if (!region) continue;

      const frame = await child.captureFrame();

      // Resize child frame to fit its region
      const resized = await sharp(frame)
        .resize(region.width, region.height, { fit: "fill" })
        .png()
        .toBuffer();

      inputs.push({ input: resized, left: region.x, top: region.y });
    }

    if (inputs.length > 0) {
      composite = sharp({
        create: {
          width: this.viewportWidth,
          height: this.viewportHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 255 },
        },
      })
        .composite(inputs)
        .png();
    }

    return composite.toBuffer();
  }

  async teardown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;

    await this.teardownChildren([...this.children.keys()]);
    this.children.clear();
    this.regions.clear();
  }

  private computeRegions(): Map<string, CompositeRegion> {
    const w = this.viewportWidth;
    const h = this.viewportHeight;
    const regions = new Map<string, CompositeRegion>();

    switch (this.layout) {
      case "split-horizontal": {
        const halfW = Math.floor(w / 2);
        regions.set("left", { x: 0, y: 0, width: halfW, height: h });
        regions.set("right", { x: halfW, y: 0, width: w - halfW, height: h });
        break;
      }
      case "split-vertical": {
        const halfH = Math.floor(h / 2);
        regions.set("top", { x: 0, y: 0, width: w, height: halfH });
        regions.set("bottom", { x: 0, y: halfH, width: w, height: h - halfH });
        break;
      }
      case "picture-in-picture": {
        const pipW = Math.floor(w * PIP_SCALE);
        const pipH = Math.floor(h * PIP_SCALE);
        regions.set("main", { x: 0, y: 0, width: w, height: h });
        regions.set("pip", {
          x: w - pipW - PIP_MARGIN,
          y: h - pipH - PIP_MARGIN,
          width: pipW,
          height: pipH,
        });
        break;
      }
      default:
        throw new SurfaceSetupError(
          "composite",
          `Unknown layout: "${this.layout}". ` +
            'Supported: "split-horizontal", "split-vertical", "picture-in-picture"',
        );
    }

    return regions;
  }

  private resolveChildConfigs(
    raw: Record<string, unknown>,
  ): Array<[string, SurfaceConfig]> {
    const configs: Array<[string, SurfaceConfig]> = [];

    const slotPairs = this.getSlotPairs();
    for (const slot of slotPairs) {
      const childRaw = raw[slot] as Record<string, unknown> | undefined;
      if (!childRaw) continue;

      const region = this.regions.get(slot);
      const childConfig: SurfaceConfig = {
        type: childRaw["type"] as SurfaceType,
        viewport: region ? { width: region.width, height: region.height } : undefined,
        options: childRaw["options"] as Readonly<Record<string, unknown>> | undefined,
      };

      configs.push([slot, childConfig]);
    }

    if (configs.length === 0) {
      throw new SurfaceSetupError(
        "composite",
        `No child surfaces configured. For "${this.layout}" layout, ` +
          `provide: ${this.getSlotPairs().join(", ")}`,
      );
    }

    return configs;
  }

  private getSlotPairs(): readonly SlotName[] {
    switch (this.layout) {
      case "split-horizontal":
        return ["left", "right"];
      case "split-vertical":
        return ["top", "bottom"];
      case "picture-in-picture":
        return ["main", "pip"];
      default:
        return [];
    }
  }

  private ensureReady(action: string): void {
    if (this.children.size === 0) {
      throw new SurfaceError(
        `Composite surface not initialized. Call setup() before ${action}.`,
        { surfaceType: "composite", action },
      );
    }
  }

  private async teardownChildren(slots: readonly string[]): Promise<void> {
    for (const slot of slots) {
      const child = this.children.get(slot);
      if (child) {
        try {
          await child.teardown();
        } catch {
          // Child teardown failure -- safe to ignore for cleanup
        }
      }
    }
  }
}
