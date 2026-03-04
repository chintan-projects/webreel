# Sequence Diagrams

This document contains Mermaid sequence diagrams for the major pipelines and flows in the webreel system. Each diagram corresponds to a distinct subsystem or command-level workflow.

---

## 1. Legacy Recording Pipeline (`webreel record`)

The legacy recording pipeline processes JSON config files through the CLI runner. It launches a headless Chrome instance via CDP, executes scripted interaction steps (click, type, scroll, drag, etc.), captures frames in real-time via `Page.captureScreenshot`, pipes them to an ffmpeg subprocess, and finalizes the output through the compositor with cursor and keystroke overlays.

```mermaid
sequenceDiagram
    participant CLI as CLI (record command)
    participant CL as ConfigLoader
    participant Runner as Runner
    participant Chrome as Chrome (headless)
    participant CDP as CDP Client
    participant Ctx as RecordingContext
    participant TL as InteractionTimeline
    participant Rec as Recorder
    participant FFmpeg as FFmpeg (subprocess)
    participant Comp as Compositor (compose)

    CLI->>CL: loadWebreelConfig(configPath)
    CL-->>CLI: WebreelConfig (videos, baseUrl, viewport)
    CLI->>CLI: filterVideosByName(videos, names)

    loop For each VideoConfig
        CLI->>Runner: runVideo(videoConfig, options)
        Runner->>Chrome: launchChrome({ headless: true })
        Chrome-->>Runner: chrome process (port)
        Runner->>CDP: connectCDP(port)
        CDP-->>Runner: CDPClient
        Runner->>CDP: Page.enable(), Runtime.enable()
        Runner->>CDP: Emulation.setDeviceMetricsOverride(viewport)
        Runner->>CDP: navigate(url)

        opt waitFor configured
            Runner->>CDP: waitForSelector / waitForText
        end

        Runner->>Ctx: new RecordingContext()
        Runner->>TL: new InteractionTimeline(width, height, opts)
        Runner->>Ctx: setTimeline(timeline)
        Runner->>Rec: new Recorder(width, height, opts)
        Runner->>Rec: setTimeline(timeline)
        Runner->>Rec: start(client, outputPath, ctx)
        Rec->>FFmpeg: spawn ffmpeg (image2pipe stdin)
        Rec->>Rec: captureLoop begins

        loop Capture Loop (parallel)
            Rec->>TL: tick()
            Rec->>CDP: Page.captureScreenshot({ format: jpeg })
            CDP-->>Rec: base64 frame data
            Rec->>FFmpeg: write frame to stdin pipe
        end

        loop For each Step
            Runner->>CDP: execute step (click/type/scroll/drag/key/navigate)
            Runner->>Ctx: update cursor position, add events
        end

        Runner->>Rec: stop()
        Rec->>FFmpeg: close stdin pipe
        FFmpeg-->>Rec: temp MP4 written

        Runner->>Comp: compose(rawVideo, timelineData, outputPath, sfx)
        Comp-->>Runner: final output (MP4/WebM/GIF with overlays)

        Runner->>Chrome: kill()
    end
```

---

## 2. Demo Markdown Render Pipeline (`webreel render`)

The render pipeline processes Demo Markdown scripts (`.md` files) through the parser, scene orchestrator, surfaces, and video assembler. The parser converts Markdown into a DemoScript IR. The SceneOrchestrator iterates over acts and scenes, creating surfaces via a registry, executing actions, and capturing frames. The VideoAssembler handles encoding to the target format(s) with optional transitions, chapters, and subtitles.

```mermaid
sequenceDiagram
    participant CLI as CLI (render command)
    participant CI as CI Detector
    participant SO as SceneOrchestrator
    participant Parser as Parser (@webreel/director)
    participant Cache as SceneCache
    participant Hasher as SceneHasher
    participant SR as SurfaceRegistry
    participant Surface as Surface (browser/terminal/title)
    participant NE as NarrationEngine
    participant VA as VideoAssembler
    participant FFmpeg as FFmpeg

    CLI->>CI: detectCI()
    CI-->>CLI: CIEnvironment { isCI, provider }
    CLI->>SR: createDefaultSurfaceRegistry()
    CLI->>SO: new SceneOrchestrator(registry, renderConfig)
    CLI->>SO: render(options)

    SO->>SO: readFile(scriptPath)
    SO->>Parser: parse(scriptContent)
    Parser-->>SO: DemoScript { meta, acts[] }
    SO->>Hasher: hashScript(script)
    Hasher-->>SO: scriptHash

    opt Cache enabled
        SO->>Cache: listHashes(scriptHash)
        Cache-->>SO: Map of sceneName to hash
    end

    loop For each Act
        loop For each Scene
            SO->>Hasher: hashScene(scene)
            Hasher-->>SO: sceneHash

            alt Cache hit (hash matches)
                SO->>Cache: read(scriptHash, sceneName)
                Cache-->>SO: CachedScene { videoPath }
                SO->>SO: load cached video data
            else Cache miss (new or modified)
                SO->>SR: create(surfaceConfig)
                SR-->>SO: Surface instance

                SO->>Surface: setup(config)
                SO->>Surface: captureFrame() [initial]

                loop For each Action
                    SO->>Surface: execute(action, context)
                    Surface-->>SO: result { captures }
                    SO->>Surface: captureFrame()
                    Surface-->>SO: frame Buffer
                end

                SO->>Surface: captureFrame() [final hold frames]
                SO->>Surface: teardown()

                opt Cache enabled
                    SO->>Cache: write(scriptHash, sceneName, { video, hash })
                end
            end
        end
    end

    SO->>SO: parseFormats(format) -- e.g. ["mp4", "webm", "gif"]

    loop For each output format
        SO->>VA: assembleVideo(results, script, options, config, ffmpegPath)
        VA->>VA: resolveTransitions(sceneTransitions)
        VA->>VA: writeChapterMetadata (if MP4 + chapters)

        alt Has non-cut transitions
            VA->>FFmpeg: encode per-scene MP4 segments
            VA->>FFmpeg: apply xfade filter_complex
        else Direct frame concat
            VA->>FFmpeg: buildFfmpegArgs + runFfmpeg
        end

        FFmpeg-->>VA: output file (mp4/webm/gif)

        opt Subtitles requested
            VA->>VA: generateSRT + generateVTT
        end

        VA-->>SO: outputPath
    end

    SO-->>CLI: outputPaths[]
```

---

## 3. TTS Narration Flow

The narration engine orchestrates text-to-speech generation through a provider registry. It preprocesses narration blocks into sentence-level segments, checks a disk-based cache (keyed by SHA-256 of text + voice + speed), and delegates to the appropriate TTS provider on cache miss. Supported providers include Kokoro (local model), OpenAI TTS, ElevenLabs, Piper (subprocess), and HTTP (generic REST endpoint). Generated audio is cached as WAV files for reuse.

```mermaid
sequenceDiagram
    participant SO as SceneOrchestrator
    participant NE as NarrationEngine
    participant PP as TextPreprocessor
    participant Cache as TTSCache (disk)
    participant Reg as TTSProviderRegistry
    participant Provider as TTSProvider (Kokoro/OpenAI/ElevenLabs/Piper/HTTP)
    participant TA as TimelineAssembler

    SO->>NE: generateTimeline(narrationBlocks)
    NE->>PP: preprocessNarration(blocks, config)
    PP-->>NE: PreprocessedSegment[] (text, speed, isPause, isDeferred)

    loop For each segment
        alt Pause segment
            NE->>NE: create silent segment (duration only)
        else Deferred segment ([read_output:name])
            NE->>NE: estimateDurationMs(text) -- 150 WPM estimate
        else Normal segment
            NE->>Cache: getCacheKey(text, voice, speed)
            Cache-->>NE: sha256 hex key
            NE->>Cache: get(key)

            alt Cache hit
                Cache-->>NE: TTSResult { audio: Buffer, durationMs }
            else Cache miss
                NE->>NE: ensureProvider()

                opt First call (lazy init)
                    NE->>Reg: create(providerName)
                    Reg-->>NE: TTSProvider instance
                    NE->>Provider: initialize()
                end

                NE->>Provider: generate(text, { voice, speed })

                alt API-based provider (OpenAI, ElevenLabs, HTTP)
                    Provider->>Provider: HTTP POST to TTS API
                    Provider-->>NE: TTSResult { audio, durationMs }
                else Local model (Kokoro)
                    Provider->>Provider: load model, run inference
                    Provider->>Provider: PCM to WAV conversion
                    Provider-->>NE: TTSResult { audio, durationMs }
                else Subprocess (Piper)
                    Provider->>Provider: spawn piper process, pipe text
                    Provider->>Provider: PCM to WAV conversion
                    Provider-->>NE: TTSResult { audio, durationMs }
                end

                NE->>Cache: set(key, result, { voice, speed, text })
                Note over Cache: Write {key}.wav + {key}.json atomically
            end
        end
    end

    NE->>TA: assembleTimeline(generatedSegments, config)
    TA-->>NE: NarrationTimeline { segments[], totalDurationMs }
    NE-->>SO: NarrationTimeline

    opt Deferred segments need resolution
        SO->>NE: resolveDeferred(timeline, capturedValues)
        loop For each deferred segment
            NE->>NE: replace [read_output:name] placeholders
            NE->>Provider: generate(resolvedText, { voice, speed })
            Provider-->>NE: TTSResult
        end
        NE->>TA: assembleTimeline(resolvedSegments, config)
        TA-->>NE: updated NarrationTimeline
        NE-->>SO: resolved NarrationTimeline
    end
```

---

## 4. LLM Authoring Pipeline (`webreel author`)

The authoring pipeline generates Demo Markdown scripts from YAML brief files using an LLM provider. It supports three modes: brief-to-draft generation, interactive brief building, and iterative script refinement. The core generation uses a self-healing loop that parses and validates LLM output, retrying with error feedback on failure. Optional pacing analysis checks timing and narration density.

```mermaid
sequenceDiagram
    participant CLI as CLI (author command)
    participant Reg as LLMProviderRegistry
    participant Resolver as resolveProvider
    participant Provider as LLMProvider (Anthropic/OpenAI)
    participant PL as PromptLoader
    participant GAV as generateAndValidate
    participant Parser as Parser
    participant PA as PacingAnalysis
    participant User as User (stdin)

    CLI->>Reg: new LLMProviderRegistry()
    CLI->>Reg: registerDefaultProviders(registry)
    CLI->>Resolver: resolveProvider(config, registry)
    Resolver-->>CLI: { providerName, model }
    CLI->>Reg: create(providerName)
    Reg-->>CLI: LLMProvider instance
    CLI->>Provider: initialize()

    alt Brief mode (--brief path.yaml)
        CLI->>CLI: readFile(briefPath) + parseYaml
        CLI->>PL: loadPrompt("demo-markdown-spec")
        PL-->>CLI: spec template
        CLI->>PL: loadPrompt("brief-to-draft", { demo_markdown_spec })
        PL-->>CLI: system prompt
        CLI->>CLI: formatBrief(brief) -- user prompt

        CLI->>GAV: generateAndValidate(provider, userPrompt, llmOptions)

        loop Retry loop (max 3 attempts)
            GAV->>Provider: generate(prompt, options)
            Provider-->>GAV: { text } (streaming response)
            GAV->>GAV: extractMarkdown(text) -- strip code fences

            GAV->>Parser: parse(markdown)

            alt Valid Demo Markdown
                Parser-->>GAV: DemoScript
                GAV-->>CLI: GenerateResult { script, markdown, attempts }
            else Parse/validation error
                Parser-->>GAV: Error
                GAV->>GAV: buildRetryPrompt(original, failed, error)
                Note over GAV: Retry with error feedback appended
            end
        end

    else Refinement mode (--script path.md)
        CLI->>CLI: readFile(scriptPath)
        CLI->>User: display script preview

        loop Refinement loop
            User->>CLI: feedback text (or "done" to exit)

            alt User typed "done"/"quit"/"exit"
                CLI->>CLI: break loop
            else Feedback provided
                CLI->>PL: loadPrompt("script-refinement", { spec, script, feedback })
                PL-->>CLI: system prompt
                CLI->>GAV: generateAndValidate(provider, prompt, options)
                GAV-->>CLI: RefinementResult { markdown, diff, attempts }
                CLI->>CLI: generateDiff(old, new)
                CLI->>CLI: display diff
            end
        end

    else Interactive mode (no flags)
        CLI->>User: promptForBrief() -- product, audience, messages, etc.
        User-->>CLI: Brief fields
        Note over CLI: Same flow as brief mode from here
    end

    opt --analyze flag
        CLI->>Parser: parse(outputMarkdown)
        Parser-->>CLI: DemoScript
        CLI->>PA: analyzePacing(script)
        PA->>PA: estimateSceneDuration (narration WPM + action time)
        PA->>PA: checkNarrationDuration, checkDeadAir, checkActionDensity
        PA->>PA: checkActDuration, checkTotalDuration
        PA-->>CLI: PacingReport { issues, passed, sceneDurations }
        CLI->>CLI: displayPacingReport(report)
    end

    CLI->>Provider: dispose()
    CLI->>CLI: writeFile(outputPath, markdown)
```

---

## 5. CI Rendering Flow

When webreel runs in a CI environment, it detects the CI provider, applies safe configuration defaults (Chrome sandbox flags, extended timeouts, viewport overrides), and disables scene caching by default since CI caches are often ephemeral. This flow shows the detection and configuration sequence before rendering begins.

```mermaid
sequenceDiagram
    participant CLI as CLI (render command)
    participant Detect as detectCI()
    participant Config as getCIConfig()
    participant SO as SceneOrchestrator
    participant Chrome as Chrome (headless)
    participant Cache as SceneCache

    CLI->>Detect: detectCI()

    alt GITHUB_ACTIONS=true
        Detect-->>CLI: { isCI: true, provider: "github-actions" }
    else GITLAB_CI=true
        Detect-->>CLI: { isCI: true, provider: "gitlab-ci" }
    else CI=true or CI=1
        Detect-->>CLI: { isCI: true, provider: "generic" }
    else --ci flag forced
        CLI->>CLI: { isCI: true, provider: "forced" }
    else No CI detected
        Detect-->>CLI: { isCI: false, provider: "local" }
    end

    alt CI environment detected
        CLI->>Config: getCIConfig()
        Config-->>CLI: CIConfig

        Note over CLI: Chrome flags applied:<br/>--no-sandbox<br/>--disable-setuid-sandbox<br/>--disable-dev-shm-usage<br/>--disable-gpu<br/>--single-process

        Note over CLI: Timeout multiplier: 2x<br/>Viewport: 1920x1080<br/>Cache disabled by default

        CLI->>CLI: effectiveNoCache = true (CI default)
        CLI->>SO: new SceneOrchestrator(registry, renderConfig)
        CLI->>SO: render({ noCache: true, ... })

        SO->>Chrome: launchChrome({ flags: ciConfig.chromeFlags })
        Note over Chrome: Headless Chrome with<br/>CI-safe sandbox settings

        SO->>Cache: (skipped -- caching disabled)

        SO->>SO: Full render of all scenes
        SO-->>CLI: outputPaths[]
    else Local environment
        CLI->>SO: render({ noCache: false, ... })
        Note over SO: Normal render with caching enabled
    end
```

---

## 6. Watch Mode Flow

Both `webreel record` and `webreel render` support `--watch` mode for iterative development. The file watcher monitors config/script files for changes, debounces rapid edits (300ms default), and re-runs the recording or rendering pipeline. Concurrent execution protection ensures a new run does not start while the previous one is still in progress.

```mermaid
sequenceDiagram
    participant User as User (editor)
    participant FS as File System (fs.watch)
    participant FW as FileWatcher
    participant Timer as Debounce Timer
    participant Pipeline as Record/Render Pipeline

    Note over FW: watchAndRerun(paths, callback, { debounceMs: 300 })

    FW->>FS: watch(configPath)
    FW->>FS: watch(scriptPath)
    FW->>FS: watch(includePaths...)
    Note over FW: Initial run completes, watching for changes

    User->>FS: Save file change
    FS->>FW: onChange event

    FW->>Timer: clearTimeout (if pending)
    FW->>Timer: setTimeout(300ms)

    User->>FS: Another save (rapid edit)
    FS->>FW: onChange event
    FW->>Timer: clearTimeout (previous)
    FW->>Timer: setTimeout(300ms) -- reset debounce

    Note over Timer: 300ms passes with no more changes

    Timer->>FW: debounce fires

    alt No run in progress
        FW->>Pipeline: callback() -- async
        Note over Pipeline: Re-record or re-render

        opt Config changed includes
            Pipeline->>FW: handle.updatePaths(newPaths)
            FW->>FS: close old watchers
            FW->>FS: watch(newPaths)
        end

        Pipeline-->>FW: complete
        Note over FW: runInProgress = null

    else Run already in progress
        Note over FW: Change queued -- will trigger<br/>after current run completes
    end

    opt User presses Ctrl+C
        FW->>FW: SIGINT handler
        FW->>Timer: clearTimeout
        FW->>FS: close all watchers

        alt Run in progress
            FW->>Pipeline: await runInProgress
            Note over FW: Wait for current run to finish
        end

        FW->>FW: process.exit(0)
    end
```

---

## 7. Multi-Format Output Flow

When multiple output formats are requested (e.g., `--format mp4,webm,gif`), the render pipeline produces one output file per format from the same set of rendered frames. The format string is parsed and deduplicated by `parseFormats()`. Each format is encoded sequentially through the video assembler. Subtitles are generated only once alongside the first format.

```mermaid
sequenceDiagram
    participant SO as SceneOrchestrator
    participant FU as parseFormats()
    participant VA as VideoAssembler
    participant FFmpeg as FFmpeg
    participant SubGen as SubtitleGenerator
    participant ChGen as ChapterGenerator

    SO->>FU: parseFormats("mp4,webm,gif", defaultFormat)
    FU->>FU: split(","), trim, deduplicate
    FU-->>SO: ["mp4", "webm", "gif"]

    loop For each format (i = 0, 1, 2)
        SO->>SO: resolveOutputPath(outputPath, format)
        Note over SO: Replace extension: output.mp4, output.webm, output.gif

        SO->>VA: assembleVideo(results, script, options, config, ffmpegPath)

        alt format = "html"
            VA->>VA: assembleHtmlOutput (see diagram 9)
        else format = "mp4"
            opt chapters requested (default for MP4)
                VA->>ChGen: extractChapters(script, durations)
                ChGen-->>VA: Chapter[]
                VA->>ChGen: generateFfmpegChapterMetadata(chapters, totalMs)
                ChGen-->>VA: ffmetadata.txt content
                VA->>VA: writeFile(tempDir/ffmetadata.txt)
            end

            VA->>FFmpeg: buildFfmpegArgs(frames, output.mp4, fps, "mp4", crf, preset, metadata)
            FFmpeg-->>VA: output.mp4

        else format = "webm"
            VA->>FFmpeg: buildFfmpegArgs(frames, output.webm, fps, "webm", crf, preset)
            FFmpeg-->>VA: output.webm

        else format = "gif"
            VA->>FFmpeg: buildFfmpegArgs(frames, output.gif, fps, "gif", crf, preset)
            FFmpeg-->>VA: output.gif
        end

        opt Subtitles requested AND i = 0 (first format only)
            VA->>SubGen: buildSubtitleSegments(results, fps)
            SubGen-->>VA: SubtitleSegment[]
            VA->>SubGen: generateSRT(segments)
            SubGen-->>VA: SRT string
            VA->>SubGen: generateVTT(segments)
            SubGen-->>VA: VTT string
            VA->>VA: writeFile(output.srt)
            VA->>VA: writeFile(output.vtt)
        end

        VA-->>SO: outputPath
    end

    SO-->>SO: outputPaths = ["output.mp4", "output.webm", "output.gif"]
```

---

## 8. Scene Caching Flow

The scene cache enables incremental re-rendering by storing per-scene video segments keyed by content hash. On each render, the scene hasher computes a SHA-256 of the scene's content (surface config, narration, actions, transitions). If the hash matches a cached entry, the cached video is loaded directly. On cache miss, the scene is fully rendered and the result is written to cache with atomic write semantics (temp directory then rename) to prevent corruption from interrupted writes.

```mermaid
sequenceDiagram
    participant SO as SceneOrchestrator
    participant Hasher as SceneHasher
    participant Cache as SceneCache
    participant FS as File System
    participant Surface as Surface
    participant FFmpeg as FFmpeg

    SO->>Hasher: hashScript(script)
    Note over Hasher: SHA-256 of { title, viewport, theme, output }
    Hasher-->>SO: scriptHash

    SO->>Cache: listHashes(scriptHash)
    Cache->>FS: readdir(~/.webreel/cache/scenes/{scriptHash}/)
    Cache->>FS: read hash.txt from each scene subdirectory
    FS-->>Cache: Map of sceneName to storedHash
    Cache-->>SO: cachedHashes

    loop For each scene in script
        SO->>Hasher: hashScene(scene)
        Note over Hasher: SHA-256 of { surface, narration,<br/>actions, transitions, durationHint }
        Hasher-->>SO: currentHash

        alt cachedHashes.get(sceneName) === currentHash
            Note over SO: Cache HIT
            SO->>Cache: read(scriptHash, sceneName)
            Cache->>FS: readFile(scene.mp4)
            FS-->>Cache: video Buffer
            Cache-->>SO: CachedScene { videoPath, hash }
            SO->>SO: use cached video data (skip render)

        else Hash mismatch or not found
            Note over SO: Cache MISS
            SO->>Surface: setup(config)
            SO->>Surface: execute actions + captureFrame()
            Surface-->>SO: frames[]
            SO->>Surface: teardown()

            Note over SO: Write to cache (atomic)
            SO->>FS: mkdtemp(webreel-cache-{uuid})
            SO->>FFmpeg: encode frames to scene.mp4 in tempDir
            SO->>FS: writeFile(tempDir/scene.mp4)
            SO->>FS: writeFile(tempDir/hash.txt, currentHash)
            SO->>FS: rm(existing cache entry)
            SO->>FS: rename(tempDir, cacheDir/{scriptHash}/{sceneName})
            Note over FS: Atomic move prevents partial writes
        end
    end
```

---

## 9. Interactive HTML Output Flow

When the output format is `html`, the assembler produces a self-contained HTML file with an embedded video player. Frames are first encoded to a temporary MP4 via ffmpeg, then the MP4 is read and base64-encoded. Chapter markers are extracted from the script's act/scene structure, and subtitle segments are built from narration blocks. Everything is injected into an HTML template that includes a video player with chapter navigation and subtitle display, requiring zero external dependencies.

```mermaid
sequenceDiagram
    participant VA as VideoAssembler
    participant FFmpeg as FFmpeg
    participant FS as File System
    participant ChGen as ChapterGenerator
    participant SubGen as SubtitleGenerator
    participant HtmlGen as HtmlGenerator
    participant Template as HtmlPlayerTemplate

    VA->>VA: format = "html" detected
    VA->>FS: mkdtemp(webreel-html-{random})
    FS-->>VA: tempDir path

    Note over VA: Step 1: Encode frames to temporary MP4
    VA->>VA: assembleDirectFrames(results, tempDir, tempMp4, config)

    loop Write all frames to tempDir
        VA->>FS: writeFile(frame_000001.png, frameBuffer)
    end

    VA->>FFmpeg: buildFfmpegArgs(frame_%06d.png, video.mp4, fps, "mp4", crf, preset)
    FFmpeg-->>VA: tempDir/video.mp4 written

    Note over VA: Step 2: Compute scene durations
    VA->>VA: sceneDurations = Map of sceneName to durationMs

    Note over VA: Step 3: Build subtitle segments
    VA->>SubGen: buildSubtitleSegments(results, fps)
    SubGen-->>VA: SubtitleSegment[] (startMs, endMs, text)

    Note over VA: Step 4: Generate interactive HTML
    VA->>HtmlGen: generateInteractiveHTML({ videoPath, script, durations, subtitles })

    HtmlGen->>FS: readFile(tempDir/video.mp4)
    FS-->>HtmlGen: video Buffer

    HtmlGen->>HtmlGen: videoBase64 = buffer.toString("base64")

    HtmlGen->>ChGen: extractChapters(script, sceneDurations)
    ChGen-->>HtmlGen: Chapter[] { title, startMs }

    HtmlGen->>Template: generateHtmlPlayer({ videoBase64, mimeType, title, chapters, subtitles })

    Note over Template: Embeds video as data:video/mp4;base64,...<br/>Injects chapter navigation controls<br/>Injects subtitle overlay display<br/>Self-contained -- zero external deps

    Template-->>HtmlGen: complete HTML document string
    HtmlGen-->>VA: HTML string

    VA->>FS: writeFile(outputPath, html)
    VA->>FS: rm(tempDir, { recursive: true })

    VA-->>VA: outputPath (e.g., demo.html)
```
