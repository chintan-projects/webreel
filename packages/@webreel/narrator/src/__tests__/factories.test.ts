import { describe, it, expect } from "vitest";

import { ElevenLabsProvider } from "../providers/elevenlabs.js";
import {
  createElevenLabsProvider,
  createHttpTTSProvider,
  createKokoroProvider,
  createOpenAITTSProvider,
  createPiperProvider,
} from "../providers/factories.js";
import { HttpTTSProvider } from "../providers/http-tts.js";
import { KokoroProvider } from "../providers/kokoro.js";
import { OpenAITTSProvider } from "../providers/openai-tts.js";
import { PiperProvider } from "../providers/piper.js";

describe("factories", () => {
  it("createKokoroProvider returns factory that creates KokoroProvider", () => {
    const factory = createKokoroProvider();
    const provider = factory();

    expect(provider).toBeInstanceOf(KokoroProvider);
    expect(provider.name).toBe("kokoro");
  });

  it("createOpenAITTSProvider returns factory that creates OpenAITTSProvider", () => {
    const factory = createOpenAITTSProvider({ apiKey: "test-key" });
    const provider = factory();

    expect(provider).toBeInstanceOf(OpenAITTSProvider);
    expect(provider.name).toBe("openai-tts");
  });

  it("createElevenLabsProvider returns factory that creates ElevenLabsProvider", () => {
    const factory = createElevenLabsProvider({ apiKey: "test-key" });
    const provider = factory();

    expect(provider).toBeInstanceOf(ElevenLabsProvider);
    expect(provider.name).toBe("elevenlabs");
  });

  it("createPiperProvider returns factory that creates PiperProvider", () => {
    const factory = createPiperProvider({ modelPath: "/tmp/model.onnx" });
    const provider = factory();

    expect(provider).toBeInstanceOf(PiperProvider);
    expect(provider.name).toBe("piper");
  });

  it("createHttpTTSProvider returns factory that creates HttpTTSProvider", () => {
    const factory = createHttpTTSProvider({
      baseURL: "http://localhost:5000",
    });
    const provider = factory();

    expect(provider).toBeInstanceOf(HttpTTSProvider);
    expect(provider.name).toBe("http-tts");
  });
});
