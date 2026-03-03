import { describe, it, expect } from "vitest";
import { AnnotationRegistry } from "../registry.js";
import { AnnotationNotFoundError } from "../errors.js";
import type { AnnotationRenderer, AnnotationConfig } from "../types.js";

function createMockRenderer(type: string): AnnotationRenderer {
  return {
    type: type as AnnotationRenderer["type"],
    async render(frame: Buffer, _config: AnnotationConfig, _ts: number): Promise<Buffer> {
      return frame;
    },
  };
}

describe("AnnotationRegistry", () => {
  it("registers and creates a renderer", () => {
    const registry = new AnnotationRegistry();
    registry.register("highlight", () => createMockRenderer("highlight"));

    const renderer = registry.create("highlight");
    expect(renderer.type).toBe("highlight");
  });

  it("has() returns true for registered types", () => {
    const registry = new AnnotationRegistry();
    registry.register("arrow", () => createMockRenderer("arrow"));

    expect(registry.has("arrow")).toBe(true);
    expect(registry.has("zoom")).toBe(false);
  });

  it("throws AnnotationNotFoundError for unknown types", () => {
    const registry = new AnnotationRegistry();

    expect(() => registry.create("unknown")).toThrow(AnnotationNotFoundError);
    expect(() => registry.create("unknown")).toThrow(/not registered/);
  });

  it("types() lists all registered type names", () => {
    const registry = new AnnotationRegistry();
    registry.register("highlight", () => createMockRenderer("highlight"));
    registry.register("zoom", () => createMockRenderer("zoom"));

    const types = registry.types();
    expect(types).toContain("highlight");
    expect(types).toContain("zoom");
    expect(types).toHaveLength(2);
  });

  it("overwrites existing factory on re-register", () => {
    const registry = new AnnotationRegistry();
    let callCount = 0;

    registry.register("highlight", () => {
      callCount = 1;
      return createMockRenderer("highlight");
    });
    registry.register("highlight", () => {
      callCount = 2;
      return createMockRenderer("highlight");
    });

    registry.create("highlight");
    expect(callCount).toBe(2);
  });

  it("unregister() removes a registered type", () => {
    const registry = new AnnotationRegistry();
    registry.register("redact", () => createMockRenderer("redact"));

    expect(registry.has("redact")).toBe(true);
    const removed = registry.unregister("redact");
    expect(removed).toBe(true);
    expect(registry.has("redact")).toBe(false);
  });

  it("unregister() returns false for unregistered types", () => {
    const registry = new AnnotationRegistry();
    expect(registry.unregister("nonexistent")).toBe(false);
  });

  it("create() returns new instances on each call", () => {
    const registry = new AnnotationRegistry();
    registry.register("highlight", () => createMockRenderer("highlight"));

    const a = registry.create("highlight");
    const b = registry.create("highlight");
    expect(a).not.toBe(b);
  });
});
