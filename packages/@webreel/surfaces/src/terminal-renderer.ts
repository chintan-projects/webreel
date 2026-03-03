import sharp from "sharp";

/** Minimal cell interface matching xterm's IBufferCell for color resolution. */
export interface BufferCell {
  isFgDefault(): boolean;
  isFgRGB(): boolean;
  isFgPalette(): boolean;
  getFgColor(): number;
  isBold(): number;
  isItalic(): number;
  getChars(): string;
  getWidth(): number;
}

/** Minimal buffer interface for rendering terminal frames. */
export interface TerminalBuffer {
  getLine(y: number): TerminalBufferLine | undefined;
  getNullCell(): BufferCell;
}

/** Minimal line interface for rendering terminal frames. */
export interface TerminalBufferLine {
  getCell(x: number, cell?: BufferCell): BufferCell | undefined;
}

/** ANSI 16-color palette (Catppuccin Mocha-inspired, indices 0-15). */
const ANSI_PALETTE: readonly string[] = [
  "#1e1e2e",
  "#f38ba8",
  "#a6e3a1",
  "#f9e2af",
  "#89b4fa",
  "#cba6f7",
  "#94e2d5",
  "#bac2de",
  "#585b70",
  "#f38ba8",
  "#a6e3a1",
  "#f9e2af",
  "#89b4fa",
  "#cba6f7",
  "#94e2d5",
  "#a6adc8",
];

const DEFAULT_FG = "#cdd6f4";
export const DEFAULT_BG = "#1e1e2e";
const DEFAULT_LINE_HEIGHT = 1.4;
const CELL_WIDTH_FACTOR = 0.6;

/** Configuration for terminal frame rendering. */
export interface RenderConfig {
  readonly cols: number;
  readonly rows: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly fontSize: number;
}

/**
 * Render the current terminal buffer state to a PNG image.
 *
 * Reads each cell from the xterm buffer, builds an SVG with styled text
 * on a dark background, then converts to PNG via sharp.
 */
export async function renderTerminalFrame(
  buffer: TerminalBuffer,
  config: RenderConfig,
): Promise<Buffer> {
  const { cols, rows, viewportWidth, viewportHeight, fontSize } = config;
  const lineHeight = Math.round(fontSize * DEFAULT_LINE_HEIGHT);
  const cellWidth = Math.round(fontSize * CELL_WIDTH_FACTOR);
  const padX = 16;
  const padY = 12;

  const svgParts: string[] = [];
  const nullCell = buffer.getNullCell();

  for (let row = 0; row < rows; row++) {
    const line = buffer.getLine(row);
    if (!line) continue;

    const y = padY + row * lineHeight + fontSize;

    for (let col = 0; col < cols; col++) {
      const cell = line.getCell(col, nullCell);
      if (!cell) continue;

      const ch = cell.getChars();
      if (!ch || ch === " ") continue;

      const fg = resolveFg(cell);
      const x = padX + col * cellWidth;
      const weight = cell.isBold() ? "bold" : "normal";
      const style = cell.isItalic() ? "italic" : "normal";
      const escaped = escapeXml(ch);

      svgParts.push(
        `<text x="${x}" y="${y}" fill="${fg}" font-weight="${weight}" ` +
          `font-style="${style}" font-size="${fontSize}" ` +
          `font-family="monospace">${escaped}</text>`,
      );
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}">` +
    `<rect width="100%" height="100%" fill="${DEFAULT_BG}"/>` +
    svgParts.join("") +
    `</svg>`;

  return await sharp(Buffer.from(svg))
    .resize(viewportWidth, viewportHeight)
    .png()
    .toBuffer();
}

/**
 * Compute terminal column count from viewport and font size.
 * Subtracts horizontal padding (32px) and divides by cell width.
 */
export function computeCols(viewportWidth: number, fontSize: number): number {
  const cellWidth = Math.round(fontSize * CELL_WIDTH_FACTOR);
  return Math.floor((viewportWidth - 32) / cellWidth);
}

/**
 * Compute terminal row count from viewport and font size.
 * Subtracts vertical padding (24px) and divides by line height.
 */
export function computeRows(viewportHeight: number, fontSize: number): number {
  const lineHeight = Math.round(fontSize * DEFAULT_LINE_HEIGHT);
  return Math.floor((viewportHeight - 24) / lineHeight);
}

// ── Color resolution ──────────────────────────────────────────────

/** Resolve the foreground color for a terminal cell. */
function resolveFg(cell: BufferCell): string {
  if (cell.isFgDefault()) return DEFAULT_FG;
  if (cell.isFgRGB()) {
    const color = cell.getFgColor();
    return `#${color.toString(16).padStart(6, "0")}`;
  }
  if (cell.isFgPalette()) {
    const idx = cell.getFgColor();
    if (idx < 16) return ANSI_PALETTE[idx] ?? DEFAULT_FG;
    if (idx < 232) return palette256ToHex(idx);
    return grayscaleToHex(idx);
  }
  return DEFAULT_FG;
}

/** Convert xterm 256-color palette index (16-231) to hex. */
function palette256ToHex(idx: number): string {
  const i = idx - 16;
  const r = Math.floor(i / 36);
  const g = Math.floor((i % 36) / 6);
  const b = i % 6;
  const toVal = (c: number): number => (c === 0 ? 0 : 55 + c * 40);
  return (
    `#${toVal(r).toString(16).padStart(2, "0")}` +
    `${toVal(g).toString(16).padStart(2, "0")}` +
    `${toVal(b).toString(16).padStart(2, "0")}`
  );
}

/** Convert xterm grayscale index (232-255) to hex. */
function grayscaleToHex(idx: number): string {
  const val = 8 + (idx - 232) * 10;
  const hex = val.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

/** Escape special XML characters for safe SVG embedding. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Well-known key names mapped to their terminal escape sequences. */
export const KEY_MAP: Readonly<Record<string, string>> = {
  enter: "\r",
  tab: "\t",
  escape: "\x1b",
  backspace: "\x7f",
  delete: "\x1b[3~",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  home: "\x1b[H",
  end: "\x1b[F",
  "ctrl+c": "\x03",
  "ctrl+d": "\x04",
  "ctrl+l": "\x0c",
  "ctrl+z": "\x1a",
};
