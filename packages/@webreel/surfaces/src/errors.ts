import { WebReelError } from "@webreel/core";

/**
 * Error thrown by surface operations.
 * Includes surface type and optional action context for diagnostics.
 */
export class SurfaceError extends WebReelError {
  public readonly surfaceType: string;
  public readonly action?: string;
  public readonly sceneName?: string;

  constructor(
    message: string,
    options: {
      surfaceType: string;
      action?: string;
      sceneName?: string;
      cause?: Error;
    },
  ) {
    super(message, { code: "SURFACE_ERROR", cause: options.cause });
    this.name = "SurfaceError";
    this.surfaceType = options.surfaceType;
    this.action = options.action;
    this.sceneName = options.sceneName;
  }
}

/**
 * Error thrown when a requested surface type is not registered.
 */
export class SurfaceNotFoundError extends SurfaceError {
  constructor(surfaceType: string) {
    super(
      `Surface type "${surfaceType}" is not registered. Available types can be listed via SurfaceRegistry.types().`,
      {
        surfaceType,
      },
    );
    this.name = "SurfaceNotFoundError";
  }
}

/**
 * Error thrown when surface setup fails (e.g., Chrome won't launch, PTY spawn fails).
 */
export class SurfaceSetupError extends SurfaceError {
  constructor(surfaceType: string, message: string, cause?: Error) {
    super(`Setup failed for "${surfaceType}" surface: ${message}`, {
      surfaceType,
      cause,
    });
    this.name = "SurfaceSetupError";
  }
}

/**
 * Error thrown when a surface action times out.
 */
export class SurfaceTimeoutError extends SurfaceError {
  public readonly timeoutMs: number;

  constructor(surfaceType: string, action: string, timeoutMs: number) {
    super(
      `Action "${action}" on "${surfaceType}" surface timed out after ${timeoutMs}ms`,
      {
        surfaceType,
        action,
      },
    );
    this.name = "SurfaceTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
