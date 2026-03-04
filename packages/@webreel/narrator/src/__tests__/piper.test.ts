import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { TTSInitializationError } from "../errors.js";
import { PiperProvider } from "../providers/piper.js";

describe("PiperProvider", () => {
  let originalModelPath: string | undefined;
  let originalPiperPath: string | undefined;

  beforeEach(() => {
    originalModelPath = process.env.PIPER_MODEL_PATH;
    originalPiperPath = process.env.PIPER_PATH;
  });

  afterEach(() => {
    if (originalModelPath !== undefined) {
      process.env.PIPER_MODEL_PATH = originalModelPath;
    } else {
      delete process.env.PIPER_MODEL_PATH;
    }
    if (originalPiperPath !== undefined) {
      process.env.PIPER_PATH = originalPiperPath;
    } else {
      delete process.env.PIPER_PATH;
    }
  });

  it("has correct name", () => {
    const provider = new PiperProvider();
    expect(provider.name).toBe("piper");
  });

  it('voices() returns ["default"]', async () => {
    const provider = new PiperProvider();
    const voices = await provider.voices();

    expect(voices).toEqual(["default"]);
  });

  it("initialize() throws if model path not set", async () => {
    delete process.env.PIPER_MODEL_PATH;
    const provider = new PiperProvider();

    await expect(provider.initialize()).rejects.toThrow(TTSInitializationError);
    await expect(provider.initialize()).rejects.toThrow(/No model path provided/);
  });

  it("generate() throws TTSInitializationError if not initialized", async () => {
    const provider = new PiperProvider({ modelPath: "/tmp/model.onnx" });

    await expect(
      provider.generate("Hello", { voice: "default", speed: 1.0 }),
    ).rejects.toThrow(TTSInitializationError);
  });
});
