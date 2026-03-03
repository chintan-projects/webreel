import * as pty from "node-pty";
import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";

import type {
  Surface,
  SurfaceType,
  SurfaceConfig,
  SurfaceAction,
  ActionResult,
  ExecutionContext,
} from "./types.js";
import { SurfaceError, SurfaceSetupError, SurfaceTimeoutError } from "./errors.js";
import { AsciicastWriter } from "./asciicast-writer.js";
import {
  renderTerminalFrame,
  computeCols,
  computeRows,
  KEY_MAP,
  type RenderConfig,
} from "./terminal-renderer.js";

const DEFAULT_TYPING_DELAY_MS = 50;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const DEFAULT_PROMPT_SETTLE_MS = 500;
const DEFAULT_FONT_SIZE = 14;

/** Terminal options extracted from SurfaceConfig.options. */
interface TerminalOptions {
  readonly shell: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly typingDelayMs: number;
  readonly commandTimeoutMs: number;
  readonly promptSettleMs: number;
  readonly fontSize: number;
  readonly asciicastPath?: string;
}

/** Terminal surface: PTY + xterm-headless emulation, rendered to PNG via sharp. */
export class TerminalSurface implements Surface {
  readonly type: SurfaceType = "terminal";

  private ptyProcess: pty.IPty | null = null;
  private terminal: Terminal | null = null;
  private serializer: SerializeAddon | null = null;
  private asciicast: AsciicastWriter | null = null;
  private outputBuffer = "";
  private cols = 80;
  private rows = 24;
  private viewportWidth = 1280;
  private viewportHeight = 720;
  private options: TerminalOptions | null = null;
  private tornDown = false;

  async setup(config: SurfaceConfig): Promise<void> {
    const opts = this.parseOptions(config);
    this.options = opts;

    if (config.viewport) {
      this.viewportWidth = config.viewport.width;
      this.viewportHeight = config.viewport.height;
    }

    this.cols = computeCols(this.viewportWidth, opts.fontSize);
    this.rows = computeRows(this.viewportHeight, opts.fontSize);

    this.terminal = new Terminal({
      cols: this.cols,
      rows: this.rows,
      allowProposedApi: true,
      logLevel: "off",
    });

    this.serializer = new SerializeAddon();
    this.terminal.loadAddon(this.serializer);

    this.asciicast = new AsciicastWriter(this.cols, this.rows, opts.asciicastPath);
    this.asciicast.writeHeader();

    try {
      this.ptyProcess = pty.spawn(opts.shell, [], {
        name: "xterm-256color",
        cols: this.cols,
        rows: this.rows,
        cwd: opts.cwd,
        env: opts.env as Record<string, string>,
      });
    } catch (err: unknown) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new SurfaceSetupError(
        "terminal",
        `Failed to spawn PTY: ${cause.message}`,
        cause,
      );
    }

    this.ptyProcess.onData((data: string) => {
      this.outputBuffer += data;
      this.terminal!.write(data);
      this.asciicast!.writeOutput(data);
    });

    await this.waitForSettle(opts.promptSettleMs);
  }

  async execute(action: SurfaceAction, context: ExecutionContext): Promise<ActionResult> {
    this.ensureReady(action.type);
    const start = Date.now();
    const captures: Record<string, string> = {};

    switch (action.type) {
      case "run":
        await this.executeRun(action, captures);
        break;
      case "type_command":
      case "type":
      case "type_text":
        await this.executeType(action);
        break;
      case "wait_for_output":
        await this.executeWaitForOutput(action, captures);
        break;
      case "send_key":
      case "key":
        this.executeSendKey(action);
        break;
      case "clear":
        this.ptyProcess!.write("clear\r");
        await this.waitForSettle(this.options!.promptSettleMs);
        break;
      case "wait":
      case "pause": {
        const duration = (action.params["duration"] as number | undefined) ?? 1;
        await delay(duration * 1000);
        break;
      }
      default:
        throw new SurfaceError(`Unknown terminal action type: "${action.type}"`, {
          surfaceType: "terminal",
          action: action.type,
          sceneName: context.sceneName,
        });
    }

    return { captures, durationMs: Date.now() - start };
  }

  async captureFrame(): Promise<Buffer> {
    this.ensureReady("captureFrame");
    const renderConfig: RenderConfig = {
      cols: this.cols,
      rows: this.rows,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      fontSize: this.options!.fontSize,
    };
    return renderTerminalFrame(this.terminal!.buffer.active, renderConfig);
  }

  async teardown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;

    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch {
        // PTY may already be dead -- safe to ignore
      }
      this.ptyProcess = null;
    }

    if (this.serializer) {
      this.serializer.dispose();
      this.serializer = null;
    }

    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }

    if (this.asciicast) {
      await this.asciicast.finish();
      this.asciicast = null;
    }
  }

  private parseOptions(config: SurfaceConfig): TerminalOptions {
    const raw = (config.options ?? {}) as Record<string, unknown>;
    return {
      shell: (raw["shell"] as string | undefined) ?? process.env["SHELL"] ?? "/bin/bash",
      cwd: (raw["cwd"] as string | undefined) ?? process.cwd(),
      env: (raw["env"] as Record<string, string> | undefined) ?? stripUndefinedEnv(),
      typingDelayMs:
        (raw["typingDelayMs"] as number | undefined) ?? DEFAULT_TYPING_DELAY_MS,
      commandTimeoutMs:
        (raw["commandTimeoutMs"] as number | undefined) ?? DEFAULT_COMMAND_TIMEOUT_MS,
      promptSettleMs:
        (raw["promptSettleMs"] as number | undefined) ?? DEFAULT_PROMPT_SETTLE_MS,
      fontSize: (raw["fontSize"] as number | undefined) ?? DEFAULT_FONT_SIZE,
      asciicastPath: raw["asciicastPath"] as string | undefined,
    };
  }

  private ensureReady(action: string): void {
    if (!this.ptyProcess || !this.terminal) {
      throw new SurfaceError(
        `Terminal surface not initialized. Call setup() before ${action}.`,
        { surfaceType: "terminal", action },
      );
    }
  }

  private async executeRun(
    action: SurfaceAction,
    captures: Record<string, string>,
  ): Promise<void> {
    const command = action.params["command"] as string;
    const timeout =
      (action.params["timeout"] as number | undefined) ?? this.options!.commandTimeoutMs;

    this.outputBuffer = "";
    this.ptyProcess!.write(command + "\r");
    this.asciicast!.writeInput(command + "\r");

    await this.waitForSettle(this.options!.promptSettleMs, timeout);
    this.runCaptures(action, captures);
  }

  private async executeType(action: SurfaceAction): Promise<void> {
    const text = (action.params["text"] ?? action.params["command"] ?? "") as string;
    const delayMs =
      (action.params["delayMs"] as number | undefined) ?? this.options!.typingDelayMs;
    const submit = (action.params["submit"] as boolean | undefined) ?? false;

    for (const ch of text) {
      this.ptyProcess!.write(ch);
      this.asciicast!.writeInput(ch);
      await delay(delayMs);
    }

    if (submit) {
      this.ptyProcess!.write("\r");
      this.asciicast!.writeInput("\r");
      await this.waitForSettle(this.options!.promptSettleMs);
    }
  }

  private async executeWaitForOutput(
    action: SurfaceAction,
    captures: Record<string, string>,
  ): Promise<void> {
    const pattern = new RegExp(action.params["pattern"] as string);
    const timeout =
      (action.params["timeout"] as number | undefined) ?? this.options!.commandTimeoutMs;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (pattern.test(this.outputBuffer)) {
        this.runCaptures(action, captures);
        return;
      }
      await delay(100);
    }

    throw new SurfaceTimeoutError("terminal", "wait_for_output", timeout);
  }

  private executeSendKey(action: SurfaceAction): void {
    const key = action.params["key"] as string;
    const sequence = KEY_MAP[key.toLowerCase()] ?? key;
    this.ptyProcess!.write(sequence);
    this.asciicast!.writeInput(sequence);
  }

  private runCaptures(action: SurfaceAction, captures: Record<string, string>): void {
    const capturePatterns = action.params["captures"] as
      | Readonly<Record<string, string>>
      | undefined;
    if (!capturePatterns) return;

    for (const [name, patternStr] of Object.entries(capturePatterns)) {
      const match = new RegExp(patternStr).exec(this.outputBuffer);
      if (match) {
        captures[name] = match[1] ?? match[0];
      }
    }
  }

  private async waitForSettle(settleMs: number, timeoutMs?: number): Promise<void> {
    const maxWait =
      timeoutMs ?? this.options?.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const start = Date.now();
    let lastLength = this.outputBuffer.length;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await delay(settleMs);
      if (this.outputBuffer.length === lastLength) return;
      lastLength = this.outputBuffer.length;
      if (Date.now() - start > maxWait) return;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripUndefinedEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}
