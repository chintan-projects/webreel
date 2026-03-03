import { describe, it, expect } from "vitest";
import { hashScene, hashScript, detectChangedScenes } from "../scene-hasher.js";
import type { Scene, DemoScript } from "@webreel/director";

/** Helper to create a minimal Scene for testing. */
function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    name: overrides.name ?? "Test Scene",
    surface: overrides.surface ?? { type: "browser", options: {} },
    narration: overrides.narration ?? [],
    actions: overrides.actions ?? [],
    transitions: overrides.transitions ?? {},
    directorNotes: overrides.directorNotes ?? [],
    durationHint: overrides.durationHint,
  };
}

/** Helper to create a minimal DemoScript for testing. */
function makeScript(overrides: Partial<DemoScript> = {}): DemoScript {
  return {
    meta: overrides.meta ?? { title: "Test Demo" },
    acts: overrides.acts ?? [],
  };
}

describe("hashScene", () => {
  it("produces a deterministic hash for the same scene", () => {
    const scene = makeScene({ name: "A" });
    const hash1 = hashScene(scene);
    const hash2 = hashScene(scene);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it("produces different hashes for different surface types", () => {
    const scene1 = makeScene({ surface: { type: "browser", options: {} } });
    const scene2 = makeScene({ surface: { type: "terminal", options: {} } });
    expect(hashScene(scene1)).not.toBe(hashScene(scene2));
  });

  it("produces different hashes for different actions", () => {
    const scene1 = makeScene({
      actions: [{ type: "click", params: { x: 100, y: 200 } }],
    });
    const scene2 = makeScene({
      actions: [{ type: "click", params: { x: 300, y: 400 } }],
    });
    expect(hashScene(scene1)).not.toBe(hashScene(scene2));
  });

  it("produces different hashes for different narration", () => {
    const scene1 = makeScene({
      narration: [{ text: "Hello world", dynamicRefs: [] }],
    });
    const scene2 = makeScene({
      narration: [{ text: "Goodbye world", dynamicRefs: [] }],
    });
    expect(hashScene(scene1)).not.toBe(hashScene(scene2));
  });

  it("ignores scene name — renaming does not change hash", () => {
    const scene1 = makeScene({ name: "Original Name" });
    const scene2 = makeScene({ name: "Renamed Scene" });
    // Same content, different names — should hash the same
    expect(hashScene(scene1)).toBe(hashScene(scene2));
  });

  it("is not affected by key ordering in params", () => {
    const scene1 = makeScene({
      actions: [{ type: "click", params: { x: 100, y: 200 } }],
    });
    const scene2 = makeScene({
      actions: [{ type: "click", params: { y: 200, x: 100 } }],
    });
    expect(hashScene(scene1)).toBe(hashScene(scene2));
  });

  it("is not affected by key ordering in surface options", () => {
    const scene1 = makeScene({
      surface: { type: "browser", options: { url: "https://example.com", zoom: 1 } },
    });
    const scene2 = makeScene({
      surface: { type: "browser", options: { zoom: 1, url: "https://example.com" } },
    });
    expect(hashScene(scene1)).toBe(hashScene(scene2));
  });

  it("changes when transitions change", () => {
    const scene1 = makeScene({
      transitions: { in: { type: "crossfade", durationMs: 500 } },
    });
    const scene2 = makeScene({
      transitions: { in: { type: "fade-to-black", durationMs: 500 } },
    });
    expect(hashScene(scene1)).not.toBe(hashScene(scene2));
  });

  it("changes when duration hint changes", () => {
    const scene1 = makeScene({ durationHint: 10 });
    const scene2 = makeScene({ durationHint: 20 });
    expect(hashScene(scene1)).not.toBe(hashScene(scene2));
  });
});

describe("hashScript", () => {
  it("produces a deterministic hash", () => {
    const script = makeScript({ meta: { title: "Demo" } });
    expect(hashScript(script)).toBe(hashScript(script));
    expect(hashScript(script)).toHaveLength(64);
  });

  it("changes when the title changes", () => {
    const s1 = makeScript({ meta: { title: "Demo A" } });
    const s2 = makeScript({ meta: { title: "Demo B" } });
    expect(hashScript(s1)).not.toBe(hashScript(s2));
  });

  it("changes when viewport changes", () => {
    const s1 = makeScript({
      meta: { title: "Demo", viewport: { width: 1920, height: 1080 } },
    });
    const s2 = makeScript({
      meta: { title: "Demo", viewport: { width: 1280, height: 720 } },
    });
    expect(hashScript(s1)).not.toBe(hashScript(s2));
  });
});

describe("detectChangedScenes", () => {
  it("detects new scenes (not in cache)", () => {
    const scene = makeScene({ name: "New Scene" });
    const script = makeScript({
      acts: [{ name: "Act 1", scenes: [scene] }],
    });
    const cachedHashes = new Map<string, string>();

    const changes = detectChangedScenes(script, cachedHashes);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      sceneName: "New Scene",
      actName: "Act 1",
      reason: "new",
    });
  });

  it("detects modified scenes (hash mismatch)", () => {
    const scene = makeScene({
      name: "Modified Scene",
      actions: [{ type: "click", params: { x: 100 } }],
    });
    const script = makeScript({
      acts: [{ name: "Act 1", scenes: [scene] }],
    });
    const cachedHashes = new Map([["Modified Scene", "old-hash-value"]]);

    const changes = detectChangedScenes(script, cachedHashes);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      sceneName: "Modified Scene",
      actName: "Act 1",
      reason: "modified",
    });
  });

  it("detects removed scenes (in cache but not in script)", () => {
    const script = makeScript({ acts: [{ name: "Act 1", scenes: [] }] });
    const cachedHashes = new Map([["Removed Scene", "some-hash"]]);

    const changes = detectChangedScenes(script, cachedHashes);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      sceneName: "Removed Scene",
      actName: "",
      reason: "removed",
    });
  });

  it("returns empty when nothing changed", () => {
    const scene = makeScene({ name: "Unchanged" });
    const script = makeScript({
      acts: [{ name: "Act 1", scenes: [scene] }],
    });
    const currentHash = hashScene(scene);
    const cachedHashes = new Map([["Unchanged", currentHash]]);

    const changes = detectChangedScenes(script, cachedHashes);
    expect(changes).toHaveLength(0);
  });

  it("reordering scenes does not cause invalidation", () => {
    const sceneA = makeScene({
      name: "A",
      surface: { type: "browser", options: {} },
    });
    const sceneB = makeScene({
      name: "B",
      surface: { type: "terminal", options: {} },
    });

    const cachedHashes = new Map([
      ["A", hashScene(sceneA)],
      ["B", hashScene(sceneB)],
    ]);

    // Reversed order
    const script = makeScript({
      acts: [{ name: "Act 1", scenes: [sceneB, sceneA] }],
    });

    const changes = detectChangedScenes(script, cachedHashes);
    expect(changes).toHaveLength(0);
  });
});
