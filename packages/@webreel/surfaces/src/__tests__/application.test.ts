import { describe, it, expect, vi, beforeEach } from "vitest";

import type { SurfaceConfig, ExecutionContext, SurfaceAction } from "../types.js";

// Mock nut.js
const mockGrabRegion = vi.fn();
const mockType = vi.fn();
const mockPressKey = vi.fn();
const mockSetPosition = vi.fn();
const mockLeftClick = vi.fn();
const mockScreenWidth = vi.fn();
const mockScreenHeight = vi.fn();

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
    LeftControl: 101,
    LeftAlt: 102,
    LeftShift: 103,
    Tab: 104,
    Return: 105,
    S: 83,
    A: 65,
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
const mockFindWindow = vi.fn();
const mockFocusWindow = vi.fn();
const mockPositionWindow = vi.fn();
const mockGetWindowBounds = vi.fn();

vi.mock("../window-manager.js", () => ({
  findWindow: (...args: unknown[]) => mockFindWindow(...args),
  focusWindow: (...args: unknown[]) => mockFocusWindow(...args),
  positionWindow: (...args: unknown[]) => mockPositionWindow(...args),
  getWindowBounds: (...args: unknown[]) => mockGetWindowBounds(...args),
}));

// Mock sharp for captureFrame
vi.mock("sharp", () => ({
  default: vi.fn().mockReturnValue({
    png: vi.fn().mockReturnValue({
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    }),
  }),
}));

import { ApplicationSurface } from "../application.js";

function makeConfig(options: Record<string, unknown> = {}): SurfaceConfig {
  return {
    type: "application",
    viewport: { width: 1280, height: 720 },
    options: { app: "Visual Studio Code", ...options },
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

describe("ApplicationSurface", () => {
  let surface: ApplicationSurface;

  beforeEach(() => {
    vi.clearAllMocks();
    surface = new ApplicationSurface();

    // Default mock returns
    mockFindWindow.mockResolvedValue({
      title: "Visual Studio Code",
      pid: 1234,
      bounds: { x: 100, y: 200, width: 1280, height: 720 },
    });
    mockFocusWindow.mockResolvedValue(undefined);
    mockPositionWindow.mockResolvedValue(undefined);
    mockGetWindowBounds.mockResolvedValue({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });

    mockGrabRegion.mockResolvedValue({
      toRGB: () =>
        Promise.resolve({
          data: Buffer.alloc(1280 * 720 * 3),
          width: 1280,
          height: 720,
        }),
      width: 1280,
      height: 720,
    });
  });

  describe("setup", () => {
    it("finds and positions the application window", async () => {
      await surface.setup(makeConfig());

      expect(mockFindWindow).toHaveBeenCalledWith("Visual Studio Code");
      expect(mockPositionWindow).toHaveBeenCalledWith("Visual Studio Code", {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
      });
      expect(mockFocusWindow).toHaveBeenCalledWith("Visual Studio Code");
    });

    it("accepts window_title as alternative to app", async () => {
      const config = makeConfig({ app: undefined, window_title: "Finder" });
      mockFindWindow.mockResolvedValue({
        title: "Finder",
        pid: 5678,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      });

      await surface.setup(config);
      expect(mockFindWindow).toHaveBeenCalledWith("Finder");
    });

    it("throws SurfaceSetupError when window not found", async () => {
      mockFindWindow.mockResolvedValue(undefined);

      await expect(surface.setup(makeConfig())).rejects.toThrow(
        'Could not find window matching "Visual Studio Code"',
      );
    });

    it("throws when neither app nor window_title provided", async () => {
      const config: SurfaceConfig = {
        type: "application",
        options: {},
      };

      await expect(surface.setup(config)).rejects.toThrow(
        'requires an "app" or "window_title" option',
      );
    });
  });

  describe("execute", () => {
    beforeEach(async () => {
      await surface.setup(makeConfig());
    });

    it("handles focus_window action", async () => {
      const action: SurfaceAction = { type: "focus_window", params: {} };
      const result = await surface.execute(action, makeContext());

      expect(mockFocusWindow).toHaveBeenCalledWith("Visual Studio Code");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("handles click_at action with window offset", async () => {
      mockGetWindowBounds.mockResolvedValue({ x: 100, y: 200, width: 1280, height: 720 });

      const action: SurfaceAction = {
        type: "click_at",
        params: { x: 50, y: 30 },
      };
      await surface.execute(action, makeContext());

      // Should offset by window position: (100+50, 200+30)
      expect(mockSetPosition).toHaveBeenCalled();
      expect(mockLeftClick).toHaveBeenCalled();
    });

    it("handles type_text action", async () => {
      const action: SurfaceAction = {
        type: "type_text",
        params: { text: "hello", delayMs: 1 },
      };
      await surface.execute(action, makeContext());

      expect(mockType).toHaveBeenCalledTimes(5); // one call per character
    });

    it("handles send_shortcut action", async () => {
      const action: SurfaceAction = {
        type: "send_shortcut",
        params: { shortcut: "cmd+s" },
      };
      await surface.execute(action, makeContext());

      // Should press LeftSuper + S
      expect(mockPressKey).toHaveBeenCalledWith(100, 83);
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
      const action: SurfaceAction = { type: "unknown_action", params: {} };
      await expect(surface.execute(action, makeContext())).rejects.toThrow(
        'Unknown application action type: "unknown_action"',
      );
    });

    it("throws when type_text has no text param", async () => {
      const action: SurfaceAction = { type: "type_text", params: {} };
      await expect(surface.execute(action, makeContext())).rejects.toThrow(
        'type_text requires a "text" parameter',
      );
    });

    it("throws when send_shortcut has no shortcut param", async () => {
      const action: SurfaceAction = { type: "send_shortcut", params: {} };
      await expect(surface.execute(action, makeContext())).rejects.toThrow(
        'send_shortcut requires a "shortcut" parameter',
      );
    });

    it("throws when not initialized", async () => {
      const freshSurface = new ApplicationSurface();
      const action: SurfaceAction = { type: "focus_window", params: {} };
      await expect(freshSurface.execute(action, makeContext())).rejects.toThrow(
        "not initialized",
      );
    });
  });

  describe("captureFrame", () => {
    it("captures the app window region as PNG", async () => {
      await surface.setup(makeConfig());
      const frame = await surface.captureFrame();
      expect(frame).toBeInstanceOf(Buffer);
      expect(mockGrabRegion).toHaveBeenCalled();
    });

    it("throws when not initialized", async () => {
      const freshSurface = new ApplicationSurface();
      await expect(freshSurface.captureFrame()).rejects.toThrow("not initialized");
    });
  });

  describe("teardown", () => {
    it("restores original window position", async () => {
      await surface.setup(makeConfig());
      await surface.teardown();

      expect(mockPositionWindow).toHaveBeenCalledWith("Visual Studio Code", {
        x: 100,
        y: 200,
        width: 1280,
        height: 720,
      });
    });

    it("is idempotent", async () => {
      await surface.setup(makeConfig());
      await surface.teardown();
      await surface.teardown();

      // positionWindow called during setup (1) and first teardown (1) = 2
      // Second teardown should not call again
      const positionCalls = mockPositionWindow.mock.calls.filter(
        (call: unknown[]) => (call[1] as Record<string, unknown>)?.x === 100, // original position
      );
      expect(positionCalls).toHaveLength(1);
    });
  });
});
