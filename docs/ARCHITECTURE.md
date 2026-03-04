# Architecture: Webreel Demo Automation Platform

**Version:** 1.0
**Date:** 2026-03-03
**Companion:** [PRD](./PRD.md) | [Research](./RESEARCH-open-source-landscape.md)

This document covers the full system design — what exists today, what changes, and every architectural decision that shapes the platform. It is the technical reference for implementers.

> **v1.0 changes:** All 4 implementation phases complete. 844 tests, typecheck clean, build clean. Document updated to reflect implemented system.
>
> **v0.2 changes:** ADR-007 revised (Node Canvas → xterm-headless), added ADR-010 (asciicast v2 format), ADR-011 (Kokoro TTS default), ADR-012 (nut.js desktop). Terminal surface module updated. Narrator providers updated. All changes informed by open source landscape research.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Current Architecture (v0.1)](#2-current-architecture-v01)
3. [Target Architecture (v1.0)](#3-target-architecture-v10)
4. [Core Abstractions](#4-core-abstractions)
5. [Module Deep-Dives](#5-module-deep-dives)
6. [Sequence Flows](#6-sequence-flows)
7. [Data Models](#7-data-models)
8. [Concurrency Model](#8-concurrency-model)
9. [Architectural Decisions](#9-architectural-decisions)
10. [Error Handling Strategy](#10-error-handling-strategy)
11. [Performance Budget](#11-performance-budget)
12. [Security & Isolation](#12-security--isolation)
13. [Testing Strategy](#13-testing-strategy)
14. [Migration Path](#14-migration-path)

---

## Implementation Status

All four phases of the webreel platform are fully implemented and tested.

| Phase                                | Status   | Tests | Key Deliverables                                                                                                                                                   |
| ------------------------------------ | -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1: Foundation                  | Complete | 307   | Monorepo scaffolding, Demo Markdown parser, Terminal/Browser/TitleCard surfaces, Narration engine, Scene orchestrator, Render CLI                                  |
| Phase 2: Multi-Surface & Annotations | Complete | 524   | Application surface (nut.js), Desktop surface, Composite surface, Annotation system, Scene transitions, Subtitles + chapters, Section-level re-rendering, Plan CLI |
| Phase 3: LLM Collaborative Authoring | Complete | 701   | LLM providers (Anthropic, OpenAI, OpenRouter, Together AI), Prompt template system, Authoring pipeline, Author CLI                                                 |
| Phase 4: Polish & Scale              | Complete | 844   | CLI wiring, Multi-format output (MP4/WebM/GIF/HTML), Interactive HTML player, CI rendering, TTS ecosystem (5 providers), Templates, Watch mode                     |

### Package Status

| Package                | Description                                                                               | Status        |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------- |
| `@webreel/core`        | Chrome automation, recording engine, overlays                                             | Stable (v0.1) |
| `@webreel/director`    | Demo Markdown parser, LLM integration, authoring pipeline                                 | Complete      |
| `@webreel/narrator`    | TTS narration engine with 5 providers                                                     | Complete      |
| `@webreel/surfaces`    | Multi-surface abstraction (Browser, Terminal, Application, Desktop, TitleCard, Composite) | Complete      |
| `@webreel/annotations` | Visual annotation overlays (highlight, arrow, zoom, callout, redact)                      | Complete      |
| `webreel` (CLI)        | User-facing CLI with 8 commands                                                           | Complete      |

---

## 1. System Overview

Webreel transforms structured scripts into polished demo videos. The system has two modes:

**Legacy mode** (`webreel record`) — JSON config drives headless Chrome actions, captures frames via CDP, composites cursor/HUD overlays, encodes to MP4/WebM/GIF. This is the current v0.1 product.

**Demo mode** (`webreel render`) — Demo Markdown script drives multi-surface execution (browser, terminal, application, desktop), generates voice narration, composites annotations and transitions, produces a complete narrated demo video. This is the v1.0 target.

Both modes share the same recording core (frame capture, ffmpeg pipeline, timeline, cursor animation). Demo mode adds layers on top: script parsing, surface abstraction, narration engine, annotation system, and LLM-powered authoring.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Layer                                 │
│  webreel record (legacy)  │  webreel render (demo)              │
│  webreel preview          │  webreel author                     │
│  webreel composite        │  webreel plan                       │
├───────────────────────────┼─────────────────────────────────────┤
│                           │  @webreel/director (LLM)            │
│                           │  @webreel/narrator (TTS)            │
│                           │  @webreel/annotations (overlays)    │
│                           │  @webreel/surfaces (multi-surface)  │
├───────────────────────────┴─────────────────────────────────────┤
│                     @webreel/core                                │
│  Recorder │ Timeline │ Compositor │ Actions │ Cursor │ Media    │
│  Chrome   │ CDP      │ FFmpeg     │ Overlays│ Types  │ Download │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Current Architecture (v0.1)

### 2.1. Recording Pipeline

The existing system is a two-phase pipeline:

```
Phase 1: Raw Recording                Phase 2: Compositing
┌──────────┐                          ┌──────────────┐
│  Config   │                          │  Raw Video   │
│  (JSON)   │                          │  (.mp4)      │
└────┬──────┘                          └──────┬───────┘
     │                                        │
     ▼                                        ▼
┌──────────┐   CDP    ┌──────────┐    ┌──────────────┐
│  Runner   │────────▶│  Chrome   │    │  Timeline    │
│           │         │ (headless)│    │  Data (JSON) │
└────┬──────┘         └────┬──────┘    └──────┬───────┘
     │                     │                  │
     │  Execute steps      │  Screenshots     │
     │  (click, type,      │  (JPEG @ 60fps)  │
     │   scroll, drag)     │                  │
     ▼                     ▼                  ▼
┌──────────┐         ┌──────────┐    ┌──────────────┐
│ Recording │────────▶│  FFmpeg  │    │  Compositor   │
│ Context   │  pipe   │ (H.264)  │    │  (sharp +     │
│ + Timeline│         └────┬─────┘    │   ffmpeg)     │
└───────────┘              │          └──────┬────────┘
                           ▼                 │
                    ┌────────────┐            │
                    │ Temp Video │            │
                    │ (raw, no   │────────────┘
                    │  overlays) │
                    └────────────┘
                           │
                           ▼
                    ┌────────────┐
                    │ Media.ts   │
                    │ (audio mix │
                    │  + format) │
                    └─────┬──────┘
                          │
                          ▼
                    ┌────────────┐
                    │ Final MP4  │
                    │ + thumbnail│
                    └────────────┘
```

**Why two phases?** Raw recording captures at full speed without overlay rendering overhead. Compositing applies pixel-perfect overlays using the timeline — every cursor position, HUD state, and click event is replayed frame-by-frame. This decoupling means:

- Recording speed is limited only by CDP screenshot latency, not by overlay rendering
- Overlays can be re-composited with different themes without re-recording
- Timeline data is serializable — the `webreel composite` command re-renders from saved timelines

### 2.2. Frame Capture Mechanics

The capture loop runs at 60 FPS target (16.67ms per frame):

```
┌─────────────────── captureLoop() ───────────────────┐
│                                                       │
│  while (running) {                                    │
│    timeline.tick()          // Advance cursor path     │
│    ┌─────────────────────────────────────┐            │
│    │ CDP: Page.captureScreenshot()        │            │
│    │ Returns: base64 JPEG (quality 60)    │            │
│    │ Typical latency: 8-12ms              │            │
│    └─────────────┬───────────────────────┘            │
│                  │                                     │
│    ┌─────────────▼───────────────────────┐            │
│    │ Timing compensation:                 │            │
│    │ elapsed = now - lastFrameTime        │            │
│    │ frameSlots = round(elapsed / 16.67)  │            │
│    │ if frameSlots > 1:                   │            │
│    │   write (frameSlots - 1) duplicates  │  ◄── Frame duplication
│    │   timeline.tickDuplicate() for each  │      keeps video smooth
│    └─────────────┬───────────────────────┘            │
│                  │                                     │
│    ┌─────────────▼───────────────────────┐            │
│    │ ffmpeg stdin.write(jpegBuffer)       │            │
│    │ if (!ok) await drain()              │  ◄── Backpressure
│    └─────────────────────────────────────┘            │
│  }                                                    │
└───────────────────────────────────────────────────────┘
```

**Frame duplication** is critical for smooth video. If a single capture takes 35ms (two frame slots), the recorder writes the frame twice so the video maintains constant 60fps without jitter. The timeline also duplicates its state to keep cursor/HUD overlays in sync.

**Backpressure** from ffmpeg's stdin is handled via a promise that resolves on the `drain` event. This prevents Node.js from buffering unbounded JPEG data in memory.

### 2.3. Cursor Animation System

Cursor motion uses a Fitts's law model with asymmetric easing:

```
    Position
    ▲
    │          ╭──────────────── Cubic deceleration
    │        ╱
    │      ╱
    │    ╱
    │  ╱ Quadratic acceleration
    │╱
    └──────────────────────────▶ Time
    0%        40%              100%
              ↑
         Inflection point (0.5 of distance)
```

**Duration model:** `180 + 16 × √distance ± 15ms jitter`

- 180ms base (human reaction time)
- Sublinear scaling with distance (Fitts's law approximation)
- Random jitter for natural variation

**Path shape:** Quadratic Bezier with perpendicular control point offset

```
    Start ●
           ╲
            ╲  Control point (3-10% perpendicular offset)
             ●
            ╱
           ╱
    End   ●
```

- Short distances (< 80px): straight line (no offset)
- Long distances: subtle curve from perpendicular deflection
- Micro-jitter (< 0.4px) peaks at 50% of motion (simulates hand tremor)

### 2.4. Audio Pipeline

Sound effects are mixed post-recording via ffmpeg's audio filter graph:

```
Input 0: Raw video (video track only)
Input 1: anullsrc (silent mono, 44.1kHz) ─── duration reference
Input 2: click-1.mp3 ──┐
Input 3: key-2.mp3  ───┤
Input 4: click-1.mp3 ──┤  Each sound event gets its own input
...                     │
Input N: key-1.mp3  ────┘

Per-event filter:
  asetrate(44100 × [0.93..1.07])  → Pitch variation
  aresample(44100)                → Normalize sample rate
  adelay(timeMs|timeMs)           → Position on timeline
  volume([0.15..0.40])            → Volume randomization

Mixing:
  [1][s0][s1]...[sN] amix=inputs=N+1:normalize=0 → [aout]

Output: -map 0:v -map [aout] → Final MP4 with audio
```

**Humanization:** Each sound event gets independent random pitch (±7%) and volume (±30%) variation, making repeated clicks/keystrokes sound natural rather than robotic.

### 2.5. CDP Integration

The Chrome DevTools Protocol client exposes four domains:

```
┌──────────────────────────────────────────────┐
│                CDPClient                      │
├──────────────┬───────────────────────────────┤
│ Page         │ navigate(url)                  │
│              │ captureScreenshot(format, q)    │
│              │ loadEventFired()                │
│              │ enable()                        │
├──────────────┼───────────────────────────────┤
│ Runtime      │ evaluate(expression)            │
│              │ enable()                        │
├──────────────┼───────────────────────────────┤
│ Input        │ dispatchMouseEvent(type, x, y)  │
│              │ dispatchKeyEvent(type, key)      │
├──────────────┼───────────────────────────────┤
│ Emulation    │ setDeviceMetricsOverride(w, h)  │
└──────────────┴───────────────────────────────┘
```

**Click event synthesis** uses a dual-dispatch strategy:

1. CDP `Input.dispatchMouseEvent` — triggers native browser behaviors (focus, caret placement, selection)
2. JS event dispatch via `Runtime.evaluate` — provides full control over modifier flags, event properties

Event blocking prevents the page's own JS handlers from seeing CDP-dispatched events (which have unreliable modifier flags), while still allowing synthetic JS events through:

```javascript
// Injected before CDP dispatch
document.addEventListener(
  "click",
  function __wrBlock(e) {
    if (e.__wrSynthetic) return; // Let our events through
    e.stopImmediatePropagation(); // Block CDP events
    document.removeEventListener("click", __wrBlock, true);
  },
  true,
);
```

### 2.6. Binary Management

Chrome and ffmpeg binaries are managed with a download-and-cache strategy:

```
~/.webreel/
├── bin/
│   ├── chrome/                     # Chrome for Testing
│   │   └── <platform>/            # Platform-specific binary
│   └── ffmpeg/                     # FFmpeg static build
│       └── ffmpeg                  # Binary
├── raw/                            # Raw recordings (pre-composite)
│   └── {name}.mp4
├── timelines/                      # Saved timeline data
│   └── {name}.timeline.json
└── frames/                         # Debug frame output (--frames flag)
    └── {name}/
        ├── 000001.jpg
        └── ...
```

**Discovery chain** (both Chrome and ffmpeg):

1. Environment variable (`CHROME_PATH` / `FFMPEG_PATH`)
2. Cached binary in `~/.webreel/bin/`
3. Download from CDN (platform-detected)
4. System installation fallback

**Download resilience:** 3 retries with exponential backoff (1s × attempt).

---

## 3. Target Architecture (v1.0)

### 3.1. Package Dependency Graph

```
                      ┌────────────┐
                      │  webreel   │  CLI (entry point)
                      │  (CLI)     │
                      └──────┬─────┘
                             │ depends on all packages
          ┌──────────────────┼──────────────────────┐
          │                  │                       │
          ▼                  ▼                       ▼
┌─────────────────┐ ┌───────────────┐ ┌─────────────────────┐
│ @webreel/       │ │ @webreel/     │ │ @webreel/director   │
│ surfaces        │ │ narrator      │ │ (LLM integration)   │
│                 │ │ (TTS engine)  │ │                     │
│ browser.ts      │ │               │ │ parser.ts           │
│ terminal.ts     │ │ kokoro.ts     │ │ planner.ts          │
│ application.ts  │ │ piper.ts      │ │ validator.ts        │
│ desktop.ts      │ │ openai-tts.ts │ │ reviewer.ts         │
│ title-card.ts   │ │ elevenlabs.ts │ │ brief-to-draft.ts   │
│ composite.ts    │ │ http-tts.ts   │ │ refinement.ts       │
└────────┬────────┘ └───────┬───────┘ └──────────┬──────────┘
         │                  │                     │
         │     all depend on core                 │
         └──────────────────┼─────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │      @webreel/core       │  (existing, extended)
              │                          │
              │  Recorder, Timeline,     │
              │  Compositor, Actions,    │
              │  CursorMotion, Media,    │
              │  Chrome, CDP, FFmpeg,    │
              │  Types                   │
              └──────────────────────────┘
                            │
              ┌──────────────────────────┐
              │   @webreel/annotations   │  depends on core (sharp)
              │                          │
              │  highlight, arrow, zoom, │
              │  callout, redact,        │
              │  transition              │
              └──────────────────────────┘
```

**Key constraint:** `@webreel/core` has zero dependencies on new packages. New packages depend downward. The existing `webreel record` flow is unchanged.

### 3.2. Process Architecture

A render session spawns multiple OS processes:

```
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Main Process                       │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Script       │  │ Scene        │  │ Narrator          │  │
│  │ Parser       │  │ Orchestrator │  │ (TTS API calls)   │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────────┘  │
│         │                │                   │               │
│         │                │   Frame capture   │  Audio files  │
│         │                ▼                   ▼               │
│         │         ┌──────────────────────────────┐          │
│         │         │      Scene Compositor         │          │
│         │         │   (concat + mix + overlay)    │          │
│         │         └──────────────────────────────┘          │
└─────────┼───────────────┼────────────────────────────────────┘
          │               │
          │    ┌──────────┼──────────────┐
          │    │          │              │
          ▼    ▼          ▼              ▼
     ┌────────────┐ ┌──────────┐ ┌───────────┐
     │ Chrome     │ │ FFmpeg   │ │ PTY       │
     │ (headless) │ │ (encode) │ │ (terminal │
     │            │ │          │ │  surface) │
     └────────────┘ └──────────┘ └───────────┘
      Child process  Child process  Child process
```

**Process count per render:** 1 Node.js + 1 Chrome + 1-N FFmpeg (encoding phases) + 0-1 PTY (terminal scenes). Application/desktop surfaces use OS automation APIs from the main process (no additional child process).

---

## 4. Core Abstractions

### 4.1. Surface Interface

The central abstraction for multi-surface support. Every surface type implements this contract:

```typescript
interface Surface {
  readonly type: SurfaceType;

  /**
   * Initialize the surface.
   * Browser: launch Chrome, connect CDP.
   * Terminal: spawn PTY process.
   * Application: verify app is running, get window handle.
   */
  setup(config: SurfaceConfig): Promise<void>;

  /**
   * Execute a single action. Returns captured output values
   * (e.g., terminal command stdout) for dynamic narration.
   */
  execute(action: SurfaceAction, context: RecordingContext): Promise<ActionResult>;

  /**
   * Capture the current visual state as a raw frame buffer.
   * Browser: CDP Page.captureScreenshot.
   * Terminal: render PTY buffer to image via canvas.
   * Application: platform screen capture API.
   */
  captureFrame(): Promise<Buffer>;

  /**
   * Clean up. Kill processes, close connections, restore window state.
   */
  teardown(): Promise<void>;
}

interface ActionResult {
  captures?: Record<string, string>; // Named values for dynamic narration
  durationMs: number; // How long the action took
}

type SurfaceType =
  | "browser"
  | "terminal"
  | "application"
  | "desktop"
  | "title"
  | "composite";
```

**Why this interface?** It isolates the recording pipeline from surface-specific mechanics. The scene orchestrator calls `setup()`, loops `execute()` + `captureFrame()`, then calls `teardown()`. It doesn't know or care whether it's driving Chrome via CDP or a terminal via PTY.

### 4.2. Scene Graph (Intermediate Representation)

The Demo Markdown parser produces a Scene Graph — the canonical IR that all downstream systems consume:

```typescript
interface DemoScript {
  meta: ScriptMeta; // Front matter (title, duration, voice, etc.)
  acts: Act[]; // Top-level narrative structure
}

interface Act {
  name: string; // H1 heading text
  durationHint?: number; // Target duration in seconds (from heading)
  scenes: Scene[];
}

interface Scene {
  name: string; // H2 heading text
  surface: SurfaceConfig; // Surface type + config (from blockquotes)
  narration: NarrationBlock[]; // Quoted text segments
  actions: ActionDirective[]; // Bulleted action lines
  transitions: {
    in?: TransitionConfig;
    out?: TransitionConfig;
  };
  directorNotes: string[]; // > note: lines (not rendered)
}

interface NarrationBlock {
  text: string; // Raw narration text
  dynamicRefs: string[]; // [read_output:name] references found
  speed?: number; // Per-block speed override
}

interface ActionDirective {
  type: string; // "run", "click", "annotate", "pause", etc.
  params: Record<string, unknown>; // Action-specific parameters
  captures?: CaptureSpec[]; // Output capture rules
}
```

**Why an IR?** The Demo Markdown is human-friendly but ambiguous. The IR is machine-friendly and unambiguous. The parser resolves ambiguity once; all downstream code works with clean typed data. The IR also enables:

- Validation before rendering (timing analysis, missing references)
- Execution plan generation (prerequisites, ordering)
- Diffing between script versions (for incremental re-rendering)

### 4.3. Execution Plan

The planner transforms the Scene Graph into a concrete execution plan:

```typescript
interface ExecutionPlan {
  prerequisites: Prerequisite[]; // Software that must be running
  scenes: SceneExecution[]; // Ordered scene executions
  totalEstimatedDuration: number; // Seconds
  risks: RiskAssessment[]; // Non-deterministic scenes, etc.
}

interface SceneExecution {
  sceneRef: string; // Act.Scene identifier
  surface: SurfaceConfig;
  narrationAudio: NarrationPlan; // TTS generation plan
  actions: ActionPlan[]; // Resolved action sequence
  estimatedDuration: number;
  dependsOn: string[]; // Scenes this depends on (for captures)
}

interface NarrationPlan {
  segments: Array<{
    text: string; // Final text (dynamic refs resolved later)
    hasDynamicRefs: boolean; // Requires deferred TTS generation
    estimatedDurationMs: number; // Estimated from word count
  }>;
  voice: string;
  speed: number;
}
```

### 4.4. Narration Timeline

The narration engine produces timed audio segments that the scene orchestrator uses for synchronization:

```typescript
interface NarrationTimeline {
  segments: NarrationSegment[];
  totalDurationMs: number;
}

interface NarrationSegment {
  audioBuffer: Buffer; // WAV/MP3 audio data
  durationMs: number; // Measured from audio
  text: string; // Original text (for subtitles)
  startOffsetMs: number; // Absolute position in scene timeline
  waitForNarration: boolean; // Block next action until segment finishes
}
```

**Timing synchronization flow:**

```
Narration segment generated (e.g., 3200ms duration)
    │
    ├─ If waitForNarration: true (default)
    │     Next action waits 3200ms before executing
    │     Frame capture continues (visual holds on current state)
    │
    └─ If waitForNarration: false
          Next action executes immediately
          Narration plays in parallel with visual actions
```

---

## 5. Module Deep-Dives

### 5.1. Demo Markdown Parser (`@webreel/director/parser.ts`)

**Input:** Markdown string with YAML front matter.

**Parsing stages:**

```
Raw Markdown
    │
    ▼
┌──────────────────┐
│ 1. Front matter   │  Extract YAML between --- fences
│    extraction      │  → ScriptMeta
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. Heading tree   │  Split by H1 (acts) and H2 (scenes)
│    construction    │  Parse duration hints from "(30s)" in headings
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. Scene block    │  For each H2 section:
│    parsing         │  - Blockquotes → surface config
│                    │  - Quoted text → narration blocks
│                    │  - Bullet lists → action directives
│                    │  - > note: → director notes
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. Reference      │  Find [read_output:name] in narration
│    extraction      │  Find #selector and .class in actions
│                    │  Validate cross-references
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 5. Validation     │  Every scene has a surface
│                    │  Every act has at least one scene
│                    │  Duration hints sum to ≈ front matter duration
│                    │  No unresolved dynamic references
└────────┬─────────┘
         │
         ▼
    DemoScript (IR)
```

**Blockquote surface config parsing:**

```markdown
> surface: terminal
> working_directory: ~/Projects/privacy-gateway
> shell: zsh
```

Parsed as key-value pairs. The `surface` key is required; all others are surface-type-specific.

**Narration detection:** Any line that is quoted text (`"..."`) or a plain paragraph (not a bullet, not a blockquote, not a heading) within a scene is narration. This keeps the script natural — you just write what to say.

**Action directive parsing:**

```markdown
- run: python scan.py --payload financial
- wait_for_output: "entities detected"
- annotate: "#latency" with "Under 5ms" style=highlight
- pause: 2s
```

Each bullet is `- action_type: parameters`. Parameters are parsed per action type.

### 5.2. Terminal Surface (`@webreel/surfaces/terminal.ts`)

The terminal surface manages a PTY (pseudo-terminal) process and renders its buffer to image frames using `@xterm/headless` for terminal emulation and state tracking.

```
┌──────────────────────────────────────────────────────────────┐
│                     Terminal Surface                           │
│                                                              │
│  ┌─────────┐    ┌──────────────┐    ┌───────────────────┐   │
│  │  PTY    │───▶│  @xterm/     │───▶│  Canvas Renderer  │   │
│  │ Process │    │  headless    │    │  (buffer → PNG)   │   │
│  │ (shell) │    │  (emulator)  │    │                   │   │
│  └────┬────┘    └──────┬───────┘    └────────┬──────────┘   │
│       │                │                      │              │
│   stdin/stdout    Terminal state          Frame buffer        │
│                   (cells, cursor,                            │
│                    colors, scroll)                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Output Capture Buffer                               │    │
│  │  Stores all stdout for regex matching                │    │
│  │  and dynamic reference resolution                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  asciicast Writer                                    │    │
│  │  Logs all PTY events to .cast file (NDJSON)         │    │
│  │  for replay, debugging, and incremental re-render   │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**Frame rendering approach (revised per ADR-007):** `@xterm/headless` processes all PTY output (ANSI escapes, cursor movement, colors, unicode) and maintains terminal state in memory. At each frame capture, the serialize addon extracts the full buffer state (cells, attributes, cursor position), which a thin canvas renderer converts to PNG at the configured viewport size. This handles all terminal edge cases (curses apps, 256-color, true color, alternate screen buffer) without custom ANSI parsing.

**Recording format (ADR-010):** All PTY events are simultaneously written to an asciicast v2 `.cast` file alongside the xterm processing. This enables replay mode (re-render from `.cast` without live execution) and provides a debug artifact for inspecting terminal timing.

**Output capture:**

```typescript
interface OutputCapture {
  name: string;
  pattern: RegExp;
  value?: string; // Set when pattern matches
}

// During command execution, stdout is piped through:
ptyProcess.onData((data: string) => {
  outputBuffer += data;
  for (const capture of pendingCaptures) {
    const match = capture.pattern.exec(outputBuffer);
    if (match) {
      capture.value = match[1]; // First capture group
    }
  }
});
```

### 5.3. Narration Engine (`@webreel/narrator`)

```
┌──────────────────────────────────────────────────────────┐
│                   Narration Engine                         │
│                                                          │
│  ┌─────────────┐                                         │
│  │ TTS Provider │◄─── Strategy pattern                    │
│  │ Interface    │     (OpenAI, ElevenLabs, Local)         │
│  └──────┬──────┘                                         │
│         │                                                 │
│         ▼                                                 │
│  ┌─────────────────────────────┐                         │
│  │  1. Text preprocessing      │                         │
│  │     - Resolve static refs   │                         │
│  │     - Apply SSML tags       │                         │
│  │     - Split at sentence     │                         │
│  │       boundaries            │                         │
│  └──────────┬──────────────────┘                         │
│             │                                             │
│             ▼                                             │
│  ┌─────────────────────────────┐                         │
│  │  2. TTS generation          │                         │
│  │     - Per-segment API call  │                         │
│  │     - Cache by text hash    │                         │
│  │     - Measure duration      │                         │
│  └──────────┬──────────────────┘                         │
│             │                                             │
│             ▼                                             │
│  ┌─────────────────────────────┐                         │
│  │  3. Timeline assembly       │                         │
│  │     - Place segments with   │                         │
│  │       inter-sentence gaps   │                         │
│  │     - Calculate start       │                         │
│  │       offsets               │                         │
│  │     - Return NarrationTimeline                        │
│  └─────────────────────────────┘                         │
└──────────────────────────────────────────────────────────┘
```

**TTS caching:** Audio segments are cached by `sha256(text + voice + speed)`. On re-render, only segments with changed text are regenerated. Cache lives in `~/.webreel/cache/tts/`.

**Dynamic narration (deferred TTS):** When narration contains `[read_output:latency_ms]`, TTS generation is deferred until the referenced value is captured during execution. The scene orchestrator:

1. Executes actions up to and including the one that captures the value
2. Resolves the reference in the narration text
3. Calls TTS for the resolved text
4. Measures audio duration and adjusts the scene timeline
5. Continues with remaining actions

This is the most complex timing flow in the system and is detailed in [Sequence Flow 6.3](#63-dynamic-narration-with-live-capture).

### 5.4. Annotation Renderer (`@webreel/annotations`)

Annotations are rendered as overlay frames composited on top of the scene video, extending the existing compositor's overlay approach.

```typescript
interface Annotation {
  type: "highlight" | "arrow" | "callout" | "zoom" | "redact";
  target: AnnotationTarget; // CSS selector, coordinates, or region
  label?: string;
  style?: Record<string, string>;
  enterFrame: number; // Frame when annotation appears
  exitFrame: number; // Frame when annotation disappears
  animation: "fade" | "slide" | "instant";
}

interface AnnotationTarget {
  selector?: string; // CSS selector (browser surfaces)
  region?: { x: number; y: number; w: number; h: number };
  text?: string; // Text content to find
}
```

**Rendering strategy:** Annotations are rendered into the same overlay PNG stream that the existing compositor uses for cursor and HUD overlays. Each frame's overlay includes:

1. Cursor (existing)
2. HUD keys (existing)
3. Active annotations (new)

This reuses the proven `sharp`-based compositing pipeline without changing the ffmpeg filter graph.

### 5.5. Scene Compositor (`webreel/lib/scene-compositor.ts`)

The scene compositor concatenates individual scene recordings into a final video:

```
Scene 1 video (raw)  Scene 2 video (raw)  Scene 3 video (raw)
     │                    │                    │
     ▼                    ▼                    ▼
┌─────────┐         ┌─────────┐         ┌─────────┐
│Composite │         │Composite │         │Composite │
│overlays  │         │overlays  │         │overlays  │
│(cursor + │         │(cursor + │         │(cursor + │
│ annot.)  │         │ annot.)  │         │ annot.)  │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     ▼                    ▼                    ▼
┌─────────┐         ┌─────────┐         ┌─────────┐
│ Scene 1  │ ──fade──│ Scene 2  │──slide──│ Scene 3  │
│ segment  │  300ms  │ segment  │  300ms  │ segment  │
└─────────┘         └─────────┘         └─────────┘
     │                    │                    │
     └────────────────────┼────────────────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │  FFmpeg concat      │
               │  + transition       │
               │  filter graph       │
               └──────────┬──────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │  Audio mixing       │
               │  narration +        │
               │  sfx + bgm         │
               └──────────┬──────────┘
                          │
                          ▼
               ┌─────────────────────┐
               │  Final output       │
               │  MP4 + SRT + PNG    │
               └─────────────────────┘
```

**FFmpeg concat with transitions:**

```
ffmpeg -i scene1.mp4 -i scene2.mp4 -i scene3.mp4
  -filter_complex "
    [0][1]xfade=transition=fade:duration=0.3:offset=T1[v01];
    [v01][2]xfade=transition=slideleft:duration=0.3:offset=T2[vout]
  "
  -map [vout] output.mp4
```

The `xfade` filter handles scene transitions natively in ffmpeg. Transition type and duration come from the scene config.

**Audio mixing** combines three tracks:

1. **Narration:** Concatenated TTS segments with silence padding at scene boundaries
2. **Sound effects:** Click/key sounds positioned by timestamp (existing system)
3. **Background music:** Optional ambient track with volume ducking during narration (sidechain compression via ffmpeg `sidechaincompress` filter or simple volume automation)

---

## 6. Sequence Flows

### 6.1. Full Render Flow (`webreel render script.md`)

```
User runs: webreel render demo.md
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  1. PARSE                                                    │
│     Read demo.md → parse front matter + markdown             │
│     Produce DemoScript IR                                    │
│     Validate: surfaces exist, refs resolvable, timing sane   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. PLAN                                                     │
│     IR → ExecutionPlan                                       │
│     Resolve prerequisites (Chrome, ffmpeg, apps)             │
│     Estimate duration per scene (narration word count)       │
│     Identify deferred TTS segments (dynamic refs)            │
│     Pre-flight checks (binaries available, URLs reachable)   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. GENERATE STATIC NARRATION                                │
│     For each narration segment without dynamic refs:         │
│       Call TTS provider (or hit cache)                        │
│       Measure audio duration                                  │
│       Store in NarrationTimeline                              │
│     Dynamic ref segments: placeholder with estimated duration │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. RENDER SCENES (sequential, per-scene)                    │
│                                                              │
│     For each scene:                                          │
│       a. Setup surface (launch Chrome / spawn PTY / etc.)    │
│       b. Create Recorder + Timeline                          │
│       c. Start frame capture loop                            │
│       d. Play narration segments (virtual — for timing sync) │
│       e. Execute actions between/during narration:           │
│          - If action produces captures → resolve pending     │
│            dynamic narration → call TTS → adjust timeline    │
│          - If annotation → add to overlay state              │
│       f. Stop recording                                      │
│       g. Composite overlays (cursor + HUD + annotations)     │
│       h. Store scene segment + audio + timeline              │
│       i. Teardown surface                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. ASSEMBLE                                                 │
│     Concatenate scene videos with transitions (ffmpeg xfade) │
│     Mix audio: narration + sound effects + background music  │
│     Embed chapter markers from acts                          │
│     Generate subtitle track (SRT/VTT)                        │
│     Encode to output format (MP4/WebM/GIF)                   │
│     Extract thumbnail                                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                    Final output files:
                    ├── demo.mp4
                    ├── demo.srt
                    └── demo.png (thumbnail)
```

### 6.2. Single Scene Execution (Detail)

```
Scene: "Live Detection"
Surface: terminal
Narration: "Let me show you it running."
Actions: run, wait_for_output, highlight, pause
Dynamic narration: "[latency_ms] milliseconds."

Timeline ──────────────────────────────────────────────────▶

  0ms                1.8s              4.2s         6.5s    8s
  │                  │                 │             │       │
  │  Narration #1    │  Action: run    │  Action:    │ Narr  │
  │  "Let me show    │  python scan.py │  highlight  │ #2    │
  │   you it         │  (real exec)    │  latency    │ deferred
  │   running."      │                 │  line       │ TTS   │
  │  ├─ TTS: 1.8s    │  ├─ wait for    │             │       │
  │  │               │  │  "entities   │  ├─ 500ms   │       │
  │  │               │  │   detected"  │  │  hold     │       │
  │  │               │  │              │  │           │       │
  ▼  ▼               ▼  ▼              ▼  ▼           ▼       ▼

Frames: ═══════════════════════════════════════════════════════
         Terminal shows     Terminal shows     Highlight      Terminal
         blank prompt       scan output        overlay on     holds,
                           appearing live      latency line   voice says
                                                             "[4.2]ms"
```

### 6.3. Dynamic Narration with Live Capture

This is the most complex flow — narration text contains a value that doesn't exist until a command runs.

```
Script says:
  - run: python scan.py --payload financial
    capture:
      latency_ms: regex("(\d+\.\d+)ms")
  "[latency_ms] milliseconds. Found every entity."

Execution:

  1. Parse narration → detect [latency_ms] → mark as deferred

  2. Estimate duration from word count (fallback: 2.5s)
     Reserve timeline space for narration audio

  3. Execute "run" action on terminal surface
     PTY spawns: python scan.py --payload financial
     Output capture monitors stdout for regex match

  4. wait_for_output: "entities detected"
     Output capture sees: "Found 33 entities in 4.2ms"
     Regex captures: latency_ms = "4.2"

  5. Resolve narration text:
     "4.2 milliseconds. Found every entity."

  6. Generate TTS for resolved text
     Measured duration: 2.1s

  7. Adjust timeline:
     If measured (2.1s) ≠ estimated (2.5s):
       Shrink/expand reserved space by 0.4s
       Shift all subsequent scene timing

  8. Continue frame capture with narration audio synced
```

**Why not generate all TTS upfront?** Dynamic references depend on live execution output. The value doesn't exist until a command runs. This is fundamental to the "real execution" principle — the video says the actual latency number, not a hardcoded one.

### 6.4. Section-Level Re-Render

When a user changes one scene and re-renders:

```
webreel render demo.md --scene "Live Detection"

  1. Parse full script → identify changed scene

  2. Load cached scene segments for unchanged scenes
     (stored in ~/.webreel/scenes/{script_hash}/{scene_name}/)

  3. Re-render only the changed scene:
     - Re-generate TTS (if narration changed)
     - Re-record (if actions changed)
     - Re-composite (if annotations changed)

  4. Re-assemble full video:
     - Concatenate cached + new scene segments
     - Re-mix audio (narration positions may have shifted)
     - Re-generate subtitles

  Time savings:
  - 4-minute video, 6 scenes, 1 changed
  - Full render: ~90 seconds
  - Section re-render: ~20 seconds (one scene + assembly)
```

**Cache structure:**

```
~/.webreel/cache/
├── tts/
│   └── {sha256(text+voice+speed)}.mp3     # TTS audio segments
├── scenes/
│   └── {script_content_hash}/
│       ├── scene-1-title-card/
│       │   ├── video.mp4                   # Composited scene video
│       │   ├── audio.wav                   # Scene narration audio
│       │   ├── timeline.json               # Scene timeline data
│       │   └── meta.json                   # Hash of scene config
│       ├── scene-2-live-detection/
│       │   └── ...
│       └── ...
└── binaries/
    ├── chrome/
    └── ffmpeg/
```

### 6.5. LLM Authoring Flow (`webreel author`)

```
User runs: webreel author --brief brief.md

  ┌───────────────────────────────────────────┐
  │  1. Load brief                             │
  │     Parse audience, product, messages,     │
  │     duration, tone, demo assets            │
  └─────────────────┬─────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────┐
  │  2. Generate first draft                   │
  │     LLM receives brief + Demo Markdown     │
  │     format spec + available demo assets    │
  │     Outputs: structured script (Markdown)  │
  │     Writes to: demo-draft.md               │
  └─────────────────┬─────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────┐
  │  3. Validate draft                         │
  │     Parse → check timing → check surfaces │
  │     Report: "Act 2 is 75s of narration    │
  │     but budgeted for 60s"                  │
  └─────────────────┬─────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────┐
  │  4. Interactive refinement loop            │
  │     Display script + validation results    │
  │     User types feedback in CLI             │
  │     LLM modifies script                    │
  │     Re-validate                            │
  │     Repeat until user approves             │
  └─────────────────┬─────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────┐
  │  5. Generate execution plan                │
  │     Prerequisites, timing breakdown,       │
  │     risk assessment                        │
  │     User reviews and approves              │
  └─────────────────┬─────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────┐
  │  6. Render                                 │
  │     Execute plan → produce video           │
  │     (Sequence flow 6.1)                    │
  └─────────────────┬─────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────┐
  │  7. Post-render review loop                │
  │     User watches video, types feedback     │
  │     LLM adjusts timing/narration/actions   │
  │     Re-renders affected scenes only        │
  │     Repeat until user approves             │
  └───────────────────────────────────────────┘
```

---

## 7. Data Models

### 7.1. Config File Formats

**Legacy JSON config** (`webreel.config.json`) — unchanged:

```
WebreelConfig
├── $schema?: string
├── outDir?: string
├── baseUrl?: string
├── viewport?: { width, height } | PresetName
├── theme?: { cursor, hud }
├── sfx?: { click, key }
├── include?: string[]
├── defaultDelay?: number
├── clickDwell?: number
└── videos: Record<string, VideoConfig>
    └── VideoConfig
        ├── url: string (required)
        ├── steps: Step[] (required)
        ├── viewport?, zoom?, fps?, quality?
        ├── waitFor?, output?, thumbnail?
        ├── theme?, sfx?, include?
        └── defaultDelay?, clickDwell?
```

**Demo Markdown** (`demo.md`) — new:

```
DemoScript
├── meta: ScriptMeta
│   ├── title: string
│   ├── duration?: string ("4m", "2m30s")
│   ├── audience?: string
│   ├── voice?: string
│   ├── viewport?: { width, height }
│   ├── theme?: "dark" | "light" | ThemeConfig
│   └── output?: string
├── acts: Act[]
│   ├── name: string
│   ├── durationHint?: number (seconds)
│   └── scenes: Scene[]
│       ├── name: string
│       ├── surface: SurfaceConfig
│       │   ├── type: SurfaceType
│       │   └── [type-specific fields]
│       ├── narration: NarrationBlock[]
│       │   ├── text: string
│       │   ├── dynamicRefs: string[]
│       │   └── speed?: number
│       ├── actions: ActionDirective[]
│       │   ├── type: string
│       │   ├── params: Record<string, unknown>
│       │   └── captures?: CaptureSpec[]
│       ├── transitions: { in?, out? }
│       └── directorNotes: string[]
```

### 7.2. Timeline Data (Extended)

The existing `TimelineData` is extended for multi-surface support:

```
TimelineData (existing)              DemoTimelineData (extended)
├── fps                              ├── fps
├── width                            ├── width
├── height                           ├── height
├── zoom                             ├── zoom
├── theme                            ├── theme
├── frames: FrameData[]              ├── frames: ExtendedFrameData[]
│   ├── cursor: { x, y, scale }     │   ├── cursor: { x, y, scale }
│   └── hud: { labels } | null      │   ├── hud: { labels } | null
│                                    │   └── annotations: Annotation[]
└── events: SoundEvent[]             ├── events: SoundEvent[]
                                     └── narration: NarrationMarker[]
                                         ├── startFrame: number
                                         ├── endFrame: number
                                         └── text: string
```

### 7.3. Output Artifacts

```
output/
├── demo.mp4                # Primary video (H.264 + AAC)
├── demo.srt                # Subtitles (from narration text + timestamps)
├── demo.vtt                # WebVTT subtitles (alternative format)
├── demo.png                # Thumbnail (from specified frame)
├── demo.chapters.txt       # Chapter markers (from acts)
└── demo.webm               # Alternative format (if requested)
```

---

## 8. Concurrency Model

### 8.1. Single-Threaded Orchestration

The Node.js main thread orchestrates all activity. No worker threads. Concurrency comes from:

- **Async I/O:** CDP calls, TTS API calls, file reads/writes
- **Child processes:** Chrome, ffmpeg, PTY (all run in separate OS processes)
- **Stream backpressure:** ffmpeg stdin pipe flow control

```
Main thread event loop:
┌──────────────────────────────────────────────┐
│                                              │
│  Scene orchestrator (async/await)            │
│    │                                         │
│    ├── TTS API call (async, awaited)         │
│    │                                         │
│    ├── Surface.execute() (async, awaited)    │
│    │     │                                   │
│    │     └── CDP evaluate (async I/O)        │
│    │                                         │
│    ├── Recorder.captureLoop() (background)   │
│    │     │                                   │
│    │     ├── CDP captureScreenshot (async)    │
│    │     └── ffmpeg stdin.write (buffered)    │
│    │                                         │
│    └── Timeline.waitForNextTick() (promise)  │
│                                              │
└──────────────────────────────────────────────┘
```

**Why no parallelism within a scene?** Actions are sequential by nature — you click, then type, then scroll. Frame capture runs as a background loop, but it's coordinated with actions via the timeline's `waitForNextTick()` promise.

### 8.2. Parallel Scene Rendering (Phase 4)

Independent scenes (no capture dependencies between them) can render in parallel:

```
Scene A (browser)  ──────▶  output_a.mp4
Scene B (terminal) ──────▶  output_b.mp4    (parallel, separate Chrome/PTY)
Scene C (browser)  ──────▶  output_c.mp4

                   Then:

Assembly: concat(A, B, C) + mix audio ──▶ final.mp4
```

**Constraint:** Scenes with dynamic reference dependencies must render in order. If Scene C's narration references a value captured in Scene B, Scene B must finish first.

---

## 9. Architectural Decisions

### ADR-001: Two-Phase Recording (Existing — Preserved)

**Context:** Overlays (cursor, HUD, annotations) must be pixel-perfect and frame-aligned.

**Decision:** Record raw video first, then composite overlays in a second pass using timeline data.

**Rationale:**

- Recording phase runs at full capture speed (no rendering overhead)
- Compositing is deterministic (replay timeline frame-by-frame)
- Overlays can be changed without re-recording (different cursor, different annotations)
- Timeline data is serializable — enables `webreel composite` command

**Trade-off:** Two ffmpeg encoding passes instead of one. Acceptable because the second pass is a simple overlay operation.

### ADR-002: Surface Abstraction Over Unified Screen Capture

**Context:** Multi-surface support could be implemented as either (a) individual surface drivers with their own capture methods, or (b) a single screen capture that records whatever is on the physical/virtual display.

**Decision:** Individual surface drivers with the `Surface` interface.

**Rationale:**

- Browser surfaces get pixel-perfect CDP screenshots (no display needed)
- Terminal surfaces get rendered text (no screen capture jitter)
- Only application/desktop surfaces need actual screen capture
- Headless browser + terminal scenes work in CI without a display server
- Each surface controls its own input method (CDP events vs. PTY writes vs. OS input)

**Trade-off:** Composite layouts (split-screen) require stitching frames from different surfaces. More complex than capturing a laid-out screen, but more reliable and portable.

### ADR-003: Demo Markdown as Script Format

**Context:** The script format could be JSON (like existing configs), YAML, a custom DSL, or Markdown.

**Decision:** Extended Markdown with YAML front matter and embedded action directives.

**Rationale:**

- Readable by humans without tooling (it's just Markdown)
- Editable in any text editor with syntax highlighting
- Diffable and reviewable in PRs (git-friendly)
- Front matter is standard (Jekyll, Hugo, MDX all use it)
- Narration is natural — quoted text or paragraphs
- Actions are bullets — familiar list syntax
- LLMs can read and write Markdown natively

**Trade-off:** Parsing is more complex than JSON/YAML (need to handle Markdown semantics). Mitigated by a well-defined subset and strict validation.

### ADR-004: TTS-First Timing (Narration Drives Timeline)

**Context:** Video timing could be driven by (a) fixed durations from the script, (b) action execution time, or (c) narration audio duration.

**Decision:** Narration audio duration is the primary timing driver. Actions are scheduled around narration.

**Rationale:**

- Narration is what the audience hears — pacing must match speech
- TTS duration is deterministic (same text → same audio → same duration)
- Actions can be padded or compressed to fit narration timing
- "Dead air" (visual with no narration) is explicitly authored via pauses

**How it works:**

1. Generate TTS audio for all static narration segments
2. Measure actual duration of each segment
3. Build scene timeline: narration segments → action slots between segments → total scene duration
4. During recording, hold frames (pause) if actions finish before narration

**Trade-off:** Dynamic narration (deferred TTS) introduces a re-timing step mid-scene. Accepted as necessary for "real execution" principle.

### ADR-005: Per-Scene Caching for Incremental Re-Render

**Context:** Re-rendering a full 4-minute video for a 10-second change is unacceptable for iteration speed.

**Decision:** Cache composited scene segments. On re-render, only re-record changed scenes, then re-assemble.

**Rationale:**

- Scene boundaries are natural cache boundaries
- Each scene's cache is keyed by a hash of its config (surface, actions, narration text)
- Assembly (concat + audio mix) is fast (~5 seconds for a 4-minute video)
- TTS audio is separately cached by text hash (reusable across script versions)

**Cache invalidation:** Hash of scene config (surface type + actions + narration text + annotations). Any change to any of these invalidates the scene cache. Global changes (voice, theme) invalidate all scenes.

### ADR-006: FFmpeg as Universal Media Backend

**Context:** Video encoding, audio mixing, format conversion, and transitions all need a media processing engine.

**Decision:** FFmpeg for all media operations. No alternative encoder.

**Rationale:**

- Already a dependency (existing webreel uses ffmpeg for encoding)
- Handles all required operations: H.264/VP9 encoding, audio mixing, xfade transitions, GIF palette generation, subtitle embedding, chapter markers
- Filter graph system handles complex operations declaratively
- Cross-platform static builds available
- Well-documented, battle-tested

**Trade-off:** Complex filter graphs are hard to debug. Mitigated by logging the full filter graph and supporting `--frames` mode for visual debugging.

### ADR-007: xterm-headless for Terminal Frame Rendering (revised)

**Context:** Terminal surfaces need to produce frame images from PTY output. Original decision was `node-canvas` with hand-rolled ANSI parsing. Research (see `docs/RESEARCH-open-source-landscape.md`) identified a better approach.

**Decision:** Use `@xterm/headless` for terminal state management and ANSI processing, with a canvas-based renderer for PNG frame generation.

**Pipeline:**

```
PTY stdout → @xterm/headless (state tracking) → serialize addon → canvas render → PNG frame
```

**Alternatives considered:**

- **node-canvas + hand-rolled ANSI parser (original plan):** Works for simple output, but reimplements ANSI parsing that xterm.js already handles. Breaks on curses apps, 256-color, true color, unicode combining characters, and terminal resize events.
- **xterm.js in headless Chrome:** Adds Chrome dependency for terminal-only scenes. Slower.
- **Sharp SVG:** Sharp can render SVG, but generating SVG for styled terminal text is complex.

**Rationale:**

- `@xterm/headless` runs in Node.js (no browser needed) — handles all ANSI escape sequences, cursor positioning, scrollback, alternate screen buffer
- Serialize addon extracts full terminal state at any point for frame rendering
- Handles edge cases automatically: curses apps (vim, htop), unicode, 256-color, true color, mouse tracking
- ~200KB package — lightweight, MIT-licensed, powers VS Code's terminal
- Canvas rendering from xterm buffer state is a thin layer, not a full parser

**Trade-off:** Introduces a dependency on the xterm.js project. Mitigated by the fact that xterm.js is one of the most actively maintained terminal emulators (Microsoft-backed, used in VS Code).

### ADR-008: LLM Integration via Provider Abstraction

**Context:** The director package needs LLM access for script authoring.

**Decision:** Abstract LLM provider behind an interface. Support Claude (default), OpenAI, and local models.

```typescript
interface LLMProvider {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  stream(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
}
```

**Rationale:**

- Users may prefer different LLM providers
- Local models enable offline authoring
- Provider abstraction keeps director logic testable (mock LLM in tests)

### ADR-009: Subtitle Generation from Narration Text

**Context:** Subtitles could be generated by (a) speech-to-text from audio, or (b) directly from narration text with timestamps.

**Decision:** Generate subtitles directly from narration text using timestamps from the narration timeline.

**Rationale:**

- We already have the exact text (it's in the script)
- We already have the timestamps (from TTS audio segment placement)
- No additional API call or processing needed
- 100% accurate (no speech recognition errors)
- Dynamic references are resolved before subtitle generation

### ADR-010: asciicast v2 as Terminal Recording Format

**Context:** Terminal surfaces capture PTY output during execution. We need an intermediate format to store this output for replay, debugging, and incremental re-rendering. Research (see `docs/RESEARCH-open-source-landscape.md`) evaluated the terminal recording ecosystem.

**Decision:** Use **asciicast v2** (NDJSON) as the intermediate format for terminal recordings.

**Format overview:**

```
{"version": 2, "width": 120, "height": 40, "timestamp": 1709500800}   ← header
[0.5, "o", "$ npm test\r\n"]                                          ← output event
[1.2, "o", "\u001b[32m✓ 42 tests passed\u001b[0m\r\n"]               ← colored output
[3.0, "m", "test_complete"]                                            ← marker event
[3.1, "r", "120x50"]                                                   ← resize event
```

**Alternatives considered:**

- **Raw PTY buffer:** No timing information, hard to replay at correct speed.
- **Custom JSON format:** Works but reinvents the wheel; no ecosystem tooling.
- **VHS tape format:** Input-oriented (keystrokes), not output-oriented (what appeared on screen). Different purpose.

**Rationale:**

- Well-specified, widely adopted format (asciinema ecosystem)
- NDJSON — trivially readable/writable, streamable, line-diffable
- Stores timing information per-event (essential for replay and frame generation)
- Marker events (`"m"`) enable breakpoints and chapter boundaries
- Enables replay mode: import pre-recorded `.cast` files for demos without live execution
- Tooling ecosystem for debugging: `agg` (GIF), `svg-term-cli` (SVG), `asciinema-player` (web)
- No dependency on asciinema CLI — we write `.cast` files from our PTY driver

**Trade-off:** asciicast v2 is GPL-3.0 (the asciinema CLI), but the format specification itself is openly documented. We implement our own reader/writer, not the CLI.

### ADR-011: Kokoro as Default TTS Provider

**Context:** The narration engine needs a default TTS provider that works out of the box without API keys. Research evaluated Kokoro, Piper, Coqui TTS, Kyutai, and cloud providers.

**Decision:** Use **Kokoro** (`kokoro-js` npm package) as the default TTS provider. Piper for multilingual. Cloud providers (OpenAI TTS, ElevenLabs) for premium quality. HTTP provider for local TTS servers (e.g., LFM2.5-Audio).

**Alternatives considered:**

- **OpenAI TTS:** Better quality but requires API key, network access, and per-request cost. Implemented as cloud provider option (`openai-tts`).
- **Piper:** Excellent multilingual support, ships as a native binary. Implemented as local subprocess provider (`piper`).
- **ElevenLabs:** High-quality cloud TTS. Implemented as cloud provider option (`elevenlabs`).
- **HTTP TTS:** Generic HTTP provider for local TTS servers (e.g., LFM2.5-Audio). Implemented for flexibility (`http-tts`).
- **Coqui XTTS-v2:** Evaluated but not implemented. Python-based, requires GPU for reasonable speed. Replaced by Piper (local) and HTTP provider (for local servers).
- **Kyutai Pocket TTS:** Newly released (Jan 2026), 100M params, promising but unproven ecosystem. Not implemented.

**Rationale:**

- 82M parameters — runs on CPU in real-time, no GPU needed
- npm-native: `npm install kokoro-js`, zero system dependencies
- Apache-2.0 license
- Quality rivals models 10-100x its size
- Three lines to generate speech:
  ```typescript
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX");
  const audio = await tts.generate(text, { voice: "af_heart" });
  ```
- Offline-first: resolves PRD open question #4 (default is local, cloud is upgrade)

**Trade-off:** English-focused, limited voice variety. Addressed by Piper (30+ languages), OpenAI TTS, ElevenLabs, and HTTP provider for custom local servers.

### ADR-012: nut.js for Desktop Automation

**Context:** Application and desktop surfaces need OS-level mouse/keyboard control. Research evaluated nut.js, RobotJS, and native platform APIs.

**Decision:** Use **nut.js** (`@nut-tree-fork/nut-js`) for application and desktop surface drivers in Phase 2.

**Alternatives considered:**

- **RobotJS:** Maintenance mode, stale dependencies, less capable API.
- **AppleScript/xdotool directly:** Platform-specific, requires separate implementations per OS.
- **Playwright for native apps:** Playwright only drives browsers, not native applications.

**Rationale:**

- Cross-platform (macOS, Windows, Linux) from a single API
- Promise-based, fits our async pipeline
- Image-based element finding for robust targeting
- Active maintenance, N-API native addons
- Apache-2.0 license

**Trade-off:** Requires visible screen (no headless mode for native apps). Image matching can be fragile across display scales. CI requires Xvfb or similar virtual display.

---

## 10. Error Handling Strategy

### 10.1. Error Categories

```
┌─────────────────────────────────────────────────────────────┐
│  Category        │  Example                │  Recovery       │
├──────────────────┼─────────────────────────┼────────────────┤
│  Config error    │  Invalid surface type   │  Fail fast     │
│                  │  Missing required field  │  with location │
│                  │  Unresolved reference    │  and suggestion│
├──────────────────┼─────────────────────────┼────────────────┤
│  Binary missing  │  Chrome not found       │  Auto-download │
│                  │  FFmpeg not available    │  + retry       │
├──────────────────┼─────────────────────────┼────────────────┤
│  Capture failure │  CDP screenshot fails   │  Retry (10x)   │
│                  │  Screen capture blank    │  then abort    │
├──────────────────┼─────────────────────────┼────────────────┤
│  Action failure  │  Selector not found     │  Timeout +     │
│                  │  Command exits non-zero  │  error with    │
│                  │  Window not visible      │  step context  │
├──────────────────┼─────────────────────────┼────────────────┤
│  TTS failure     │  API rate limit         │  Retry with    │
│                  │  Network timeout         │  backoff, then │
│                  │  Invalid voice name      │  local fallback│
├──────────────────┼─────────────────────────┼────────────────┤
│  FFmpeg failure  │  Encoding error         │  Log stderr,   │
│                  │  Invalid filter graph    │  abort scene   │
│                  │  Process crash           │  with context  │
├──────────────────┼─────────────────────────┼────────────────┤
│  Dynamic capture │  Regex never matches    │  Timeout →     │
│  failure         │  Value out of range     │  use fallback  │
│                  │                          │  text or abort │
└──────────────────┴─────────────────────────┴────────────────┘
```

### 10.2. Error Propagation Pattern

```typescript
// Actions include step context in errors
try {
  await surface.execute(action, context);
} catch (err) {
  throw new SceneError(
    `Scene "${scene.name}", action ${i} (${action.type}): ${err.message}`,
    { scene: scene.name, actionIndex: i, actionType: action.type, cause: err }
  );
}

// Scene errors include act context
try {
  await renderScene(scene, ...);
} catch (err) {
  if (err instanceof SceneError) {
    throw new RenderError(
      `Act "${act.name}" → ${err.message}`,
      { act: act.name, ...err.context, cause: err }
    );
  }
  throw err;
}
```

Every error carries full context: which act, which scene, which action, and the original cause. This makes debugging straightforward — the user sees exactly where the failure occurred in their script.

### 10.3. Graceful Cleanup

```
On error during rendering:
  1. Stop frame capture loop (if running)
  2. Close ffmpeg stdin → wait for exit (10s timeout → SIGKILL)
  3. Kill Chrome process (SIGTERM → 500ms → force kill)
  4. Kill PTY process (if terminal surface)
  5. Save partial scene segments (for debugging)
  6. Report error with full context
  7. Clean up temp files (unless --keep-temp flag)
```

---

## 11. Performance Budget

### 11.1. Rendering Speed Targets

| Operation                                | Target                 | Bottleneck              |
| ---------------------------------------- | ---------------------- | ----------------------- |
| Script parsing                           | < 50ms                 | String processing       |
| TTS generation (cached)                  | < 10ms per segment     | Disk I/O                |
| TTS generation (API)                     | 500-2000ms per segment | Network + API           |
| Frame capture (CDP)                      | 8-12ms per frame       | Chrome rendering        |
| Frame capture (terminal)                 | 2-5ms per frame        | xterm-headless + canvas |
| Overlay compositing                      | 3-8ms per frame        | Sharp image operations  |
| Scene assembly (ffmpeg)                  | 2-5s for 4-min video   | FFmpeg concat           |
| Audio mixing                             | 1-3s for 4-min video   | FFmpeg filter graph     |
| **Total render (4-min video, 6 scenes)** | **60-120s**            | Scene recording         |
| **Section re-render (1 scene)**          | **15-30s**             | Scene + assembly        |

### 11.2. Memory Budget

| Component               | Typical Usage  | Peak       |
| ----------------------- | -------------- | ---------- |
| Node.js base            | 50 MB          | 80 MB      |
| Chrome (headless)       | 150-300 MB     | 500 MB     |
| FFmpeg (encoding)       | 50-100 MB      | 200 MB     |
| Timeline data (per min) | 10 MB          | 10 MB      |
| TTS audio cache         | 5-20 MB        | 50 MB      |
| Frame compositing       | 20-50 MB       | 100 MB     |
| **Total**               | **300-550 MB** | **900 MB** |

### 11.3. Disk Budget

| Artifact                        | Size (per minute of video) |
| ------------------------------- | -------------------------- |
| Raw scene video (H.264, CRF 18) | 200-500 MB                 |
| Composited scene video          | 200-500 MB                 |
| Final output (MP4)              | 200-500 MB                 |
| TTS audio cache                 | 2-5 MB                     |
| Timeline data                   | 2-3 MB                     |
| Debug frames (--frames)         | 600 MB                     |
| **Total working space**         | **~1.5 GB per minute**     |

Temp files are cleaned up after assembly. Final disk usage is just the output video + cache.

---

## 12. Security & Isolation

### 12.1. Process Isolation

```
┌────────────────────────────────────────────────┐
│  Node.js (main)                                 │
│  - Orchestration only                           │
│  - No direct network access (except TTS API)    │
│  - Reads script, writes output                  │
├────────────────────────────────────────────────┤
│  Chrome (child process)                         │
│  - Sandboxed (--no-sandbox disabled for Docker) │
│  - Temp user data dir (deleted on exit)         │
│  - No persistent state between sessions         │
├────────────────────────────────────────────────┤
│  FFmpeg (child process)                         │
│  - Reads from stdin pipe (no file system access)│
│  - Writes to temp dir (restricted path)         │
├────────────────────────────────────────────────┤
│  PTY (child process)                            │
│  - Runs in specified working directory          │
│  - Inherits user's shell environment            │
│  - ⚠ Executes real commands (by design)         │
└────────────────────────────────────────────────┘
```

### 12.2. Script Safety

Demo Markdown scripts execute real commands on the user's machine. This is intentional (real execution principle), but requires awareness:

- **No remote script execution.** Scripts must be local files.
- **Command preview.** `webreel plan --validate` shows all commands that will be executed before rendering.
- **No credential injection.** Scripts should not contain secrets. Use environment variables.
- **Temp directory isolation.** Webreel's working files are in `~/.webreel/`, not in the project directory.

---

## 13. Testing Strategy

### 13.1. Test Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Unit Tests (vitest)                                         │
│  - Parser: Markdown → IR conversion                          │
│  - Cursor motion: easing functions, path computation         │
│  - Timeline: frame tracking, state serialization             │
│  - Audio: filter graph generation                            │
│  - Config: validation, env var substitution                  │
│  Coverage target: 85%                                        │
├─────────────────────────────────────────────────────────────┤
│  Integration Tests (vitest)                                  │
│  - Surface drivers: mock CDP / mock PTY / mock screen        │
│  - Narrator: mock TTS provider, verify timing                │
│  - Compositor: verify ffmpeg filter graph output             │
│  - Runner: mock surfaces, verify orchestration order         │
│  Coverage target: 70%                                        │
├─────────────────────────────────────────────────────────────┤
│  E2E Tests (vitest + real Chrome + real ffmpeg)              │
│  - Record a simple browser demo → verify MP4 output          │
│  - Record a terminal demo → verify PTY output capture        │
│  - Render from Demo Markdown → verify narrated video         │
│  - Re-render single scene → verify cache hit + assembly      │
│  Run: slower, CI only, require Chrome + ffmpeg binaries      │
└─────────────────────────────────────────────────────────────┘
```

### 13.2. Mock Strategy

```typescript
// Mock Surface for testing orchestration
class MockSurface implements Surface {
  readonly type = "browser";
  setupCalls: SurfaceConfig[] = [];
  executeCalls: SurfaceAction[] = [];
  frameCount = 0;

  async setup(config: SurfaceConfig): Promise<void> {
    this.setupCalls.push(config);
  }

  async execute(action: SurfaceAction): Promise<ActionResult> {
    this.executeCalls.push(action);
    return { durationMs: 100 };
  }

  async captureFrame(): Promise<Buffer> {
    this.frameCount++;
    return Buffer.alloc(100); // Blank frame
  }

  async teardown(): Promise<void> {}
}

// Mock TTS for testing narration timing
class MockTTSProvider implements TTSProvider {
  async generate(text: string): Promise<TTSResult> {
    const estimatedMs = text.split(" ").length * 200; // 200ms per word
    return {
      audio: Buffer.alloc(estimatedMs * 44), // ~44 bytes per ms at 44.1kHz
      durationMs: estimatedMs,
    };
  }
}
```

---

## 14. Migration Path

### 14.1. Backward Compatibility

The existing `webreel record` command and JSON config format are **unchanged**. All existing configs continue to work. The new `webreel render` command is additive — it's a separate code path that shares core infrastructure.

```
webreel record  →  JSON config  →  @webreel/core  →  MP4
webreel render  →  Demo Markdown →  @webreel/surfaces + narrator + core  →  MP4
```

### 14.2. Core Package Changes

`@webreel/core` changes are additive:

| Change                                            | Type      | Breaking?                      |
| ------------------------------------------------- | --------- | ------------------------------ |
| Export `Surface` interface from types.ts          | Addition  | No                             |
| Export `Annotation` types from types.ts           | Addition  | No                             |
| Add `narration` field to `TimelineData`           | Extension | No (optional field)            |
| Add `annotations` field to `FrameData`            | Extension | No (optional field)            |
| Extract browser-specific logic to surface adapter | Refactor  | No (re-export from same paths) |

### 14.3. Phase-by-Phase Migration

**Phase 1:** New packages (`surfaces`, `narrator`, `director`, `annotations`) added to workspace. Core unchanged. CLI gets `render` command alongside existing `record`.

**Phase 2:** Core's overlay system extended for annotations. Timeline data extended. Existing compositing pipeline handles new overlay types transparently.

**Phase 3:** Director package added. LLM integration is optional — `render` works without it. `author` command is new.

**Phase 4:** Performance optimizations (parallel rendering, caching) are internal. No API changes.

---

## Appendix: Glossary

| Term                  | Definition                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Surface**           | An input/output target (browser, terminal, application, desktop) that can execute actions and produce frames       |
| **Scene**             | A single recording segment on one surface with narration and actions                                               |
| **Act**               | A group of scenes forming a narrative chapter                                                                      |
| **Demo Markdown**     | The script format — Markdown with embedded surface configs, narration, and actions                                 |
| **IR**                | Intermediate Representation — the parsed, validated, typed scene graph                                             |
| **Timeline**          | Frame-by-frame record of cursor positions, HUD state, annotations, and events                                      |
| **Dynamic reference** | A `[read_output:name]` placeholder in narration that resolves to a live-captured value                             |
| **Compositor**        | The module that overlays cursor/HUD/annotations onto raw video frames                                              |
| **Scene segment**     | A composited video clip for one scene, ready for concatenation                                                     |
| **TTS**               | Text-to-Speech — converts narration text to audio                                                                  |
| **CDP**               | Chrome DevTools Protocol — the API for controlling headless Chrome                                                 |
| **PTY**               | Pseudo-Terminal — the interface for driving a terminal process                                                     |
| **CRF**               | Constant Rate Factor — ffmpeg quality parameter (lower = better, 23 = default for render, 18 = default for record) |
| **asciicast**         | NDJSON format for terminal recordings (asciinema ecosystem). Used as intermediate format (ADR-010)                 |
| **Kokoro**            | 82M-parameter TTS model, npm-native, default narration provider (ADR-011)                                          |
| **Piper**             | Local ONNX TTS engine. 100+ voices, runs via subprocess                                                            |
| **ElevenLabs**        | Cloud TTS API provider. High-quality voice synthesis                                                               |
| **HTTP TTS**          | Generic HTTP TTS provider. Connects to any local TTS server (e.g., LFM2.5-Audio)                                   |
| **OpenAI TTS**        | Cloud TTS provider via OpenAI API. 6 voices (alloy, echo, fable, onyx, nova, shimmer)                              |
| **xterm-headless**    | Node.js terminal emulator (headless xterm.js). Used for terminal state management (ADR-007 revised)                |
| **nut.js**            | Node.js desktop automation library for mouse/keyboard/screen control (ADR-012)                                     |

---

## Appendix: Research References

Open source landscape research informing ADR-007 (revised), ADR-010, ADR-011, and ADR-012 is documented in [`docs/RESEARCH-open-source-landscape.md`](./RESEARCH-open-source-landscape.md). Covers: video composition frameworks, terminal recording tools, TTS engines, desktop automation, and competitive landscape analysis.
