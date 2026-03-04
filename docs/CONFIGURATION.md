# Configuration Reference

Complete reference for all configuration points in the webreel system, including environment variables, config files, Demo Markdown front matter, provider settings, rendering defaults, and file system paths.

---

## Table of Contents

1. [Environment Variables](#1-environment-variables)
2. [Config File (webreel.config.json)](#2-config-file-webreelconfigjson)
3. [Demo Markdown Front Matter](#3-demo-markdown-front-matter)
4. [TTS Provider Configuration](#4-tts-provider-configuration)
5. [LLM Provider Configuration](#5-llm-provider-configuration)
6. [Rendering Defaults](#6-rendering-defaults)
7. [File System Paths](#7-file-system-paths)

---

## 1. Environment Variables

### Browser and Tools

| Variable      | Description                                                                    | Default                                                                    |
| ------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `CHROME_PATH` | Path to Chrome or Chromium binary. Skips auto-detection and download when set. | Auto-detected from system paths, or downloaded to `~/.webreel/bin/chrome/` |
| `FFMPEG_PATH` | Path to FFmpeg binary. Skips auto-detection and download when set.             | Auto-detected from `$PATH`, or downloaded to `~/.webreel/bin/ffmpeg/`      |

When neither variable is set, webreel auto-downloads Chrome for Testing and FFmpeg on first use. The binaries are cached in `~/.webreel/bin/` for subsequent runs.

### LLM Provider API Keys

| Variable             | Description              | Required For                                               |
| -------------------- | ------------------------ | ---------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | Anthropic Claude API key | `author` command with `anthropic` provider                 |
| `OPENAI_API_KEY`     | OpenAI API key           | `author` with `openai` provider; `openai-tts` TTS provider |
| `OPENROUTER_API_KEY` | OpenRouter API key       | `author` with `openrouter` provider                        |
| `TOGETHER_API_KEY`   | Together AI API key      | `author` with `together` provider                          |
| `ELEVENLABS_API_KEY` | ElevenLabs API key       | `elevenlabs` TTS provider                                  |

When no explicit `--provider` is passed to the `author` command, webreel scans environment variables in the order listed above and uses the first available key. If none are found, it falls back to Ollama (local, keyless).

### TTS Model Paths

| Variable           | Description                                                                 | Default                                      |
| ------------------ | --------------------------------------------------------------------------- | -------------------------------------------- |
| `PIPER_MODEL_PATH` | Absolute path to a Piper ONNX model file (e.g., `en_US-lessac-medium.onnx`) | None (must be set to use the Piper provider) |
| `PIPER_PATH`       | Path to the Piper binary                                                    | `"piper"` (resolved via `$PATH`)             |

### CI Detection (Read-Only, Auto-Detected)

webreel automatically detects CI environments by checking these variables in priority order. When CI is detected, the `render` command applies CI-safe defaults (extended timeouts, headless Chrome flags, `--no-cache` by default).

| Variable         | CI System      | Detected When     |
| ---------------- | -------------- | ----------------- |
| `GITHUB_ACTIONS` | GitHub Actions | `"true"`          |
| `GITLAB_CI`      | GitLab CI      | `"true"`          |
| `CIRCLECI`       | CircleCI       | `"true"`          |
| `JENKINS_URL`    | Jenkins        | Any URL value     |
| `TRAVIS`         | Travis CI      | `"true"`          |
| `BUILDKITE`      | Buildkite      | `"true"`          |
| `CI`             | Generic CI     | `"true"` or `"1"` |

CI mode can also be forced with the `--ci` flag on the `render` command.

**CI-safe defaults applied when detected:**

| Setting            | Value                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Chrome flags       | `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu` (and others) |
| Viewport           | 1920x1080                                                                                  |
| Timeout multiplier | 2x                                                                                         |
| Silent mode        | Enabled                                                                                    |
| Cache              | Disabled (CI caches are often ephemeral)                                                   |

---

## 2. Config File (webreel.config.json)

### File Discovery

The config file is resolved in this order:

1. Explicit path via `--config <path>` CLI flag.
2. Automatic search starting from the current working directory, walking up the directory tree until a match is found.

**Supported file names** (checked in order at each directory level):

| Extension | Format                       |
| --------- | ---------------------------- |
| `.json`   | JSONC (JSON with comments)   |
| `.ts`     | TypeScript (loaded via jiti) |
| `.mts`    | TypeScript ESM               |
| `.js`     | JavaScript                   |
| `.mjs`    | JavaScript ESM               |

All config files use the base name `webreel.config` (e.g., `webreel.config.json`, `webreel.config.ts`).

TypeScript and JavaScript config files should export the config object as the default export. A `defineConfig` helper is provided for type safety:

```ts
import { defineConfig } from "webreel";

export default defineConfig({
  outDir: "videos",
  videos: {
    demo: {
      url: "https://example.com",
      steps: [{ action: "pause", ms: 2000 }],
    },
  },
});
```

### Environment Variable Interpolation

JSONC config files support `${ENV_VAR}` and `$ENV_VAR` syntax for environment variable substitution in string values:

```jsonc
{
  "baseUrl": "${BASE_URL}",
  "videos": {
    "demo": {
      "url": "$DEMO_URL/dashboard",
    },
  },
}
```

### Schema

| Field           | Value                                |
| --------------- | ------------------------------------ |
| Schema URL      | `https://webreel.dev/schema/v1.json` |
| Current version | v1                                   |

### Top-Level Fields

| Field          | Type                          | Default        | Description                                                                           |
| -------------- | ----------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `$schema`      | `string`                      | --             | JSON schema URL for IDE autocompletion                                                |
| `outDir`       | `string`                      | `"videos"`     | Directory for output files (relative to config file)                                  |
| `baseUrl`      | `string`                      | --             | Base URL prepended to all video URLs                                                  |
| `viewport`     | `string \| {width, height}`   | --             | Default viewport; accepts a preset name or explicit dimensions                        |
| `theme`        | `ThemeConfig`                 | --             | Default theme applied to all videos (see [Theme Configuration](#theme-configuration)) |
| `sfx`          | `SfxConfig`                   | --             | Default sound effects (see [SFX Configuration](#sfx-configuration))                   |
| `include`      | `string[]`                    | --             | Array of shared step files to prepend to all videos                                   |
| `defaultDelay` | `number`                      | --             | Default delay in ms between steps                                                     |
| `clickDwell`   | `number`                      | --             | Duration in ms to hold the cursor after a click                                       |
| `videos`       | `Record<string, VideoConfig>` | **(required)** | Map of video names to video configurations                                            |

### Per-Video Fields

Each entry in the `videos` object supports:

| Field          | Type                           | Default                  | Description                                        |
| -------------- | ------------------------------ | ------------------------ | -------------------------------------------------- |
| `url`          | `string`                       | **(required)**           | Page URL to record                                 |
| `baseUrl`      | `string`                       | Inherited from top-level | Override base URL for this video                   |
| `viewport`     | `string \| {width, height}`    | Inherited from top-level | Override viewport for this video                   |
| `zoom`         | `number`                       | `1`                      | Page zoom factor (e.g., `1.5` for 150%)            |
| `fps`          | `number`                       | `60`                     | Frame rate (1--120) for the recording capture loop |
| `quality`      | `number`                       | --                       | JPEG capture quality (1--100)                      |
| `waitFor`      | `string \| {selector?, text?}` | --                       | Wait for an element before starting steps          |
| `output`       | `string`                       | `"<outDir>/<name>.mp4"`  | Output file path                                   |
| `thumbnail`    | `{time?, enabled?}`            | --                       | Thumbnail extraction settings (`time` in seconds)  |
| `include`      | `string[]`                     | Inherited from top-level | Shared step files to prepend to this video         |
| `theme`        | `ThemeConfig`                  | Merged with top-level    | Theme overrides for this video                     |
| `sfx`          | `SfxConfig`                    | Inherited from top-level | Sound effect overrides for this video              |
| `defaultDelay` | `number`                       | Inherited from top-level | Delay between steps (ms)                           |
| `clickDwell`   | `number`                       | Inherited from top-level | Post-click cursor hold duration (ms)               |
| `steps`        | `Step[]`                       | **(required)**           | Array of action steps to execute                   |

### Step / Action Types

Every step requires an `action` field. All step types support optional `label`, `delay`, and `description` fields.

| Action       | Required Fields                    | Optional Fields                        | Description                                                                |
| ------------ | ---------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `pause`      | `ms`                               | --                                     | Pause recording for specified milliseconds                                 |
| `click`      | `text` or `selector`               | `within`, `modifiers`                  | Click an element found by visible text or CSS selector                     |
| `key`        | `key`                              | `target`                               | Press a keyboard key (e.g., `"Enter"`, `"Tab"`, `"Meta+k"`)                |
| `type`       | `text`                             | `selector`, `within`, `charDelay`      | Type text character by character into a focused or targeted element        |
| `drag`       | `from`, `to`                       | --                                     | Drag from one element to another; `from` and `to` are `{text?, selector?}` |
| `scroll`     | --                                 | `x`, `y`, `text`, `selector`, `within` | Scroll by pixel offset or scroll an element into view                      |
| `wait`       | `selector` or `text`               | `within`, `timeout`                    | Wait for an element to appear in the DOM                                   |
| `moveTo`     | `text` or `selector`               | `within`                               | Move cursor to an element without clicking                                 |
| `screenshot` | `output`                           | --                                     | Capture a screenshot to the specified file path                            |
| `navigate`   | `url`                              | --                                     | Navigate to a new URL                                                      |
| `hover`      | `text` or `selector`               | `within`                               | Hover over an element (triggers hover styles)                              |
| `select`     | (`text` or `selector`) and `value` | `within`                               | Select a value from a `<select>` dropdown                                  |

**Element targeting:** Steps that target elements accept `text` (visible text content), `selector` (CSS selector), and optionally `within` (CSS selector to scope the search to a container).

**Modifier keys** (for `click`): Pass an array of modifier strings, e.g., `["Meta", "Shift"]`.

### Theme Configuration

```jsonc
{
  "theme": {
    "cursor": {
      "image": "./cursor.svg", // Path to custom cursor image (SVG or PNG)
      "size": 24, // Cursor display size in pixels (default: 24)
      "hotspot": "top-left", // Click point: "top-left" or "center"
    },
    "hud": {
      "background": "rgba(0,0,0,0.5)", // Label background color
      "color": "rgba(255,255,255,0.85)", // Label text color
      "fontSize": 56, // Label font size in pixels
      "fontFamily": "\"Geist\", -apple-system, BlinkMacSystemFont, sans-serif",
      "borderRadius": 18, // Label border radius in pixels
      "position": "bottom", // Label position: "top" or "bottom"
    },
  },
}
```

### SFX Configuration

```jsonc
{
  "sfx": {
    "click": 1, // Built-in click sound variant (1-4) or path to audio file
    "key": 2, // Built-in key sound variant (1-4) or path to audio file
  },
}
```

Valid values for `click` and `key`:

- `1`, `2`, `3`, or `4` -- built-in sound effect variants
- A string file path to a custom audio file

### Viewport Presets

Use any of these preset names as the `viewport` value instead of explicit `{width, height}`:

| Preset              | Width | Height |
| ------------------- | ----- | ------ |
| `desktop`           | 1920  | 1080   |
| `desktop-hd`        | 2560  | 1440   |
| `laptop`            | 1366  | 768    |
| `macbook-air`       | 1440  | 900    |
| `macbook-pro`       | 1512  | 982    |
| `ipad`              | 1024  | 1366   |
| `ipad-pro`          | 834   | 1194   |
| `ipad-mini`         | 768   | 1024   |
| `iphone-15`         | 393   | 852    |
| `iphone-15-pro-max` | 430   | 932    |
| `iphone-se`         | 375   | 667    |
| `pixel-8`           | 412   | 915    |
| `galaxy-s24`        | 360   | 780    |

### Minimal Example

```jsonc
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "outDir": "videos",
  "baseUrl": "https://myapp.com",
  "viewport": "macbook-pro",
  "videos": {
    "homepage": {
      "url": "/",
      "steps": [
        { "action": "pause", "ms": 1000 },
        { "action": "click", "text": "Get Started" },
        { "action": "pause", "ms": 2000 },
      ],
    },
  },
}
```

---

## 3. Demo Markdown Front Matter

Demo Markdown scripts use a YAML front matter block for configuration. This controls metadata, narration, output, and transitions for the `render` command.

### meta Section

| Field         | Type              | Default        | Description                                           |
| ------------- | ----------------- | -------------- | ----------------------------------------------------- |
| `title`       | `string`          | **(required)** | Demo title                                            |
| `description` | `string`          | --             | Description of the demo                               |
| `version`     | `string`          | --             | Script version                                        |
| `duration`    | `number`          | --             | Target total duration in seconds (hint, not enforced) |
| `voice`       | `string`          | `"af_heart"`   | Default TTS voice identifier                          |
| `viewport`    | `{width, height}` | `{1280, 720}`  | Default viewport dimensions                           |
| `theme`       | `string`          | --             | Visual theme name for annotations and overlays        |
| `output`      | `object`          | --             | Output format preferences (see below)                 |

**output sub-fields:**

| Field     | Type     | Default | Description                                                      |
| --------- | -------- | ------- | ---------------------------------------------------------------- |
| `format`  | `string` | `"mp4"` | Output format (`mp4`, `webm`, `gif`, `html`, or comma-separated) |
| `fps`     | `number` | `30`    | Frame rate                                                       |
| `quality` | `string` | --      | Quality preset name                                              |

### narrator Section

| Field               | Type      | Default                  | Description                                                            |
| ------------------- | --------- | ------------------------ | ---------------------------------------------------------------------- |
| `provider`          | `string`  | `"kokoro"`               | TTS provider name (see [TTS Providers](#4-tts-provider-configuration)) |
| `voice`             | `string`  | `"af_heart"`             | Voice identifier (provider-specific)                                   |
| `speed`             | `number`  | `1.0`                    | Speech speed multiplier                                                |
| `interSegmentGapMs` | `number`  | `300`                    | Gap between narration segments in milliseconds                         |
| `cacheDir`          | `string`  | `"~/.webreel/cache/tts"` | Cache directory for generated audio                                    |
| `cacheEnabled`      | `boolean` | `true`                   | Whether to cache TTS output                                            |

### transitions Section

| Field     | Type               | Default                  | Description                             |
| --------- | ------------------ | ------------------------ | --------------------------------------- |
| `default` | `TransitionConfig` | `{type: "cut"}`          | Default transition between scenes       |
| Per-scene | `TransitionConfig` | Inherited from `default` | Override transition for specific scenes |

**Transition types:**

| Type            | Description                            |
| --------------- | -------------------------------------- |
| `cut`           | Instant cut (no transition effect)     |
| `crossfade`     | Dissolve between scenes                |
| `fade-to-black` | Fade out to black, then fade in        |
| `slide-left`    | Slide the new scene in from the right  |
| `slide-right`   | Slide the new scene in from the left   |
| `slide-up`      | Slide the new scene in from the bottom |
| `wipe`          | Wipe transition                        |

Each transition config accepts an optional `durationMs` field (milliseconds).

### Example Front Matter

```yaml
---
meta:
  title: "Product Demo"
  description: "Walk through the new dashboard features"
  duration: 120
  output:
    format: mp4
    resolution: 1080p
    fps: 30
    crf: 23

narrator:
  provider: kokoro
  voice: af_heart
  speed: 1.0
  interSegmentGapMs: 300
  cacheEnabled: true

transitions:
  default:
    type: crossfade
    durationMs: 500
---
```

---

## 4. TTS Provider Configuration

Five TTS providers are available. Providers are specified in the `narrator.provider` field of Demo Markdown front matter.

### kokoro (Default)

Local ONNX-based TTS using the Kokoro-82M model. No API key required. The model is downloaded automatically from Hugging Face on first use.

| Setting            | Value                                 |
| ------------------ | ------------------------------------- |
| Model ID           | `onnx-community/Kokoro-82M-v1.0-ONNX` |
| ONNX dtype         | `q8`                                  |
| API key            | Not required                          |
| Package dependency | `kokoro-js`                           |

**Available voices:**

| Category                | Voices                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| American Female (`af_`) | `af_heart` (default), `af_alloy`, `af_aoede`, `af_bella`, `af_jessica`, `af_kore`, `af_nicole`, `af_nova`, `af_river`, `af_sarah`, `af_sky` |
| American Male (`am_`)   | `am_adam`, `am_echo`, `am_eric`, `am_fenrir`, `am_liam`, `am_michael`, `am_onyx`, `am_puck`, `am_santa`                                     |
| British Female (`bf_`)  | `bf_emma`, `bf_isabella`, `bf_alice`, `bf_lily`                                                                                             |
| British Male (`bm_`)    | `bm_george`, `bm_lewis`, `bm_daniel`, `bm_fable`                                                                                            |

### openai-tts

Cloud-based TTS via the OpenAI audio API.

| Setting            | Value                       |
| ------------------ | --------------------------- |
| API key            | `OPENAI_API_KEY` (required) |
| Default model      | `tts-1`                     |
| Output format      | WAV                         |
| Package dependency | `openai`                    |

**Available voices:** `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

### elevenlabs

Cloud-based TTS via the ElevenLabs REST API. No SDK dependency -- uses native `fetch()`.

| Setting          | Value                           |
| ---------------- | ------------------------------- |
| API key          | `ELEVENLABS_API_KEY` (required) |
| Default model ID | `eleven_monolingual_v1`         |
| API base         | `https://api.elevenlabs.io/v1`  |
| Output format    | WAV                             |

Voices are identified by ElevenLabs voice IDs. The default voice list includes six built-in voices (Rachel, Domi, Bella, Elli, Callum, Josh). Custom voices from your ElevenLabs account can be used by passing their voice ID.

### piper

Local TTS using the Piper command-line tool with ONNX models.

| Setting         | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| Model path      | `PIPER_MODEL_PATH` environment variable (required)           |
| Binary path     | `PIPER_PATH` environment variable, or `"piper"` from `$PATH` |
| Sample rate     | 22050 Hz                                                     |
| Bit depth       | 16-bit                                                       |
| Channels        | 1 (mono)                                                     |
| Process timeout | 30000 ms                                                     |

Voice selection is done by choosing the model file, not by voice name. The `voices()` method returns `["default"]`.

### http

Generic HTTP TTS provider for any REST-accessible TTS server. Useful for custom models, LFM2.5-Audio, or any local TTS server.

| Setting          | Type             | Default        | Description                                                |
| ---------------- | ---------------- | -------------- | ---------------------------------------------------------- |
| `baseURL`        | `string`         | **(required)** | Base URL of the TTS server (e.g., `http://localhost:5000`) |
| `ttsEndpoint`    | `string`         | `/api/tts`     | POST endpoint for speech generation                        |
| `voicesEndpoint` | `string`         | `/api/voices`  | GET endpoint for listing available voices                  |
| `audioFormat`    | `"wav" \| "pcm"` | `"wav"`        | Audio format returned by the server                        |
| `sampleRate`     | `number`         | `24000`        | Sample rate in Hz (used for PCM-to-WAV conversion)         |
| `defaultVoice`   | `string`         | --             | Voice to use when none is specified                        |
| `staticVoices`   | `string[]`       | --             | Static voice list (skips server voice endpoint)            |

The provider performs a health check against `{baseURL}/api/health` during initialization. Requests have a 30-second timeout.

---

## 5. LLM Provider Configuration

Five LLM providers are available for the `author` command. Providers are selected via `--provider <name>` or auto-detected from environment variables.

### anthropic

| Setting       | Value                                |
| ------------- | ------------------------------------ |
| API key       | `ANTHROPIC_API_KEY` (required)       |
| Default model | `claude-sonnet-4-20250514`           |
| SDK           | `@anthropic-ai/sdk` (dynamic import) |
| API           | Anthropic Messages API               |

### openai

| Setting       | Value                       |
| ------------- | --------------------------- |
| API key       | `OPENAI_API_KEY` (required) |
| Default model | `gpt-4o`                    |
| Base URL      | `https://api.openai.com/v1` |
| SDK           | `openai` (dynamic import)   |

### openrouter

| Setting       | Value                                                   |
| ------------- | ------------------------------------------------------- |
| API key       | `OPENROUTER_API_KEY` (required)                         |
| Default model | `anthropic/claude-sonnet-4-20250514`                    |
| Base URL      | `https://openrouter.ai/api/v1`                          |
| SDK           | `openai` (OpenAI-compatible, dynamic import)            |
| Extra headers | `HTTP-Referer: https://webreel.dev`, `X-Title: webreel` |

### together

| Setting       | Value                                        |
| ------------- | -------------------------------------------- |
| API key       | `TOGETHER_API_KEY` (required)                |
| Default model | `meta-llama/Llama-3-70b-chat-hf`             |
| Base URL      | `https://api.together.xyz/v1`                |
| SDK           | `openai` (OpenAI-compatible, dynamic import) |

### ollama (Local Fallback)

| Setting       | Value                                        |
| ------------- | -------------------------------------------- |
| API key       | Not required                                 |
| Default model | `llama3.2`                                   |
| Base URL      | `http://localhost:11434/v1`                  |
| SDK           | `openai` (OpenAI-compatible, dynamic import) |

Ollama is used as the automatic fallback when no API keys are found in the environment.

### Default LLM Config

These defaults are used when no explicit overrides are provided:

| Setting     | Default Value |
| ----------- | ------------- |
| Provider    | `anthropic`   |
| Temperature | `0.7`         |
| Max tokens  | `4096`        |

### Provider Auto-Detection Order

When `--provider` is not specified, webreel scans environment variables in this order:

1. `ANTHROPIC_API_KEY` --> `anthropic`
2. `OPENAI_API_KEY` --> `openai`
3. `OPENROUTER_API_KEY` --> `openrouter`
4. `TOGETHER_API_KEY` --> `together`
5. (fallback) --> `ollama` (local, no key needed)

---

## 6. Rendering Defaults

### Record Command Defaults (webreel.config.json pipeline)

| Setting              | Default                             | Override                |
| -------------------- | ----------------------------------- | ----------------------- |
| Internal capture FPS | 60                                  | `fps` in video config   |
| FFmpeg CRF           | 18                                  | Constructor option      |
| FFmpeg preset        | `ultrafast`                         | --                      |
| Output format        | Determined by output file extension | `.mp4`, `.webm`, `.gif` |

### Render Command Defaults (Demo Markdown pipeline)

| Setting       | Default                            | Override                                               |
| ------------- | ---------------------------------- | ------------------------------------------------------ |
| FPS           | 30                                 | `--fps` CLI flag, or `output.fps` in front matter      |
| CRF           | 23                                 | `--crf` CLI flag (0--51, lower = better quality)       |
| FFmpeg preset | `fast`                             | --                                                     |
| Output format | `mp4`                              | `--format` CLI flag (comma-separated for multi-format) |
| Scene cache   | Enabled                            | `--no-cache` to disable                                |
| Hold frames   | 30 frames of final frame per scene | --                                                     |

### Supported Output Formats

| Format | Codec            | Notes                                                        |
| ------ | ---------------- | ------------------------------------------------------------ |
| `mp4`  | H.264 (libx264)  | Default. `yuv420p` pixel format, `+faststart` for streaming. |
| `webm` | VP9 (libvpx-vp9) | `yuva420p` pixel format (alpha support).                     |
| `gif`  | Palette-based    | Auto-generated palette for quality.                          |
| `html` | --               | Self-contained HTML player.                                  |

Multi-format output is supported: `--format mp4,webm,gif` produces all three from a single render pass.

---

## 7. File System Paths

### Global Cache and Binaries (`~/.webreel/`)

| Path                                    | Contents                                                            |
| --------------------------------------- | ------------------------------------------------------------------- |
| `~/.webreel/bin/chrome/`                | Auto-downloaded Chrome for Testing binary                           |
| `~/.webreel/bin/chrome-headless-shell/` | Auto-downloaded Chrome Headless Shell binary                        |
| `~/.webreel/bin/ffmpeg/`                | Auto-downloaded FFmpeg binary                                       |
| `~/.webreel/cache/tts/`                 | Cached TTS audio segments (used by narration engine)                |
| `~/.webreel/cache/scenes/`              | Cached rendered scene segments (per-script hash, per-scene name)    |
| `~/.webreel/_rec_[timestamp].mp4`       | Temporary recording file during capture (cleaned up after encoding) |

### Scene Cache Layout

```
~/.webreel/cache/scenes/{script_hash}/{scene_name}/
  scene.mp4         -- rendered scene segment
  scene.wav         -- narration audio (optional)
  timeline.json     -- narration timeline (optional)
  hash.txt          -- scene content hash for invalidation
```

Cache writes are atomic: data is written to a temp file first, then renamed into place. This prevents partial writes from corrupting the cache on interruption.

### Project-Local Paths (`.webreel/`)

| Path                            | Contents                    | Created By                  |
| ------------------------------- | --------------------------- | --------------------------- |
| `.webreel/frames/<video-name>/` | Exported raw JPEG frames    | `record --frames`           |
| `.webreel/raw/`                 | Raw recording intermediates | Internal recording pipeline |
| `.webreel/timelines/`           | Timeline data (JSON)        | Compositing pipeline        |
| `.webreel/cache/`               | CI-mode cache directory     | `render --ci`               |

### Output Defaults

| Context          | Default Path                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `record` command | `<outDir>/<video-name>.mp4` (outDir defaults to `videos/` relative to config file)          |
| `render` command | Derived from script filename with format extension, or specified via `-o`                   |
| Thumbnails       | Same directory as video output, `.png` extension                                            |
| Subtitles        | Same directory as video output, `.srt` and `.vtt` extensions (when `--subtitles` is passed) |
