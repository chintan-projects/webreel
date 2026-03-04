/**
 * Parser roundtrip e2e test — validates that all fixture Demo Markdown scripts
 * parse without errors through the @webreel/director parser.
 *
 * No external services required (Chrome, ffmpeg, etc.). Pure parse validation.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parse } from "@webreel/director";
import type { DemoScript } from "@webreel/director";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

/**
 * Read all .md fixture files from the fixtures directory.
 * Returns an array of { name, content } pairs.
 */
async function loadFixtures(): Promise<readonly { name: string; content: string }[]> {
  const entries = await readdir(fixturesDir);
  const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();

  const results: { name: string; content: string }[] = [];
  for (const name of mdFiles) {
    const content = await readFile(join(fixturesDir, name), "utf-8");
    results.push({ name, content });
  }
  return results;
}

describe("parser roundtrip (fixture scripts)", () => {
  it("all fixture scripts parse without errors", async () => {
    const fixtures = await loadFixtures();
    expect(fixtures.length).toBeGreaterThan(0);

    for (const { name, content } of fixtures) {
      let script: DemoScript;
      try {
        script = parse(content);
      } catch (error) {
        throw new Error(
          `Fixture "${name}" failed to parse: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      expect(script.acts.length, `${name} should have at least one act`).toBeGreaterThan(
        0,
      );

      const totalScenes = script.acts.reduce((sum, act) => sum + act.scenes.length, 0);
      expect(totalScenes, `${name} should have at least one scene`).toBeGreaterThan(0);
    }
  });

  it("parsed script preserves narration blocks", async () => {
    const content = await readFile(join(fixturesDir, "liquid-pii-detection.md"), "utf-8");
    const script: DemoScript = parse(content);

    const allNarration = script.acts.flatMap((act) =>
      act.scenes.flatMap((scene) => scene.narration),
    );

    expect(
      allNarration.length,
      "should have at least one narration block",
    ).toBeGreaterThanOrEqual(1);

    const narrationText = allNarration.map((n) => n.text).join(" ");
    const containsExpectedTerm =
      narrationText.includes("identifies") ||
      narrationText.includes("PII") ||
      narrationText.includes("personally identifiable");

    expect(
      containsExpectedTerm,
      `narration should reference PII detection; got: "${narrationText}"`,
    ).toBe(true);
  });

  it("parsed script has valid surface configs", async () => {
    const fixtures = await loadFixtures();

    for (const { name, content } of fixtures) {
      const script: DemoScript = parse(content);

      for (const act of script.acts) {
        for (const scene of act.scenes) {
          expect(
            scene.surface.type,
            `${name} > ${act.name} > ${scene.name}: surface.type must be non-empty`,
          ).toBeTruthy();

          if (scene.surface.type === "browser") {
            expect(
              scene.surface.options.url,
              `${name} > ${act.name} > ${scene.name}: browser surface must have a url`,
            ).toBeTruthy();
          }
        }
      }
    }
  });

  it("multi-scene script has correct scene count", async () => {
    const content = await readFile(
      join(fixturesDir, "multi-scene-walkthrough.md"),
      "utf-8",
    );
    const script: DemoScript = parse(content);

    const totalScenes = script.acts.reduce((sum, act) => sum + act.scenes.length, 0);
    expect(totalScenes).toBe(2);

    const sceneNames = script.acts.flatMap((act) =>
      act.scenes.map((scene) => scene.name),
    );
    expect(sceneNames).toContain("Homepage");
    expect(sceneNames).toContain("Solutions Page");
  });
});
