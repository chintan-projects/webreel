/**
 * Default surface registry with all built-in surfaces registered.
 *
 * Adding a new surface = implement the Surface interface in @webreel/surfaces,
 * then register the factory here. Zero changes to the orchestrator.
 */

import {
  SurfaceRegistry,
  TerminalSurface,
  TitleCardSurface,
  BrowserSurface,
  ApplicationSurface,
  DesktopSurface,
  CompositeSurface,
} from "@webreel/surfaces";

/**
 * Create a SurfaceRegistry pre-loaded with all built-in surface types.
 *
 * Registered surfaces:
 * - "terminal"    — PTY + xterm headless, rendered to PNG via sharp
 * - "title"       — Static title card with SVG text rendering
 * - "browser"     — Headless Chrome via CDP
 * - "application" — Native app window capture via nut.js
 * - "desktop"     — Full screen / region capture via nut.js
 * - "composite"   — Multi-surface compositing (split, PiP)
 *
 * @returns A configured SurfaceRegistry ready for use by the orchestrator.
 */
export function createDefaultSurfaceRegistry(): SurfaceRegistry {
  const registry = new SurfaceRegistry();

  registry.register("terminal", () => new TerminalSurface());
  registry.register("title", () => new TitleCardSurface());
  registry.register("browser", () => new BrowserSurface());
  registry.register("application", () => new ApplicationSurface());
  registry.register("desktop", () => new DesktopSurface());
  registry.register("composite", () => new CompositeSurface(registry));

  return registry;
}
