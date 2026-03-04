/**
 * Piper ONNX local TTS provider implementation.
 *
 * Uses the piper command-line tool for local speech synthesis via
 * child_process spawn. Piper outputs raw PCM which is converted to
 * WAV format using shared utilities. Supports any Piper ONNX model file.
 */

import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { TTSGenerationError, TTSInitializationError } from "../errors.js";
import type { TTSOptions, TTSProvider, TTSResult } from "../types.js";
import { pcmToWav, wavDurationMs } from "./wav-utils.js";

/** Default Piper output sample rate in Hz. */
const DEFAULT_SAMPLE_RATE = 22050;

/** Default bit depth for Piper PCM output. */
const DEFAULT_BIT_DEPTH = 16;

/** Default number of audio channels (mono). */
const DEFAULT_CHANNELS = 1;

/** Timeout for piper process in milliseconds (30 seconds). */
const PIPER_TIMEOUT_MS = 30_000;

/** Configuration for the Piper TTS provider. */
export interface PiperProviderConfig {
  readonly modelPath?: string;
  readonly piperPath?: string;
}

/**
 * Piper ONNX local TTS provider.
 *
 * Implements the TTSProvider interface for local speech synthesis
 * using the piper command-line tool with ONNX runtime inference.
 * Voice selection is done via model file, not by voice name.
 *
 * @example
 * ```ts
 * const provider = new PiperProvider({
 *   modelPath: "/path/to/en_US-lessac-medium.onnx",
 * });
 * await provider.initialize();
 * const result = await provider.generate("Hello world", { voice: "default", speed: 1.0 });
 * ```
 */
export class PiperProvider implements TTSProvider {
  readonly name = "piper";

  private initialized = false;
  private readonly modelPath: string | undefined;
  private readonly piperPath: string;

  constructor(config?: PiperProviderConfig) {
    this.modelPath = config?.modelPath ?? process.env.PIPER_MODEL_PATH;
    this.piperPath = config?.piperPath ?? process.env.PIPER_PATH ?? "piper";
  }

  /**
   * Initialize the Piper provider.
   * Verifies that the piper binary is accessible and the model file exists.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.modelPath) {
      throw new TTSInitializationError(
        this.name,
        "No model path provided. Set PIPER_MODEL_PATH environment variable or pass modelPath in config.",
      );
    }

    // Verify model file exists
    try {
      await access(this.modelPath, constants.R_OK);
    } catch (error) {
      throw new TTSInitializationError(
        this.name,
        `Model file not found or not readable: "${this.modelPath}".`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    // Verify piper binary is available
    try {
      await this.spawnPiper(["--version"]);
    } catch (error) {
      throw new TTSInitializationError(
        this.name,
        `Piper binary not found at "${this.piperPath}". Ensure piper is installed and on PATH.`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    this.initialized = true;
  }

  /**
   * Generate speech audio from text using the Piper CLI.
   *
   * Spawns piper with --output-raw flag, writes text to stdin,
   * collects raw PCM output from stdout, and converts to WAV.
   *
   * @param text - Input text to synthesize.
   * @param options - Voice and speed configuration (voice is ignored; use model file).
   * @returns WAV audio buffer with measured duration.
   */
  async generate(text: string, options: TTSOptions): Promise<TTSResult> {
    this.ensureInitialized();

    const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;

    try {
      const pcmData = await this.generatePCM(text);
      const audio = pcmToWav(pcmData, sampleRate, DEFAULT_CHANNELS, DEFAULT_BIT_DEPTH);
      const durationMs = wavDurationMs(audio);

      return { audio, durationMs };
    } catch (error) {
      if (error instanceof TTSGenerationError) {
        throw error;
      }
      throw new TTSGenerationError(
        this.name,
        text,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * List available Piper voices.
   * Returns ["default"] since Piper voices are selected by model file, not by name.
   */
  async voices(): Promise<readonly string[]> {
    return ["default"];
  }

  /**
   * Release provider resources.
   * After disposal, the provider must be re-initialized before use.
   */
  async dispose(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Ensure the provider is initialized, throwing if not.
   * Synchronous guard for methods that require initialization.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new TTSInitializationError(
        this.name,
        "Provider not initialized. Call initialize() before generate().",
      );
    }
  }

  /**
   * Generate raw PCM audio from text by spawning the piper process.
   *
   * @param text - Input text to synthesize.
   * @returns Raw PCM audio data buffer (16-bit signed, mono).
   */
  private async generatePCM(text: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const args = ["--model", this.modelPath!, "--output-raw"];
      const child = spawn(this.piperPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const chunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Piper process timed out after ${PIPER_TIMEOUT_MS}ms`));
      }, PIPER_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code: number | null) => {
        clearTimeout(timeout);
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString("utf-8");
          reject(new Error(`Piper exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });

      // Write text to stdin and close
      child.stdin.write(text);
      child.stdin.end();
    });
  }

  /**
   * Spawn a piper process with given arguments and wait for completion.
   * Used for health checks (e.g., --version) during initialization.
   *
   * @param args - Command-line arguments to pass to piper.
   * @returns Stdout output as a string.
   */
  private async spawnPiper(args: readonly string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.piperPath, [...args], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const chunks: Buffer[] = [];

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Piper version check timed out"));
      }, 5000);

      child.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      child.on("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code: number | null) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Piper exited with code ${code}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });
    });
  }
}
