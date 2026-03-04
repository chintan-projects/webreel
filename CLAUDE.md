# CLAUDE.md — webreel

Browser video recording tool. Automates headless Chrome to record scripted interactions, captures frames, applies cursor animations and keystroke overlays, encodes to MP4/GIF/WebM via ffmpeg.

## Key Paths

```
packages/
├── @webreel/core/       # Core recording engine (CDP, frame capture, compositing)
│   └── src/
│       ├── recorder.ts      # Main recording orchestration
│       ├── chrome.ts        # Chrome process management
│       ├── cdp.ts           # Chrome DevTools Protocol client
│       ├── actions.ts       # User action simulation (click, type, drag)
│       ├── compositor.ts    # Frame compositing with overlays
│       ├── cursor-motion.ts # Smooth cursor animation
│       ├── overlays.ts      # Keystroke/click visual overlays
│       ├── ffmpeg.ts        # Video encoding pipeline
│       ├── timeline.ts      # Action timeline scheduling
│       ├── media.ts         # Media file handling
│       ├── download.ts      # Chrome/ffmpeg binary management
│       └── types.ts         # Shared type definitions
├── webreel/             # CLI tool
│   └── src/
│       ├── index.ts         # CLI entry point (commander)
│       ├── config.ts        # JSONC config parser + schema validation
│       ├── commands/        # CLI subcommands
│       └── lib/             # CLI utilities
apps/
└── docs/                # Documentation site
examples/                # 15+ demo recording configs
scripts/                 # Build/sync scripts
```

## Commands

```bash
# Build all packages
pnpm build               # turbo run build

# Type checking
pnpm type-check           # turbo run type-check

# Tests
pnpm test                 # turbo run test (vitest)

# Lint + format
pnpm lint                 # eslint .
pnpm format               # prettier --write .
pnpm format:check         # prettier --check .

# Development
pnpm dev                  # turbo run dev

# Record examples
pnpm record-examples      # bash scripts/record-examples.sh

# Publishing
pnpm changeset            # create changeset
pnpm ci:version           # changeset version
pnpm ci:publish           # build + changeset publish
```

## Architecture

Monorepo managed by pnpm workspaces + Turborepo. Two main packages:

**@webreel/core** — The engine. Takes a recording config (JSON), launches headless Chrome via CDP, executes scripted actions (click, type, scroll, drag), captures frames via `Page.captureScreenshot`, composites cursor/keystroke overlays using `sharp`, and encodes to video via spawned `ffmpeg` process.

**webreel** (CLI) — User-facing CLI built with `commander`. Parses JSONC config files, validates against schema, delegates to `@webreel/core` for recording.

Key dependencies: `chrome-remote-interface` (CDP), `sharp` (image processing), `commander` (CLI), `vitest` (testing).

## Conventions

- TypeScript strict mode (`"strict": true`)
- ESM modules (`"type": "module"`)
- Prettier for formatting, ESLint for linting
- Changesets for versioning
- Husky + lint-staged for pre-commit hooks
