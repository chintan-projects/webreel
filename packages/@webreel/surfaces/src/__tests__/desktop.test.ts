import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SurfaceConfig, ExecutionContext, SurfaceAction } from "../types.js";

// Mock nut.js
const mockGrabRegion = vi.fn();
const mockType = vi.fn();
const mockPressKey = vi.fn();
const mockSetPosition = vi.fn();
const mockLeftClick = vi.fn();
const mockScreenWidth = vi.fn().mockResolvedValue(1920);
const mockScreenHeight = vi.fn().mockResolvedValue(1080);

vi.mock("@nut-tree-fork/nut-js", () => ({
  screen: {
    grabRegion: mockGrabRegion,
    width: mockScreenWidth,
    height: mockScreenHeight,
  },
  keyboard: {
    type: mockType,
    pressKey: mockPressKey,
  },
  mouse: {
    setPosition: mockSetPosition,
    leftClick: mockLeftClick,
  },
  Key: {
    LeftSuper: 100,
    Tab: 104,
  },
  Region: class MockRegion {
    constructor(
      public left: number,
      public top: number,
      public width: number,
      public height: number,
    ) {}
  },
  Point: class MockPoint {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

// Mock window-manager
const mockFocusWindow = vi.fn().mockResolvedValue(undefined);
const mockPositionWindow = vi.fn().mockResolvedValue(undefined);
const mockGetWindowBounds = vi.fn();

vi.mock("../window-manager.js", () => ({
  findWindow: vi.fn(),
  focusWindow: (...args: unknown[]) => mockFocusWindow(...args),
  positionWindow: (...args: unknown[]) => mockPositionWindow(...args),
  getWindowBounds: (...args: unknown[]) => mockGetWindowBounds(...args),
}));

// Mock sharp
vi.mock("sharp", () => ({
  default: vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnValue({
      png: vi.fn().mockReturnValue({
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
      }),
    }),
    png: vi.fn().mockReturnValue({
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    }),
  }),
}));

import { DesktopSurface } from "../desktop.js";

function makeConfig(options: Record<string, unknown> = {}): SurfaceConfig {
  return {
    type: "desktop",
    viewport: { width: 1920, height: 1080 },
    options,
  };
}

function makeContext(): ExecutionContext {
  return {
    sceneName: "Test Scene",
    actName: "Test Act",
    captures: {},
    verbose: false,
  };
}

describe("DesktopSurface", () => {
  let surface: DesktopSurface;

  beforeEach(() => {
    vi.clearAllMocks();
    surface = new DesktopSurface();

    mockGrabRegion.mockResolvedValue({
      toRGB: () =>
        Promise.resolve({
          data: Buffer.alloc(1920 * 1080 * 3),
          width: 1920,
          height: 1080,
        }),
      width: 1920,
      height: 1080,
    });
  });

  describe("setup", () => {
    it("initializes with default options", async () => {
      await surface.setup(makeConfig());
      // Should succeed without throwing
      expect(surface.type).toBe("desktop");
    });

    it("accepts monitor and region options", async () => {
      const config = makeConfig({
        monitor: 1,
        region: { x: 100, y: 100, width: 800, height: 600 },
      });
      await surface.setup(config);
      expect(surface.type).toBe("desktop");
    });
  });

  describe("execute", () => {
    beforeEach(async () => {
      await surface.setup(makeConfig());
    });

    it("handles arrange_windows action", async () => {
      mockGetWindowBounds.mockResolvedValue({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      });

      const action: SurfaceAction = {
        type: "arrange_windows",
        params: {
          windows: [
            { title: "VS Code", x: 0, y: 0, width: 960, height: 1080 },
            { title: "Terminal", x: 960, y: 0, width: 960, height: 1080 },
          ],
        },
      };

      await surface.execute(action, makeContext());

      expect(mockPositionWindow).toHaveBeenCalledTimes(2);
      expect(mockPositionWindow).toHaveBeenCalledWith("VS Code", {
        x: 0,
        y: 0,
        width: 960,
        height: 1080,
      });
      expect(mockPositionWindow).toHaveBeenCalledWith("Terminal", {
        x: 960,
        y: 0,
        width: 960,
        height: 1080,
      });
    });

    it("saves window state for teardown restoration", async () => {
      mockGetWindowBounds.mockResolvedValue({
        x: 50,
        y: 100,
        width: 800,
        height: 600,
      });

      const action: SurfaceAction = {
        type: "arrange_windows",
        params: {
          windows: [{ title: "Finder", x: 0, y: 0, width: 1920, height: 1080 }],
        },
      };

      await surface.execute(action, makeContext());
      await surface.teardown();

      // Should restore original position during teardown
      expect(mockPositionWindow).toHaveBeenCalledWith("Finder", {
        x: 50,
        y: 100,
        width: 800,
        height: 600,
      });
    });

    it("handles switch_app action by name", async () => {
      const action: SurfaceAction = {
        type: "switch_app",
        params: { app: "Terminal" },
      };
      await surface.execute(action, makeContext());
      expect(mockFocusWindow).toHaveBeenCalledWith("Terminal");
    });

    it("handles switch_app action with Cmd+Tab", async () => {
      const action: SurfaceAction = {
        type: "switch_app",
        params: { times: 2 },
      };
      await surface.execute(action, makeContext());

      // Should press LeftSuper+Tab twice
      expect(mockPressKey).toHaveBeenCalledTimes(2);
    });

    it("handles screenshot_region action", async () => {
      const action: SurfaceAction = {
        type: "screenshot_region",
        params: { x: 100, y: 200, width: 400, height: 300, name: "my_capture" },
      };
      const result = await surface.execute(action, makeContext());

      expect(mockGrabRegion).toHaveBeenCalled();
      expect(result.captures?.["my_capture_width"]).toBeDefined();
      expect(result.captures?.["my_capture_height"]).toBeDefined();
    });

    it("handles click_at action", async () => {
      const action: SurfaceAction = {
        type: "click_at",
        params: { x: 500, y: 300 },
      };
      await surface.execute(action, makeContext());

      expect(mockSetPosition).toHaveBeenCalled();
      expect(mockLeftClick).toHaveBeenCalled();
    });

    it("handles type_text action", async () => {
      const action: SurfaceAction = {
        type: "type_text",
        params: { text: "hi", delayMs: 1 },
      };
      await surface.execute(action, makeContext());
      expect(mockType).toHaveBeenCalledTimes(2);
    });

    it("handles wait/pause action", async () => {
      const action: SurfaceAction = {
        type: "wait",
        params: { duration: 0.01 },
      };
      const result = await surface.execute(action, makeContext());
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("throws on unknown action type", async () => {
      const action: SurfaceAction = { type: "fly_drone", params: {} };
      await expect(surface.execute(action, makeContext())).rejects.toThrow(
        'Unknown desktop action type: "fly_drone"',
      );
    });

    it("throws when arrange_windows has no windows param", async () => {
      const action: SurfaceAction = { type: "arrange_windows", params: {} };
      await expect(surface.execute(action, makeContext())).rejects.toThrow(
        'arrange_windows requires a "windows" array parameter',
      );
    });

    it("throws when not initialized", async () => {
      const freshSurface = new DesktopSurface();
      const action: SurfaceAction = { type: "click_at", params: { x: 0, y: 0 } };
      await expect(freshSurface.execute(action, makeContext())).rejects.toThrow(
        "not initialized",
      );
    });
  });

  describe("captureFrame", () => {
    it("captures the full screen as PNG", async () => {
      await surface.setup(makeConfig());
      const frame = await surface.captureFrame();
      expect(frame).toBeInstanceOf(Buffer);
      expect(mockGrabRegion).toHaveBeenCalled();
    });

    it("captures a configured region", async () => {
      await surface.setup(
        makeConfig({ region: { x: 100, y: 100, width: 800, height: 600 } }),
      );
      const frame = await surface.captureFrame();
      expect(frame).toBeInstanceOf(Buffer);
    });

    it("throws when not initialized", async () => {
      const freshSurface = new DesktopSurface();
      await expect(freshSurface.captureFrame()).rejects.toThrow("not initialized");
    });
  });

  describe("teardown", () => {
    it("is idempotent", async () => {
      await surface.setup(makeConfig());
      await surface.teardown();
      await surface.teardown(); // should not throw
    });
  });
});
