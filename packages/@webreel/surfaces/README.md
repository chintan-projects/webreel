# @webreel/surfaces

Multi-surface abstraction for webreel. Provides the `Surface` interface and implementations for recording across different environments: browsers, terminals, applications, desktops, and composites.

## Installation

```bash
npm install @webreel/surfaces
```

## Surface Types

| Type          | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `browser`     | Headless Chrome via CDP. Web application recording.            |
| `terminal`    | PTY-based terminal with xterm-headless rendering.              |
| `application` | OS-level app control via nut.js. Native application recording. |
| `desktop`     | Full desktop capture and automation via nut.js.                |
| `title`       | Static title/intro card generation.                            |
| `composite`   | Multi-surface composition (split-screen, PiP, etc.).           |

## Surface Interface

Every surface implementation follows the same lifecycle contract: `setup()` -> `execute()` -> `captureFrame()` -> `teardown()`.

```ts
interface Surface {
  readonly type: SurfaceType;

  /** Initialize the surface (launch Chrome, spawn PTY, etc.). */
  setup(config: SurfaceConfig): Promise<void>;

  /** Execute a single action and return captured output values. */
  execute(action: SurfaceAction, context: ExecutionContext): Promise<ActionResult>;

  /** Capture the current visual state as a raw PNG frame buffer. */
  captureFrame(): Promise<Buffer>;

  /** Clean up all resources. Safe to call multiple times. */
  teardown(): Promise<void>;
}
```

Each surface type captures frames differently:

- **Browser** -- CDP `Page.captureScreenshot`
- **Terminal** -- render PTY buffer to image via sharp
- **Application** -- platform screen capture API
- **Desktop** -- full desktop screen capture
- **Title card** -- generate static text frame

Every `setup()` must have a matching `teardown()` to ensure resource cleanup (Chrome processes, PTY sessions, file handles).

## Surface Registry

Surfaces are registered and resolved through `SurfaceRegistry`, which maps type strings to factory functions. The orchestrator uses the registry to create surface instances from config -- it never imports concrete implementations directly.

```ts
import { SurfaceRegistry, BrowserSurface, TerminalSurface } from "@webreel/surfaces";

const registry = new SurfaceRegistry();
registry.register("browser", (config) => new BrowserSurface());
registry.register("terminal", (config) => new TerminalSurface());

// Check registered types
registry.has("browser"); // true
registry.types(); // ["browser", "terminal"]
```

Adding a new surface type requires implementing the `Surface` interface and registering a factory. Zero changes to the orchestrator.

## Usage

```ts
import { BrowserSurface } from "@webreel/surfaces";
import type { SurfaceConfig, SurfaceAction, ExecutionContext } from "@webreel/surfaces";

const surface = new BrowserSurface();

const config: SurfaceConfig = {
  type: "browser",
  viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
  options: { url: "https://example.com" },
};

await surface.setup(config);

const action: SurfaceAction = {
  type: "click",
  params: { selector: "button.primary" },
};

const context: ExecutionContext = {
  sceneName: "intro",
  actName: "click-button",
  captures: {},
  verbose: false,
};

await surface.execute(action, context);
const frame = await surface.captureFrame();

await surface.teardown();
```

## License

Apache-2.0
