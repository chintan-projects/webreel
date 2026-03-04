/**
 * Audio mixer — combines narration WAV segments into composite audio tracks.
 *
 * Mixes per-segment WAV buffers at their absolute timeline offsets into a
 * single scene-level WAV, then concatenates per-scene WAVs into a final
 * composite audio track for the complete video.
 *
 * Reuses pcmToWav() and wavDurationMs() from @webreel/narrator.
 */

import type { NarrationTimeline } from "@webreel/narrator";
import { pcmToWav } from "@webreel/narrator";

/** Default audio parameters for narration tracks. */
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_BIT_DEPTH = 16;
const DEFAULT_CHANNELS = 1;

/** Size of the standard WAV header (RIFF PCM format). */
const WAV_HEADER_SIZE = 44;

/**
 * Extract raw PCM data from a WAV buffer by stripping the 44-byte header.
 * Returns an empty buffer if the input is too small.
 */
function extractPcm(wav: Buffer): Buffer {
  if (wav.length <= WAV_HEADER_SIZE) {
    return Buffer.alloc(0);
  }
  return wav.subarray(WAV_HEADER_SIZE);
}

/**
 * Read sample rate from a WAV header. Falls back to default if invalid.
 */
function readSampleRate(wav: Buffer): number {
  if (wav.length < WAV_HEADER_SIZE) return DEFAULT_SAMPLE_RATE;
  return wav.readUInt32LE(24) || DEFAULT_SAMPLE_RATE;
}

/**
 * Mix per-segment WAV audio buffers into a single WAV for one scene.
 *
 * Creates a silence PCM buffer sized to sceneDurationMs, then overlays
 * each NarrationSegment's audioBuffer at its startOffsetMs position.
 * Samples are added (mixed) with int16 clipping.
 *
 * @param timeline - Narration timeline with per-segment WAV buffers.
 * @param sceneDurationMs - Total scene duration in milliseconds.
 * @param sampleRate - Output sample rate (default 44100).
 * @returns A complete WAV file buffer for the scene.
 */
export function mixSceneAudio(
  timeline: NarrationTimeline,
  sceneDurationMs: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
): Buffer {
  const bytesPerSample = DEFAULT_BIT_DEPTH / 8;
  const totalSamples = Math.ceil((sceneDurationMs / 1000) * sampleRate);
  const pcmBuffer = Buffer.alloc(totalSamples * bytesPerSample);

  for (const segment of timeline.segments) {
    if (segment.audioBuffer.length <= WAV_HEADER_SIZE) continue;

    const segmentPcm = extractPcm(segment.audioBuffer);
    if (segmentPcm.length === 0) continue;

    const segmentSampleRate = readSampleRate(segment.audioBuffer);
    const offsetSamples = Math.floor((segment.startOffsetMs / 1000) * sampleRate);
    const offsetBytes = offsetSamples * bytesPerSample;

    // Resample if source rate differs (simple nearest-neighbor for now)
    if (segmentSampleRate !== sampleRate) {
      const ratio = sampleRate / segmentSampleRate;
      const srcSamples = Math.floor(segmentPcm.length / bytesPerSample);
      const dstSamples = Math.floor(srcSamples * ratio);

      for (let i = 0; i < dstSamples; i++) {
        const srcIdx = Math.floor(i / ratio);
        const srcOffset = srcIdx * bytesPerSample;
        const dstOffset = offsetBytes + i * bytesPerSample;
        if (srcOffset + 1 >= segmentPcm.length) break;
        if (dstOffset + 1 >= pcmBuffer.length) break;

        const srcSample = segmentPcm.readInt16LE(srcOffset);
        const existing = pcmBuffer.readInt16LE(dstOffset);
        const mixed = Math.max(-32768, Math.min(32767, existing + srcSample));
        pcmBuffer.writeInt16LE(mixed, dstOffset);
      }
    } else {
      // Direct mix at matching sample rate
      const sampleCount = Math.floor(segmentPcm.length / bytesPerSample);
      for (let i = 0; i < sampleCount; i++) {
        const srcOffset = i * bytesPerSample;
        const dstOffset = offsetBytes + i * bytesPerSample;
        if (dstOffset + 1 >= pcmBuffer.length) break;

        const srcSample = segmentPcm.readInt16LE(srcOffset);
        const existing = pcmBuffer.readInt16LE(dstOffset);
        const mixed = Math.max(-32768, Math.min(32767, existing + srcSample));
        pcmBuffer.writeInt16LE(mixed, dstOffset);
      }
    }
  }

  return pcmToWav(pcmBuffer, sampleRate, DEFAULT_CHANNELS, DEFAULT_BIT_DEPTH);
}

/**
 * Create a WAV file containing silence of the given duration.
 *
 * @param durationMs - Duration of silence in milliseconds.
 * @param sampleRate - Sample rate (default 44100).
 * @returns A WAV buffer of pure silence.
 */
export function createSilence(
  durationMs: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
): Buffer {
  const totalSamples = Math.ceil((durationMs / 1000) * sampleRate);
  const pcm = Buffer.alloc(totalSamples * (DEFAULT_BIT_DEPTH / 8));
  return pcmToWav(pcm, sampleRate, DEFAULT_CHANNELS, DEFAULT_BIT_DEPTH);
}

/**
 * Concatenate multiple WAV files into a single WAV by appending PCM data.
 *
 * All inputs must be mono 16-bit WAV at the same sample rate.
 * The sample rate of the first non-empty track is used for the output header.
 *
 * @param tracks - WAV buffers to concatenate in order.
 * @returns A single WAV file containing all tracks sequentially.
 */
export function concatenateAudioTracks(tracks: readonly Buffer[]): Buffer {
  if (tracks.length === 0) {
    return createSilence(0);
  }

  const pcmChunks: Buffer[] = [];
  let sampleRate = DEFAULT_SAMPLE_RATE;

  for (const track of tracks) {
    if (track.length > WAV_HEADER_SIZE) {
      if (pcmChunks.length === 0) {
        sampleRate = readSampleRate(track);
      }
      pcmChunks.push(extractPcm(track));
    }
  }

  if (pcmChunks.length === 0) {
    return createSilence(0);
  }

  const totalPcm = Buffer.concat(pcmChunks);
  return pcmToWav(totalPcm, sampleRate, DEFAULT_CHANNELS, DEFAULT_BIT_DEPTH);
}
