# @webreel/narrator

TTS narration engine for webreel.

Generates voice narration from text using multiple TTS providers. Supports local and cloud-based synthesis with audio caching and timeline integration.

## Installation

```bash
npm install @webreel/narrator
```

## Providers

| Provider     | Type             | Default | Requirements                                                    |
| ------------ | ---------------- | ------- | --------------------------------------------------------------- |
| `kokoro`     | Local ONNX       | Yes     | No API key needed. Model downloaded automatically on first use. |
| `piper`      | Local subprocess | No      | Piper binary installed. Model path via `PIPER_MODEL_PATH`.      |
| `openai-tts` | Cloud API        | No      | `OPENAI_API_KEY` environment variable.                          |
| `elevenlabs` | Cloud API        | No      | `ELEVENLABS_API_KEY` environment variable.                      |
| `http`       | Generic HTTP     | No      | Configurable base URL pointing to any TTS server.               |

## Usage

```ts
import {
  TTSProviderRegistry,
  NarrationEngine,
  registerDefaultTTSProviders,
  DEFAULT_NARRATOR_CONFIG,
} from "@webreel/narrator";

// Create a registry and register built-in providers
const registry = new TTSProviderRegistry();
registerDefaultTTSProviders(registry);

// Create the narration engine with default config
const engine = new NarrationEngine(registry, DEFAULT_NARRATOR_CONFIG);

// Generate a narration timeline from parsed narration blocks
const timeline = await engine.generateTimeline(narrationBlocks);

// Resolve deferred segments after capturing dynamic values
const resolved = await engine.resolveDeferred(timeline, {
  latency: "42ms",
});

// Clean up when done
await engine.dispose();
```

## API

### Types

- **`TTSProvider`** -- Interface that all TTS providers implement. Methods: `generate()`, `voices()`, `initialize()`, `dispose()`.
- **`TTSProviderFactory`** -- Factory function signature `() => TTSProvider`.
- **`TTSOptions`** -- Generation options: `voice`, `speed`, `sampleRate`.
- **`TTSResult`** -- Generation result: `audio` (Buffer), `durationMs`.
- **`NarratorConfig`** -- Engine configuration (provider, voice, speed, caching).
- **`NarrationTimeline`** -- Complete timeline: `segments`, `totalDurationMs`.
- **`NarrationSegment`** -- Single segment: `audioBuffer`, `durationMs`, `text`, `startOffsetMs`, `waitForNarration`, `isDeferred`.

### Classes

- **`TTSProviderRegistry`** -- Registry of provider factories. Methods: `register()`, `create()`, `has()`, `providers()`, `unregister()`.
- **`NarrationEngine`** -- Main engine. Methods: `generateTimeline()`, `resolveDeferred()`, `dispose()`.
- **`TTSCache`** -- Disk-based audio cache with content-addressed keys.

### Provider Classes

- **`KokoroProvider`** -- Local ONNX inference via `kokoro-js`.
- **`OpenAITTSProvider`** -- OpenAI audio API (`tts-1` / `tts-1-hd`).
- **`ElevenLabsProvider`** -- ElevenLabs REST API.
- **`PiperProvider`** -- Local Piper subprocess.
- **`HttpTTSProvider`** -- Generic HTTP TTS server.

### Factory Functions

- `createKokoroProvider(modelId?)` -- Returns a `TTSProviderFactory` for Kokoro.
- `createOpenAITTSProvider(config?)` -- Returns a `TTSProviderFactory` for OpenAI TTS.
- `createElevenLabsProvider(config?)` -- Returns a `TTSProviderFactory` for ElevenLabs.
- `createPiperProvider(config?)` -- Returns a `TTSProviderFactory` for Piper.
- `createHttpTTSProvider(config)` -- Returns a `TTSProviderFactory` for generic HTTP.

### Utilities

- `registerDefaultTTSProviders(registry)` -- Registers all built-in providers (kokoro, openai-tts, elevenlabs, piper) with a registry.
- `resolveTTSProvider(config, registry)` -- Auto-detects the best provider based on config and environment variables.
- `pcmToWav(pcmData, sampleRate, channels, bitDepth)` -- Converts raw PCM audio to WAV format.
- `wavDurationMs(wavBuffer)` -- Calculates duration in milliseconds from a WAV buffer.
- `preprocessNarration(blocks, config)` -- Splits narration blocks into sentence-level segments.
- `assembleTimeline(segments, config)` -- Assembles generated segments into a timed narration timeline.

### Error Classes

- `NarrationError` -- Base error for narration failures.
- `TTSProviderNotFoundError` -- Requested provider is not registered.
- `TTSGenerationError` -- TTS generation failed (model error, timeout, API failure).
- `TTSInitializationError` -- Provider initialization failed (missing model, missing API key).

## Configuration

The `NarratorConfig` interface controls engine behavior:

| Field               | Type      | Default                  | Description                                             |
| ------------------- | --------- | ------------------------ | ------------------------------------------------------- |
| `provider`          | `string`  | `"kokoro"`               | TTS provider name (must be registered in the registry). |
| `voice`             | `string`  | `"af_heart"`             | Default voice identifier (provider-specific).           |
| `speed`             | `number`  | `1.0`                    | Speech speed multiplier.                                |
| `interSegmentGapMs` | `number`  | `300`                    | Silence gap between narration segments in milliseconds. |
| `cacheDir`          | `string`  | `"~/.webreel/cache/tts"` | Directory for cached TTS audio files.                   |
| `cacheEnabled`      | `boolean` | `true`                   | Whether to cache generated audio to disk.               |

## Adding a Custom Provider

Implement the `TTSProvider` interface and register it with the registry:

```ts
import type { TTSProvider, TTSOptions, TTSResult } from "@webreel/narrator";
import { TTSProviderRegistry, NarrationEngine } from "@webreel/narrator";

class MyCustomProvider implements TTSProvider {
  readonly name = "my-provider";

  async initialize(): Promise<void> {
    // Load models, establish connections, validate credentials
  }

  async generate(text: string, options: TTSOptions): Promise<TTSResult> {
    // Synthesize speech, return WAV buffer with duration
    const audio = Buffer.from(/* WAV data */);
    const durationMs = 1200;
    return { audio, durationMs };
  }

  async voices(): Promise<readonly string[]> {
    return ["voice-a", "voice-b"];
  }

  async dispose(): Promise<void> {
    // Release resources
  }
}

// Register and use
const registry = new TTSProviderRegistry();
registry.register("my-provider", () => new MyCustomProvider());

const engine = new NarrationEngine(registry, {
  provider: "my-provider",
  voice: "voice-a",
  speed: 1.0,
  interSegmentGapMs: 300,
  cacheDir: "~/.webreel/cache/tts",
  cacheEnabled: true,
});
```

## Environment Variables

| Variable             | Provider     | Description                                             |
| -------------------- | ------------ | ------------------------------------------------------- |
| `OPENAI_API_KEY`     | `openai-tts` | OpenAI API key for cloud TTS.                           |
| `ELEVENLABS_API_KEY` | `elevenlabs` | ElevenLabs API key for cloud TTS.                       |
| `PIPER_MODEL_PATH`   | `piper`      | Path to the Piper ONNX model file.                      |
| `PIPER_PATH`         | `piper`      | Path to the Piper binary (defaults to `piper` on PATH). |

Provider auto-detection priority when no explicit provider is configured:

1. `OPENAI_API_KEY` present -- selects `openai-tts`
2. `ELEVENLABS_API_KEY` present -- selects `elevenlabs`
3. `PIPER_MODEL_PATH` present -- selects `piper`
4. Fallback -- selects `kokoro` (no env vars required)

## License

Apache-2.0
