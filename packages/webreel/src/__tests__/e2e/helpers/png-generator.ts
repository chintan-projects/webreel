/**
 * Minimal PNG generator — no external image library required.
 *
 * Produces valid PNG files from raw RGB data using Node.js built-in zlib.
 * Used by both TestSurface and pipeline tests to generate synthetic frames
 * without depending on sharp or any native addon.
 */

import { createDeflateRaw } from "node:zlib";

/** RGB color triplet. */
export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Compute CRC-32 for a PNG chunk. */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a single PNG chunk (length + type + data + crc). */
function buildPngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

/** Compress raw bytes using zlib deflate (promisified). */
function deflateRaw(input: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const deflater = createDeflateRaw();
    deflater.on("data", (chunk: Buffer) => chunks.push(chunk));
    deflater.on("end", () => resolve(Buffer.concat(chunks)));
    deflater.on("error", reject);
    deflater.end(input);
  });
}

/**
 * Generate a minimal valid PNG file as a Buffer.
 * Creates a solid-color image at the specified dimensions.
 */
export async function createSolidPng(
  width: number,
  height: number,
  color: RgbColor,
): Promise<Buffer> {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: width, height, bit depth 8, color type 2 (RGB)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = buildPngChunk("IHDR", ihdrData);

  // Raw image data: each row starts with filter byte 0 (None), then RGB pixels
  const rowBytes = 1 + width * 3;
  const rawData = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowBytes;
    rawData[offset] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      rawData[px] = color.r;
      rawData[px + 1] = color.g;
      rawData[px + 2] = color.b;
    }
  }

  // Compress with zlib and wrap in IDAT chunk
  const compressed = await deflateRaw(rawData);
  // Wrap in zlib container: CMF + FLG header, deflate data, adler32
  const zlibHeader = Buffer.from([0x78, 0x01]);
  // Compute Adler-32 of uncompressed data
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < rawData.length; i++) {
    s1 = (s1 + rawData[i]!) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((s2 << 16) | s1) >>> 0, 0);
  const idatPayload = Buffer.concat([zlibHeader, compressed, adler]);
  const idat = buildPngChunk("IDAT", idatPayload);

  // IEND chunk
  const iend = buildPngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Generate a synthetic frame with colors derived from the frame index.
 * Ensures each frame in a sequence has a different color.
 */
export async function createIndexedFrame(
  index: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const color: RgbColor = {
    r: Math.floor((index * 8) % 256),
    g: Math.floor((index * 13 + 80) % 256),
    b: Math.floor((index * 21 + 160) % 256),
  };
  return createSolidPng(width, height, color);
}
