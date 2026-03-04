import { describe, it, expect } from "vitest";

import { pcmToWav, wavDurationMs } from "../providers/wav-utils.js";

describe("wav-utils", () => {
  describe("pcmToWav", () => {
    it("creates a valid WAV header", () => {
      const pcm = Buffer.alloc(100);
      const wav = pcmToWav(pcm, 22050, 1, 16);

      // RIFF header
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.toString("ascii", 8, 12)).toBe("WAVE");

      // fmt sub-chunk
      expect(wav.toString("ascii", 12, 16)).toBe("fmt ");
      expect(wav.readUInt32LE(16)).toBe(16); // SubChunk1Size
      expect(wav.readUInt16LE(20)).toBe(1); // AudioFormat (PCM)
      expect(wav.readUInt16LE(22)).toBe(1); // Channels
      expect(wav.readUInt32LE(24)).toBe(22050); // SampleRate
      expect(wav.readUInt32LE(28)).toBe(44100); // ByteRate (22050 * 1 * 2)
      expect(wav.readUInt16LE(32)).toBe(2); // BlockAlign (1 * 2)
      expect(wav.readUInt16LE(34)).toBe(16); // BitsPerSample

      // data sub-chunk
      expect(wav.toString("ascii", 36, 40)).toBe("data");
      expect(wav.readUInt32LE(40)).toBe(100); // DataSize
    });

    it("preserves PCM data after header", () => {
      const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
      const wav = pcmToWav(pcm, 44100, 1, 16);

      // PCM data starts at offset 44
      expect(wav.length).toBe(44 + 5);
      expect(wav[44]).toBe(0x01);
      expect(wav[45]).toBe(0x02);
      expect(wav[46]).toBe(0x03);
      expect(wav[47]).toBe(0x04);
      expect(wav[48]).toBe(0x05);
    });
  });

  describe("wavDurationMs", () => {
    it("calculates correct duration from WAV buffer", () => {
      // 1 second of 16-bit mono audio at 22050 Hz = 44100 bytes of PCM data
      const sampleRate = 22050;
      const durationSec = 1;
      const bytesPerSample = 2;
      const channels = 1;
      const pcmSize = sampleRate * durationSec * bytesPerSample * channels;
      const pcm = Buffer.alloc(pcmSize);
      const wav = pcmToWav(pcm, sampleRate, channels, 16);

      expect(wavDurationMs(wav)).toBe(1000);
    });

    it("returns 0 for invalid buffer", () => {
      // Too short
      expect(wavDurationMs(Buffer.alloc(10))).toBe(0);

      // Wrong RIFF header
      const badRiff = Buffer.alloc(44);
      badRiff.write("XXXX", 0);
      expect(wavDurationMs(badRiff)).toBe(0);

      // Wrong WAVE marker
      const badWave = Buffer.alloc(44);
      badWave.write("RIFF", 0);
      badWave.write("XXXX", 8);
      expect(wavDurationMs(badWave)).toBe(0);
    });

    it("round-trips pcmToWav then wavDurationMs correctly", () => {
      // 500ms of 16-bit stereo audio at 44100 Hz
      const sampleRate = 44100;
      const channels = 2;
      const bitDepth = 16;
      const durationMs = 500;
      const bytesPerSample = bitDepth / 8;
      const pcmSize = (sampleRate * durationMs * channels * bytesPerSample) / 1000;
      const pcm = Buffer.alloc(pcmSize);
      const wav = pcmToWav(pcm, sampleRate, channels, bitDepth);

      expect(wavDurationMs(wav)).toBe(500);
    });
  });
});
