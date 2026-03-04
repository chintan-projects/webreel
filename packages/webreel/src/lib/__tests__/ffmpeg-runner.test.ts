import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";

// Mock child_process before importing the module under test
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import {
  buildFfmpegArgs,
  buildTransitionFfmpegArgs,
  runFfmpeg,
} from "../ffmpeg-runner.js";

const mockSpawn = vi.mocked(spawn);

// ---------------------------------------------------------------------------
// buildFfmpegArgs
// ---------------------------------------------------------------------------

describe("buildFfmpegArgs", () => {
  it("builds mp4 args with libx264 by default", () => {
    const args = buildFfmpegArgs("frames/%06d.png", "out.mp4", 30, "mp4", 23, "medium");
    expect(args).toContain("-y");
    expect(args).toContain("-framerate");
    expect(args).toContain("30");
    expect(args).toContain("-i");
    expect(args).toContain("frames/%06d.png");
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
    expect(args).toContain("-preset");
    expect(args).toContain("medium");
    expect(args).toContain("-crf");
    expect(args).toContain("23");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("builds gif args with palette filter", () => {
    const args = buildFfmpegArgs("frames/%06d.png", "out.gif", 15, "gif", 23, "medium");
    expect(args).toContain("-vf");
    const vfIdx = args.indexOf("-vf");
    const vfValue = args[vfIdx + 1];
    expect(vfValue).toContain("fps=15");
    expect(vfValue).toContain("palettegen");
    expect(vfValue).toContain("paletteuse");
    expect(args).not.toContain("-c:v");
    expect(args[args.length - 1]).toBe("out.gif");
  });

  it("builds webm args with libvpx-vp9", () => {
    const args = buildFfmpegArgs("frames/%06d.png", "out.webm", 24, "webm", 30, "medium");
    expect(args).toContain("-c:v");
    expect(args).toContain("libvpx-vp9");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuva420p");
    expect(args).toContain("-crf");
    expect(args).toContain("30");
    expect(args).toContain("-b:v");
    expect(args).toContain("0");
    expect(args).not.toContain("-preset");
    expect(args[args.length - 1]).toBe("out.webm");
  });

  it("includes chapter metadata input when metadataPath is provided", () => {
    const args = buildFfmpegArgs(
      "frames/%06d.png",
      "out.mp4",
      30,
      "mp4",
      23,
      "medium",
      "/tmp/ffmetadata.txt",
    );
    expect(args).toContain("-i");
    expect(args).toContain("/tmp/ffmetadata.txt");
    expect(args).toContain("-map_metadata");
    expect(args).toContain("1");
  });

  it("omits metadata args when metadataPath is not provided", () => {
    const args = buildFfmpegArgs("frames/%06d.png", "out.mp4", 30, "mp4", 23, "medium");
    expect(args).not.toContain("-map_metadata");
  });

  it("includes metadata in gif args when provided", () => {
    const args = buildFfmpegArgs(
      "frames/%06d.png",
      "out.gif",
      15,
      "gif",
      23,
      "medium",
      "/tmp/meta.txt",
    );
    expect(args).toContain("/tmp/meta.txt");
    expect(args).toContain("-map_metadata");
  });

  it("includes metadata in webm args when provided", () => {
    const args = buildFfmpegArgs(
      "frames/%06d.png",
      "out.webm",
      24,
      "webm",
      30,
      "fast",
      "/tmp/meta.txt",
    );
    expect(args).toContain("/tmp/meta.txt");
    expect(args).toContain("-map_metadata");
  });

  it("treats unknown format as mp4", () => {
    const args = buildFfmpegArgs("frames/%06d.png", "out.avi", 30, "avi", 23, "medium");
    expect(args).toContain("libx264");
    expect(args).toContain("-preset");
  });

  it("returns a readonly array", () => {
    const args = buildFfmpegArgs("frames/%06d.png", "out.mp4", 30, "mp4", 23, "medium");
    // The return type is readonly string[] — verify it is an array
    expect(Array.isArray(args)).toBe(true);
  });

  it("converts numeric fps and crf to strings", () => {
    const args = buildFfmpegArgs("frames/%06d.png", "out.mp4", 60, "mp4", 18, "slow");
    expect(args).toContain("60");
    expect(args).toContain("18");
    expect(args).toContain("slow");
  });
});

// ---------------------------------------------------------------------------
// buildTransitionFfmpegArgs
// ---------------------------------------------------------------------------

describe("buildTransitionFfmpegArgs", () => {
  it("builds args with segment inputs and filter_complex", () => {
    const args = buildTransitionFfmpegArgs(
      ["scene_0.mp4", "scene_1.mp4"],
      "[0:v][1:v]xfade=transition=fade:duration=0.500:offset=9.500[vout]",
      "out.mp4",
      "mp4",
      23,
      "medium",
    );
    expect(args[0]).toBe("-y");
    expect(args).toContain("-i");
    expect(args).toContain("scene_0.mp4");
    expect(args).toContain("scene_1.mp4");
    expect(args).toContain("-filter_complex");
    expect(args).toContain("-map");
    expect(args).toContain("[vout]");
    expect(args).toContain("libx264");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("builds webm transition args with vp9 codec", () => {
    const args = buildTransitionFfmpegArgs(
      ["s0.mp4", "s1.mp4"],
      "filter",
      "out.webm",
      "webm",
      30,
      "medium",
    );
    expect(args).toContain("libvpx-vp9");
    expect(args).toContain("yuva420p");
    expect(args).toContain("-b:v");
    expect(args).toContain("0");
    expect(args).not.toContain("-preset");
  });

  it("includes all segment paths as separate -i inputs", () => {
    const segments = ["a.mp4", "b.mp4", "c.mp4"];
    const args = buildTransitionFfmpegArgs(
      segments,
      "filter",
      "out.mp4",
      "mp4",
      23,
      "medium",
    );

    // Count -i occurrences
    const inputIndices: number[] = [];
    args.forEach((arg, idx) => {
      if (arg === "-i") inputIndices.push(idx);
    });
    expect(inputIndices).toHaveLength(3);
    expect(args[inputIndices[0]! + 1]).toBe("a.mp4");
    expect(args[inputIndices[1]! + 1]).toBe("b.mp4");
    expect(args[inputIndices[2]! + 1]).toBe("c.mp4");
  });

  it("includes metadata with correct map index when metadataPath is provided", () => {
    const segments = ["s0.mp4", "s1.mp4", "s2.mp4"];
    const args = buildTransitionFfmpegArgs(
      segments,
      "filter",
      "out.mp4",
      "mp4",
      23,
      "medium",
      "/tmp/meta.txt",
    );
    expect(args).toContain("/tmp/meta.txt");
    expect(args).toContain("-map_metadata");
    // metadata map index should be the number of segment inputs (3)
    expect(args).toContain("3");
  });

  it("omits metadata when metadataPath is undefined", () => {
    const args = buildTransitionFfmpegArgs(
      ["s0.mp4"],
      "filter",
      "out.mp4",
      "mp4",
      23,
      "medium",
    );
    expect(args).not.toContain("-map_metadata");
  });

  it("sets metadata map index to 1 for single segment with metadata", () => {
    const args = buildTransitionFfmpegArgs(
      ["s0.mp4"],
      "filter",
      "out.mp4",
      "mp4",
      23,
      "medium",
      "/tmp/meta.txt",
    );
    const mapMetaIdx = args.indexOf("-map_metadata");
    expect(args[mapMetaIdx + 1]).toBe("1");
  });

  it("uses default (mp4) codec for unknown format", () => {
    const args = buildTransitionFfmpegArgs(
      ["s0.mp4"],
      "filter",
      "out.avi",
      "avi",
      23,
      "medium",
    );
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("-preset");
  });
});

// ---------------------------------------------------------------------------
// runFfmpeg
// ---------------------------------------------------------------------------

describe("runFfmpeg", () => {
  /** Helper to create a fake ChildProcess with event emitter behavior. */
  function createMockProcess(): {
    process: ChildProcess;
    emitClose: (code: number | null) => void;
    emitError: (err: Error) => void;
    emitStderr: (data: string) => void;
  } {
    const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
    const stderrHandlers = new Map<string, ((...args: unknown[]) => void)[]>();

    const mockStderr = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const existing = stderrHandlers.get(event) ?? [];
        existing.push(handler);
        stderrHandlers.set(event, existing);
      }),
    } as unknown as Readable;

    const proc = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const existing = handlers.get(event) ?? [];
        existing.push(handler);
        handlers.set(event, existing);
      }),
      stderr: mockStderr,
    } as unknown as ChildProcess;

    return {
      process: proc,
      emitClose: (code: number | null) => {
        for (const h of handlers.get("close") ?? []) {
          h(code);
        }
      },
      emitError: (err: Error) => {
        for (const h of handlers.get("error") ?? []) {
          h(err);
        }
      },
      emitStderr: (data: string) => {
        for (const h of stderrHandlers.get("data") ?? []) {
          h(Buffer.from(data));
        }
      },
    };
  }

  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it("resolves when ffmpeg exits with code 0", async () => {
    const { process: proc, emitClose } = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = runFfmpeg("/usr/bin/ffmpeg", ["-y", "out.mp4"], false);
    emitClose(0);
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects with WebReelError when ffmpeg exits with non-zero code", async () => {
    const { process: proc, emitClose, emitStderr } = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = runFfmpeg("/usr/bin/ffmpeg", ["-y", "out.mp4"], false);
    emitStderr("Error: something went wrong");
    emitClose(1);

    await expect(promise).rejects.toThrow("ffmpeg exited with code 1");
    await expect(promise).rejects.toThrow("something went wrong");
  });

  it("rejects with WebReelError on spawn error", async () => {
    const { process: proc, emitError } = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = runFfmpeg("/usr/bin/ffmpeg", ["-y", "out.mp4"], false);
    emitError(new Error("ENOENT"));

    await expect(promise).rejects.toThrow("Failed to spawn ffmpeg");
    await expect(promise).rejects.toThrow("ENOENT");
  });

  it("spawns with 'pipe' stdio when not verbose", () => {
    const { process: proc, emitClose } = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = runFfmpeg("/usr/bin/ffmpeg", ["-y", "out.mp4"], false);
    emitClose(0);

    expect(mockSpawn).toHaveBeenCalledWith("/usr/bin/ffmpeg", ["-y", "out.mp4"], {
      stdio: "pipe",
    });

    return promise;
  });

  it("spawns with 'inherit' stdio when verbose", () => {
    const { process: proc, emitClose } = createMockProcess();
    // When verbose, stderr is null (inherited)
    (proc as unknown as Record<string, unknown>).stderr = null;
    mockSpawn.mockReturnValue(proc);

    const promise = runFfmpeg("/usr/bin/ffmpeg", ["-y"], true);
    emitClose(0);

    expect(mockSpawn).toHaveBeenCalledWith("/usr/bin/ffmpeg", ["-y"], {
      stdio: "inherit",
    });

    return promise;
  });

  it("includes truncated stderr in error message", async () => {
    const { process: proc, emitClose, emitStderr } = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = runFfmpeg("/usr/bin/ffmpeg", ["-y"], false);
    // Send a long stderr message
    const longMessage = "x".repeat(600);
    emitStderr(longMessage);
    emitClose(1);

    try {
      await promise;
    } catch (err: unknown) {
      const error = err as Error;
      // The error message should contain at most 500 chars of stderr
      expect(error.message).toContain("ffmpeg exited with code 1");
      // stderr is sliced to last 500 chars
      expect(error.message.length).toBeLessThan(600 + 100);
    }
  });

  it("handles null exit code", async () => {
    const { process: proc, emitClose } = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = runFfmpeg("/usr/bin/ffmpeg", ["-y"], false);
    emitClose(null);

    await expect(promise).rejects.toThrow("ffmpeg exited with code null");
  });

  it("passes the correct ffmpeg path to spawn", () => {
    const { process: proc, emitClose } = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const promise = runFfmpeg("/custom/path/ffmpeg", ["-version"], false);
    emitClose(0);

    expect(mockSpawn).toHaveBeenCalledWith(
      "/custom/path/ffmpeg",
      ["-version"],
      expect.objectContaining({ stdio: "pipe" }),
    );

    return promise;
  });
});
