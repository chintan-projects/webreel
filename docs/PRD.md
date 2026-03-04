# PRD: Webreel Demo Automation Platform

**Version:** 0.2 — Draft
**Date:** 2026-03-03
**Author:** Chintan
**Status:** Proposal

> **v0.2 changes:** TTS strategy updated — Kokoro (local, 82M) is default provider, cloud TTS is upgrade. Phase 1 no longer requires API key. Narrator providers renamed. Open question #4 (offline-first) resolved. Three new open questions added from research. See [RESEARCH-open-source-landscape.md](./RESEARCH-open-source-landscape.md) for full analysis.

---

## 1. Problem Statement

Product demos are the highest-leverage sales and developer relations artifact a company produces. A 4-minute demo video can close a deal, win a partnership, or drive adoption at a conference. Yet today, producing one is a painful, manual, multi-tool process:

1. **A human writes a talk track** (what to say, what to show)
2. **A human writes a script** (terminal automation, slide decks, or clicks through a live app)
3. **A human records** (screen recording + voice, hoping nothing breaks)
4. **A human edits** (syncing audio to video, cutting mistakes, adding polish)
5. **A human re-records** when anything changes (new feature, updated numbers, different audience)

This process takes hours per demo. Every product update invalidates the recording. Every new audience requires a re-edit. The talk track and the video are disconnected artifacts — changing one doesn't update the other.

**The core insight:** A demo is a program. It has a script (what to say), a storyboard (what to show), and execution (rendering). If the script is structured, the rest can be compiled — just like source code compiles to a binary.

### What Exists Today

**Webreel (current)** solves one piece: scripted browser recordings with polished cursor animations, sound effects, and 60 FPS video output. You write a JSON config, it produces an MP4. But it only controls a headless browser tab — it can't drive a terminal, a native app, or narrate.

**Typical demo workflow** (e.g., privacy-gateway AMD ISV demo): A Python script prints styled text to a terminal with timed delays. A human runs the script, records with Loom, narrates live, and manually edits the result. The talk track is a separate Markdown file that the presenter memorizes. There is no connection between the script and the talk track — they drift apart.

### What Should Exist

A platform where:

- The **script is the single source of truth** — a Markdown document that an LLM and a human co-author
- The script compiles to a **multi-surface recording** — browser, terminal, native apps, desktop — whatever the demo requires
- **Voice narration is generated** from the script and synced to the visual timeline
- **Real software runs** during recording — live scans, real latency numbers, actual API calls
- The human's only job is to **align on the script** — everything else is automated
- When the product changes, you **update the script and re-render** — not re-record

---

## 2. Target Users

### Primary: Developer Relations & Solutions Engineers

People who demo products to technical audiences. They know what they want to show but spend disproportionate time on production mechanics. They want to write a script, review a rendered video, tweak, and ship.

### Secondary: Product & Marketing Teams

People who need product walkthroughs, onboarding videos, and feature announcements. They care about polish and consistency. They want to update a video when the UI changes without reshooting.

### Tertiary: Engineering Teams (Internal)

Teams that record architecture walkthroughs, debug sessions, or integration tutorials for internal knowledge sharing. They want low-friction recording with enough polish to be watchable.

---

## 3. Design Principles

### 3.1. Script Is Source Code

The demo script (Markdown) is the canonical artifact. Everything else — video, audio, timing, overlays — is a build artifact derived from it. Scripts are version-controlled, diffable, and reviewable via PR. Changing the script and re-rendering is the normal workflow, not an exception.

### 3.2. Surfaces Are Pluggable

A demo might use a browser, a terminal, a native application, the desktop, or any combination. No surface is privileged. The recording engine captures whatever is on screen and drives whatever is in focus. Adding a new surface type (e.g., mobile emulator) shouldn't require rewriting the pipeline.

### 3.3. Real Execution, Not Simulation

Demos run real software. Terminal commands execute and produce real output. Browser interactions hit real pages. Latency numbers come from actual measurements. This is what makes demos credible. Canned screenshots and pre-recorded output are a last resort, not the default.

### 3.4. Human-LLM Collaborative Authoring

The LLM is a co-author and director, not just a renderer. It helps structure the talk track, suggests visual beats, optimizes pacing, and translates intent ("show that it's fast") into executable actions. The human provides domain expertise and editorial judgment. Neither works alone.

### 3.5. Iterative Refinement Over One-Shot

The workflow is a loop: draft script, render preview, review, adjust, re-render. Fast iteration matters more than first-try perfection. Section-level re-rendering (not full video) is essential for tight feedback loops.

---

## 4. Capabilities

### 4.1. Multi-Surface Recording

The recorder captures and drives any combination of surfaces within a single demo:

**Browser** — Web applications, dashboards, documentation sites. Driven via CDP (Chrome DevTools Protocol), same as today's webreel. Headless or visible.

**Terminal** — CLI tools, scripts, live command output. Driven via PTY (pseudo-terminal) with full ANSI color support. Can run real commands and capture real output, or replay pre-recorded output with controlled timing.

**Application** — Native desktop apps (VS Code, Slack, Figma, etc.). Driven via OS-level input (mouse, keyboard) with screen capture. The recorder controls the actual app, not a simulation.

**Desktop** — Window management, app switching, multi-window compositions. Driven via OS automation (AppleScript on macOS, xdotool on Linux). Handles window positioning, focus, and transitions between surfaces.

**Composition** — A scene can show one surface or multiple. Side-by-side terminal + browser. Picture-in-picture. Sequential switching. The compositor handles layout and transitions.

#### Surface Specification in Script

```markdown
## Scene: Live Detection

> surface: terminal
> working_directory: ~/Projects/privacy-gateway
> shell: zsh

Run the scan pipeline and show real-time detection results.
```

```markdown
## Scene: Dashboard Results

> surface: browser
> url: http://localhost:3000/dashboard
> viewport: 1920x1080

Navigate to the results tab and highlight the latency chart.
```

```markdown
## Scene: Code Integration

> surface: application
> app: Visual Studio Code
> file: src/integration.py

Show the 3-line integration code. Highlight the scan() call.
```

```markdown
## Scene: Side-by-Side

> surface: composite
> layout: split-horizontal
> left: terminal
> right: browser

Run the scan in terminal while the dashboard updates in real-time.
```

### 4.2. Voice Narration

Generated speech from the script's narration text, synced to the visual timeline.

**TTS Providers (informed by [open source research](./RESEARCH-open-source-landscape.md)):**

- **Kokoro** (default, Phase 1) — 82M-parameter local model via `kokoro-js` npm package. Runs on CPU, no API key needed. Natural English speech. Offline-first.
- **Piper** (Phase 2) — Fast local TTS with 30+ languages. Native binary via child process. For multilingual demos.
- **Coqui XTTS-v2** (Phase 3) — Voice cloning from 10-second audio sample. Python microservice. For presenters who want their own voice.
- **Cloud providers** (user-configured) — OpenAI TTS, ElevenLabs, etc. For users who prefer cloud quality or have existing API keys.

Provider is configurable per-project via `narrator.provider` in front matter.

**Voice Selection:** Per-project default voice with per-scene overrides. Supports voice cloning for presenters who want their own voice without recording.

**Timing Synchronization:**

- Narration audio is generated first, with duration measured
- Visual actions are scheduled around narration timing
- `waitForNarration: true` (default) holds the next visual action until the current narration segment finishes
- `narrationAlignment: "parallel"` allows actions and narration to overlap

**Pacing Control:**

- Natural pauses between sentences (configurable gap duration)
- Speed adjustment per-section (1.0x default, 0.8x for emphasis, 1.2x for transitions)
- Manual pause insertion via `[pause 1.5s]` in narration text

**SSML Support:** For fine-grained control over pronunciation, emphasis, and prosody — passed through to TTS providers that support it.

### 4.3. Script Format (Demo Markdown)

The script is a Markdown document with embedded metadata, narration, and action directives. It is the single source of truth for the entire demo.

#### Structure

```markdown
---
title: "Liquid + AMD ISV Partner Demo"
duration: 4m
audience: AMD ISV partners, solutions architects
voice: onyx
viewport: 1920x1080
theme: dark
---

# Act 1: The Problem (30s)

## Scene: Title Card

> surface: title
> background: #0a0a0a
> transition_in: fade 500ms

"Every ISV wants to ship LLM-powered features. But your enterprise
customers keep asking the same three questions."

## Scene: The Gap

> surface: browser
> url: file://./slides/gap.html
> viewport: 1920x1080

"More than 60% of enterprise AI projects stall because IT can't
approve data leaving the device."

- wait: 1.5s
- annotate: "#stat-60" with "The adoption blocker" style=highlight
- pause: 2s

---

# Act 2: The Model (60s)

## Scene: RAM Comparison

> surface: browser
> url: file://./slides/ram-chart.html
> transition_in: slide-left 300ms

"A standard 16GB laptop has about 4 gigs free for AI tasks."

- annotate: "#ram-bar-free" with "~4GB available" style=arrow
- pause: 1s

"An 8-billion parameter model needs 6 gigs. They don't fit."

- annotate: "#model-8b" with "Doesn't fit" style=cross
- pause: 1.5s

## Scene: Live Detection

> surface: terminal
> working_directory: ~/Projects/privacy-gateway
> transition_in: fade 300ms

"Let me show you it running. 33 entity types, three verticals."

- run: python scan.py --payload financial
- wait_for_output: "entities detected"
- highlight_output: line_containing="latency"
- pause: 1s

"[read_output:latency_ms] milliseconds. Found every entity."
```

#### Script Elements

**Front Matter** — Global config: title, duration target, default voice, viewport, theme. YAML block at the top.

**Acts** — Top-level narrative structure (H1 headings). Map to chapters in the final video. Control pacing budget.

**Scenes** — Individual recording segments (H2 headings). Each scene specifies a surface and optional transitions. A scene runs on exactly one surface (or a composite of surfaces).

**Narration** — Quoted text or plain paragraphs. Becomes TTS audio. Supports inline dynamic references like `[read_output:latency_ms]` that are filled from live execution output.

**Actions** — Bulleted directives within a scene. Prefixed with the action type. Executed in order between narration segments.

**Director Notes** — Block quotes starting with `> note:`. Not rendered. Used for context, warnings, and instructions to the rendering engine (e.g., "if latency > 20ms, re-run with warm cache").

**Dynamic References** — `[read_output:name]` injects live values captured during execution into narration text. TTS generates speech after values are captured. Enables "read the real numbers off the screen" naturally.

**Transitions** — `transition_in` and `transition_out` on scenes. Types: `fade`, `slide-left`, `slide-right`, `slide-up`, `wipe`, `cut` (instant). Duration in ms.

### 4.4. LLM Collaborative Authoring

The LLM participates in script creation and refinement, not just rendering. This is an interactive workflow, not a one-shot generation.

#### Phase 1: Brief

The human provides a brief — audience, product, key messages, duration, and tone. The LLM generates a first draft of the structured script.

**Input:**

```
Audience: AMD ISV partners
Product: ShieldFlow on-device PII detection
Key messages: runs locally, <10ms, zero data loss, 679MB model
Duration: 4 minutes
Tone: Technical but accessible. Confident, not salesy.
Demo assets: privacy-gateway repo (scan pipeline, benchmarks)
```

**Output:** Full first-draft script in Demo Markdown format with acts, scenes, narration, and action placeholders.

#### Phase 2: Script Refinement (Collaborative Loop)

Human and LLM iterate on the script through conversation:

- **Human:** "The latency section needs more punch. Add a comparison."
- **LLM:** Rewrites the section, adds a cloud-vs-local comparison annotation, adjusts timing budget.
- **Human:** "Show the actual benchmark running, not just the result."
- **LLM:** Changes scene surface from browser to terminal, adds `run:` directive with benchmark command, adds progress tracking, adjusts narration to reference live output.

The LLM acts as a **demo director** — it understands pacing, visual rhythm, and audience engagement:

- Flags sections with too much narration and no visual action ("dead air")
- Suggests visual beats the human didn't specify ("add a zoom on the latency number")
- Validates timing budgets against narration length ("this section has 45s of narration but you budgeted 30s")
- Proposes scene transitions and ordering for narrative flow

#### Phase 3: Demo Plan Generation

Once the script is approved, the LLM generates a concrete execution plan:

- What software/services need to be running before recording
- What files/pages need to exist
- Expected duration per scene (from narration length + action timing)
- Risk assessment (which scenes depend on live execution, which are deterministic)
- Pre-flight checks (is Chrome available? Is ffmpeg installed? Is the demo app running?)

The human reviews and approves the plan before rendering begins.

#### Phase 4: Post-Render Review (Collaborative Loop)

After rendering, the human reviews the output and gives feedback:

- **Human:** "The terminal section is too fast — I can't read the output."
- **LLM:** Adjusts timing for that scene, adds a longer pause after output appears, re-renders only that section.
- **Human:** "The voice sounds rushed in the closing."
- **LLM:** Reduces narration speed to 0.9x for the closing act, re-generates TTS, re-renders.

Section-level re-rendering is critical here. Re-rendering a 4-minute video because of a 10-second fix is unacceptable.

### 4.5. Annotations & Visual Overlays

Beyond cursor and keystroke HUD (which webreel already has), demos need:

**Highlight** — Draw attention to a region. Dims everything except the target. Configurable color and opacity.

**Arrow/Pointer** — An animated arrow pointing at a specific element with an optional label. Appears and disappears with configurable timing.

**Zoom** — Smooth zoom into a specific element or region. Ken Burns effect. Useful for showing small text or numbers.

**Callout** — A labeled box connected to an element by a line. For adding context ("This is the latency value") to what's on screen.

**Comparison** — Side-by-side before/after or old/new. Split-screen overlay within a single scene.

**Redaction** — Blur or pixelate sensitive regions (API keys, real emails) that appear in live execution output.

#### Annotation Syntax in Script

```markdown
- annotate: "#latency-value" with "Under 5ms" style=highlight
- annotate: ".model-size" with "679 MB — one file" style=arrow position=right
- zoom: "#benchmark-table" duration=2s
- callout: "#scan-result" label="33 entity types detected"
- redact: "#api-key-field"
```

### 4.6. Title Cards & Section Breaks

Configurable interstitial screens between acts or scenes:

```markdown
## Scene: Title Card

> surface: title
> background: #0a0a0a
> text_color: #ffffff
> subtitle: "Runs on any 16GB AMD Ryzen laptop"

"THE MODEL: LFM-350M"
```

Rendered as full-screen text with configurable typography, background, and transition animations. No browser or terminal needed — purely generated frames.

### 4.7. Execution Engine

The execution engine is responsible for driving all surfaces and capturing the screen during recording.

#### Recording Modes

**Headless Mode** — For browser-only demos. Uses CDP screenshot capture (current webreel approach). Fastest, most reliable, no display needed. Works in CI.

**Screen Capture Mode** — For multi-surface demos. Captures the actual screen (or a virtual display). Required when the demo involves terminals, native apps, or desktop interactions. Uses platform screen capture APIs.

**Hybrid Mode** — Browser scenes use headless CDP. Terminal/app scenes use screen capture. Compositor stitches them together. Best balance of reliability and flexibility.

#### Action Execution

Each surface type has an action driver:

**Browser Actions** (existing webreel actions):
`click`, `type`, `scroll`, `drag`, `hover`, `select`, `key`, `navigate`, `wait`, `moveTo`, `screenshot`, `pause`

**Terminal Actions** (new):

- `run` — Execute a command, capture stdout/stderr
- `type_command` — Type a command character-by-character (visible typing effect)
- `wait_for_output` — Wait for specific text in terminal output
- `highlight_output` — Highlight a line or pattern in the output
- `clear` — Clear the terminal
- `send_key` — Send a keypress to the terminal (Enter, Ctrl+C, etc.)

**Application Actions** (new):

- `focus_window` — Bring an application window to front
- `click_at` — Click at screen coordinates (with cursor animation)
- `type_text` — Type text into the focused application
- `send_shortcut` — Send a keyboard shortcut (Cmd+S, Ctrl+Shift+P)
- `wait_for_window` — Wait for a window title to appear

**Desktop Actions** (new):

- `arrange_windows` — Position windows for a specific layout
- `switch_app` — Cmd+Tab or taskbar click to switch applications
- `screenshot_region` — Capture a specific screen region

**Annotation Actions** (new):

- `annotate` — Add a visual overlay (highlight, arrow, callout, zoom)
- `remove_annotation` — Remove a previously added annotation
- `transition` — Scene transition effect

#### Live Output Capture

When terminal commands run, their output is captured and indexed:

```markdown
- run: python scan.py --payload financial
  capture:
  latency_ms: regex("(\d+\.\d+)ms")
  entity_count: regex("Found (\d+) entities")
```

Captured values are available for:

1. Dynamic narration: `"[latency_ms] milliseconds — found every entity"`
2. Conditional logic: `if latency_ms > 20: re-run with --warm-cache`
3. Annotation content: `annotate: "#result" with "[entity_count] entities"`

### 4.8. Timeline & Composition

The compositor assembles the final video from:

1. **Screen captures** — Per-scene frame sequences
2. **Narration audio** — TTS-generated speech per scene
3. **Sound effects** — Click sounds, key sounds (existing webreel feature)
4. **Overlay frames** — Annotations, cursor, HUD
5. **Transition effects** — Between scenes
6. **Background music** — Optional ambient track (ducked during narration)
7. **Title cards** — Generated interstitials

#### Timeline Structure

```
Act 1 (30s)
├── Scene: Title Card [0:00 - 0:04]
│   ├── Narration: none
│   ├── Visual: generated title frame
│   └── Transition: fade in 500ms
├── Scene: The Gap [0:04 - 0:30]
│   ├── Narration: "Every ISV wants to..." (8.2s TTS)
│   ├── Visual: browser @ gap.html
│   ├── Action: annotate at 0:12
│   └── Transition: fade out 300ms
Act 2 (60s)
├── Scene: RAM Comparison [0:30 - 1:05]
│   ├── Narration: "A standard 16GB laptop..." (12.4s TTS)
│   ├── Visual: browser @ ram-chart.html
│   ├── Actions: annotate, annotate, pause
│   └── Transition: slide-left 300ms
├── Scene: Live Detection [1:05 - 1:30]
│   ├── Narration: "Let me show you it running..." (6.1s TTS)
│   ├── Visual: terminal running scan.py
│   ├── Actions: run, wait_for_output, highlight
│   ├── Dynamic narration: "[latency_ms] milliseconds"
│   └── Transition: fade 300ms
...
```

### 4.9. Output Formats

**MP4** — Primary format. H.264 video + AAC audio. Chapters embedded from acts. Subtitle track from narration text.

**WebM** — VP9 + Opus. For web embedding.

**GIF** — Animated GIF, no audio. For README badges, Slack previews, social cards. Auto-trimmed to key moments.

**Subtitles** — SRT/VTT generated from narration text with timestamps. Delivered alongside video.

**Interactive HTML** — (Stretch goal) Click-to-advance presentation mode. Like a self-running keynote embedded in a web page. Each scene is a step. Narration plays on advance.

---

## 5. Architecture

### 5.1. Package Structure

```
packages/
├── @webreel/core/              # Existing — browser recording engine
│   └── src/
│       ├── recorder.ts          # Frame capture + ffmpeg pipeline
│       ├── actions.ts           # Browser action implementations
│       ├── compositor.ts        # Overlay compositing
│       ├── overlays.ts          # Cursor + HUD injection
│       ├── timeline.ts          # Frame-level event tracking
│       ├── chrome.ts            # Chrome process management
│       ├── cdp.ts               # CDP client
│       ├── cursor-motion.ts     # Cursor animation math
│       ├── ffmpeg.ts            # ffmpeg binary management
│       ├── media.ts             # Audio mixing
│       └── types.ts             # Shared types
│
├── @webreel/surfaces/           # NEW — Multi-surface drivers
│   └── src/
│       ├── browser.ts           # CDP-based browser surface (extracted from core)
│       ├── terminal.ts          # PTY-based terminal surface
│       ├── application.ts       # OS-level app control surface
│       ├── desktop.ts           # Window management + screen capture
│       ├── title-card.ts        # Generated title/interstitial frames
│       ├── composite.ts         # Multi-surface layout compositor
│       └── types.ts             # Surface interfaces
│
├── @webreel/narrator/           # NEW — Voice narration engine
│   └── src/
│       ├── tts.ts               # TTS provider abstraction
│       ├── providers/
│       │   ├── kokoro.ts        # Kokoro TTS (default, 82M local)
│       │   ├── piper.ts         # Piper TTS (multilingual, local)
│       │   ├── coqui.ts         # Coqui XTTS-v2 (voice cloning)
│       │   └── cloud.ts         # Cloud providers (OpenAI, ElevenLabs)
│       ├── timing.ts            # Narration timing + sync
│       ├── ssml.ts              # SSML generation for fine control
│       └── types.ts
│
├── @webreel/director/           # NEW — LLM-powered script intelligence
│   └── src/
│       ├── parser.ts            # Demo Markdown → structured IR
│       ├── planner.ts           # Script → execution plan
│       ├── validator.ts         # Timing/pacing/completeness checks
│       ├── reviewer.ts          # Post-render review suggestions
│       ├── brief-to-draft.ts    # Brief → first draft generation
│       ├── refinement.ts        # Collaborative refinement loop
│       └── types.ts
│
├── @webreel/annotations/        # NEW — Visual overlay system
│   └── src/
│       ├── highlight.ts         # Dimming spotlight effect
│       ├── arrow.ts             # Animated pointer with label
│       ├── zoom.ts              # Ken Burns zoom effect
│       ├── callout.ts           # Labeled connector box
│       ├── redact.ts            # Blur/pixelate regions
│       ├── transition.ts        # Scene transition effects
│       └── types.ts
│
├── webreel/                     # Existing CLI — expanded
│   └── src/
│       ├── commands/
│       │   ├── record.ts        # Existing — JSON config recording
│       │   ├── render.ts        # NEW — Demo Markdown → video
│       │   ├── preview.ts       # Existing — expanded for multi-surface
│       │   ├── author.ts        # NEW — Interactive script authoring with LLM
│       │   ├── plan.ts          # NEW — Generate execution plan from script
│       │   ├── init.ts          # Existing
│       │   ├── validate.ts      # Existing — expanded for Demo Markdown
│       │   └── composite.ts     # Existing
│       └── lib/
│           ├── runner.ts        # Existing — expanded for multi-surface
│           ├── script-parser.ts # NEW — Demo Markdown parsing
│           └── config.ts        # Existing
```

### 5.2. Data Flow

```
                    ┌─────────────────────┐
                    │   Demo Markdown      │
                    │   (script.md)        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Director/Parser    │
                    │   Parse → IR         │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Planner            │
                    │   IR → Execution     │
                    │   Plan               │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                 │
    ┌─────────▼────┐  ┌───────▼──────┐  ┌──────▼───────┐
    │  Narrator     │  │  Surface     │  │  Annotation  │
    │  TTS audio    │  │  Drivers     │  │  Overlays    │
    │  generation   │  │  (execute    │  │  (generate   │
    │               │  │   + capture) │  │   frames)    │
    └───────┬──────┘  └───────┬──────┘  └──────┬───────┘
            │                 │                 │
            └────────────┬────┘─────────────────┘
                         │
              ┌──────────▼──────────┐
              │   Compositor        │
              │   Assemble:         │
              │   video + audio +   │
              │   overlays +        │
              │   transitions       │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   Output            │
              │   MP4 / WebM / GIF  │
              │   + SRT subtitles   │
              │   + thumbnails      │
              └─────────────────────┘
```

### 5.3. Surface Interface

Every surface implements a common interface:

```typescript
interface Surface {
  readonly type: SurfaceType;

  /** Initialize the surface (launch browser, open terminal, etc.) */
  setup(config: SurfaceConfig): Promise<void>;

  /** Execute a single action on this surface */
  execute(action: Action, context: RecordingContext): Promise<ActionResult>;

  /** Capture the current visual state as a frame */
  captureFrame(): Promise<Buffer>;

  /** Clean up resources */
  teardown(): Promise<void>;
}

type SurfaceType =
  | "browser"
  | "terminal"
  | "application"
  | "desktop"
  | "title"
  | "composite";

interface ActionResult {
  /** Captured output values (for dynamic narration) */
  captures?: Record<string, string>;
  /** Duration the action took */
  durationMs: number;
}
```

This interface is the contract that allows new surface types to be added without changing the recording pipeline.

### 5.4. Rendering Pipeline

```
For each Act:
  For each Scene:
    1. Setup surface (if changed from previous scene)
    2. Generate narration audio for this scene's text
    3. Calculate timing: narration duration + action delays + pauses
    4. Begin frame capture on surface
    5. Execute actions in sequence:
       a. Start narration audio playback (virtual — for timing sync)
       b. Execute action → capture result
       c. If action has captures → store for dynamic narration
       d. If dynamic narration pending → generate TTS → update timing
       e. Render annotation overlays onto frames
       f. Advance timeline
    6. Apply scene transition (fade/slide/wipe)
    7. Stop frame capture
    8. Store scene segment (video frames + audio + timeline)

After all scenes:
  1. Concatenate scene segments with transitions
  2. Mix audio: narration + sound effects + background music
  3. Embed chapter markers from Acts
  4. Generate subtitle track from narration text + timestamps
  5. Encode to output format(s)
  6. Extract thumbnails
```

---

## 6. CLI Commands

### Existing (unchanged)

```bash
webreel record [videos...]         # Record from JSON config (existing flow)
webreel preview [videos...]        # Preview in visible browser
webreel composite [videos...]      # Re-composite from timeline
webreel validate                   # Validate JSON config
webreel init                       # Scaffold JSON config
```

### New

```bash
webreel render <script.md>         # Render a Demo Markdown script to video
  --scene <name>                   # Render only a specific scene (for iteration)
  --act <name>                     # Render only a specific act
  --preview                        # Visible mode, no output file
  --dry-run                        # Print execution plan, don't render
  --voice <name>                   # Override voice
  --output <path>                  # Override output path
  --format mp4|webm|gif            # Override format
  --subtitles                      # Generate SRT/VTT
  --verbose                        # Log each step

webreel author                     # Interactive LLM-assisted script authoring
  --brief <file>                   # Start from a brief document
  --script <file>                  # Refine an existing script
  --model <name>                   # LLM model to use (default: claude-sonnet)

webreel plan <script.md>           # Generate and display execution plan
  --validate                       # Check that all prerequisites are met
  --timing                         # Show timing breakdown per scene
```

---

## 7. Phased Delivery

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Demo Markdown parser + terminal surface + basic narration. Enough to render the privacy-gateway AMD ISV demo end-to-end.

**Deliverables:**

- Demo Markdown parser (front matter, acts, scenes, narration, actions)
- Terminal surface driver (PTY, run commands, capture output, wait for patterns)
- Narration engine with default TTS provider (Kokoro — local, no API key)
- Narration-to-timeline synchronization
- `webreel render` command (basic — single surface per scene)
- Dynamic narration references (`[read_output:name]`)
- Title card surface (generated text frames)
- Scene transitions (fade, cut)

**Validation:** Render the privacy-gateway AMD ISV demo from a Demo Markdown script. Output is an MP4 with narrated voice, terminal execution showing real scan results, and basic transitions between sections.

### Phase 2: Multi-Surface & Annotations (Weeks 5-8)

**Goal:** Multiple surfaces in one demo + visual annotations. Enough for a polished, conference-quality demo video.

**Deliverables:**

- Application surface driver (OS-level input, window management)
- Desktop surface driver (window arrangement, app switching)
- Composite surface (split-screen, picture-in-picture layouts)
- Annotation system (highlight, arrow, callout, zoom, redact)
- Additional scene transitions (slide, wipe)
- Background music support with ducking
- Subtitle generation (SRT/VTT)
- Chapter markers in MP4 output
- Section-level re-rendering (re-render one scene without re-rendering the full video)
- `webreel plan` command

**Validation:** Render a demo that starts in VS Code (show code), switches to terminal (run scan), switches to browser (show dashboard), with annotations highlighting key values and narration throughout.

### Phase 3: LLM Collaborative Authoring (Weeks 9-12)

**Goal:** The LLM co-authors and directs. The human writes a brief, the LLM produces a draft, and they iterate.

**Deliverables:**

- `webreel author` command — interactive CLI for script co-authoring
- Brief-to-draft generation (audience + product → structured script)
- Script refinement loop (human feedback → LLM edits)
- Pacing analysis (flag dead air, timing overruns, missing visual beats)
- Execution plan generation and validation
- Post-render review suggestions ("this scene has no visual action for 8 seconds")
- Voice cloning integration (Coqui XTTS-v2 local, ElevenLabs cloud)
- Conditional logic in scripts (`if output > threshold: retry`)
- Pre-flight checks (`webreel plan --validate`)

**Validation:** Starting from a 5-sentence brief, produce a 3-minute demo video through the collaborative authoring flow — brief → draft → 3 rounds of refinement → render → 1 round of post-render adjustment → final output.

### Phase 4: Polish & Scale (Weeks 13-16)

**Goal:** Production hardening, additional output formats, and CI integration.

**Deliverables:**

- WebM and GIF output for `render` command
- Interactive HTML output (click-to-advance presentation)
- CI-friendly mode (headless rendering with virtual display)
- Template library (common demo patterns: product walkthrough, feature announcement, tutorial)
- Cloud TTS providers (OpenAI, ElevenLabs) for users who prefer cloud quality
- Parallel scene rendering (render independent scenes concurrently)
- Caching (skip re-rendering unchanged scenes)
- `webreel render --watch` (re-render on script change, like hot reload)

**Validation:** Render a demo in a GitHub Actions pipeline triggered by a script change in a PR. Output uploaded as a PR artifact for review.

---

## 8. Success Criteria

### Phase 1 Gate

- [ ] Privacy-gateway AMD ISV demo renders from a Demo Markdown script
- [ ] Terminal commands execute and produce real output in the recording
- [ ] Narration audio is generated and synced to visual timeline
- [ ] Dynamic narration references resolve to live captured values
- [ ] Output MP4 is watchable without manual editing

### Phase 2 Gate

- [ ] A demo uses 3+ surfaces (browser, terminal, application)
- [ ] Annotations render correctly (highlight, arrow, zoom, callout)
- [ ] Section-level re-rendering works (change one scene, re-render in <30 seconds)
- [ ] Subtitle track is accurate to narration timing

### Phase 3 Gate

- [ ] Starting from a brief, LLM produces a usable first draft
- [ ] 3 rounds of refinement produce a conference-quality script
- [ ] Pacing analysis catches timing issues before rendering
- [ ] Total time from brief to final video: under 2 hours (including human review)

### Phase 4 Gate

- [ ] Demo renders in CI (GitHub Actions) without a physical display
- [ ] Interactive HTML output works in browser
- [ ] Unchanged scenes are cached and skipped on re-render
- [ ] Template library covers 3+ common demo patterns

---

## 9. Technical Risks & Mitigations

| Risk                                                 | Impact                                                     | Likelihood | Mitigation                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS-level automation is fragile across platforms      | Application/desktop surfaces unreliable                    | High       | Phase 1 focuses on browser + terminal (cross-platform via CDP + PTY). Application surface is Phase 2 with macOS-first support.                     |
| TTS latency slows the authoring loop                 | Slow iteration — minutes to hear changes                   | Low        | Kokoro (default) runs locally in real-time on CPU — no network latency. Cache TTS output by text hash. Only regenerate changed narration segments. |
| Live execution produces non-deterministic output     | Demo video has different numbers each time                 | Medium     | Support `capture` + `expect` for assertions. Offer "warm-up run" before recording. Allow pre-recorded output fallback.                             |
| Screen capture quality varies by platform            | Inconsistent visual quality                                | Medium     | Prefer headless CDP for browser scenes (pixel-perfect). Screen capture only for surfaces that require it.                                          |
| ffmpeg complexity grows with multi-track composition | Hard to debug rendering issues                             | Medium     | Build the compositor incrementally. Log the full ffmpeg filter graph. Support `--frames` mode for frame-by-frame debugging.                        |
| LLM generates poor scripts that waste render time    | Human spends time fixing LLM output instead of saving time | Medium     | Phase 3 includes `webreel plan --validate` to catch issues before rendering. Pacing analysis runs before render, not after.                        |

---

## 10. Non-Goals (Explicitly Out of Scope)

- **Live streaming** — This is a recording tool, not a streaming platform. Output is a file.
- **Video editing UI** — No GUI editor. The script is the editor. Use a text editor.
- **Slide deck replacement** — This is not a presentation tool. It records software demos. Use slides for slides.
- **Mobile device recording** — No physical device control. Mobile viewports in browser (existing feature) are sufficient.
- **Real-time collaboration** — One author at a time. Use git for collaboration (scripts are Markdown, diffable, mergeable).
- **Hosting/distribution** — Webreel produces files. Upload them wherever you want.

---

## 11. Open Questions

1. **Voice cloning ethics:** Should `webreel author` allow cloning any voice, or require the voice owner's consent flow? Coqui XTTS-v2 (Phase 3 default) has no built-in consent mechanism. ElevenLabs (cloud option) does. Should we build our own consent flow, or leave it to the provider?

2. **CI rendering environment:** Research confirms: headless Chrome + PTY work in CI without a display. Application/desktop surface requires Xvfb (virtual display). **Recommendation from research:** Phase 1 targets CLI rendering. Phase 4 adds `webreel render --ci` mode that auto-detects headless environment and skips desktop surface. Application surfaces require explicit `--virtual-display` flag in CI.

3. **Script versioning:** When a script changes, should webreel track which scenes changed and only re-render those? Or is explicit `--scene` selection sufficient?

4. ~~**Offline-first:**~~ **Resolved.** Default TTS is local (Kokoro, 82M params, no API key). Cloud TTS (OpenAI, ElevenLabs) is a user-configured upgrade. This was decided based on research finding that Kokoro via `kokoro-js` runs on CPU in real-time with quality rivaling models 10-100x its size. See ADR-011 in Architecture doc.

5. **Interactive HTML output:** Is this a core feature or a community plugin? It requires a fundamentally different rendering path (no ffmpeg, instead a web player with synced audio/video/annotations). Research identified asciinema-player as a reference for chapter-based web playback.

6. **WebVTT/SRT as first-class output:** ADR-009 generates subtitles from narration text, but should the output be burned-in only, or also exported as standalone `.vtt`/`.srt` files? Standalone files enable accessibility and multi-language subtitle tracks. (Identified during research.)

7. **Background music and sound design:** Current architecture covers narration audio and existing click/keystroke sounds. Should we add background music (loopable tracks, volume ducking), transition sounds, and sound design presets (corporate/casual/technical)? (Identified during research.)

8. **Short-form clip extraction:** Should `webreel render` auto-generate 15s/30s/60s highlight clips for social media alongside the full video? Or is this a separate command? (Identified during research.)
