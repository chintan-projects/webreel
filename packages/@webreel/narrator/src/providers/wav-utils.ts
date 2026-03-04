/**
 * WAV format utilities shared by TTS providers.
 * Handles PCM-to-WAV conversion and WAV header parsing.
 */

/** Standard WAV file header size in bytes. */
const WAV_HEADER_SIZE = 44;

/** Minimum valid WAV file size (header only, no data). */
const MIN_WAV_SIZE = 44;

/**
 * Create a WAV file buffer from raw PCM data.
 *
 * Constructs a standard 44-byte WAV header (RIFF/WAVE format, PCM audio format = 1)
 * followed by the raw PCM sample data.
 *
 * @param pcm - Raw PCM audio data buffer.
 * @param sampleRate - Sample rate in Hz (e.g., 22050, 44100).
 * @param channels - Number of audio channels (1 = mono, 2 = stereo).
 * @param bitDepth - Bits per sample (e.g., 16, 24).
 * @returns A complete WAV file as a Buffer.
 */
export function pcmToWav(
  pcm: Buffer,
  sampleRate: number,
  channels: number,
  bitDepth: number,
): Buffer {
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcm.length;
  const wav = Buffer.alloc(WAV_HEADER_SIZE + dataSize);

  // RIFF chunk descriptor
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);

  // fmt sub-chunk
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16); // SubChunk1Size (PCM)
  wav.writeUInt16LE(1, 20); // AudioFormat (PCM = 1)
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitDepth, 34);

  // data sub-chunk
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  pcm.copy(wav, WAV_HEADER_SIZE);

  return wav;
}

/**
 * Parse a WAV header and return the audio duration in milliseconds.
 *
 * Validates the RIFF/WAVE header markers, reads sample rate and byte rate
 * from the fmt chunk, and calculates duration from the data chunk size.
 *
 * @param wav - A WAV file buffer (must include at least the 44-byte header).
 * @returns Duration in milliseconds, or 0 for invalid/empty WAV data.
 */
export function wavDurationMs(wav: Buffer): number {
  if (wav.length < MIN_WAV_SIZE) {
    return 0;
  }

  // Validate RIFF header
  const riff = wav.toString("ascii", 0, 4);
  const wave = wav.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    return 0;
  }

  // Parse fmt chunk for byte rate
  const byteRate = wav.readUInt32LE(28);
  if (byteRate === 0) {
    return 0;
  }

  // Parse data chunk size
  const dataSize = wav.readUInt32LE(40);

  return Math.round((dataSize / byteRate) * 1000);
}
