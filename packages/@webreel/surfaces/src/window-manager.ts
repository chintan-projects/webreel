/**
 * Cross-platform window management utilities.
 *
 * macOS: uses osascript (AppleScript) via child_process.execFile
 * Linux: uses wmctrl / xdotool
 * Windows: deferred (throws SurfaceSetupError)
 *
 * All functions are async and use execFile (never exec) for safety.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import { SurfaceSetupError } from "./errors.js";

const execFile = promisify(execFileCb);

/** Information about a discovered window. */
export interface WindowInfo {
  readonly title: string;
  readonly pid: number;
  readonly bounds: WindowBounds;
}

/** Window position and size on screen. */
export interface WindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Find a window by title (substring match, case-insensitive).
 * Returns undefined if no matching window is found.
 */
export async function findWindow(title: string): Promise<WindowInfo | undefined> {
  const platform = process.platform;
  if (platform === "darwin") {
    return findWindowMacOS(title);
  }
  if (platform === "linux") {
    return findWindowLinux(title);
  }
  throw new SurfaceSetupError(
    "application",
    `Window management is not supported on platform: ${platform}`,
  );
}

/** Bring a window to the front by title (substring match). */
export async function focusWindow(title: string): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") {
    await focusWindowMacOS(title);
    return;
  }
  if (platform === "linux") {
    await focusWindowLinux(title);
    return;
  }
  throw new SurfaceSetupError(
    "application",
    `Window management is not supported on platform: ${platform}`,
  );
}

/** Resize and reposition a window by title. */
export async function positionWindow(title: string, bounds: WindowBounds): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") {
    await positionWindowMacOS(title, bounds);
    return;
  }
  if (platform === "linux") {
    await positionWindowLinux(title, bounds);
    return;
  }
  throw new SurfaceSetupError(
    "application",
    `Window management is not supported on platform: ${platform}`,
  );
}

/** Get current bounds of a window by title. */
export async function getWindowBounds(title: string): Promise<WindowBounds | undefined> {
  const info = await findWindow(title);
  return info?.bounds;
}

// ---------------------------------------------------------------------------
// macOS implementation (AppleScript via osascript)
// ---------------------------------------------------------------------------

async function findWindowMacOS(title: string): Promise<WindowInfo | undefined> {
  const script = `
tell application "System Events"
  set matchedProcs to application processes whose name contains "${escapeAppleScript(title)}"
  if (count of matchedProcs) is 0 then
    return "NOT_FOUND"
  end if
  set frontProc to item 1 of matchedProcs
  set procName to name of frontProc
  set procPid to unix id of frontProc
  if (count of windows of frontProc) is 0 then
    return "NOT_FOUND"
  end if
  set win to window 1 of frontProc
  set winPos to position of win
  set winSize to size of win
  set x to item 1 of winPos
  set y to item 2 of winPos
  set w to item 1 of winSize
  set h to item 2 of winSize
  return procName & "|" & procPid & "|" & x & "|" & y & "|" & w & "|" & h
end tell`;

  const { stdout } = await runOsascript(script);
  const trimmed = stdout.trim();
  if (trimmed === "NOT_FOUND") return undefined;

  const parts = trimmed.split("|");
  if (parts.length < 6) return undefined;

  return {
    title: parts[0]!,
    pid: parseInt(parts[1]!, 10),
    bounds: {
      x: parseInt(parts[2]!, 10),
      y: parseInt(parts[3]!, 10),
      width: parseInt(parts[4]!, 10),
      height: parseInt(parts[5]!, 10),
    },
  };
}

async function focusWindowMacOS(title: string): Promise<void> {
  const script = `
tell application "System Events"
  set matchedProcs to application processes whose name contains "${escapeAppleScript(title)}"
  if (count of matchedProcs) > 0 then
    set frontmost of (item 1 of matchedProcs) to true
  end if
end tell`;
  await runOsascript(script);
}

async function positionWindowMacOS(title: string, bounds: WindowBounds): Promise<void> {
  const script = `
tell application "System Events"
  set matchedProcs to application processes whose name contains "${escapeAppleScript(title)}"
  if (count of matchedProcs) > 0 then
    set frontProc to item 1 of matchedProcs
    if (count of windows of frontProc) > 0 then
      set win to window 1 of frontProc
      set position of win to {${bounds.x}, ${bounds.y}}
      set size of win to {${bounds.width}, ${bounds.height}}
    end if
  end if
end tell`;
  await runOsascript(script);
}

// ---------------------------------------------------------------------------
// Linux implementation (wmctrl / xdotool)
// ---------------------------------------------------------------------------

async function findWindowLinux(title: string): Promise<WindowInfo | undefined> {
  try {
    const { stdout } = await execFile("wmctrl", ["-l", "-p"]);
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    const lower = title.toLowerCase();

    for (const line of lines) {
      if (line.toLowerCase().includes(lower)) {
        return parseWmctrlLine(line);
      }
    }
    return undefined;
  } catch {
    throw new SurfaceSetupError(
      "application",
      "wmctrl is required for window management on Linux. Install with: sudo apt install wmctrl",
    );
  }
}

async function focusWindowLinux(title: string): Promise<void> {
  try {
    await execFile("wmctrl", ["-a", title]);
  } catch {
    throw new SurfaceSetupError(
      "application",
      `Failed to focus window with title containing "${title}". Ensure wmctrl is installed.`,
    );
  }
}

async function positionWindowLinux(title: string, bounds: WindowBounds): Promise<void> {
  try {
    await execFile("wmctrl", [
      "-r",
      title,
      "-e",
      `0,${bounds.x},${bounds.y},${bounds.width},${bounds.height}`,
    ]);
  } catch {
    throw new SurfaceSetupError(
      "application",
      `Failed to position window "${title}". Ensure wmctrl is installed.`,
    );
  }
}

function parseWmctrlLine(line: string): WindowInfo | undefined {
  // wmctrl -l -p format: <windowId> <desktop> <pid> <host> <title...>
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return undefined;
  const pid = parseInt(parts[2]!, 10);
  const windowTitle = parts.slice(4).join(" ");

  return {
    title: windowTitle,
    pid,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runOsascript(script: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFile("osascript", ["-e", script]);
  } catch (err: unknown) {
    const cause = err instanceof Error ? err : new Error(String(err));
    throw new SurfaceSetupError(
      "application",
      `AppleScript execution failed: ${cause.message}`,
      cause,
    );
  }
}

/** Escape special characters for embedding in AppleScript strings. */
function escapeAppleScript(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
