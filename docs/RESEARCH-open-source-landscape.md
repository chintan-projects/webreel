# Open Source Landscape Research

**Date:** 2026-03-03
**Purpose:** Evaluate open source tools relevant to Webreel's demo automation platform. Identify what to adopt as dependencies, what to learn from, and what to build from scratch.

---

## 1. Programmatic Video Composition

The biggest architectural question: should Webreel stick with its own ffmpeg pipeline or adopt a higher-level framework?

### Remotion (React-based video)

- **What:** React components rendered frame-by-frame to video. Use `useCurrentFrame()` + `interpolate()` for animation. CLI renders to MP4.
- **Stars:** 21k+ GitHub. Actively maintained. Production-proven.
- **License:** Source-available; requires paid license for commercial use in companies.
- **Fit for Webreel:** Poor. Remotion is designed for template-driven content (explainer videos, social clips), not live-captured screen recordings. It renders React DOM to frames — Webreel captures real browser/terminal screens. The abstraction layer doesn't match. Remotion's ffmpeg integration is useful to study, but the framework itself adds overhead without solving our core problem (multi-surface capture + compositing).
- **Learn from:** Their ffmpeg filter graph construction, WebCodecs integration, and parallelized rendering architecture.
- [GitHub](https://github.com/remotion-dev/remotion) | [Docs](https://www.remotion.dev/)

### Revideo (Motion Canvas fork)

- **What:** Fork of Motion Canvas that adds headless rendering, audio support, and API-driven video generation. TypeScript, canvas-based.
- **Stars:** 1.5k+ GitHub. Y Combinator backed.
- **License:** MIT (truly open source, unlike Remotion).
- **Fit for Webreel:** Limited. Same mismatch — it's for programmatic animation, not screen capture compositing. But the headless rendering approach and the way they parallelized rendering across workers is worth studying.
- **Learn from:** Parallelized rendering architecture, API endpoint pattern for render-as-a-service.
- [GitHub](https://github.com/redotvideo/revideo) | [Blog](https://re.video/blog/fork)

### Motion Canvas

- **What:** Imperative animation framework using a single `<canvas>` element. Great for explainer animations.
- **License:** MIT.
- **Fit for Webreel:** None directly. Motion Canvas explicitly avoids audio and video output (the maintainers rejected those features, which caused the Revideo fork). Not designed for our use case.
- **Learn from:** Their procedural animation API design is elegant for sequenced visual effects.

### Verdict: Stay with custom ffmpeg pipeline

Webreel's two-phase recording (capture → composite) is architecturally different from these frameworks. Our compositor already uses ffmpeg's filter graphs and sharp for overlays. The video frameworks above solve a different problem (generating video from code/React). **Recommendation: Keep the existing ffmpeg pipeline.** Study Remotion's filter graph patterns for transitions and Revideo's parallelized rendering for the per-scene cache strategy.

---

## 2. Terminal Recording & Rendering

### Asciinema

- **What:** Records terminal sessions to `.cast` files (NDJSON format). Web player for playback. Huge ecosystem.
- **Format:** asciicast v2 — Header line (JSON with terminal size, env, command) + event stream (each line: `[timestamp, type, data]`). Event types: `"o"` (output), `"m"` (marker), `"r"` (resize).
- **License:** GPL-3.0.
- **Fit for Webreel:** High — but as a format, not a dependency. The asciicast format is the lingua franca for terminal recordings. Webreel's terminal surface should:
  1. **Write `.cast` files** as the intermediate capture format (not raw PTY output)
  2. **Read `.cast` files** for replay-mode terminals (pre-recorded demos)
  3. The renderer then converts cast data to visual frames
- **What NOT to use:** The asciinema CLI itself (it records interactively, not programmatically). We need to generate cast events from our PTY driver.
- **Learn from:** Their timing model and the `.cast` format spec for terminal event representation.
- [GitHub](https://github.com/asciinema/asciinema) | [Format Spec](https://docs.asciinema.org/manual/asciicast/v2/)

### VHS (Charmbracelet)

- **What:** Declarative terminal recorder. You write a `.tape` script (`Type "hello"`, `Sleep 1s`, `Enter`), it runs commands in a virtual terminal and produces a GIF/MP4/WebM.
- **License:** MIT.
- **Fit for Webreel:** Medium-high. VHS's scripting model is remarkably similar to what we're building — declarative actions → terminal recording → video output. However:
  - VHS is a standalone Go binary, not a library. Can't embed it.
  - VHS renders terminal output to frames using its own rendering engine.
  - VHS has no concept of multi-surface composition.
- **Learn from:** Their `.tape` scripting DSL design (action vocabulary, timing control). Their approach to virtual terminal rendering (they use a Go-based terminal emulator). The fact that they solved the "script → terminal video" pipeline validates our approach.
- [GitHub](https://github.com/charmbracelet/vhs)

### xterm.js (+ xterm-headless)

- **What:** Full terminal emulator in TypeScript. Powers VS Code's integrated terminal. Has a headless mode (`@xterm/headless`) for Node.js.
- **License:** MIT.
- **Fit for Webreel:** **Strong candidate for terminal frame rendering.** The architecture doc specifies Node Canvas for terminal rendering (ADR-007), but xterm.js offers an alternative path:
  1. `@xterm/headless` processes ANSI escape sequences in Node.js
  2. Feed PTY output into the headless terminal to track state
  3. Use the serialization addon to extract terminal state at any frame
  4. Render that state to an image (via canvas or custom renderer)
- **Trade-off vs Node Canvas:** xterm.js handles all ANSI parsing, cursor positioning, scrollback, and terminal state management for free. Node Canvas approach requires reimplementing ANSI parsing. xterm.js is the more robust path for complex terminal output (curses apps, colors, unicode).
- **Recommendation:** **Replace ADR-007 (Node Canvas) with xterm-headless + canvas rendering.** Use `@xterm/headless` for state tracking and a lightweight canvas renderer for frame generation. This eliminates the need to build an ANSI parser from scratch.
- [GitHub](https://github.com/xtermjs/xterm.js) | [npm: xterm-headless](https://www.npmjs.com/package/@xterm/headless)

### agg (asciinema GIF generator)

- **What:** Converts `.cast` files to animated GIFs. Rust-based, fast.
- **License:** Apache-2.0.
- **Fit for Webreel:** Low as a dependency (we need per-frame PNG, not GIF output). But demonstrates the cast → visual frame pipeline.
- [GitHub](https://github.com/asciinema/agg)

### Verdict: Adopt asciicast format + xterm-headless

**Recommendation:**

1. Use **asciicast v2 format** as the intermediate representation for terminal recordings
2. Use **`@xterm/headless`** for terminal state management and ANSI processing
3. Build a thin **frame renderer** (canvas-based) that reads xterm state and produces PNGs
4. Support **reading `.cast` files** for replay-mode (pre-recorded terminals)
5. Study **VHS tape format** for action vocabulary design in Demo Markdown

---

## 3. Text-to-Speech (TTS)

### Kokoro (82M params, npm package)

- **What:** Lightweight TTS model. 82M parameters. Available as npm package (`kokoro-js`). Runs locally via ONNX Runtime (CPU/WebGPU/WASM).
- **Quality:** Rivals models 10-100x its size. Natural English speech.
- **Speed:** Real-time or faster on CPU. Sub-second latency.
- **Voices:** Multiple built-in voices (e.g., `af_heart`). Speed control.
- **License:** Apache-2.0.
- **Fit for Webreel:** **Excellent for Phase 1.** Native Node.js support, npm install, zero external dependencies. This is the fastest path to working TTS:
  ```typescript
  import { KokoroTTS } from "kokoro-js";
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX");
  const audio = await tts.generate("Hello world", { voice: "af_heart" });
  ```
- **Limitation:** English-focused. Limited voice variety compared to larger models. No voice cloning.
- [npm](https://www.npmjs.com/package/kokoro-js) | [HuggingFace](https://huggingface.co/posts/Xenova/503648859052804)

### Piper (Rhasspy)

- **What:** Fast local TTS using VITS models exported to ONNX. Designed for Raspberry Pi-class devices.
- **Languages:** 30+ languages, many voices.
- **Speed:** Real-time on CPU. Extremely fast inference.
- **License:** MIT.
- **Fit for Webreel:** **Good for multilingual needs.** Piper is a native binary (not Node.js), so integration requires spawning a child process or using its HTTP server. Less ergonomic than Kokoro for a Node.js project, but broader language support.
- **Integration path:** `piper --model en_US-lessac-high --output_file out.wav < text.txt`
- [GitHub](https://github.com/rhasspy/piper)

### Coqui TTS (XTTS-v2)

- **What:** Python-based deep learning TTS toolkit. Successor to Mozilla TTS. Supports voice cloning.
- **Voice cloning:** XTTS-v2 can clone a voice from a short audio sample.
- **License:** MPL-2.0.
- **Fit for Webreel:** **Best for voice cloning (Phase 3+).** The voice cloning capability is unique — a speaker records 10 seconds of audio, and XTTS-v2 generates narration in their voice. However: it's Python, requires GPU for reasonable speed, and is heavier to deploy.
- **Integration path:** Run as a Python microservice, call via HTTP.
- [GitHub](https://github.com/coqui-ai/TTS)

### Kyutai Pocket TTS (100M params)

- **What:** Released January 2026. 100M parameters, runs on CPU in real-time.
- **License:** Check repository (newly released).
- **Fit for Webreel:** Worth monitoring. Similar size class to Kokoro but newer. Need to evaluate quality vs. Kokoro.
- [Site](https://kyutai.org/tts)

### Higgs Audio V2

- **What:** Built on Llama 3.2 3B, trained on 10M+ hours. Top trending TTS on HuggingFace.
- **Fit for Webreel:** Too large for local inference without GPU. Better suited as a cloud API option.

### Verdict: Kokoro for Phase 1, provider abstraction for all

**Recommendation:**

1. **Phase 1:** Use **Kokoro (`kokoro-js`)** as the default TTS provider. Zero-config, npm-native, good quality.
2. **Phase 2:** Add **Piper** as an alternative for multilingual support.
3. **Phase 3:** Add **Coqui TTS (XTTS-v2)** via Python microservice for voice cloning.
4. The **TTS provider abstraction** in the architecture (ADR-008 pattern) is validated — we need it to support all three.

---

## 4. Desktop Automation

### nut.js

- **What:** Node.js desktop automation. Controls mouse, keyboard, and screen across Windows, macOS, Linux. Image-based element finding.
- **API:** Promise-based. `mouse.move()`, `keyboard.type()`, `screen.find()`.
- **Native addons:** Uses N-API for OS-level input simulation.
- **License:** Apache-2.0.
- **Fit for Webreel:** **Direct match for Application and Desktop surfaces.** The architecture specifies OS-level input for native app control — nut.js is exactly this.
  ```typescript
  import { mouse, keyboard, screen, Point } from "@nut-tree-fork/nut-js";
  await mouse.move(straightTo(new Point(500, 300)));
  await mouse.leftClick();
  await keyboard.type("hello");
  const region = await screen.find(imageResource("button.png"));
  ```
- **Limitation:** Image matching is fragile. Requires screen to be visible (no headless mode for native apps). Performance overhead from native addon compilation.
- [GitHub](https://github.com/nut-tree/nut.js) | [Docs](https://nutjs.dev/)

### RobotJS

- **What:** Earlier Node.js desktop automation library. Mouse, keyboard, screen reading.
- **Status:** Maintenance mode. Last significant update was years ago.
- **Fit for Webreel:** Skip in favor of nut.js. nut.js is actively maintained and has a richer API.
- [GitHub](https://github.com/octalmage/robotjs)

### Playwright (for browser surface)

- **What:** Microsoft's browser automation framework. Supports Chromium, Firefox, WebKit.
- **Video recording:** Built-in `context.newPage({ recordVideo })` for WebM capture.
- **MCP integration:** Microsoft now ships a Playwright MCP server.
- **License:** Apache-2.0.
- **Fit for Webreel:** **Potential alternative to raw CDP for browser surface.** Webreel currently uses `chrome-remote-interface` (raw CDP). Playwright provides:
  - Higher-level API (auto-waiting, selectors, assertions)
  - Cross-browser support
  - Built-in video recording
  - Better DevX (auto-complete, error messages)
  - However: less control over frame timing, adds abstraction layer over CDP
- **Trade-off:** Playwright's video recording captures at the browser level, not frame-by-frame. Webreel needs precise per-frame control for cursor animation and overlay compositing. Raw CDP (`Page.captureScreenshot`) gives this control; Playwright's recording does not.
- **Recommendation:** Keep raw CDP for frame capture (critical for the compositor pipeline). Consider Playwright's selector engine and auto-wait patterns for action execution — but this is a Phase 4+ optimization, not essential.

### Verdict: nut.js for desktop, keep CDP for browser

**Recommendation:**

1. **Browser surface:** Keep raw CDP via `chrome-remote-interface`. Playwright adds overhead without solving our frame capture needs.
2. **Application/Desktop surface:** Adopt **nut.js** for OS-level input simulation and screen reading.
3. **Terminal surface:** Use PTY (node-pty) + xterm-headless (see Section 2).

---

## 5. Existing Demo/Documentation Tools (Competitive Landscape)

These aren't dependencies but inform what the market expects:

| Tool          | What It Does                                       | Gap vs. Webreel Target               |
| ------------- | -------------------------------------------------- | ------------------------------------ |
| **Loom**      | Screen + cam recording, human narrates live        | No automation, no re-rendering       |
| **Arcade**    | Interactive product demos (click-through)          | Not video, no terminal, no voice     |
| **Descript**  | Video editing via transcript editing               | Post-production tool, not generation |
| **Synthesia** | AI avatar reads a script to camera                 | Talking head only, no screen capture |
| **Scribe**    | Auto-generates step-by-step guides from recordings | Documentation, not demo videos       |
| **Supademo**  | Interactive click-through demos                    | Screenshot-based, not video          |
| **VHS**       | Scripted terminal → GIF/video                      | Terminal only, no multi-surface      |
| **asciinema** | Terminal session recording + web playback          | Terminal only, no compositing        |

**Key gap in the market:** No tool combines multi-surface capture + voice generation + script-driven rendering + LLM collaboration. Webreel's expansion fills a genuinely unoccupied niche.

---

## 6. Architecture Revisions Based on Research

### 6.1. Revise ADR-007: Terminal Rendering

**Current decision:** Node Canvas for terminal frame rendering (ANSI → styled text → PNG).

**Revised recommendation:** **xterm-headless + canvas rendering.** xterm.js handles all ANSI parsing, cursor state, scrollback, and terminal emulation. We render xterm's internal buffer state to PNG frames. This eliminates the need to build a custom ANSI parser and handles edge cases (curses apps, unicode, 256-color, true color) that a hand-rolled parser would miss.

**Migration:** Replace the planned `TerminalRenderer` class with:

```
PTY output → @xterm/headless (state tracking) → serialize addon → canvas render → PNG frame
```

### 6.2. Add ADR-010: Terminal Recording Format

**Decision:** Use **asciicast v2** as the intermediate format for terminal recordings.

**Rationale:**

- Well-specified, widely adopted format
- Enables replay mode (import pre-recorded demos)
- Tooling ecosystem (agg, svg-term, asciinema-player) for debugging
- Simple NDJSON format — easy to read/write programmatically
- Supports markers for breakpoints and navigation

### 6.3. Validate ADR-008: TTS Provider Abstraction

**Confirmed.** Research validates three distinct TTS providers at different phases:

- Phase 1: Kokoro (npm-native, 82M, fast, English)
- Phase 2: Piper (multilingual, binary, fast)
- Phase 3: Coqui XTTS-v2 (voice cloning, Python, GPU)

The provider interface in the architecture handles all three cleanly.

### 6.4. Add to Phase 1 dependency list

**New dependencies to add:**
| Package | Purpose | Size |
|---------|---------|------|
| `kokoro-js` | Default TTS provider | ~82M model download |
| `@xterm/headless` | Terminal state management | ~200KB |
| `node-pty` | PTY spawning for terminal surface | Native addon |

**Existing (validated):**
| Package | Purpose | Status |
|---------|---------|--------|
| `chrome-remote-interface` | CDP for browser surface | Keep |
| `sharp` | Image compositing | Keep |
| `commander` | CLI | Keep |

**Phase 2+ dependencies:**
| Package | Purpose | Phase |
|---------|---------|-------|
| `@nut-tree-fork/nut-js` | Desktop/app automation | Phase 2 |
| Piper (binary) | Multilingual TTS | Phase 2 |
| Coqui TTS (Python) | Voice cloning | Phase 3 |

---

## 7. Things to Consider That Aren't in the Architecture Yet

### 7.1. Accessibility / Closed Captions

The architecture has ADR-009 for subtitle generation from narration text, but doesn't address:

- **WebVTT/SRT generation** as a first-class output (not just burned-in)
- **Timing alignment** between generated subtitles and narration audio
- **Multi-language subtitles** when Piper enables multilingual narration

### 7.2. CI/CD Integration

The PRD mentions CI rendering as an open question. Research shows:

- Remotion has a **Lambda renderer** for cloud rendering — validates the pattern
- Revideo exposes rendering as an **API endpoint** — applicable to our REST/CLI model
- **Headless Chrome in CI** is well-solved (Playwright ships browsers, we can too)
- **Terminal surface in CI** works (PTY doesn't need a display)
- **Desktop surface in CI** requires Xvfb or similar virtual display — this is the hard part
- **Recommendation:** Phase 1 targets CLI rendering. Phase 4 adds a `webreel render --ci` mode that skips desktop surface and runs browser + terminal headlessly.

### 7.3. Streaming / Progressive Preview

During authoring, waiting for a full render is painful. Consider:

- **Scene-level preview:** Render one scene at a time and stream to a preview player
- **Audio-only preview:** Generate narration audio quickly for timing review before full video render
- **Thumbnail strip:** Generate a frame every N seconds for visual overview
- VHS solves this by showing terminal output live while recording — we could do the same for browser surface (show the headless Chrome window during recording).

### 7.4. Template Library

VHS has a community of `.tape` files shared on GitHub. Consider:

- **Example scripts** that ship with webreel (already have 15+ browser examples)
- **Demo Markdown templates** for common patterns (product walkthrough, CLI tool demo, API demo, before/after comparison)
- **LLM prompt templates** for the director (starter prompts for different demo types)

### 7.5. Audio Mixing Beyond TTS

The architecture covers narration audio but not:

- **Background music** (loopable tracks, volume ducking during narration)
- **Transition sounds** (whoosh, click, subtle audio cues between scenes)
- **Sound design presets** (corporate, casual, technical) — bundles of background + transition + typing sounds
- Current webreel already has click/keystroke sounds with humanization — this extends naturally.

### 7.6. Output Format Flexibility

Current architecture targets MP4/WebM/GIF. Consider:

- **Interactive HTML** — embed the video with chapter navigation (like asciinema player but for full demos)
- **Slide deck export** — key frames as presentation slides with speaker notes from narration
- **Short-form clips** — auto-extract highlight moments for social media (15s/30s/60s cuts)

---

## 8. Recommended Dependency Stack (Updated)

```
Phase 1 (Core + Browser + Terminal + Voice)
├── @webreel/core (existing)
│   ├── chrome-remote-interface  ← CDP for browser surface (keep)
│   ├── sharp                    ← image compositing (keep)
│   └── ffmpeg                   ← video encoding (keep, binary)
├── @webreel/surfaces
│   ├── node-pty                 ← terminal PTY spawning (new)
│   └── @xterm/headless          ← terminal state/ANSI parsing (new, replaces Node Canvas plan)
├── @webreel/narrator
│   └── kokoro-js                ← TTS, 82M params, npm-native (new)
├── @webreel/director
│   └── (LLM provider SDK)       ← Anthropic/OpenAI, user-configured
└── webreel (CLI)
    └── commander                ← CLI framework (keep)

Phase 2 (Desktop + Multilingual)
├── @nut-tree-fork/nut-js        ← desktop automation (new)
└── piper                        ← multilingual TTS (new, binary)

Phase 3 (Voice Cloning + Polish)
└── coqui-tts                    ← voice cloning via Python service (new)
```

---

## Sources

- [Remotion GitHub](https://github.com/remotion-dev/remotion)
- [Revideo GitHub](https://github.com/redotvideo/revideo) | [Fork rationale](https://re.video/blog/fork)
- [Motion Canvas comparison](https://www.remotion.dev/docs/compare/motion-canvas)
- [Asciinema](https://asciinema.org/) | [asciicast v2 format](https://docs.asciinema.org/manual/asciicast/v2/)
- [VHS by Charmbracelet](https://github.com/charmbracelet/vhs)
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js) | [xterm-headless npm](https://www.npmjs.com/package/@xterm/headless)
- [Awesome Terminal Recorder](https://github.com/orangekame3/awesome-terminal-recorder)
- [Kokoro TTS npm](https://www.npmjs.com/package/kokoro-js) | [HuggingFace announcement](https://huggingface.co/posts/Xenova/503648859052804)
- [Piper TTS](https://github.com/rhasspy/piper)
- [Coqui TTS](https://github.com/coqui-ai/TTS)
- [Kyutai TTS](https://kyutai.org/tts)
- [BentoML TTS overview](https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models)
- [DataCamp TTS engines](https://www.datacamp.com/blog/best-open-source-text-to-speech-tts-engines)
- [nut.js](https://nutjs.dev/) | [GitHub](https://github.com/nut-tree/nut.js)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [CDP vs Playwright comparison](https://lightpanda.io/blog/posts/cdp-vs-playwright-vs-puppeteer-is-this-the-wrong-question)
- [Remotion programmatic pipeline](https://dev.to/ryancwynar/i-built-a-programmatic-video-pipeline-with-remotion-and-you-should-too-jaa)
