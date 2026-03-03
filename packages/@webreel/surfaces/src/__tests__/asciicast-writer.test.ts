import { describe, it, expect } from "vitest";

import { AsciicastWriter } from "../asciicast-writer.js";

describe("AsciicastWriter", () => {
  it("header is valid JSON with correct version, width, height", () => {
    const writer = new AsciicastWriter(120, 40);
    writer.writeHeader();
    const events = writer.getEvents();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const header = JSON.parse(events[0]!) as Record<string, unknown>;
    expect(header["version"]).toBe(2);
    expect(header["width"]).toBe(120);
    expect(header["height"]).toBe(40);
    expect(typeof header["timestamp"]).toBe("number");
  });

  it("output events have correct format [timestamp, 'o', data]", () => {
    const writer = new AsciicastWriter(80, 24);
    writer.writeOutput("hello world");
    const events = writer.getEvents();

    // First event is auto-generated header, second is the output event
    expect(events.length).toBe(2);
    const event = JSON.parse(events[1]!) as [number, string, string];
    expect(event).toHaveLength(3);
    expect(typeof event[0]).toBe("number");
    expect(event[1]).toBe("o");
    expect(event[2]).toBe("hello world");
  });

  it("input events have correct format [timestamp, 'i', data]", () => {
    const writer = new AsciicastWriter(80, 24);
    writer.writeInput("ls -la\n");
    const events = writer.getEvents();

    expect(events.length).toBe(2);
    const event = JSON.parse(events[1]!) as [number, string, string];
    expect(event).toHaveLength(3);
    expect(typeof event[0]).toBe("number");
    expect(event[1]).toBe("i");
    expect(event[2]).toBe("ls -la\n");
  });

  it("timestamps increase monotonically", async () => {
    const writer = new AsciicastWriter(80, 24);
    writer.writeOutput("first");
    // Small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));
    writer.writeOutput("second");
    const events = writer.getEvents();

    // Skip header (index 0), compare event timestamps
    const ts1 = (JSON.parse(events[1]!) as [number, string, string])[0];
    const ts2 = (JSON.parse(events[2]!) as [number, string, string])[0];
    expect(ts2).toBeGreaterThanOrEqual(ts1);
  });

  it("in-memory mode stores events correctly", () => {
    const writer = new AsciicastWriter(80, 24);
    writer.writeOutput("line 1");
    writer.writeOutput("line 2");
    writer.writeInput("cmd");
    const events = writer.getEvents();

    // 1 auto-header + 3 events = 4 total
    expect(events).toHaveLength(4);
  });

  it("getEvents() returns all recorded events", () => {
    const writer = new AsciicastWriter(80, 24);
    writer.writeHeader();
    writer.writeOutput("data");
    const events = writer.getEvents();

    expect(events).toHaveLength(2);
    // Verify header is first
    const header = JSON.parse(events[0]!) as Record<string, unknown>;
    expect(header["version"]).toBe(2);
    // Verify event is second
    const event = JSON.parse(events[1]!) as [number, string, string];
    expect(event[1]).toBe("o");
  });
});
