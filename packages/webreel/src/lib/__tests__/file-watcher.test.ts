import { describe, it, expect, vi, afterEach } from "vitest";
import { watchAndRerun } from "../file-watcher.js";
import type { FileWatcherHandle } from "../file-watcher.js";

// Mock node:fs to avoid real file system watchers in tests
vi.mock("node:fs", () => ({
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

describe("watchAndRerun", () => {
  const handles: FileWatcherHandle[] = [];

  afterEach(() => {
    for (const h of handles) h.close();
    handles.length = 0;
  });

  /** Helper to track handles for cleanup. */
  function tracked(handle: FileWatcherHandle): FileWatcherHandle {
    handles.push(handle);
    return handle;
  }

  it("returns a handle with close and updatePaths methods", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const handle = tracked(watchAndRerun(["/tmp/test.txt"], callback));

    expect(typeof handle.close).toBe("function");
    expect(typeof handle.updatePaths).toBe("function");
  });

  it("close() is idempotent and can be called multiple times", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const handle = tracked(watchAndRerun(["/tmp/test.txt"], callback));

    expect(() => {
      handle.close();
      handle.close();
      handle.close();
    }).not.toThrow();
  });

  it("updatePaths() accepts an empty array without throwing", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const handle = tracked(watchAndRerun(["/tmp/test.txt"], callback));

    expect(() => handle.updatePaths([])).not.toThrow();
  });

  it("accepts custom debounceMs option", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const handle = tracked(
      watchAndRerun(["/tmp/test.txt"], callback, { debounceMs: 500 }),
    );

    expect(handle).toBeDefined();
  });

  it("does not throw when given non-existent paths", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    expect(() => {
      const handle = watchAndRerun(
        ["/nonexistent/path/file.txt", "/also/missing.md"],
        callback,
      );
      handles.push(handle);
    }).not.toThrow();
  });

  it("does not throw when given an empty paths array", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    expect(() => {
      const handle = watchAndRerun([], callback);
      handles.push(handle);
    }).not.toThrow();
  });

  it("does not invoke callback immediately upon creation", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    tracked(watchAndRerun(["/tmp/test.txt"], callback));

    expect(callback).not.toHaveBeenCalled();
  });

  it("updatePaths() can be called with new paths after creation", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const handle = tracked(watchAndRerun(["/tmp/a.txt"], callback));

    expect(() => {
      handle.updatePaths(["/tmp/b.txt", "/tmp/c.txt"]);
    }).not.toThrow();
  });
});
