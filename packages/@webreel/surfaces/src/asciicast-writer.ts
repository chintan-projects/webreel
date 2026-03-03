import { createWriteStream, type WriteStream } from "node:fs";

/** A single asciicast v2 event: [elapsed_seconds, event_type, data]. */
type AsciicastEvent = readonly [number, "o" | "i", string];

/** Header for asciicast v2 format. */
interface AsciicastHeader {
  readonly version: 2;
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
}

/**
 * Writes asciicast v2 recordings (NDJSON format).
 *
 * Each line is either a JSON header object or a JSON event array.
 * If no file path is provided, events are stored in memory.
 *
 * @see https://docs.asciinema.org/manual/asciicast/v2/
 */
export class AsciicastWriter {
  private readonly cols: number;
  private readonly rows: number;
  private readonly startTime: number;
  private readonly stream: WriteStream | null;
  private readonly memoryEvents: string[] = [];
  private headerWritten = false;

  constructor(cols: number, rows: number, filePath?: string) {
    this.cols = cols;
    this.rows = rows;
    this.startTime = Date.now();
    this.stream = filePath ? createWriteStream(filePath, { encoding: "utf-8" }) : null;
  }

  /** Write the v2 header as the first NDJSON line. */
  writeHeader(): void {
    if (this.headerWritten) return;
    const header: AsciicastHeader = {
      version: 2,
      width: this.cols,
      height: this.rows,
      timestamp: Math.floor(this.startTime / 1000),
    };
    this.writeLine(JSON.stringify(header));
    this.headerWritten = true;
  }

  /** Record an output event (data written to the terminal). */
  writeOutput(data: string): void {
    this.ensureHeader();
    const event: AsciicastEvent = [this.elapsed(), "o", data];
    this.writeLine(JSON.stringify(event));
  }

  /** Record an input event (data sent to the terminal). */
  writeInput(data: string): void {
    this.ensureHeader();
    const event: AsciicastEvent = [this.elapsed(), "i", data];
    this.writeLine(JSON.stringify(event));
  }

  /** Flush and close the file stream, or return in-memory events. */
  async finish(): Promise<readonly string[]> {
    if (this.stream) {
      await new Promise<void>((resolve, reject) => {
        this.stream!.end(() => resolve());
        this.stream!.on("error", reject);
      });
    }
    return this.memoryEvents;
  }

  /** Get all in-memory events (empty if writing to file). */
  getEvents(): readonly string[] {
    return this.memoryEvents;
  }

  private ensureHeader(): void {
    if (!this.headerWritten) {
      this.writeHeader();
    }
  }

  private elapsed(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  private writeLine(line: string): void {
    const entry = line + "\n";
    if (this.stream) {
      this.stream.write(entry);
    } else {
      this.memoryEvents.push(line);
    }
  }
}
