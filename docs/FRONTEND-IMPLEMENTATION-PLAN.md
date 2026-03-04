# webreel studio — Frontend Implementation Plan

> Product design & architecture for the webreel studio web UI.
> Status: **Planning** | Created: 2026-03-03

## Context

Phases 1-6 are complete. webreel has a fully functional CLI pipeline: Demo Markdown parser, 6 surface types, LLM-powered script authoring, 5 TTS providers, video rendering to MP4/WebM/GIF, subtitles, chapters, narration audio, scene caching. **862 tests, all passing.**

The problem: everything is CLI-driven. A developer who wants to create a demo video must learn Demo Markdown syntax, manually write scripts, run terminal commands, and iterate via text-based feedback loops. There's no visual interface, no project understanding, no guided workflow.

**webreel studio** is the product layer on top of the engine -- a local web app where developers point it at their project, have a conversation about what demo to create, and click a button to generate the video.

---

## 1. First Principles: Who Uses This and Why

### User Personas

**Indie Developer / Startup Founder**

- Building a product, needs to show it to investors/users
- Triggers: launch day, Product Hunt post, investor deck, blog post
- Tolerance for setup: low. Wants it to "just work"
- Success: polished 60-second video in under 10 minutes

**DevRel / Developer Advocate**

- Creates demos for docs, conference talks, tutorials
- Triggers: new feature release, docs update, conference prep
- Tolerance for setup: moderate. Comfortable with CLI but prefers GUI
- Success: library of demos that stay updated as the product changes

**Enterprise Product Team**

- Marketing + engineering collaborate on demo content
- Triggers: sales enablement, customer onboarding, quarterly releases
- Tolerance for setup: needs IT-friendly distribution (Docker)
- Success: consistent, on-brand demos across the org

### The Core Insight

Developers already know what their app does. They just can't easily translate that knowledge into a scripted video. The LLM bridges this gap -- it understands the project, asks the right questions, and generates the script. The developer's job is to approve and refine, not to author from scratch.

---

## 2. The Developer Experience

### 2.1 Entry Point

```bash
cd ~/my-project
webreel studio
```

This:

1. Starts a local HTTP server on port 4747
2. Opens `http://localhost:4747` in the default browser
3. Auto-detects the project in the current directory

That's it. One command. No config files, no setup wizard, no account creation.

**First-run experience**: If no API keys are configured, studio shows a setup banner: "Add an LLM API key to enable AI-powered authoring" with links to get keys from Anthropic/OpenAI. Works without keys too -- just no LLM features (manual script editing only).

### 2.2 Discovery Phase (Automatic)

When studio starts, it silently analyzes the project directory:

**What it reads:**

- `package.json` / `Cargo.toml` / `pyproject.toml` / `go.mod` -- tech stack, project name, description
- `README.md` -- product description, features, usage examples
- Directory structure -- detect patterns (src/api = has backend, src/components = has frontend)
- `Dockerfile` / `docker-compose.yml` -- how to run the app
- `.env.example` / config files -- what services the app needs
- `scripts` in package.json -- dev server commands (`npm run dev`, `npm start`)
- Existing webreel scripts -- prior demos to build on

**What it infers:**

- **Project type**: web app, CLI tool, API service, mobile app, desktop app, library
- **Tech stack**: React, Next.js, Express, Python/FastAPI, Rust CLI, etc.
- **How to start it**: the dev server command, what port it runs on
- **Recommended surfaces**: browser (web apps), terminal (CLI tools), composite (full-stack)
- **Key features**: extracted from README sections, CLI help text, route definitions

**What it presents:**

The studio opens with a discovery summary card:

```
my-saas-app
   Next.js 14 + PostgreSQL + Stripe

   Detected:
   - Web app running on port 3000 (npm run dev)
   - 12 API routes, 8 page routes
   - Auth system (NextAuth)
   - Billing integration (Stripe)

   Suggested demo surfaces: browser, terminal

   [Looks right] [Let me correct this]
```

User confirms or corrects via the chat. This becomes the context for all subsequent LLM interactions.

### 2.3 Guided Conversation Phase

After discovery confirmation, the chat transitions to a guided flow:

**Step 1: What's the goal?**

```
What kind of demo are you creating?

- Product walkthrough -- show the main features
- Feature spotlight -- deep-dive on one feature
- Getting started -- show how to set up and use
- Bug fix / changelog -- show what changed
- Custom -- tell me what you need
```

**Step 2: Who's watching?**

```
Who's the audience?

- Developers (technical, show code/terminal)
- End users (non-technical, focus on UI)
- Investors (business value, polished)
- Internal team (detailed, documentation-style)
```

**Step 3: Specifics (LLM-driven)**

The LLM now asks targeted questions based on discovery + goals:

```
Based on your Next.js app, I'd suggest showing:

1. The landing page and sign-up flow
2. The dashboard with real-time data
3. The Stripe billing integration

For a 90-second product walkthrough, I'd focus on items 1 and 2.
Should I draft that, or do you want to adjust?
```

**Step 4: Free-form refinement**

User can now chat naturally:

- "Actually, skip the sign-up -- go straight to the dashboard"
- "Add a terminal scene showing the CLI deployment"
- "Make the narration more casual"
- "The intro should be shorter, like 5 seconds"

### 2.4 Script Preview & Editing

The UI has a split layout:

```
+---------------------+----------------------+
|                     |                      |
|   Chat Panel        |   Script Preview     |
|                     |                      |
|   [conversation]    |   [Demo Markdown]    |
|   [conversation]    |   with syntax        |
|   [conversation]    |   highlighting       |
|                     |                      |
|   [message input]   |   [Edit] [Plan] [>]  |
|                     |                      |
+---------------------+----------------------+
```

- **Chat panel** (left): conversational authoring + refinement
- **Script panel** (right): live-updating Demo Markdown with syntax highlighting
- **Edit button**: toggles the script panel into an editable code editor
- **Plan button**: runs dry-run, shows execution plan (surfaces, actions, timing)
- **Record button (>)**: starts rendering

### 2.5 Recording Phase

User clicks **Record**. The UI transitions to a progress view:

```
Recording...

Act 1: Introduction
  [done] Scene 1: Title Card .............. 2.1s (30 frames)
  [>>]   Scene 2: Dashboard .............. [capturing...]
           Action 3/7: click "Analytics"
  [    ]  Scene 3: Terminal Deploy

Progress: ========----  2/3 scenes  |  ETA: 45s
                                         [Cancel]
```

Real-time updates via Server-Sent Events (SSE). Each scene reports:

- Status: pending / capturing / encoding / cached / done
- Frame count and timing
- Current action being executed
- Whether narration TTS is generating

### 2.6 Post-Production

When recording completes, the video player appears inline:

```
+----------------------------------------------+
|                                              |
|            [Video Player]                    |
|                                              |
|  > 0:00 -----*-------------- 1:32           |
|                                              |
|  Scene 1: Title   Scene 2: Dashboard   ...   |
|                                              |
|  [Re-render Scene 2]  [Export]  [Share]       |
|                                              |
+----------------------------------------------+
```

- **Chapter markers** below the timeline (clickable)
- **Re-render individual scenes** (uses scene cache -- only re-renders what changed)
- **Export**: MP4 / WebM / GIF / HTML player / with subtitles
- **Share**: copy embed code, download link

### 2.7 Iteration Loop

After watching, user goes back to chat:

- "The dashboard scene is too fast, add a 2-second pause after the click"
- "Can you add narration to scene 3?"
- "Switch the terminal scene to a dark theme"

LLM updates the script, user re-records, watches again. Scene caching makes re-renders fast (only changed scenes re-render).

---

## 3. Technical Architecture

### 3.1 Package Structure

```
apps/
  studio/                    # NEW -- Next.js app for studio UI
    src/
      app/
        page.tsx             # Main studio interface
        layout.tsx           # Root layout
        api/
          discover/route.ts  # POST -- project discovery
          chat/route.ts      # POST -- LLM conversation (streaming)
          render/route.ts    # POST -- start render job
          render/[id]/       # GET -- render progress (SSE)
          script/route.ts    # GET/PUT -- current script
          export/route.ts    # POST -- export video
      components/
        chat/                # Chat panel components
        editor/              # Script editor components
        player/              # Video player components
        progress/            # Render progress components
        discovery/           # Discovery summary components
      lib/
        discovery.ts         # Project analyzer
        session.ts           # In-memory session state
        render-worker.ts     # Background render orchestration
```

### 3.2 Backend: Next.js API Routes

The studio backend is a thin API layer that wraps existing webreel packages:

**`POST /api/discover`** -- Analyze the project directory

- Input: `{ projectPath: string }`
- Calls new `ProjectDiscovery` module
- Returns: `{ name, type, techStack, devCommand, port, features, suggestedSurfaces }`

**`POST /api/chat`** -- LLM conversation (streaming response)

- Input: `{ messages: ChatMessage[], discoveryContext: DiscoveryResult, currentScript?: string }`
- Delegates to `@webreel/director` LLM providers
- Streams response tokens via ReadableStream
- When script is generated/updated, includes it as a structured tool call response
- Reuses: `generateDraft()`, `refineScript()` from `@webreel/director`

**`POST /api/render`** -- Start a render job

- Input: `{ script: string, options: { format, subtitles, chapters, voice } }`
- Writes script to temp file, invokes `SceneOrchestrator.render()`
- Returns: `{ jobId: string }`
- Runs render in background (not blocking the request)

**`GET /api/render/[id]`** -- Stream render progress (SSE)

- Returns Server-Sent Events with per-scene progress
- Events: `scene:start`, `scene:progress`, `scene:complete`, `render:complete`, `render:error`
- Wraps `SceneOrchestrator` with progress callbacks

**`GET /api/script`** -- Get current script
**`PUT /api/script`** -- Update script (from editor)

**`POST /api/export`** -- Export in different format

- Input: `{ jobId, format, subtitles }`
- Re-encodes from cached frames if format differs

### 3.3 Project Discovery Module

New module: `apps/studio/src/lib/discovery.ts` (~200 lines)

```typescript
interface DiscoveryResult {
  name: string;
  description: string;
  projectType: "web-app" | "cli" | "api" | "library" | "desktop" | "mobile" | "unknown";
  techStack: string[]; // e.g., ["next.js", "typescript", "postgresql"]
  devCommand: string | null; // e.g., "npm run dev"
  devPort: number | null; // e.g., 3000
  features: string[]; // extracted from README
  suggestedSurfaces: string[]; // e.g., ["browser", "terminal"]
  readme: string | null; // truncated README content for LLM context
  hasExistingScripts: boolean; // .md files with webreel front matter
}
```

Discovery logic:

1. Read manifest file (package.json / Cargo.toml / pyproject.toml)
2. Detect framework from dependencies (next = Next.js, express = Express, etc.)
3. Parse scripts for dev command (look for "dev", "start", "serve")
4. Read README.md (first 2000 chars for LLM context)
5. Scan for existing `.md` files with webreel front matter
6. Map tech stack to surface recommendations

### 3.4 Session State

Simple in-memory state per studio session (no database for Phase 1):

```typescript
interface StudioSession {
  id: string;
  projectPath: string;
  discovery: DiscoveryResult;
  messages: ChatMessage[];
  currentScript: string | null;
  renderJobs: Map<string, RenderJob>;
}
```

Lost on server restart -- acceptable for local dev tool. Phase 2 adds SQLite persistence.

### 3.5 Render Worker

Wraps `SceneOrchestrator` with progress reporting:

```typescript
class RenderWorker {
  // Starts render in background, returns job ID
  async start(script: string, options: RenderOptions): Promise<string>;

  // Subscribe to progress events (SSE)
  subscribe(jobId: string): ReadableStream<RenderEvent>;

  // Cancel a running render
  cancel(jobId: string): void;

  // Get result video path
  getResult(jobId: string): string | null;
}
```

Progress events are generated by hooking into the orchestrator's scene loop. The orchestrator already logs per-scene timing -- we add an event emitter callback.

### 3.6 LLM Chat Integration

The chat API route manages conversation state and tool use:

**System prompt** includes:

- Discovery context (project type, tech stack, features)
- Demo Markdown format specification (from existing `demo-markdown-spec.md` prompt)
- Brief-to-draft guidelines (from existing `brief-to-draft.md` prompt)
- Current script state (if any)

**Tool calls** the LLM can make:

- `generate_script` -- produce a complete Demo Markdown script
- `update_script` -- modify the current script based on feedback
- `analyze_pacing` -- check timing and suggest improvements

This reuses the existing `@webreel/director` prompt templates and the `generateAndValidate` pipeline (parse + retry on error).

---

## 4. Distribution Strategy

### Phase 1: Local Dev Tool (Now)

```bash
cd ~/my-project
npx webreel studio
# or after global install:
webreel studio
```

**Requirements**: Node.js 18+, Chrome (auto-downloaded), ffmpeg (auto-downloaded)
**API keys**: User provides in `.env` file or studio setup screen
**Data**: All local -- scripts in project dir, videos in project dir, cache in `.webreel/`

### Phase 2: Docker Distribution (3-6 months)

```bash
docker run -it --rm \
  -p 4747:4747 \
  -v $(pwd):/project \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  webreel/studio
```

**Bundles**: Node.js + Chrome + ffmpeg + Piper (local TTS) -- zero system requirements
**Value prop**: "Works on any machine with Docker, no setup"
**Enterprise**: Self-hosted, data never leaves your infra

### Phase 3: Cloud SaaS (6-12 months)

**studio.webreel.dev** -- hosted version

- GitHub/GitLab repo connection (clone + analyze)
- Cloud rendering (GPU instances for fast encoding)
- Team features (shared demos, brand templates, approval workflows)
- CDN-hosted output videos with embed codes

### Monetization Model

| Tier           | Price  | Features                                                            |
| -------------- | ------ | ------------------------------------------------------------------- |
| **Free**       | $0     | CLI only, manual script writing, MP4 output, 1 format               |
| **Studio**     | $29/mo | Studio UI, LLM authoring, all formats, TTS narration, scene caching |
| **Team**       | $99/mo | Everything + shared workspaces, brand templates, priority rendering |
| **Enterprise** | Custom | Docker distribution, SSO, audit logs, dedicated support             |

**Upgrade triggers in UX:**

- Free user tries `webreel studio` -- prompted to add API key -- works with their own key (free tier)
- Studio features that gate: project discovery, conversational authoring, one-click recording
- Export to WebM/GIF, narration, subtitle generation gate behind Studio tier
- Team sharing and templates gate behind Team tier

---

## 5. Implementation Phases

### Phase 7A: Studio Foundation (~2 sessions)

1. Create `apps/studio` -- Next.js app scaffolding
2. `webreel studio` CLI command -- starts the dev server, opens browser
3. Project discovery module -- analyzes `cwd()` on startup
4. Basic chat API route -- wraps `@webreel/director` LLM with streaming
5. Basic render API route -- wraps `SceneOrchestrator` with SSE progress
6. Minimal UI -- chat panel + script preview + record button

### Phase 7B: Full Studio UX (~2-3 sessions)

1. Discovery summary card with confirm/correct flow
2. Guided wizard steps (goal, audience, specifics)
3. Split-pane layout: chat + script editor
4. Syntax-highlighted Demo Markdown editor (CodeMirror or Monaco)
5. Render progress UI with per-scene status
6. Inline video player with chapter markers
7. Per-scene re-render capability
8. Export dialog (format, subtitles, chapters)

### Phase 7C: Polish & Distribution (~1-2 sessions)

1. Docker image build pipeline
2. Setup/onboarding flow for API keys
3. Error handling and recovery (render failures, LLM errors)
4. Responsive design (works on different screen sizes)
5. Keyboard shortcuts
6. Session persistence (SQLite)

---

## 6. Critical Files to Modify/Create

| File                                        | Change                      | Notes                                 |
| ------------------------------------------- | --------------------------- | ------------------------------------- |
| `apps/studio/`                              | NEW -- entire Next.js app   | Main deliverable                      |
| `packages/webreel/src/index.ts`             | Add `studio` command        | CLI entry point                       |
| `packages/webreel/src/commands/studio.ts`   | NEW -- starts studio server | Spawns Next.js dev server             |
| `apps/studio/src/lib/discovery.ts`          | NEW -- project analyzer     | Reads manifests, READMEs, infers type |
| `apps/studio/src/lib/render-worker.ts`      | NEW -- background render    | Wraps SceneOrchestrator with events   |
| `apps/studio/src/app/api/chat/route.ts`     | NEW -- LLM streaming        | Wraps @webreel/director               |
| `apps/studio/src/app/api/render/route.ts`   | NEW -- render jobs          | Start/monitor renders                 |
| `apps/studio/src/app/api/discover/route.ts` | NEW -- discovery            | Project analysis endpoint             |

## 7. Existing Code to Reuse

| What                             | From                                                 | How                       |
| -------------------------------- | ---------------------------------------------------- | ------------------------- |
| `generateDraft()`                | `@webreel/director/src/authoring/brief-to-draft.ts`  | Chat to script generation |
| `refineScript()`                 | `@webreel/director/src/authoring/refinement.ts`      | Chat refinement rounds    |
| `analyzePacing()`                | `@webreel/director/src/authoring/pacing-analysis.ts` | Script validation         |
| `SceneOrchestrator`              | `packages/webreel/src/lib/scene-orchestrator.ts`     | Render execution          |
| `createDefaultSurfaceRegistry()` | `packages/webreel/src/lib/runner.ts`                 | Surface creation          |
| LLM providers                    | `@webreel/director/src/providers/`                   | Chat LLM backend          |
| Prompt templates                 | `@webreel/director/src/prompts/`                     | System prompts for chat   |
| `generateInteractiveHTML()`      | `packages/webreel/src/lib/html-generator.ts`         | Inline video player       |

---

## 8. Key Architecture Decisions

1. **Separate app, not embedded in docs** -- `apps/studio` is its own Next.js app. Clean separation. The docs site stays a docs site.
2. **Local-first, no database (Phase 1)** -- in-memory session state. Scripts saved to project directory. No auth. Acceptable for single-user local tool.
3. **API routes, not Express** -- Next.js API routes are sufficient. No separate backend server. One process to manage.
4. **SSE for render progress, not WebSocket** -- simpler, one-directional, native browser support. WebSocket is overkill for progress reporting.
5. **Streaming LLM responses** -- ReadableStream from API route, consumed by chat UI. Same pattern as ChatGPT/Claude web UIs.
6. **Discovery is read-only** -- never modifies the project. Just reads files and infers. User confirms everything before any action.
7. **Scripts saved to project dir** -- generated `.md` files live in the user's project (e.g., `demo.md`). Version-controlled with their code. Not hidden in an app database.

---

## 9. Verification Criteria

1. `webreel studio` opens browser to localhost:4747
2. Discovery correctly identifies project type from package.json/README
3. Chat conversation produces valid Demo Markdown scripts
4. Record button triggers render with real-time progress
5. Video plays inline after render completes
6. Re-rendering a single scene uses cache for unchanged scenes
7. Export produces MP4/WebM/GIF files in the project directory
8. Works without API keys (manual editing mode, no LLM features)
9. `pnpm build && pnpm type-check && pnpm test` -- all green
