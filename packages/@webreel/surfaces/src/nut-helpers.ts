/**
 * Shared nut.js type definitions and helper utilities.
 *
 * Used by ApplicationSurface and DesktopSurface to avoid duplicating
 * the nut.js interface types and the dynamic import loader.
 */

import { SurfaceSetupError } from "./errors.js";

/** Lazily loaded nut.js module reference. */
export interface NutModule {
  readonly screen: {
    grabRegion(region: NutRegion): Promise<NutImage>;
    width(): Promise<number>;
    height(): Promise<number>;
  };
  readonly keyboard: {
    type(text: string): Promise<void>;
    pressKey(...keys: number[]): Promise<void>;
  };
  readonly mouse: {
    setPosition(point: NutPoint): Promise<void>;
    leftClick(): Promise<void>;
  };
  readonly Key: Record<string, number>;
  readonly Region: new (x: number, y: number, w: number, h: number) => NutRegion;
  readonly Point: new (x: number, y: number) => NutPoint;
}

export interface NutRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NutImage {
  toRGB(): Promise<{ data: Buffer; width: number; height: number }>;
  readonly width: number;
  readonly height: number;
}

export interface NutPoint {
  x: number;
  y: number;
}

/**
 * Load nut.js via dynamic import.
 * Throws a descriptive SurfaceSetupError if the native addon is not installed.
 */
export async function loadNut(surfaceType: string): Promise<NutModule> {
  try {
    const mod = await import("@nut-tree-fork/nut-js");
    return mod as unknown as NutModule;
  } catch {
    throw new SurfaceSetupError(
      surfaceType,
      `@nut-tree-fork/nut-js is required for ${surfaceType} surface. ` +
        "Install with: pnpm add @nut-tree-fork/nut-js",
    );
  }
}

/**
 * Resolve a key name string (e.g., "cmd", "s", "shift") to a nut.js Key enum value.
 * Falls back to character code for single-character keys.
 */
export function resolveNutKey(keyEnum: Record<string, number>, keyName: string): number {
  const aliases: Record<string, string> = {
    cmd: "LeftSuper",
    command: "LeftSuper",
    meta: "LeftSuper",
    ctrl: "LeftControl",
    control: "LeftControl",
    alt: "LeftAlt",
    option: "LeftAlt",
    shift: "LeftShift",
    enter: "Return",
    return: "Return",
    tab: "Tab",
    escape: "Escape",
    esc: "Escape",
    space: "Space",
    backspace: "Backspace",
    delete: "Delete",
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
  };

  const normalized = keyName.toLowerCase();
  const aliased = aliases[normalized];
  if (aliased && keyEnum[aliased] !== undefined) {
    return keyEnum[aliased]!;
  }

  const upper = keyName.toUpperCase();
  if (keyEnum[upper] !== undefined) {
    return keyEnum[upper]!;
  }

  if (keyEnum[keyName] !== undefined) {
    return keyEnum[keyName]!;
  }

  return keyName.charCodeAt(0);
}

/** Promise-based delay. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
