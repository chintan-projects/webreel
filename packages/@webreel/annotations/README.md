# @webreel/annotations

Visual annotation system for webreel. Overlays annotations on video frames: highlights, arrows, zoom lenses, callouts, and redaction.

## Installation

```bash
npm install @webreel/annotations
```

## Annotation Types

| Type        | Description                                                         |
| ----------- | ------------------------------------------------------------------- |
| `highlight` | Dims the frame and draws a colored border around a target region.   |
| `arrow`     | Directional arrow pointing at an element, with optional text label. |
| `zoom`      | Ken Burns smooth magnifying zoom into a region.                     |
| `callout`   | Text label box connected to the target by a line.                   |
| `redact`    | Blur or pixelate a region to obscure sensitive content.             |

## Annotation Interface

All annotation configs extend a shared base that defines timing and target coordinates:

```ts
interface AnnotationConfig {
  readonly type: AnnotationType;
  readonly startMs: number;
  readonly durationMs: number;
  readonly target?: AnnotationTarget;
}

interface AnnotationTarget {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
```

Each annotation type adds its own style options:

```ts
// Highlight -- border and dim overlay
interface HighlightConfig extends AnnotationConfig {
  readonly type: "highlight";
  readonly dimOpacity?: number; // 0-1, default 0.6
  readonly borderColor?: string; // CSS color
  readonly borderWidth?: number; // pixels, default 2
}

// Arrow -- directional pointer with label
interface ArrowConfig extends AnnotationConfig {
  readonly type: "arrow";
  readonly label?: string;
  readonly color?: string; // CSS color, default "#ff4444"
  readonly thickness?: number; // pixels, default 3
  readonly from?: "left" | "right" | "top" | "bottom" | "auto";
}

// Callout -- text box with connector line
interface CalloutConfig extends AnnotationConfig {
  readonly type: "callout";
  readonly text: string;
  readonly backgroundColor?: string; // default "#333333"
  readonly textColor?: string; // default "#ffffff"
  readonly position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "auto";
}

// Zoom -- smooth zoom into target region
interface ZoomConfig extends AnnotationConfig {
  readonly type: "zoom";
  readonly maxScale?: number; // default 2.0
  readonly easing?: "linear" | "ease-in-out";
}

// Redact -- blur or pixelate a region
interface RedactConfig extends AnnotationConfig {
  readonly type: "redact";
  readonly mode?: "blur" | "pixelate";
  readonly intensity?: number; // blur sigma or pixel block size, default 10
}
```

## Usage

Annotations are applied to captured frames through the compositor. The compositor processes annotation layers in declaration order, applying only those whose timing window includes the current timestamp.

```ts
import {
  createDefaultAnnotationRegistry,
  composeAnnotations,
  type AnnotationLayer,
  type HighlightConfig,
  type ArrowConfig,
} from "@webreel/annotations";

// Create a registry with all built-in renderers
const registry = createDefaultAnnotationRegistry();

// Define annotation configs
const highlight: HighlightConfig = {
  type: "highlight",
  startMs: 0,
  durationMs: 3000,
  target: { x: 100, y: 200, width: 300, height: 50 },
  dimOpacity: 0.5,
  borderColor: "#00ff00",
};

const arrow: ArrowConfig = {
  type: "arrow",
  startMs: 1000,
  durationMs: 2000,
  target: { x: 100, y: 200, width: 300, height: 50 },
  label: "Click here",
  color: "#ff4444",
};

// Build layers by pairing configs with renderers
const layers: AnnotationLayer[] = [
  { renderer: registry.create("highlight"), config: highlight },
  { renderer: registry.create("arrow"), config: arrow },
];

// Apply annotations to a frame at a given timestamp
const annotatedFrame = await composeAnnotations(frame, layers, 1500);
```

Custom annotation types can be added by implementing the `AnnotationRenderer` interface and registering a factory:

```ts
import {
  AnnotationRegistry,
  type AnnotationRenderer,
  type AnnotationConfig,
} from "@webreel/annotations";

const registry = new AnnotationRegistry();

registry.register("custom", () => ({
  type: "custom",
  async render(
    frame: Buffer,
    config: AnnotationConfig,
    timestampMs: number,
  ): Promise<Buffer> {
    // Apply custom overlay to frame and return new PNG buffer
    return frame;
  },
}));
```

## License

Apache-2.0
