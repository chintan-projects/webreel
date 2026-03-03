import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as childProcess from "node:child_process";
import { promisify } from "node:util";

// Mock child_process.execFile before importing the module under test
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", async () => {
  const actual = await vi.importActual<typeof import("node:util")>("node:util");
  return {
    ...actual,
    promisify: vi.fn((fn: unknown) => fn),
  };
});

// We need to re-mock since promisify wraps execFile
const mockExecFile = vi.fn();
vi.mocked(promisify).mockReturnValue(mockExecFile as ReturnType<typeof promisify>);

describe("window-manager", () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.resetModules();
    mockExecFile.mockReset();
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  describe("macOS (darwin)", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    });

    it("findWindow returns WindowInfo when window is found", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "Visual Studio Code|1234|100|200|1280|720",
        stderr: "",
      });

      const { findWindow } = await import("../window-manager.js");
      const result = await findWindow("Visual Studio Code");

      expect(result).toEqual({
        title: "Visual Studio Code",
        pid: 1234,
        bounds: { x: 100, y: 200, width: 1280, height: 720 },
      });

      // Verify osascript was called
      expect(mockExecFile).toHaveBeenCalledWith(
        "osascript",
        expect.arrayContaining(["-e"]),
      );
    });

    it("findWindow returns undefined when window not found", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "NOT_FOUND",
        stderr: "",
      });

      const { findWindow } = await import("../window-manager.js");
      const result = await findWindow("NonExistent App");
      expect(result).toBeUndefined();
    });

    it("focusWindow calls osascript with correct AppleScript", async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const { focusWindow } = await import("../window-manager.js");
      await focusWindow("Terminal");

      expect(mockExecFile).toHaveBeenCalledWith(
        "osascript",
        expect.arrayContaining(["-e"]),
      );

      // Verify the script contains the app name
      const script = mockExecFile.mock.calls[0]?.[1]?.[1] as string;
      expect(script).toContain("Terminal");
      expect(script).toContain("frontmost");
    });

    it("positionWindow generates correct AppleScript with bounds", async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const { positionWindow } = await import("../window-manager.js");
      await positionWindow("Finder", { x: 50, y: 100, width: 800, height: 600 });

      const script = mockExecFile.mock.calls[0]?.[1]?.[1] as string;
      expect(script).toContain("Finder");
      expect(script).toContain("50");
      expect(script).toContain("100");
      expect(script).toContain("800");
      expect(script).toContain("600");
    });

    it("getWindowBounds returns bounds from findWindow", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "Finder|5678|10|20|640|480",
        stderr: "",
      });

      const { getWindowBounds } = await import("../window-manager.js");
      const bounds = await getWindowBounds("Finder");
      expect(bounds).toEqual({ x: 10, y: 20, width: 640, height: 480 });
    });

    it("getWindowBounds returns undefined when window not found", async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: "NOT_FOUND",
        stderr: "",
      });

      const { getWindowBounds } = await import("../window-manager.js");
      const bounds = await getWindowBounds("Missing");
      expect(bounds).toBeUndefined();
    });

    it("handles osascript errors with SurfaceSetupError", async () => {
      mockExecFile.mockRejectedValueOnce(new Error("osascript not found"));

      const { findWindow } = await import("../window-manager.js");
      await expect(findWindow("App")).rejects.toThrow("AppleScript execution failed");
    });

    it("escapes special characters in window title", async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: "NOT_FOUND", stderr: "" });

      const { findWindow } = await import("../window-manager.js");
      await findWindow('App with "quotes" and \\backslash');

      const script = mockExecFile.mock.calls[0]?.[1]?.[1] as string;
      expect(script).toContain('\\"quotes\\"');
      expect(script).toContain("\\\\backslash");
    });
  });

  describe("unsupported platform", () => {
    it("throws SurfaceSetupError on Windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });

      const { findWindow } = await import("../window-manager.js");
      await expect(findWindow("App")).rejects.toThrow("not supported on platform");
    });
  });
});
