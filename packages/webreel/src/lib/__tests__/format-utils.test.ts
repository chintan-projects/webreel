import { describe, it, expect } from "vitest";
import { parseFormats, validateFormats } from "../format-utils.js";

describe("parseFormats", () => {
  it("returns ['mp4'] when input is undefined", () => {
    expect(parseFormats(undefined)).toEqual(["mp4"]);
  });

  it("returns single-element array for a single format", () => {
    expect(parseFormats("mp4")).toEqual(["mp4"]);
    expect(parseFormats("webm")).toEqual(["webm"]);
    expect(parseFormats("gif")).toEqual(["gif"]);
  });

  it("splits comma-separated formats into an array", () => {
    expect(parseFormats("mp4,webm,gif")).toEqual(["mp4", "webm", "gif"]);
  });

  it("trims whitespace around format names", () => {
    expect(parseFormats("mp4, webm , gif")).toEqual(["mp4", "webm", "gif"]);
  });

  it("filters out empty strings from consecutive commas", () => {
    expect(parseFormats("mp4,,gif")).toEqual(["mp4", "gif"]);
  });

  it("filters out whitespace-only entries", () => {
    expect(parseFormats("mp4, , gif")).toEqual(["mp4", "gif"]);
  });

  it("uses the custom default format when input is undefined", () => {
    expect(parseFormats(undefined, "webm")).toEqual(["webm"]);
  });

  it("ignores default format when input is provided", () => {
    expect(parseFormats("gif", "webm")).toEqual(["gif"]);
  });

  it("deduplicates repeated formats while preserving order", () => {
    expect(parseFormats("mp4,mp4,webm")).toEqual(["mp4", "webm"]);
    expect(parseFormats("gif,mp4,gif,webm,mp4")).toEqual(["gif", "mp4", "webm"]);
  });

  it("handles a single trailing comma", () => {
    expect(parseFormats("mp4,")).toEqual(["mp4"]);
  });

  it("handles a single leading comma", () => {
    expect(parseFormats(",mp4")).toEqual(["mp4"]);
  });

  it("returns default for empty string input", () => {
    expect(parseFormats("")).toEqual(["mp4"]);
  });

  it("returns custom default for empty string input with default", () => {
    expect(parseFormats("", "webm")).toEqual(["webm"]);
  });

  it("handles comma-separated default format", () => {
    expect(parseFormats(undefined, "mp4,webm")).toEqual(["mp4", "webm"]);
  });
});

describe("validateFormats", () => {
  it("returns empty array when all formats are supported", () => {
    expect(validateFormats(["mp4", "webm", "gif"])).toEqual([]);
  });

  it("returns unsupported formats", () => {
    expect(validateFormats(["mp4", "avi", "gif", "mkv"])).toEqual(["avi", "mkv"]);
  });

  it("returns empty array for an empty input", () => {
    expect(validateFormats([])).toEqual([]);
  });

  it("identifies all unsupported formats in a list", () => {
    expect(validateFormats(["mov", "flv"])).toEqual(["mov", "flv"]);
  });
});
