import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { scanProject } from "../project-scanner.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures", "sample-project");

describe("scanProject", () => {
  it("extracts npm scripts as start commands", async () => {
    const result = await scanProject(FIXTURES_DIR);

    const npmCommands = result.startCommands.filter((c) => c.source === "package.json");
    expect(npmCommands.length).toBeGreaterThanOrEqual(2);

    const devCmd = npmCommands.find((c) => c.name === "dev");
    expect(devCmd).toBeDefined();
    expect(devCmd!.command).toBe("npm run dev");

    const startCmd = npmCommands.find((c) => c.name === "start");
    expect(startCmd).toBeDefined();
    expect(startCmd!.command).toBe("npm run start");
  });

  it("extracts Makefile targets as start commands", async () => {
    const result = await scanProject(FIXTURES_DIR);

    const makeCommands = result.startCommands.filter((c) => c.source === "Makefile");
    expect(makeCommands.length).toBeGreaterThanOrEqual(1);

    const devTarget = makeCommands.find((c) => c.name === "dev");
    expect(devTarget).toBeDefined();
    expect(devTarget!.command).toBe("make dev");
  });

  it("extracts port from npm scripts", async () => {
    const result = await scanProject(FIXTURES_DIR);

    const port3000 = result.ports.find((p) => p.port === 3000);
    expect(port3000).toBeDefined();
  });

  it("extracts environment variable names from .env.example", async () => {
    const result = await scanProject(FIXTURES_DIR);

    const names = result.envVars.map((v) => v.name);
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("OPENAI_API_KEY");
    expect(names).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("detects framework from dependencies", async () => {
    const result = await scanProject(FIXTURES_DIR);
    expect(result.framework).toBe("next");
  });

  it("extracts key dependencies", async () => {
    const result = await scanProject(FIXTURES_DIR);
    const depNames = result.dependencies.map((d) => d.name);
    expect(depNames).toContain("next");
  });

  it("reads and truncates README", async () => {
    const result = await scanProject(FIXTURES_DIR);
    expect(result.readme).toBeDefined();
    expect(result.readme).toContain("Sample Project");
    expect(result.readme).toContain("Quick Start");
  });

  it("returns empty results for nonexistent directory", async () => {
    const result = await scanProject("/nonexistent/path/abc123");
    expect(result.startCommands).toHaveLength(0);
    expect(result.ports).toHaveLength(0);
    expect(result.envVars).toHaveLength(0);
    expect(result.dependencies).toHaveLength(0);
    expect(result.framework).toBeUndefined();
    expect(result.readme).toBeUndefined();
  });

  it("respects maxReadmeChars option", async () => {
    const result = await scanProject(FIXTURES_DIR, { maxReadmeChars: 50 });
    expect(result.readme).toBeDefined();
    // Should be truncated — the README is longer than 50 chars
    expect(result.readme!.length).toBeLessThanOrEqual(70); // 50 + "[truncated]" overhead
  });
});
