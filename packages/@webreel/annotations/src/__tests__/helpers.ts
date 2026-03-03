/**
 * Shared test helpers for annotation renderer tests.
 */

import sharp from "sharp";

/** Default test frame dimensions. */
export const TEST_WIDTH = 640;
export const TEST_HEIGHT = 480;

/**
 * Create a solid-color PNG frame buffer for testing.
 * Default: 640x480 blue (#3366cc).
 */
export async function createTestFrame(
  width: number = TEST_WIDTH,
  height: number = TEST_HEIGHT,
  color: { r: number; g: number; b: number } = { r: 51, g: 102, b: 204 },
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

/** Check that a buffer is a valid PNG by verifying magic bytes. */
export function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

/** Get image dimensions from a PNG buffer. */
export async function getDimensions(
  buf: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buf).metadata();
  return { width: meta.width!, height: meta.height! };
}
