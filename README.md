# webreel

Record scripted demo videos with multi-surface capture, voice narration, and cursor animation.

[Documentation](https://webreel.dev) | [Examples](https://webreel.dev/examples)

webreel operates in two modes:

- **JSON config mode** -- Define browser interactions in a JSON config (clicks, key presses, drags, pauses). webreel drives a headless Chrome instance, captures screenshots at ~60fps, and encodes the result with ffmpeg.
- **Demo Markdown mode** -- Write multi-surface demo scripts in Markdown with narration, annotations, scene transitions, and LLM-powered authoring. Renders to MP4, WebM, GIF, or interactive HTML.

Chrome and ffmpeg are downloaded automatically on first use to `~/.webreel` if not already installed.

## Quick Start

### JSON Config Recording

```bash
npm install webreel
npx webreel init --name my-video --url https://example.com
npx webreel record
```

### Demo Markdown Rendering

```bash
npm install webreel
npx webreel init --template product-walkthrough --name "My Product"
npx webreel render demo.md
```

## Features

**Multi-Surface Recording** -- Record browser pages, terminal sessions, native applications, desktop windows, and composite layouts side-by-side. Each scene targets a single surface with its own configuration.

**Voice Narration** -- Generate spoken narration from inline text using 5 TTS providers: Kokoro (local, default), Piper (local), OpenAI, ElevenLabs, and any HTTP-compatible TTS endpoint. Audio is synced to actions automatically.

**LLM-Powered Script Authoring** -- Generate Demo Markdown scripts from a brief using Anthropic, OpenAI, OpenRouter, Together AI, or Ollama. Supports iterative refinement with feedback and pacing analysis.

**Demo Markdown Format** -- A script-as-code format where demo scripts are version-controlled Markdown files. Front matter configures output settings, H1 headings define acts, H2 headings define scenes, blockquotes contain narration, and bullet lists specify actions.

**Multi-Format Output** -- Encode to MP4 (H.264), WebM (VP9), animated GIF, or all three in a single pass. Configurable frame rate, video quality (CRF), and resolution.

**Annotations** -- Overlay highlights, arrows, callouts, zoom effects, and redactions on any frame. Annotations are declared as actions within scenes.

**Subtitles and Chapters** -- Generate SRT and VTT subtitle files alongside video output. Embed chapter markers in MP4 files for navigation.

**Scene Transitions** -- Cut, crossfade, fade-to-black, slide (left/right/up), and wipe transitions between scenes with configurable duration.

**Watch Mode** -- Automatically re-render when script files change. Available for both JSON config recording (`record --watch`) and Demo Markdown rendering (`render --watch`).

**CI/CD Support** -- Auto-detects GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis, and Buildkite. Applies CI-safe Chrome flags, extended timeouts, and appropriate viewport defaults.

**Template System** -- Scaffold new Demo Markdown scripts from built-in templates: blank, product-walkthrough, cli-demo, and api-demo.

**Scene-Level Caching** -- Cache rendered scenes independently for fast re-renders. Only changed scenes are re-rendered; unchanged scenes are loaded from cache.

## Examples

<!-- EXAMPLES:START -->

**[custom-theme](examples/custom-theme)** - Demonstrates fully customizing the cursor overlay and keystroke HUD appearance using a code editor page.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/custom-theme/videos/custom-theme.mp4" controls muted width="100%"></video>

**[drag-and-drop](examples/drag-and-drop)** - Demonstrates dragging elements between positions on a kanban board.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/drag-and-drop/videos/drag-and-drop.mp4" controls muted width="100%"></video>

**[form-filling](examples/form-filling)** - Demonstrates typing into form fields and clicking a submit button, simulating a login flow.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/form-filling/videos/form-filling.mp4" controls muted width="100%"></video>

**[gif-output](examples/gif-output)** - Demonstrates outputting the recording as an animated GIF instead of the default MP4.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/gif-output/videos/gif-output.gif" controls muted width="100%"></video>

**[hello-world](examples/hello-world)** - The simplest possible webreel example. Opens a landing page and clicks the call-to-action button.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/hello-world/videos/hello-world.mp4" controls muted width="100%"></video>

**[keyboard-shortcuts](examples/keyboard-shortcuts)** - Demonstrates pressing key combos and displaying them in the keystroke HUD overlay. Uses a code editor page as the target.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/keyboard-shortcuts/videos/keyboard-shortcuts.mp4" controls muted width="100%"></video>

**[mobile-viewport](examples/mobile-viewport)** - Demonstrates recording at mobile device dimensions using a finance app interface.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/mobile-viewport/videos/mobile-viewport.mp4" controls muted width="100%"></video>

**[modifier-clicks](examples/modifier-clicks)** - Demonstrates clicking elements with modifier keys held down, simulating multi-select in a file manager.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/modifier-clicks/videos/modifier-clicks.mp4" controls muted width="100%"></video>

**[multi-demo](examples/multi-demo)** - Demonstrates defining multiple videos in a single config file, each producing its own output from the same page.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/multi-demo/videos/homepage.mp4" controls muted width="100%"></video>

**[page-scrolling](examples/page-scrolling)** - Demonstrates scrolling the page and scrolling within a specific container element on a blog post layout.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/page-scrolling/videos/page-scrolling.mp4" controls muted width="100%"></video>

**[screenshots](examples/screenshots)** - Demonstrates capturing PNG screenshots at specific points during a recording. Useful for generating static marketing assets or documentation images alongside videos.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/screenshots/videos/screenshots.mp4" controls muted width="100%"></video>

**[shared-steps](examples/shared-steps)** - Demonstrates using `include` to share common setup steps across videos. The shared steps dismiss a cookie consent banner before the main video steps run.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/shared-steps/shared-steps.mp4" controls muted width="100%"></video>

**[webm-output](examples/webm-output)** - Demonstrates outputting the recording as a WebM video using VP9 encoding.

<video src="https://github.com/vercel-labs/webreel/raw/main/examples/webm-output/webm-output.webm" controls muted width="100%"></video>

<!-- EXAMPLES:END -->

## CLI Commands

### init

Scaffold a new config file or Demo Markdown script.

```bash
# JSON config (default)
webreel init
webreel init --name login-flow --url https://myapp.com
webreel init --name hero -o hero.config.json

# Demo Markdown from template
webreel init --template blank --name "My Demo"
webreel init --template product-walkthrough --name "Acme" --url https://acme.com
webreel init --template cli-demo -o cli.md

# List available templates
webreel init --list-templates
```

| Option                | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `--name <name>`       | Video or demo name (default: `my-video`)                                        |
| `--url <url>`         | Starting URL (default: `https://example.com`)                                   |
| `-o, --output <file>` | Output file path                                                                |
| `--template <name>`   | Demo Markdown template (`blank`, `product-walkthrough`, `cli-demo`, `api-demo`) |
| `--list-templates`    | List available templates and exit                                               |

### record

Record videos from a JSON config file.

```bash
webreel record
webreel record hero login
webreel record -c custom.config.json
webreel record --watch
webreel record --verbose
webreel record --dry-run
webreel record --frames
```

| Option                | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `[videos...]`         | Video names to record (default: all)                  |
| `-c, --config <path>` | Path to config file (default: `webreel.config.json`)  |
| `--watch`             | Re-record when config files change                    |
| `--frames`            | Save raw frames as JPEGs in `.webreel/frames/`        |
| `--dry-run`           | Print resolved config and step list without recording |
| `--verbose`           | Log each step as it executes                          |

### render

Render a Demo Markdown script to video.

```bash
webreel render demo.md
webreel render demo.md -o output.mp4
webreel render demo.md --format webm
webreel render demo.md --format mp4,webm,gif
webreel render demo.md --scene "Dashboard" --verbose
webreel render demo.md --act "Getting Started"
webreel render demo.md --watch
webreel render demo.md --dry-run
webreel render demo.md --ci
webreel render demo.md --subtitles --chapters
webreel render demo.md --fps 60 --crf 18
webreel render demo.md --voice af_sky
webreel render demo.md --no-cache
```

| Option                | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `<script>`            | Path to Demo Markdown file (.md)                                         |
| `-o, --output <path>` | Output file path                                                         |
| `--format <format>`   | Output format(s), comma-separated: `mp4`, `webm`, `gif` (default: `mp4`) |
| `--scene <name>`      | Render only this scene (others loaded from cache if available)           |
| `--act <name>`        | Render only this act                                                     |
| `--watch`             | Watch script file and re-render on changes                               |
| `--ci`                | Enable CI mode (auto-detected, or forced with this flag)                 |
| `--voice <voice>`     | Override TTS voice                                                       |
| `--fps <number>`      | Frame rate (default: 30)                                                 |
| `--crf <number>`      | Video quality, 0-51, lower is better (default: 23)                       |
| `--no-cache`          | Disable scene caching, force full re-render                              |
| `--subtitles`         | Generate .srt and .vtt subtitle files alongside output                   |
| `--chapters`          | Embed chapter markers in MP4 output                                      |
| `--dry-run`           | Parse and show plan without rendering                                    |
| `--verbose`           | Show detailed progress                                                   |

### plan

Analyze a Demo Markdown script and display the execution plan.

```bash
webreel plan demo.md
webreel plan demo.md --validate
webreel plan demo.md --timing
webreel plan demo.md --json
webreel plan demo.md --validate --timing --no-color
```

| Option       | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| `<script>`   | Path to Demo Markdown file (.md)                              |
| `--validate` | Run pre-flight checks (binary availability, URL reachability) |
| `--timing`   | Show per-scene duration estimates                             |
| `--json`     | Output plan as JSON for programmatic use                      |
| `--no-color` | Disable colored output                                        |

### author

Author a Demo Markdown script using an LLM.

```bash
# Generate from a brief file
webreel author --brief brief.yaml -o demo.md

# Refine an existing script with interactive feedback
webreel author --script demo.md

# Interactive mode (prompted for brief fields)
webreel author

# Override provider and model
webreel author --brief brief.yaml --provider openai --model gpt-4o

# Generate and run pacing analysis
webreel author --brief brief.yaml --analyze --verbose
```

| Option                | Description                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| `--brief <path>`      | Path to brief YAML file                                                           |
| `--script <path>`     | Path to existing script to refine                                                 |
| `-o, --output <path>` | Output file path                                                                  |
| `--provider <name>`   | LLM provider override (`anthropic`, `openai`, `openrouter`, `together`, `ollama`) |
| `--model <name>`      | Model override                                                                    |
| `--analyze`           | Run pacing analysis after generation                                              |
| `--verbose`           | Show detailed progress                                                            |

### preview

Run a video in a visible browser window without recording.

```bash
webreel preview
webreel preview hero
webreel preview hero --verbose
```

### composite

Re-composite videos from stored raw recordings and timelines without re-recording.

```bash
webreel composite
webreel composite hero
```

### validate

Check JSON config files for errors without running them.

```bash
webreel validate
webreel validate -c custom.config.json
```

## Demo Markdown Format

Demo Markdown is a structured Markdown format for defining multi-surface narrated demo videos. Scripts are plain text files that can be version-controlled, reviewed, and collaboratively edited.

```markdown
---
title: "Product Walkthrough"
viewport: { width: 1920, height: 1080 }
output:
  format: mp4
  fps: 30
---

# Getting Started

## Landing Page

surface: browser
url: https://example.com

> Let me show you how to get started with our product.

- pause: 1000
- scroll: 300
- click: "Sign Up"

## Setup Terminal

surface: terminal
shell: bash

> Now let's install the CLI tool.

- run: "npm install -g myapp"
- wait_for_output: "added"
- run: "myapp init"

# Core Features

## Dashboard

surface: browser
url: https://example.com/dashboard
transition: crossfade

> Once you're in, here's your dashboard.

- pause: 1000
- click: "Projects"
- annotate: highlight "Create New" with "Start here"
```

### Structure

| Element        | Syntax                              | Purpose                                              |
| -------------- | ----------------------------------- | ---------------------------------------------------- |
| Front matter   | `---` YAML block `---`              | Global config: title, viewport, output format, voice |
| Act            | `# Heading`                         | Top-level narrative grouping                         |
| Scene          | `## Heading`                        | A single recording unit targeting one surface        |
| Surface config | `surface: type` after scene heading | Declares the surface type and options                |
| Narration      | `> Quoted text`                     | Text spoken by the TTS narrator                      |
| Actions        | `- action: params`                  | Steps executed against the surface                   |
| Director notes | `<!-- comment -->`                  | Planning context, not rendered                       |

### Surface Types

| Surface       | Description                                                            |
| ------------- | ---------------------------------------------------------------------- |
| `browser`     | Headless Chrome via CDP. Options: `url`, `viewport`, `waitFor`, `zoom` |
| `terminal`    | PTY-backed terminal emulator. Options: `shell`, `cwd`, `env`           |
| `application` | Native application window capture. Options: `app`, `window`            |
| `desktop`     | Full desktop or region capture. Options: `region`                      |
| `composite`   | Side-by-side layout of multiple surfaces. Options: `layout`, `regions` |
| `title`       | Title card with text overlay. Options: `text`, `background`            |

### Transitions

Transitions are declared via `transition:` in scene config or front matter defaults.

| Transition      | Description                        |
| --------------- | ---------------------------------- |
| `cut`           | Instant switch (default)           |
| `crossfade`     | Gradual blend between scenes       |
| `fade-to-black` | Fade out, then fade in             |
| `slide-left`    | Slide new scene in from the right  |
| `slide-right`   | Slide new scene in from the left   |
| `slide-up`      | Slide new scene in from the bottom |
| `wipe`          | Horizontal wipe transition         |

## JSON Config Format

JSON config mode uses a `webreel.config.json` file (JSONC with comments supported):

```json
{
  "$schema": "https://webreel.dev/schema/v1.json",
  "outDir": "./videos",
  "defaultDelay": 500,
  "videos": {
    "my-video": {
      "url": "https://example.com",
      "viewport": { "width": 1080, "height": 1080 },
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "text": "Get Started" },
        { "action": "key", "key": "cmd+a", "delay": 1000 }
      ]
    }
  }
}
```

### Actions

| Action       | Fields                                                 | Description                          |
| ------------ | ------------------------------------------------------ | ------------------------------------ |
| `pause`      | `ms`                                                   | Wait for a duration                  |
| `click`      | `text` or `selector`, optional `within`, `modifiers`   | Move cursor to an element and click  |
| `key`        | `key` (e.g. `"cmd+z"`), optional `label`               | Press a key or key combo             |
| `type`       | `text`, optional `target`, `charDelay`                 | Type text character by character     |
| `scroll`     | optional `x`, `y`, `selector`                          | Scroll the page or an element        |
| `wait`       | `selector` or `text`, optional `timeout`               | Wait for an element to appear        |
| `screenshot` | `output`                                               | Capture a PNG screenshot             |
| `drag`       | `from` and `to` (each with `text`/`selector`/`within`) | Drag from one element to another     |
| `moveTo`     | `text` or `selector`, optional `within`                | Move cursor to an element            |
| `navigate`   | `url`                                                  | Navigate to a new URL mid-video      |
| `hover`      | `text` or `selector`, optional `within`                | Hover over an element (triggers CSS) |
| `select`     | `selector`, `value`                                    | Select a value in a dropdown         |

All steps (except `pause`) accept an optional `delay` field (ms to wait after the step). Use `defaultDelay` at the top-level or per-video to set a default.

### Top-Level Config Options

| Field          | Default   | Description                                  |
| -------------- | --------- | -------------------------------------------- |
| `$schema`      | -         | JSON Schema URL for IDE autocompletion       |
| `outDir`       | `videos/` | Default output directory for videos          |
| `baseUrl`      | `""`      | Prepended to relative video URLs             |
| `viewport`     | 1080x1080 | Default browser viewport dimensions          |
| `theme`        | -         | Default cursor and HUD overlay customization |
| `include`      | -         | Array of step files prepended to all videos  |
| `defaultDelay` | -         | Default delay (ms) after each step           |
| `videos`       | required  | Object mapping video names to their configs  |

### Per-Video Config Options

| Field          | Default       | Description                                            |
| -------------- | ------------- | ------------------------------------------------------ |
| `url`          | required      | URL to navigate to                                     |
| `baseUrl`      | inherited     | Prepended to relative URLs                             |
| `viewport`     | inherited     | Browser viewport dimensions                            |
| `zoom`         | -             | CSS zoom level applied to the page                     |
| `waitFor`      | -             | CSS selector to wait for before start                  |
| `output`       | `<name>.mp4`  | Output file path (.mp4, .gif, or .webm)                |
| `thumbnail`    | `{ time: 0 }` | Object with `time` (seconds) or `enabled: false`       |
| `include`      | inherited     | Array of paths to JSON files whose steps are prepended |
| `theme`        | inherited     | Cursor and HUD overlay customization                   |
| `defaultDelay` | inherited     | Default delay (ms) after each step                     |

## Environment Variables

### Binaries

| Variable      | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| `CHROME_PATH` | Path to Chrome/Chromium binary (auto-detected if unset)          |
| `FFMPEG_PATH` | Path to ffmpeg binary (auto-downloaded to `~/.webreel` if unset) |

### LLM Providers (for `author` command)

| Variable             | Provider                         |
| -------------------- | -------------------------------- |
| `ANTHROPIC_API_KEY`  | Anthropic (Claude)               |
| `OPENAI_API_KEY`     | OpenAI (GPT-4o)                  |
| `OPENROUTER_API_KEY` | OpenRouter (multi-model gateway) |
| `TOGETHER_API_KEY`   | Together AI                      |

Provider auto-detection scans these variables in the order listed above. If none are set, Ollama (local, keyless) is used as a fallback.

### TTS Providers (for `render` command narration)

| Variable             | Description                   |
| -------------------- | ----------------------------- |
| `OPENAI_API_KEY`     | OpenAI TTS voices             |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS voices         |
| `PIPER_PATH`         | Path to Piper TTS binary      |
| `PIPER_MODEL_PATH`   | Path to Piper ONNX model file |

### CI Detection

webreel auto-detects CI environments via these variables:

| Variable              | CI Provider           |
| --------------------- | --------------------- |
| `GITHUB_ACTIONS=true` | GitHub Actions        |
| `GITLAB_CI=true`      | GitLab CI             |
| `CIRCLECI=true`       | CircleCI              |
| `JENKINS_URL`         | Jenkins               |
| `TRAVIS=true`         | Travis CI             |
| `BUILDKITE=true`      | Buildkite             |
| `CI=true` or `CI=1`   | Generic CI (fallback) |

## TTS Providers

| Provider   | Type   | Voice Example           | Requires                          |
| ---------- | ------ | ----------------------- | --------------------------------- |
| Kokoro     | Local  | `af_heart`, `af_sky`    | Auto-downloaded on first use      |
| Piper      | Local  | Model-dependent         | `PIPER_PATH` + `PIPER_MODEL_PATH` |
| OpenAI     | Cloud  | `alloy`, `echo`, `nova` | `OPENAI_API_KEY`                  |
| ElevenLabs | Cloud  | Voice ID from dashboard | `ELEVENLABS_API_KEY`              |
| HTTP       | Remote | Endpoint-dependent      | Custom endpoint URL in config     |

Default provider: Kokoro (local, no API key needed). Override per-script via front matter `voice:` field or `--voice` CLI flag.

## LLM Providers

| Provider    | Default Model                        | Requires                            |
| ----------- | ------------------------------------ | ----------------------------------- |
| Anthropic   | `claude-sonnet-4-20250514`           | `ANTHROPIC_API_KEY`                 |
| OpenAI      | `gpt-4o`                             | `OPENAI_API_KEY`                    |
| OpenRouter  | `anthropic/claude-sonnet-4-20250514` | `OPENROUTER_API_KEY`                |
| Together AI | `meta-llama/Llama-3-70b-chat-hf`     | `TOGETHER_API_KEY`                  |
| Ollama      | `llama3.2`                           | Ollama running locally (no API key) |

## Packages

| Package                                                 | Description                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`@webreel/core`](packages/@webreel/core)               | Chrome automation, frame capture, cursor animation, video encoding via ffmpeg                |
| [`@webreel/director`](packages/@webreel/director)       | Demo Markdown parser, scene graph IR, LLM-powered authoring and pacing analysis              |
| [`@webreel/narrator`](packages/@webreel/narrator)       | TTS provider abstraction, narration timeline engine, audio caching                           |
| [`@webreel/surfaces`](packages/@webreel/surfaces)       | Multi-surface abstraction: browser, terminal, application, desktop, composite, title card    |
| [`@webreel/annotations`](packages/@webreel/annotations) | Annotation overlays: highlights, arrows, callouts, zoom effects, redactions                  |
| [`webreel`](packages/webreel)                           | CLI tool with all commands: init, record, render, plan, author, preview, composite, validate |

## CI/CD

Use the `--ci` flag or let webreel auto-detect your CI environment. In CI mode, webreel applies:

- Headless Chrome flags for containerized environments (`--no-sandbox`, `--disable-dev-shm-usage`, etc.)
- Extended timeout multiplier (2x) for slower CI machines
- Default 1920x1080 viewport
- Scene caching disabled by default (CI caches are often ephemeral)
- Quiet output mode

```yaml
# GitHub Actions example
- name: Render demo video
  run: npx webreel render demo.md --format mp4
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)

### Setup

```bash
pnpm install
pnpm build
```

### Commands

```bash
pnpm build            # Build all packages
pnpm type-check       # Type check all packages
pnpm test             # Run tests (vitest)
pnpm lint             # ESLint
pnpm format           # Prettier (write)
pnpm format:check     # Prettier (check)
pnpm dev              # Watch mode for development
```

## License

Apache-2.0
