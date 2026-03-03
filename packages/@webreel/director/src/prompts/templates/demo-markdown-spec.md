# Demo Markdown Specification

Demo Markdown is a structured format for scripting automated video recordings of software demos. It combines YAML front matter, Markdown headings, narration text, and action directives into a single document that the webreel engine can execute.

## Front Matter (YAML)

Every script starts with a YAML front matter block between `---` fences:

```yaml
---
title: "Demo Title"
duration: 4m
voice: af_heart
viewport: 1920x1080
theme: dark
output:
  format: mp4
  fps: 30
  quality: high
---
```

**Required fields:**

- `title` (string): The demo title.

**Optional fields:**

- `duration` (string): Target total duration (e.g., `30s`, `4m`, `2m30s`).
- `voice` (string): Default TTS voice identifier.
- `viewport` (string): Default viewport dimensions as `WIDTHxHEIGHT`.
- `theme` (string): Visual theme for annotations and overlays.
- `output` (object): Output format preferences (`format`, `fps`, `quality`).

## Acts

Acts are top-level groupings defined with H1 headings. An optional duration hint can be added in parentheses:

```markdown
# Act 1: Introduction (30s)
```

Acts contain one or more scenes. If no H1 heading is present, scenes are grouped under an implicit "Main" act.

## Scenes

Scenes are defined with H2 headings, optionally with a duration hint:

```markdown
## Scene: Dashboard Overview (20s)
```

Each scene targets a single surface and contains a blockquote configuration, narration blocks, and action directives.

## Scene Configuration (Blockquotes)

Scene settings are declared in blockquotes immediately after the H2 heading:

```markdown
> surface: terminal
> shell: bash
> working_directory: ~/Projects/app
> transition_in: crossfade 500ms
> transition_out: fade-to-black 300ms
```

**Required:**

- `surface` (string): The surface type for this scene.

**Optional:**

- `transition_in` / `transition_out`: Transition type and duration. Types: `cut`, `crossfade`, `fade-to-black`, `slide-left`, `slide-right`, `slide-up`, `wipe`.
- `note`: Director note (not rendered, used for planning context).
- Additional surface-specific options (e.g., `url`, `shell`, `working_directory`, `background`).

## Surface Types

| Type          | Description               | Key Options                         |
| ------------- | ------------------------- | ----------------------------------- |
| `terminal`    | Terminal/shell session    | `shell`, `working_directory`, `cwd` |
| `browser`     | Web browser viewport      | `url`, `fullscreen`, `zoom`         |
| `title`       | Title card / text overlay | `background`, `text_color`          |
| `application` | Native application window | `app_name`, `window_title`          |
| `desktop`     | Full desktop capture      | `resolution`                        |
| `composite`   | Multi-surface layout      | `layout`, `surfaces`                |

## Narration

Narration text becomes TTS audio. Use double-quoted strings:

```markdown
"Welcome to the dashboard. Let's explore the key features."
```

Multiple narration blocks per scene are supported. Plain text paragraphs (without quotes) are also treated as narration.

## Dynamic References

Use `[read_output:variable_name]` in narration to insert values captured at runtime:

```markdown
"The response time was [read_output:latency]ms."
```

## Action Directives

Actions are bullet list items that describe interactions with the surface:

```markdown
- click: ".button-primary"
- type: "hello world"
- run: npm install
- pause: 1.5s
- wait_for_output: "Build succeeded"
- scroll: down 300
- scroll: to "#footer"
- key: "Enter"
- drag: from "#source" to "#target"
- navigate: "https://example.com"
- hover: ".menu-item"
- clear
- annotate: "#element" with "Label text" style=highlight
```

## Capture Specifications

Capture values from action output for use in dynamic narration references:

```markdown
- run: "curl -w '%{time_total}' https://api.example.com"
  capture:
  latency: regex("(\d+\.\d+)")
  status: regex("HTTP/(\d+)")
```

## Director Notes

Non-rendered notes for planning context, declared in blockquotes with the `note:` prefix:

```markdown
> note: Keep this section brief, focus on the key value proposition.
```

## Complete Example

```markdown
---
title: "Getting Started with MyApp"
duration: 2m
voice: af_heart
viewport: 1920x1080
---

# Act 1: Setup (30s)

## Scene: Title Card

> surface: title
> background: #0a0a0a
> transition_in: fade 500ms

"Welcome to MyApp. Let's get started."

## Scene: Installation

> surface: terminal
> shell: bash
> transition_in: crossfade 300ms

"First, install the dependencies."

- run: npm install myapp
- wait_for_output: "added"
- pause: 1s

# Act 2: First Steps (60s)

## Scene: Dashboard

> surface: browser
> url: http://localhost:3000
> transition_in: crossfade 500ms
> note: Make sure the dev server is running before recording.

"The dashboard shows all your projects at a glance."

- click: ".new-project-btn"
- type: "My First Project"
- click: "#create"
- pause: 2s
```
