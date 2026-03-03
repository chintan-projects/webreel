export type {
  Surface,
  SurfaceType,
  SurfaceConfig,
  SurfaceAction,
  SurfaceFactory,
  ActionResult,
  ViewportConfig,
  ExecutionContext,
} from "./types.js";

export { SurfaceRegistry } from "./registry.js";

export {
  SurfaceError,
  SurfaceNotFoundError,
  SurfaceSetupError,
  SurfaceTimeoutError,
} from "./errors.js";

export { TerminalSurface } from "./terminal.js";
export { TitleCardSurface } from "./title-card.js";
export { BrowserSurface } from "./browser.js";
export { ApplicationSurface } from "./application.js";
export { DesktopSurface } from "./desktop.js";
export { CompositeSurface } from "./composite.js";
export type { CompositeLayout, CompositeRegion } from "./composite.js";
export { AsciicastWriter } from "./asciicast-writer.js";

export type { WindowInfo, WindowBounds } from "./window-manager.js";
export {
  findWindow,
  focusWindow,
  positionWindow,
  getWindowBounds,
} from "./window-manager.js";
