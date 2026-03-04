# @webreel/director

Demo Markdown parser and LLM authoring for webreel.

Parses Demo Markdown scripts into structured scene graph intermediate representations (IR) and provides LLM-powered script generation and refinement. The scene graph IR is the contract between the parser and all downstream systems (orchestrator, narrator, validators).

## Installation

```bash
npm install @webreel/director
```

Requires Node.js >= 18.

## Features

- **Demo Markdown parser** -- Parses YAML front matter, acts (H1), scenes (H2), surface configurations, narration blocks, action directives, duration hints, transitions, and dynamic references into a typed scene graph IR.
- **LLM providers** -- Built-in support for Anthropic, OpenAI, OpenRouter, Together AI, and Ollama, plus a generic OpenAI-compatible adapter for custom endpoints.
- **Authoring pipeline** -- Brief-to-draft generation, script refinement from feedback, rule-based and LLM-augmented pacing analysis, and post-render review.
- **Prompt template system** -- Markdown templates with `{{variable}}` substitution. User overrides via `~/.webreel/prompts/`, bundled defaults as fallback.
- **Script validation** -- Structural validation of parsed scripts: surface type checks, act/scene completeness, dynamic reference resolution, and known surface type verification.
- **Provider auto-detection** -- Scans environment variables in priority order to resolve the best available LLM provider without explicit configuration.

## Usage

### Parsing a Demo Markdown file

```ts
import { parse } from "@webreel/director";
import { readFileSync } from "node:fs";

const markdown = readFileSync("demo.md", "utf-8");
const script = parse(markdown);

console.log(script.meta.title);

for (const act of script.acts) {
  console.log(`Act: ${act.name}`);
  for (const scene of act.scenes) {
    console.log(`  Scene: ${scene.name} [${scene.surface.type}]`);
    console.log(`  Narration blocks: ${scene.narration.length}`);
    console.log(`  Actions: ${scene.actions.length}`);
  }
}
```

### Using the authoring pipeline

```ts
import {
  LLMProviderRegistry,
  registerDefaultProviders,
  resolveProvider,
  generateDraft,
} from "@webreel/director";
import type { Brief } from "@webreel/director";

// Set up the provider registry
const registry = new LLMProviderRegistry();
registerDefaultProviders(registry);

// Auto-detect provider from environment variables
const resolved = resolveProvider(registry, {
  provider: "",
  model: "",
  temperature: 0.7,
  maxTokens: 4096,
});
const provider = registry.create(resolved.providerName);
await provider.initialize();

// Define the demo brief
const brief: Brief = {
  product: "Acme Dashboard",
  audience: "DevOps engineers",
  duration: "2 minutes",
  tone: "technical",
  keyMessages: [
    "One-click deployment monitoring",
    "Real-time alerting with custom thresholds",
    "Integrates with existing CI/CD pipelines",
  ],
};

// Generate a draft script
const result = await generateDraft(provider, brief, {
  model: resolved.model,
  temperature: 0.7,
  maxTokens: 4096,
});

console.log(`Generated in ${result.attempts} attempt(s)`);
console.log(result.markdown);

await provider.dispose();
```

## Demo Markdown Format

Demo Markdown is a structured Markdown format with YAML front matter. Acts are `H1` headings, scenes are `H2` headings. Each scene declares a surface, contains narration (blockquotes), and lists action directives (bullet items).

```markdown
---
title: "My Demo"
duration: 2m
viewport: 1920x1080
narrator:
  voice: "alloy"
output:
  format: mp4
  fps: 30
---

# Act 1: Introduction

## Scene: Welcome (10s)

[surface:browser]
url: https://example.com

> Welcome to our product demo. Today we will walk through
> the key features of the dashboard.

- action: click
  selector: "#get-started"

- action: wait
  duration: 1s

## Scene: Feature Overview (20s)

[surface:browser]

> Here you can see the main dashboard with live metrics.

- action: scroll
  direction: down
  amount: 500

# Act 2: Deep Dive

## Scene: Terminal Demo (30s)

[surface:terminal]

> Let's deploy the application from the command line.

- action: run
  command: "npm run deploy"

- action: wait_for_output
  pattern: "deployed successfully"
  capture:
  - name: deploy_url
    pattern: "https://[\\S]+"

> The application is now live at [read_output:deploy_url].
```

Key elements:

- **Front matter** -- YAML metadata between `---` fences (title, duration, viewport, narrator config, output settings).
- **Acts** (`# Heading`) -- Top-level narrative groupings with optional duration hints (e.g., `(30s)`).
- **Scenes** (`## Heading`) -- Execution units targeting a single surface, with optional duration hints.
- **Surface config** (`[surface:type]`) -- Declares the surface type (browser, terminal, application, desktop, title, composite) with optional key-value parameters.
- **Narration** (`> text`) -- Blockquoted text sent to TTS. Supports `[read_output:name]` dynamic references.
- **Actions** (`- action: type`) -- Bullet list directives executed against the surface (click, type, run, scroll, wait, annotate, etc.).
- **Captures** -- Extract values from action output for use in subsequent narration via dynamic references.

## LLM Providers

| Provider    | Env Variable         | Default Model                        |
| ----------- | -------------------- | ------------------------------------ |
| Anthropic   | `ANTHROPIC_API_KEY`  | `claude-sonnet-4-20250514`           |
| OpenAI      | `OPENAI_API_KEY`     | `gpt-4o`                             |
| OpenRouter  | `OPENROUTER_API_KEY` | `anthropic/claude-sonnet-4-20250514` |
| Together AI | `TOGETHER_API_KEY`   | `meta-llama/Llama-3-70b-chat-hf`     |
| Ollama      | _(none, local)_      | `llama3.2`                           |

Provider auto-detection scans environment variables in the order listed above. If no API key is found, it falls back to Ollama (local, keyless). You can also use any OpenAI-compatible endpoint via `createLocalProvider(baseURL)`.

## API

### Parser

| Export                                                | Description                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `parse(input: string): DemoScript`                    | Parse a Demo Markdown string into a scene graph IR.          |
| `parseDuration(value: unknown): number \| undefined`  | Parse duration strings (`"30s"`, `"2m"`, `"1m30s"`).         |
| `parseViewport(value: unknown)`                       | Parse viewport strings (`"1920x1080"`) or objects.           |
| `parseSceneContent(lines, name, durationHint): Scene` | Parse scene body content from lines.                         |
| `extractDynamicRefs(text: string): string[]`          | Extract `[read_output:name]` references from narration text. |
| `validate(script: DemoScript): void`                  | Validate structural correctness of a parsed script.          |

### Types

| Export               | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| `DemoScript`         | Root IR node: front matter metadata + acts.                       |
| `Act`                | Top-level narrative grouping containing scenes.                   |
| `Scene`              | Execution unit: surface config + narration + actions.             |
| `ScriptMeta`         | Front matter metadata (title, duration, viewport, theme, output). |
| `NarrationBlock`     | Parsed narration text with dynamic references.                    |
| `ActionDirective`    | Parsed action with type, params, and captures.                    |
| `SceneSurfaceConfig` | Surface type and options as declared in the script.               |
| `TransitionConfig`   | Scene transition type and duration.                               |
| `CaptureSpec`        | Output capture rule (name, pattern, group).                       |

### LLM

| Export                               | Description                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `LLMProvider`                        | Provider interface: `generate()`, `stream()`, `initialize()`, `dispose()`.         |
| `LLMProviderRegistry`                | Registry for provider factories: `register()`, `create()`, `has()`, `providers()`. |
| `LLMOptions`                         | Generation options (model, maxTokens, temperature, systemPrompt).                  |
| `LLMResult`                          | Generation result (text, token usage).                                             |
| `AnthropicProvider`                  | Anthropic Claude provider implementation.                                          |
| `OpenAICompatibleProvider`           | Generic OpenAI-compatible provider.                                                |
| `resolveProvider(registry, config)`  | Auto-detect the best available provider from env vars.                             |
| `registerDefaultProviders(registry)` | Register all built-in providers (Anthropic, OpenAI, OpenRouter, Together, Ollama). |

### Authoring

| Export                                                                           | Description                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `generateDraft(provider, brief, options): Promise<GenerateResult>`               | Generate a Demo Markdown script from a brief.                  |
| `refineScript(provider, markdown, feedback, options): Promise<RefinementResult>` | Refine an existing script based on feedback.                   |
| `analyzePacing(script): PacingReport`                                            | Rule-based pacing analysis (narration timing, action density). |
| `analyzePacingWithLLM(provider, script, options): Promise<PacingReport>`         | LLM-augmented pacing analysis.                                 |
| `reviewRender(provider, script, metadata, options): Promise<ReviewReport>`       | Post-render quality review with improvement suggestions.       |
| `generateAndValidate(provider, prompt, options): Promise<GenerateResult>`        | Self-healing generate-parse-validate loop.                     |

### Prompts

| Export                                             | Description                                              |
| -------------------------------------------------- | -------------------------------------------------------- |
| `loadPrompt(name, variables?): Promise<string>`    | Load a prompt template with `{{variable}}` substitution. |
| `substituteVariables(template, variables): string` | Substitute `{{key}}` placeholders in a template string.  |

### Errors

| Export            | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `DirectorError`   | Base error class for all director errors.                        |
| `ParseError`      | Thrown on malformed Demo Markdown (includes line numbers).       |
| `ValidationError` | Thrown on structural issues (collected `ValidationIssue` items). |
| `LLMError`        | Thrown on LLM provider failures.                                 |

## License

Apache-2.0
