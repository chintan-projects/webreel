# Implementation Plan: Webreel Demo Automation Platform

**Version:** 1.1
**Date:** 2026-03-03
**Companion:** [PRD](./PRD.md) | [Architecture](./ARCHITECTURE.md) | [Research](./RESEARCH-open-source-landscape.md)

This document breaks the PRD's 4-phase roadmap into concrete workstreams with task-level detail, dependencies, and acceptance criteria. Each workstream is independently testable and shippable.

**This is a platform, not a single demo.** Webreel is a general-purpose demo automation engine. Specific demos (product walkthroughs, CLI tutorials, API integrations, on-device model showcases) are validation examples — they prove the platform works, but they don't define it. Every workstream builds reusable platform capability.

---

## Engineering Principles (apply to every workstream)

These are enforced across all implementation work. See `CLAUDE.local.md` for the full specification.

| Principle                  | Implementation Implication                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code Reusability**       | Shared interfaces (`Surface`, `TTSProvider`, `LLMProvider`). No duplicated logic across implementations.                                                |
| **Modularity**             | Separate packages with typed APIs. Max 300 lines/file. Composition over inheritance.                                                                    |
| **Extensibility**          | Registry pattern for surfaces, providers, formats. Adding a new one = implement interface + register. Zero changes to core.                             |
| **Robustness**             | Catch → log → recover. Per-scene caching with atomic writes. Every `setup()` has a `teardown()`. No silent failures.                                    |
| **Observability**          | Structured JSON logging. Per-scene timing reports. `--verbose` for frame-level detail.                                                                  |
| **Consistency**            | Unified lifecycle across surfaces. Same config shape everywhere. Typed error hierarchy.                                                                 |
| **Config Externalization** | No hardcoded model paths. Multiple LFM models supported via config. YAML + env var interpolation. Layered merge: defaults → user config → front matter. |

---

## Phase 1: Foundation (Weeks 1-4)

**Goal:** Build a general-purpose Demo Markdown rendering engine — parse any script, execute against terminal and browser surfaces, generate narrated audio, composite to MP4. The engine must be surface-agnostic and extensible from day one.

**Gate criteria:**

- [ ] Any single-surface Demo Markdown script (terminal or browser) renders to MP4
- [ ] Terminal commands execute in a real PTY and produce captured output
- [ ] Narration audio generated locally (Kokoro) and synced to the visual timeline
- [ ] Dynamic narration references (`[read_output:name]`) resolve to live captured values
- [ ] Output MP4 is watchable without manual editing
- [ ] Adding a new surface type requires zero changes to the orchestrator
- [ ] Example library includes 3+ scripts covering different demo patterns

---

### WS-1.1: Monorepo Scaffolding (Week 1, Days 1-2)

**What:** Create the new package structure. No logic yet — just compilable shells with types exported.

**Tasks:**

| #   | Task                                                                                              | Output                                                                                       | Depends On |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| 1   | Create `packages/@webreel/surfaces/` package with `package.json`, `tsconfig.json`, `src/types.ts` | Compiles, exports `Surface`, `SurfaceType`, `SurfaceConfig`, `ActionResult` interfaces       | —          |
| 2   | Create `packages/@webreel/narrator/` package with `package.json`, `tsconfig.json`, `src/types.ts` | Compiles, exports `TTSProvider`, `NarrationTimeline`, `NarrationSegment` interfaces          | —          |
| 3   | Create `packages/@webreel/director/` package with `package.json`, `tsconfig.json`, `src/types.ts` | Compiles, exports `DemoScript`, `Act`, `Scene`, `NarrationBlock`, `ActionDirective` IR types | —          |
| 4   | Create `packages/@webreel/annotations/` package with shell `package.json`, `tsconfig.json`        | Compiles (empty — Phase 2 content)                                                           | —          |
| 5   | Wire all packages into pnpm workspace (`pnpm-workspace.yaml`) and turbo config                    | `pnpm build` and `pnpm type-check` pass with new packages                                    | 1-4        |
| 6   | Add dependency edges: surfaces → core, narrator → core, director → (none yet), CLI → all          | Package dependency graph matches Architecture §3.1                                           | 5          |

**Key decisions:**

- Every package exports types from `src/types.ts` and implementations from `src/index.ts`. This separation is enforced from day one.
- Surface and provider registries are set up in this workstream — not deferred. The registry pattern (map of string → factory function) ensures the orchestrator never imports concrete implementations directly.
- Config types (`WebReelConfig`, `SurfaceConfig`, `NarratorConfig`) are defined here with layered merge semantics: package defaults → user config → front matter overrides.

**Acceptance:** `pnpm type-check` passes. `pnpm build` produces `.js` + `.d.ts` for all packages. All IR types from Architecture §4 are exported. Surface registry accepts any `Surface` implementation without orchestrator changes.

---

### WS-1.2: Demo Markdown Parser (Week 1, Days 2-5)

**What:** Parse Demo Markdown scripts into the typed Scene Graph IR (Architecture §5.1).

**Tasks:**

| #   | Task                                                                                                                                                                                | Output                                                                       | Depends On |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- |
| 1   | Implement YAML front matter extraction (split on `---` fences, parse with `yaml` package)                                                                                           | `ScriptMeta` object with title, duration, voice, viewport, theme             | WS-1.1     |
| 2   | Implement heading tree construction: split Markdown by H1 (acts) and H2 (scenes), parse optional `(30s)` duration hints from heading text                                           | `Act[]` with `Scene[]` stubs                                                 | 1          |
| 3   | Implement scene block parsing: extract blockquote surface config (key-value pairs), quoted text as narration blocks, bullet lists as action directives, `> note:` as director notes | Full `Scene` objects with all fields populated                               | 2          |
| 4   | Implement dynamic reference extraction: find `[read_output:name]` patterns in narration text, `#selector` and `.class` patterns in action params                                    | `NarrationBlock.dynamicRefs` populated, `ActionDirective.captures` populated | 3          |
| 5   | Implement validation pass: every scene has surface, every act has ≥1 scene, no unresolved forward references, surface type is valid enum value                                      | Throws typed `ParseError` with line number and suggestion                    | 4          |
| 6   | Write unit tests (vitest): 15+ test cases covering front matter edge cases, multi-act scripts, narration with dynamic refs, malformed inputs                                        | 90%+ line coverage on parser module                                          | 1-5        |

**Key decisions:**

- Use a simple line-by-line parser, not a full Markdown AST library. Demo Markdown is a subset — we don't need full CommonMark compliance.
- Parser lives in `@webreel/director/src/parser.ts` (as specified in Architecture).

**Acceptance:** Parse 3+ structurally different Demo Markdown scripts (terminal-only, browser-only, multi-act with dynamic refs). Each produces a valid `DemoScript` IR. All unit tests pass. Malformed inputs produce actionable `ParseError` with line numbers.

---

### WS-1.3: Terminal Surface (Week 2, Days 1-4)

**What:** PTY process management, xterm-headless state tracking, asciicast recording, canvas frame rendering.

**Dependencies:** `node-pty`, `@xterm/headless`, `@xterm/addon-serialize`

**Tasks:**

| #   | Task                                                                                                                                                                            | Output                                                      | Depends On |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------- |
| 1   | Install dependencies: `node-pty`, `@xterm/headless`, `@xterm/addon-serialize`                                                                                                   | `pnpm build` passes with native addon                       | WS-1.1     |
| 2   | Implement `TerminalSurface.setup()`: spawn PTY process with configured shell, working directory, and env vars. Create xterm-headless instance. Attach PTY stdout → xterm write. | PTY spawns, xterm processes output                          | 1          |
| 3   | Implement `TerminalSurface.execute()` for `run` action: write command to PTY stdin, wait for shell prompt return or timeout                                                     | Command executes in PTY, stdout flows through xterm         | 2          |
| 4   | Implement `TerminalSurface.execute()` for `type_command` action: write characters one-by-one with configurable delay (typing effect)                                            | Visible character-by-character typing in terminal state     | 3          |
| 5   | Implement `TerminalSurface.execute()` for `wait_for_output`: poll output buffer against regex pattern, resolve when matched or timeout                                          | Returns `ActionResult` with captured values                 | 3          |
| 6   | Implement `TerminalSurface.execute()` for `send_key`, `clear`, `highlight_output` actions                                                                                       | Full terminal action vocabulary from PRD §4.7               | 3          |
| 7   | Implement output capture buffer: accumulate all PTY stdout, run regex captures against buffer, populate `ActionResult.captures`                                                 | Dynamic reference values captured from live terminal output | 3          |
| 8   | Implement `TerminalSurface.captureFrame()`: use serialize addon to extract xterm buffer state, render cells to PNG via `sharp` (background rect + styled text grid)             | PNG buffer of terminal frame at configured viewport size    | 2          |
| 9   | Implement asciicast v2 writer: log each PTY data event as `[timestamp, "o", data]` NDJSON line, write header with terminal dimensions                                           | `.cast` file alongside render output                        | 2          |
| 10  | Implement `TerminalSurface.teardown()`: kill PTY process, close xterm, flush asciicast writer                                                                                   | Clean resource cleanup, no orphaned processes               | 2          |
| 11  | Write integration tests: spawn real PTY, run `echo hello`, capture output, verify frame has content, verify `.cast` file is valid                                               | Tests pass on macOS and Linux                               | 2-10       |

**Key decisions:**

- Frame renderer uses `sharp` to compose terminal frames (not a full canvas library). Create a background rectangle, overlay styled text lines extracted from xterm buffer state. This keeps the dependency footprint small.
- asciicast writer is append-only — flush to disk after each event for crash safety.
- Shell prompt detection: configurable prompt regex, with fallback to timeout.

**Acceptance:** Run any ANSI-producing command (e.g., `ls --color`, `pytest -v`, `docker ps`) through the terminal surface. Frame captures render ANSI colors and cursor positioning correctly. Output capture extracts named values via regex. `.cast` file is playable in asciinema player.

---

### WS-1.4: Narration Engine + Kokoro TTS (Week 2, Days 3-5 + Week 3, Day 1)

**What:** TTS provider abstraction, Kokoro integration, audio caching, timeline assembly.

**Dependencies:** `kokoro-js`

**Tasks:**

| #   | Task                                                                                                                                                                    | Output                                                          | Depends On |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------- |
| 1   | Install `kokoro-js`. Verify ONNX model downloads on first run. Test basic generation.                                                                                   | `KokoroTTS.from_pretrained()` works, produces audio buffer      | WS-1.1     |
| 2   | Define `TTSProvider` interface in `@webreel/narrator/src/types.ts`: `generate(text, options) → { audio: Buffer, durationMs: number }`                                   | Interface exported                                              | WS-1.1     |
| 3   | Implement `KokoroProvider` in `@webreel/narrator/src/providers/kokoro.ts`: wraps `kokoro-js`, handles model loading (lazy), voice selection, speed control              | Generates WAV audio from text input                             | 1, 2       |
| 4   | Implement TTS cache: `sha256(text + voice + speed)` → cached audio file in `~/.webreel/cache/tts/`. Check cache before calling provider.                                | Repeated generation of same text returns cached audio in <10ms  | 3          |
| 5   | Implement text preprocessor in `@webreel/narrator/src/tts.ts`: split text at sentence boundaries, handle `[pause Ns]` directives, strip dynamic refs (mark as deferred) | `NarrationSegment[]` with text chunks ready for TTS             | 2          |
| 6   | Implement timeline assembler: take `NarrationSegment[]`, calculate `startOffsetMs` for each segment with configurable inter-sentence gap, produce `NarrationTimeline`   | `NarrationTimeline` with total duration and per-segment offsets | 5          |
| 7   | Implement deferred TTS hook: accept resolved dynamic ref values, generate TTS for deferred segments, recalculate timeline offsets downstream                            | Timeline updates correctly when deferred segments are resolved  | 6          |
| 8   | Write unit tests: mock TTS provider, verify caching behavior, verify timeline math, verify deferred resolution                                                          | 85%+ coverage on narrator module                                | 2-7        |

**Key decisions:**

- Model download happens on first `webreel render`, not on `npm install`. Show progress bar during download (~200MB).
- Default voice: `af_heart` (Kokoro's most natural English voice). Configurable via front matter `voice:` field.
- Audio format: WAV internally (lossless for mixing), MP3/AAC at final encode.

**Acceptance:** Generate narration for any multi-section Demo Markdown script (3+ narration blocks). Audio duration is proportional to word count (±10%). Cache hit on second run is <10ms per segment. Deferred TTS for `[read_output:name]` placeholders works after value injection.

---

### WS-1.5: Title Card Surface (Week 3, Days 1-2)

**What:** Generate static text frames for title cards and interstitials.

**Tasks:**

| #   | Task                                                                                                                                                           | Output                                                 | Depends On |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- |
| 1   | Implement `TitleCardSurface.setup()`: read config (background color, text color, subtitle, font size)                                                          | Config parsed and stored                               | WS-1.1     |
| 2   | Implement `TitleCardSurface.captureFrame()`: use `sharp` to create a solid background rectangle with centered text overlay. Support title + optional subtitle. | PNG frame at configured viewport size with styled text | 1          |
| 3   | Implement fade-in/fade-out by generating intermediate frames with varying opacity                                                                              | Smooth 500ms fade transition                           | 2          |
| 4   | Write unit tests: verify frame dimensions, text content in output, background color                                                                            | Tests pass                                             | 1-3        |

**Key decisions:**

- Use `sharp` for text rendering (SVG text → PNG). No additional font library.
- Title card surface has no `execute()` — it only produces static frames.
- Narration audio plays over title card frames (the frame holds while audio plays).

**Acceptance:** Title card with configurable title + subtitle renders as a clean frame. Text is centered, readable, colors match config. Works for any content — product names, section headers, closing cards.

---

### WS-1.6: Scene Orchestrator + Render Command (Week 3, Days 2-5)

**What:** The central render loop — wire parser, surfaces, narrator, and compositor together.

**Tasks:**

| #   | Task                                                                                                                                                                                               | Output                                                                                | Depends On                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Implement scene orchestrator (`webreel/src/lib/scene-orchestrator.ts`): for each scene in IR, setup surface → generate narration → execute actions with timing sync → capture frames → teardown    | Per-scene video segment files (.mp4) + audio files (.wav) + timeline data             | WS-1.2, WS-1.3, WS-1.4, WS-1.5 |
| 2   | Implement narration timing synchronization: before each action, check if narration segment is playing. If `waitForNarration: true`, hold frame capture until segment finishes. Track elapsed time. | Actions execute between narration gaps; frame capture continues during narration hold | 1                              |
| 3   | Implement dynamic narration flow: when action produces captures → resolve pending dynamic refs → call deferred TTS → update timeline offsets for remaining segments                                | `[read_output:latency_ms]` in narration becomes "4.2 milliseconds" in audio           | 1                              |
| 4   | Implement scene transition rendering: generate crossfade/cut frames between scene segments using ffmpeg `xfade` filter                                                                             | Smooth transitions between scenes in output video                                     | 1                              |
| 5   | Implement final assembly: concatenate scene videos with transitions, mix narration audio + sound effects, encode to MP4                                                                            | Single output `.mp4` file                                                             | 4                              |
| 6   | Implement `webreel render` CLI command: parse args (script path, --scene, --act, --preview, --dry-run, --voice, --output, --format, --verbose), validate script, call orchestrator                 | CLI executable: `pnpm webreel render demo.md`                                         | 1-5                            |
| 7   | Implement `--dry-run` mode: parse script, generate plan, print timing breakdown per scene, exit without rendering                                                                                  | Useful for validating scripts before committing to render                             | 6                              |
| 8   | Implement `--scene` flag: render only a named scene (for iteration). Skip other scenes, still produce a valid MP4 for the selected scene.                                                          | Fast single-scene iteration                                                           | 6                              |
| 9   | Write integration test: render a minimal 2-scene Demo Markdown (title card + terminal `echo hello`) → verify MP4 exists, has audio track, correct duration                                         | E2E test passes                                                                       | 1-8                            |

**Key decisions:**

- Frame capture loop reuses `@webreel/core/recorder.ts` with a new surface abstraction plugged in. The existing recorder's ffmpeg pipe, backpressure handling, and frame duplication logic are reused.
- Each scene produces its own intermediate `.mp4` file. Final assembly concatenates them. This is the per-scene caching strategy (ADR-005) — only changed scenes need re-rendering.
- Sound effects (click, key) are not used for terminal scenes in Phase 1. The existing media.ts audio pipeline is reused for narration mixing.

**Acceptance:** `webreel render <any-script>.md` produces a complete MP4 video with the correct surface execution, narrated audio, dynamic value resolution, title cards, and transitions. Validated against at least 3 example scripts (terminal demo, browser walkthrough, mixed). Watchable without editing.

---

### WS-1.7: Example Library + Integration Validation (Week 4, Days 1-3)

**What:** Build a diverse example library that validates the engine across different demo patterns. The engine is a platform — examples prove it works for any use case, not just one.

**Tasks:**

| #   | Task                                                                                                                                                                                 | Output                                                              | Depends On |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------- |
| 1   | Write `examples/minimal-terminal.md` — simplest possible Demo Markdown (1 act, 1 scene, 1 terminal command). Used as the smoke test.                                                 | Minimal example for docs, testing, and new user onboarding          | WS-1.2     |
| 2   | Write `examples/cli-tool-demo.md` — CLI tool tutorial pattern: install, basic usage, advanced flags, output capture with dynamic refs. 3 acts, ~6 scenes, terminal + title surfaces. | Multi-act terminal demo validating the full action vocabulary       | WS-1.2     |
| 3   | Write `examples/browser-walkthrough.md` — browser-based product walkthrough: navigate to URL, click through UI, highlight elements. 2 acts, ~4 scenes.                               | Browser surface demo validating CDP integration + cursor animation  | WS-1.8     |
| 4   | Write `examples/mixed-surface.md` — combines terminal + browser + title cards in one script. Tests surface switching, transition types, and multi-surface narration timing.          | Cross-surface integration demo proving the orchestrator is generic  | WS-1.6     |
| 5   | Run `webreel render` against all 4 examples. Review each output for timing, audio quality, surface rendering, transitions. Fix issues found during review.                           | All examples render to watchable MP4s passing Phase 1 gate criteria | WS-1.6     |
| 6   | Add `examples/title-only.md` — title card + narration only (no terminal or browser) for testing the narration pipeline in isolation                                                  | Narration-only example for isolated testing                         | WS-1.2     |
| 7   | Write `EXAMPLES.md` — catalog of examples with descriptions, intended patterns, and what platform capabilities each one validates                                                    | Documentation for contributors and users                            | 1-6        |

**Key decisions:**

- Every example validates a different platform capability — the library is the integration test suite.
- No example should be project-specific (no hardcoded repos, paths, or product names) — use generic content that works on any machine.
- The AMD ISV demo can be added later as a real-world usage example, but it's not a gating criterion for Phase 1.

**Acceptance:** All examples render to watchable MP4s without manual editing. Each example validates a different surface/feature combination. A new user can run any example out of the box on macOS or Linux.

---

### WS-1.8: Browser Surface Extraction (Week 4, Days 3-5)

**What:** Extract the existing browser recording logic from `@webreel/core` into a proper `Surface` implementation, so it plugs into the same orchestrator as terminal and title surfaces.

**Tasks:**

| #   | Task                                                                                                                                                                                                                  | Output                                                      | Depends On     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------- |
| 1   | Implement `BrowserSurface` wrapping existing core modules: `setup()` launches Chrome + CDP, `execute()` delegates to existing `actions.ts`, `captureFrame()` uses `Page.captureScreenshot`, `teardown()` kills Chrome | Existing browser functionality behind `Surface` interface   | WS-1.1, WS-1.3 |
| 2   | Map Demo Markdown browser actions to existing action types: `click`, `type`, `scroll`, `navigate`, `wait`, `hover` → existing RecordingContext methods                                                                | All PRD §4.7 browser actions work through surface interface | 1              |
| 3   | Integration test: render a Demo Markdown with one browser scene (navigate to a URL, click a button) + narration → MP4                                                                                                 | Browser scene renders with cursor animation and narration   | 1, 2, WS-1.6   |
| 4   | Integration test: render a Demo Markdown with browser + terminal scenes in sequence                                                                                                                                   | Multi-surface demo works                                    | 3              |

**Key decisions:**

- This is a wrapper, not a rewrite. All existing cursor animation, click synthesis, and CDP logic stays in `@webreel/core`. The `BrowserSurface` delegates to it.
- The existing `webreel record` command is unchanged. Only `webreel render` uses the new surface abstraction.

**Acceptance:** A Demo Markdown script with `> surface: browser` renders correctly using existing browser recording capabilities. Cursor animation and sound effects work.

---

## Phase 2: Multi-Surface & Annotations (Weeks 5-8)

**Goal:** Multiple surfaces in one demo + visual annotations. Conference-quality output.

**Gate criteria:**

- [ ] Demo uses 3+ surfaces (browser, terminal, application)
- [ ] Annotations render correctly (highlight, arrow, zoom, callout)
- [ ] Section-level re-rendering works (<30 seconds)
- [ ] Subtitle track accurate to narration timing

---

### WS-2.1: Application Surface + nut.js (Week 5)

**Dependencies:** `@nut-tree-fork/nut-js`

**Tasks:**

| #   | Task                                                                                                                                          | Output                                                    | Depends On |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------- |
| 1   | Install `@nut-tree-fork/nut-js`. Verify native addon compiles on macOS.                                                                       | Build passes                                              | Phase 1    |
| 2   | Implement `ApplicationSurface.setup()`: verify target app is running (by window title), bring to front, resize/position window                | App window visible and positioned                         | 1          |
| 3   | Implement `ApplicationSurface.execute()`: `focus_window`, `click_at` (with cursor animation), `type_text`, `send_shortcut`, `wait_for_window` | All PRD §4.7 application actions work                     | 2          |
| 4   | Implement `ApplicationSurface.captureFrame()`: use nut.js screen capture to grab the app window region as PNG                                 | Per-frame screen capture of app window                    | 2          |
| 5   | Implement `ApplicationSurface.teardown()`: restore window position if changed                                                                 | Clean cleanup                                             | 2          |
| 6   | Integration test: render a Demo Markdown that opens VS Code, types code, takes a screenshot                                                   | Application surface produces frames with real app content | 3, 4       |

**Acceptance:** A scene with `> surface: application` + `> app: Visual Studio Code` opens VS Code, types text, and captures frames.

---

### WS-2.2: Desktop Surface (Week 5-6)

**Tasks:**

| #   | Task                                                                                                                                                       | Output                                       | Depends On |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------- |
| 1   | Implement `DesktopSurface.setup()`: configure screen capture region (full screen or specific monitor)                                                      | Screen capture initialized                   | WS-2.1     |
| 2   | Implement `DesktopSurface.execute()`: `arrange_windows` (position multiple windows by coordinates), `switch_app` (Cmd+Tab simulation), `screenshot_region` | Window management actions work               | 1          |
| 3   | Implement macOS window positioning via AppleScript (`osascript` child process)                                                                             | Windows snap to specified positions on macOS | 2          |
| 4   | Implement `DesktopSurface.captureFrame()`: full-screen or region capture via nut.js                                                                        | Desktop frames captured                      | 1          |
| 5   | Integration test: arrange two windows side-by-side, capture desktop frame                                                                                  | Layout matches specification                 | 2-4        |

**Acceptance:** `> surface: desktop` + `arrange_windows` positions VS Code and Terminal.app side-by-side. Frame capture shows both windows.

---

### WS-2.3: Composite Surface (Week 6)

**What:** Multi-surface layouts within a single scene (split-screen, picture-in-picture).

**Tasks:**

| #   | Task                                                                                                                                 | Output                             | Depends On             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------- |
| 1   | Implement `CompositeSurface.setup()`: instantiate child surfaces based on config (left/right, main/pip)                              | Child surfaces initialized         | WS-1.3, WS-1.8, WS-2.1 |
| 2   | Implement layout engine: `split-horizontal`, `split-vertical`, `picture-in-picture`. Calculate frame regions for each child surface. | Layout geometry computed           | 1                      |
| 3   | Implement `CompositeSurface.captureFrame()`: capture frames from each child surface, composite into a single frame using `sharp`     | Combined frame with correct layout | 1, 2                   |
| 4   | Implement `CompositeSurface.execute()`: route actions to the correct child surface based on action target                            | Actions dispatch to correct child  | 1                      |
| 5   | Integration test: terminal on left, browser on right, simultaneous actions                                                           | Split-screen rendering works       | 2-4                    |

**Acceptance:** `> surface: composite` + `> layout: split-horizontal` + `> left: terminal` + `> right: browser` renders a split-screen view.

---

### WS-2.4: Annotation System (Weeks 6-7)

**Tasks:**

| #   | Task                                                                                                                                                                     | Output                                                    | Depends On |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------- |
| 1   | Implement `Annotation` types and renderer infrastructure in `@webreel/annotations/`                                                                                      | Type system for all annotation kinds                      | Phase 1    |
| 2   | Implement highlight renderer: dim surrounding region (semi-transparent overlay), leave target element bright. Target resolved via CSS selector (browser) or coordinates. | Highlight overlay frames generated                        | 1          |
| 3   | Implement arrow renderer: animated SVG arrow from edge of frame to target, with optional text label                                                                      | Arrow overlay frames with entrance animation              | 1          |
| 4   | Implement callout renderer: labeled box connected to target element by a line                                                                                            | Callout overlay frames                                    | 1          |
| 5   | Implement zoom renderer: Ken Burns smooth zoom into target region over configurable duration                                                                             | Zoom effect applied to scene frames                       | 1          |
| 6   | Implement redact renderer: gaussian blur or pixelation over target region                                                                                                | Sensitive content obscured                                | 1          |
| 7   | Wire annotations into compositor: during overlay compositing, render active annotations on top of cursor/HUD layer                                                       | Annotations appear in final video at correct frame ranges | 2-6        |
| 8   | Parse `annotate:`, `zoom:`, `callout:`, `redact:` action directives in Demo Markdown parser                                                                              | Parser produces `ActionDirective` with annotation params  | WS-1.2     |
| 9   | Integration test: browser scene with highlight on a CSS selector, arrow pointing at an element, zoom into a table                                                        | All annotation types render correctly                     | 7, 8       |

**Acceptance:** Demo Markdown with `- annotate: "#latency" with "Under 5ms" style=highlight` produces a visible highlight overlay in the rendered video.

---

### WS-2.5: Scene Transitions (Week 7)

**Tasks:**

| #   | Task                                                                                            | Output                                           | Depends On |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------- |
| 1   | Implement `slide-left`, `slide-right`, `slide-up`, `wipe` transitions via ffmpeg `xfade` filter | Four additional transition types beyond fade/cut | Phase 1    |
| 2   | Parse `transition_in` and `transition_out` in scene surface config blockquotes                  | Transitions specified per-scene in Demo Markdown | WS-1.2     |
| 3   | Integration test: 3-scene demo with different transition types between each                     | Transitions render correctly                     | 1, 2       |

**Acceptance:** All transition types from PRD §4.3 work in rendered output.

---

### WS-2.6: Subtitles + Chapter Markers (Week 7)

**Tasks:**

| #   | Task                                                                                                                 | Output                                             | Depends On |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------- |
| 1   | Implement SRT generator: from `NarrationTimeline`, produce `.srt` file with timestamps aligned to narration segments | `.srt` file alongside `.mp4`                       | WS-1.4     |
| 2   | Implement VTT generator: same as SRT but in WebVTT format                                                            | `.vtt` file                                        | 1          |
| 3   | Implement chapter markers: embed act names as MP4 chapter metadata via ffmpeg `-metadata`                            | Chapters visible in video players (VLC, QuickTime) | WS-1.6     |
| 4   | Add `--subtitles` flag to `webreel render`                                                                           | SRT/VTT generated when flag is present             | 1, 2       |

**Acceptance:** `webreel render demo.md --subtitles` produces `.srt` + `.vtt` files. Subtitles align with narration audio (±200ms). Chapters show in VLC.

---

### WS-2.7: Section-Level Re-Rendering (Week 8)

**What:** Re-render one scene without re-rendering the entire video. Critical for fast iteration.

**Tasks:**

| #   | Task                                                                                                                                               | Output                                           | Depends On |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------- |
| 1   | Implement scene segment cache: store each scene's intermediate `.mp4` + `.wav` + timeline in `~/.webreel/cache/scenes/{script_hash}/{scene_name}/` | Scene outputs cached                             | WS-1.6     |
| 2   | Implement cache invalidation: hash scene block content (surface config + narration + actions). Re-render only if hash changed.                     | Changed scenes detected                          | 1          |
| 3   | Implement `--scene <name>` re-render: render only the specified scene, load cached segments for other scenes, re-assemble final video              | Re-render single scene in <30s for a 4-min video | 1, 2       |
| 4   | Implement automatic change detection: compare current script hash against cached hashes, report which scenes need re-rendering                     | `webreel render --dry-run` shows changed scenes  | 2          |

**Acceptance:** Change narration in one scene of a 6-scene demo. Re-render completes in <30 seconds. Unchanged scenes are not re-recorded.

---

### WS-2.8: `webreel plan` Command (Week 8)

**Tasks:**

| #   | Task                                                                                                                    | Output                         | Depends On |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| 1   | Implement execution plan generator: from IR, produce list of prerequisites, per-scene timing estimates, risk assessment | `ExecutionPlan` data structure | WS-1.2     |
| 2   | Implement `webreel plan <script.md>`: display formatted plan in terminal                                                | CLI command works              | 1          |
| 3   | Implement `--validate` flag: check that Chrome/ffmpeg available, URLs reachable, apps running                           | Pre-flight validation          | 2          |
| 4   | Implement `--timing` flag: show per-scene duration breakdown from narration word count                                  | Timing overview                | 2          |

**Acceptance:** `webreel plan demo.md --validate --timing` prints prerequisites, per-scene timing, and validates that all required software is available.

---

## Phase 3: LLM Collaborative Authoring (Weeks 9-12)

**Goal:** Human writes a brief, LLM produces a draft, they iterate. The LLM is a co-author and demo director.

**Gate criteria:**

- [ ] Starting from a brief, LLM produces a usable first draft
- [ ] 3 rounds of refinement produce a conference-quality script
- [ ] Pacing analysis catches timing issues before rendering
- [ ] Brief to final video: under 2 hours including human review

---

### WS-3.1: LLM Provider Abstraction (Week 9, Days 1-2)

**Tasks:**

| #   | Task                                                                                                                                                                                                              | Output                                          | Depends On |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------- |
| 1   | Define `LLMProvider` interface in `@webreel/director/src/types.ts`: `generate(prompt, options) → string`, `stream(prompt, options) → AsyncIterable<string>`                                                       | Interface exported                              | Phase 2    |
| 2   | Implement `AnthropicProvider`: wraps Anthropic SDK, handles API key from env var, supports Claude models                                                                                                          | Claude integration works                        | 1          |
| 3   | Implement `OpenAIProvider`: wraps OpenAI SDK, handles API key, supports GPT models                                                                                                                                | OpenAI integration works                        | 1          |
| 4   | Implement provider resolution: read `director.provider` from script front matter or `~/.webreel/config.yaml`, fall back to env var detection (`ANTHROPIC_API_KEY` → Claude, `OPENAI_API_KEY` → OpenAI)            | Auto-detect available LLM provider              | 2, 3       |
| 5   | Implement local model provider stub: `LocalProvider` that connects to a local inference server (e.g., LFM models via llama.cpp, Ollama, or custom gateway). Model path and endpoint from config, never hardcoded. | Local LLM integration path for on-device models | 1          |

**Key decisions:**

- Provider resolution is config-driven: front matter → user config → env var detection. No hardcoded provider preferences.
- Local model support is critical — this project supports multiple LFM models. The `LocalProvider` reads model endpoint from `~/.webreel/config.yaml` or `WEBREEL_LLM_ENDPOINT` env var.
- All providers implement the same `LLMProvider` interface — the authoring pipeline doesn't know or care which provider is active.

**Acceptance:** LLM provider resolves from config/env vars and generates text responses. Swapping between Claude, OpenAI, and a local model requires only a config change — zero code changes.

---

### WS-3.2: Brief-to-Draft Generation (Week 9, Days 3-5)

**Tasks:**

| #   | Task                                                                                                                                        | Output                                              | Depends On |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------- |
| 1   | Design system prompt for brief-to-draft: include Demo Markdown format spec, example scripts, pacing guidelines, audience awareness          | System prompt that produces valid Demo Markdown     | WS-3.1     |
| 2   | Implement `brief-to-draft.ts`: take brief (audience, product, key messages, duration, tone, assets) → LLM → structured Demo Markdown output | First-draft script from brief                       | 1          |
| 3   | Implement output validation: parse LLM output as Demo Markdown, verify it produces valid IR, report structural errors back to LLM for retry | Self-healing generation (retry on malformed output) | 2, WS-1.2  |
| 4   | Write example briefs for testing: SaaS product walkthrough, CLI tool tutorial, API integration demo, on-device model showcase               | Test fixtures covering 4+ demo patterns             | —          |

**Acceptance:** Given any well-structured brief (audience, product, key messages, duration), the LLM produces a valid Demo Markdown script that parses into a valid IR. Validated against 3+ different brief types.

---

### WS-3.3: Script Refinement Loop (Week 10)

**Tasks:**

| #   | Task                                                                                                                                                  | Output                                  | Depends On |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------- |
| 1   | Design refinement system prompt: include current script, human feedback, constraints (valid Demo Markdown, preserve structure unless asked to change) | System prompt for refinement iterations | WS-3.1     |
| 2   | Implement `refinement.ts`: take current script + human feedback → LLM → updated script. Preserve unchanged sections.                                  | Script updated based on feedback        | 1          |
| 3   | Implement diff display: show human what changed between iterations (colored terminal diff of Demo Markdown)                                           | Human can review LLM's changes          | 2          |
| 4   | Integration test: start from draft, apply 3 rounds of feedback, verify script improves                                                                | Refinement loop produces better scripts | 2, 3       |

**Acceptance:** Three rounds of refinement with feedback like "make the latency section more punchy" and "add a comparison" produce a measurably better script (more visual beats, tighter timing).

---

### WS-3.4: Pacing Analysis + Validation (Week 10-11)

**Tasks:**

| #   | Task                                                                                                                                                                            | Output                                      | Depends On |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------- |
| 1   | Implement `validator.ts`: analyze IR for timing issues — narration length vs. duration hint mismatches, scenes with no visual action ("dead air"), acts that exceed time budget | `ValidationResult` with warnings and errors | WS-1.2     |
| 2   | Implement pacing analyzer: flag sections where narration-to-action ratio is off (>10s narration with no visual change), suggest visual beats                                    | Pacing suggestions in validation output     | 1          |
| 3   | Implement `webreel plan --validate` integration: run validator as part of plan command, block render if errors (warn on warnings)                                               | Validation gates the render pipeline        | 1, WS-2.8  |
| 4   | Implement pre-render check: before render, verify all surfaces can be initialized (Chrome available, PTY works, app running)                                                    | Early failure with actionable error message | 3          |

**Acceptance:** A script with 45s of narration budgeted into a 30s act triggers a timing warning. A scene with 12s of narration and zero actions triggers a "dead air" suggestion.

---

### WS-3.5: `webreel author` Command (Week 11)

**Tasks:**

| #   | Task                                                                                                                                                 | Output                                 | Depends On     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------- |
| 1   | Implement interactive CLI: prompt for brief inputs (audience, product, messages, duration, tone), display generated draft, accept feedback in a loop | Interactive terminal UX                | WS-3.2, WS-3.3 |
| 2   | Implement `--brief <file>` flag: read brief from a structured file instead of interactive prompts                                                    | File-based brief input                 | 1              |
| 3   | Implement `--script <file>` flag: start from an existing script for refinement (skip brief-to-draft)                                                 | Refinement-only mode                   | 1              |
| 4   | Implement save-and-render flow: after refinement loop, save script to disk, optionally trigger `webreel render`                                      | End-to-end authoring → render pipeline | 1              |

**Acceptance:** `webreel author --brief brief.yaml` starts the collaborative loop. After 3 rounds, outputs a Demo Markdown file ready for `webreel render`.

---

### WS-3.6: Post-Render Review (Week 11-12)

**Tasks:**

| #   | Task                                                                                                                                     | Output                                                        | Depends On     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------- |
| 1   | Implement `reviewer.ts`: analyze rendered video metadata (per-scene duration, narration timing, action density) and suggest improvements | Review suggestions like "Scene 3 has no visual action for 8s" | WS-1.6, WS-3.4 |
| 2   | Implement review → re-render loop: human gives feedback on rendered video, LLM adjusts script, re-render only changed scenes             | Fast post-render iteration                                    | 1, WS-2.7      |
| 3   | Integrate review into `webreel author` flow: after first render, offer review loop                                                       | Complete authoring lifecycle                                  | 1, WS-3.5      |

**Acceptance:** After rendering, the reviewer identifies a scene with excessive dead air and suggests adding a zoom annotation. Human approves, LLM adds it, only that scene re-renders.

---

### WS-3.7: Voice Cloning Integration (Week 12)

**Dependencies:** Coqui TTS (Python microservice)

**Tasks:**

| #   | Task                                                                                                                                                                 | Output                           | Depends On |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| 1   | Implement `CoquiProvider` in `@webreel/narrator/src/providers/coqui.ts`: connect to local Coqui TTS HTTP API, send text + reference audio, receive synthesized audio | Voice cloning via API            | WS-1.4     |
| 2   | Implement voice enrollment: `webreel voice enroll <audio.wav>` — save reference audio to `~/.webreel/voices/`                                                        | Voice reference stored for reuse | 1          |
| 3   | Implement provider selection in front matter: `narrator.provider: coqui` + `voice: ./my-voice.wav`                                                                   | Per-script voice configuration   | 1          |
| 4   | Document Coqui TTS setup (Docker compose file for the Python service)                                                                                                | Easy setup for voice cloning     | 1          |

**Acceptance:** User records 10s of audio, enrolls it, renders a demo with their voice. Output narration sounds like the speaker.

---

### WS-3.8: Conditional Logic in Scripts (Week 12)

**Tasks:**

| #   | Task                                                                                                                                 | Output                              | Depends On |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------- |
| 1   | Extend parser to handle `> note: if output > threshold: retry` director notes as conditional directives                              | Conditionals parsed into IR         | WS-1.2     |
| 2   | Implement conditional execution in orchestrator: evaluate condition against captured values, branch to retry/skip/alternative action | Conditional branching during render | 1, WS-1.6  |
| 3   | Integration test: run a command that sometimes produces slow output, retry if latency > 20ms                                         | Conditional retry works             | 2          |

**Acceptance:** A script with `if latency_ms > 20: retry with --warm-cache` re-runs the command when the condition is met.

---

## Phase 4: Polish & Scale (Weeks 13-16)

**Goal:** Production hardening, CI integration, additional output formats, performance.

**Gate criteria:**

- [ ] Demo renders in CI (GitHub Actions) without physical display
- [ ] Interactive HTML output works in browser
- [ ] Unchanged scenes cached and skipped on re-render
- [ ] Template library covers 3+ common demo patterns

---

### WS-4.1: Additional Output Formats (Week 13)

**Tasks:**

| #   | Task                                                                                                                                      | Output                               | Depends On |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------- |
| 1   | Implement WebM output: VP9 + Opus encoding via ffmpeg                                                                                     | `webreel render --format webm` works | Phase 3    |
| 2   | Implement GIF output: ffmpeg palettegen + paletteuse for high-quality animated GIF. Auto-trim to key moments (configurable max duration). | `webreel render --format gif` works  | Phase 3    |
| 3   | Implement `--format` flag accepting comma-separated values: `mp4,webm,gif` for multi-format output                                        | Single render, multiple outputs      | 1, 2       |

---

### WS-4.2: Interactive HTML Output (Week 13-14)

**Tasks:**

| #   | Task                                                                                                                                   | Output                                                | Depends On |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| 1   | Design HTML player: single-page app with video element, chapter navigation from acts, subtitle display, click-to-advance mode          | Player design spec                                    | Phase 3    |
| 2   | Implement HTML export: generate self-contained `.html` file with embedded video (base64 or blob URL), chapter metadata, subtitle track | `webreel render --format html` produces playable HTML | 1          |
| 3   | Implement click-to-advance mode: video pauses at scene boundaries, user clicks to advance                                              | Interactive presentation mode                         | 2          |

---

### WS-4.3: CI-Friendly Rendering (Week 14)

**Tasks:**

| #   | Task                                                                                                                          | Output                                               | Depends On |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------- |
| 1   | Implement `--ci` flag: auto-detect headless environment, skip desktop surface, use Xvfb for application surfaces if available | Render works in GitHub Actions                       | Phase 3    |
| 2   | Create GitHub Actions workflow example: trigger on script change, render video, upload as PR artifact                         | Reference CI config                                  | 1          |
| 3   | Implement Chrome auto-download in CI (no interactive prompts, respect `CHROME_PATH` env var)                                  | Chrome binary available in CI without manual install | 1          |
| 4   | Implement Kokoro model caching in CI (cache `~/.webreel/cache/` across runs)                                                  | TTS model not re-downloaded every CI run             | 1          |

**Acceptance:** GitHub Actions workflow renders a demo from a PR-changed script and uploads the MP4 as a PR artifact.

---

### WS-4.4: Cloud TTS Providers (Week 14-15)

**Tasks:**

| #   | Task                                                                                                                                     | Output                              | Depends On |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------- |
| 1   | Implement `CloudProvider` in `@webreel/narrator/src/providers/cloud.ts`: support OpenAI TTS (`tts-1`, `tts-1-hd`) and ElevenLabs via API | Cloud TTS works with API key        | WS-1.4     |
| 2   | Implement provider selection: `narrator.provider: openai` or `narrator.provider: elevenlabs` in front matter                             | Per-script cloud provider selection | 1          |
| 3   | Implement SSML passthrough for providers that support it (ElevenLabs)                                                                    | Fine-grained prosody control        | 1          |

---

### WS-4.5: Parallel Scene Rendering (Week 15)

**Tasks:**

| #   | Task                                                                                                       | Output                                                             | Depends On |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| 1   | Analyze scene dependency graph: scenes with no `[read_output]` cross-references can render in parallel     | Dependency graph computed from IR                                  | WS-1.6     |
| 2   | Implement worker pool: spawn N parallel render processes (configurable, default: 2) for independent scenes | Parallel rendering via Node.js `worker_threads` or child processes | 1          |
| 3   | Implement progress reporting: aggregate per-scene progress into a single terminal progress bar             | User sees overall render progress                                  | 2          |

**Acceptance:** A 6-scene demo with 4 independent scenes renders ~2x faster with `--parallel 4`.

---

### WS-4.6: Template Library (Week 15-16)

**Tasks:**

| #   | Task                                                                                                                                 | Output                                | Depends On |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ---------- |
| 1   | Create template: Product Walkthrough (browser-based, 3-5 scenes: intro, feature 1, feature 2, closing)                               | `templates/product-walkthrough.md`    | Phase 3    |
| 2   | Create template: CLI Tool Demo (terminal-based, 4 scenes: install, basic usage, advanced feature, closing)                           | `templates/cli-demo.md`               | Phase 3    |
| 3   | Create template: API Integration Demo (terminal + browser, 5 scenes: intro, curl request, dashboard view, code walkthrough, closing) | `templates/api-demo.md`               | Phase 3    |
| 4   | Implement `webreel init --template <name>`: scaffold a new Demo Markdown script from a template                                      | CLI scaffolding command               | 1-3        |
| 5   | Create LLM prompt templates: starter system prompts for the director tuned to each demo type                                         | Prompt templates for `webreel author` | WS-3.2     |

---

### WS-4.7: Watch Mode (Week 16)

**Tasks:**

| #   | Task                                                                                                                          | Output                                                  | Depends On |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------- |
| 1   | Implement `webreel render --watch`: watch script file for changes, re-render changed scenes on save                           | Hot-reload-style rendering                              | WS-2.7     |
| 2   | Implement incremental re-render: detect which scenes changed (hash comparison), only re-render those, re-assemble final video | Fast iteration — change one line, see result in seconds | 1          |
| 3   | Implement audio-only preview: on change, regenerate narration audio only (skip video render) for quick timing review          | Near-instant audio preview                              | 1          |

**Acceptance:** Edit a narration line, save, hear updated audio in <5 seconds. See updated video in <30 seconds.

---

## Dependency Graph (Cross-Workstream)

```
WS-1.1 ─────┬──── WS-1.2 ────────────────┐
(scaffolding)│                              │
             ├──── WS-1.3 ─────┐           │
             │     (terminal)   │           │
             ├──── WS-1.4 ─────┤     WS-1.6 ──── WS-1.7 ──── Phase 1 Done
             │     (narrator)   ├────(orchestrator)              │
             └──── WS-1.5 ─────┘           │               WS-1.8
                   (title card)             │           (browser surface)
                                            │
                                            ▼
                        ┌───── Phase 2 ──────────────────────┐
                        │                                     │
                   WS-2.1 ── WS-2.2 ── WS-2.3               │
                   (app)    (desktop)  (composite)            │
                                                              │
                   WS-2.4 ─── WS-2.5                         │
                   (annotations)(transitions)                 │
                                                              │
                   WS-2.6 ─── WS-2.7 ─── WS-2.8             │
                   (subs)   (re-render)  (plan cmd)           │
                        │                                     │
                        └─────────────────────────────────────┘
                                            │
                                            ▼
                        ┌───── Phase 3 ──────────────────────┐
                        │                                     │
                   WS-3.1 ── WS-3.2 ── WS-3.3               │
                   (LLM)   (brief)   (refine)                │
                                                              │
                   WS-3.4 ── WS-3.5 ── WS-3.6               │
                   (validate)(author)  (review)               │
                                                              │
                   WS-3.7 ── WS-3.8                           │
                   (cloning)(conditional)                      │
                        │                                     │
                        └─────────────────────────────────────┘
                                            │
                                            ▼
                        ┌───── Phase 4 ──────────────────────┐
                        │                                     │
                   WS-4.1 ── WS-4.2 ── WS-4.3               │
                   (formats)(HTML)    (CI)                     │
                                                              │
                   WS-4.4 ── WS-4.5 ── WS-4.6 ── WS-4.7    │
                   (cloud)  (parallel)(templates)(watch)      │
                        │                                     │
                        └─────────────────────────────────────┘
```

---

## Summary

| Phase       | Workstreams           | Duration | Key Deliverable                                                               |
| ----------- | --------------------- | -------- | ----------------------------------------------------------------------------- |
| **Phase 1** | WS-1.1 through WS-1.8 | 4 weeks  | Extensible rendering engine: any Demo Markdown → terminal/browser/title → MP4 |
| **Phase 2** | WS-2.1 through WS-2.8 | 4 weeks  | Multi-surface compositing, annotations, section-level re-rendering            |
| **Phase 3** | WS-3.1 through WS-3.8 | 4 weeks  | LLM co-authoring with local + cloud providers: brief → script → video         |
| **Phase 4** | WS-4.1 through WS-4.7 | 4 weeks  | CI rendering, templates, watch mode, parallel rendering, cloud TTS            |

**Total workstreams:** 31
**Total estimated duration:** 16 weeks
**Critical path:** WS-1.1 → WS-1.2 → WS-1.6 → WS-1.7 (Phase 1 validation)
