import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

/** Mock dependencies before importing the module under test. */
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("@webreel/director", () => ({
  parse: vi.fn(),
}));

vi.mock("../../lib/plan-generator.js", () => ({
  generatePlan: vi.fn(),
}));

vi.mock("../../lib/plan-validator.js", () => ({
  validatePrerequisites: vi.fn(),
}));

vi.mock("../../lib/plan-formatter.js", () => ({
  formatPlan: vi.fn(),
  formatValidation: vi.fn(),
}));

import { createPlanCommand } from "../plan.js";
import { readFile } from "node:fs/promises";
import { parse } from "@webreel/director";
import { generatePlan } from "../../lib/plan-generator.js";
import { validatePrerequisites } from "../../lib/plan-validator.js";
import { formatPlan, formatValidation } from "../../lib/plan-formatter.js";
import type { ExecutionPlan } from "../../lib/plan-generator.js";
import type { ValidationResult } from "../../lib/plan-validator.js";

const mockReadFile = vi.mocked(readFile);
const mockParse = vi.mocked(parse);
const mockGeneratePlan = vi.mocked(generatePlan);
const mockValidatePrerequisites = vi.mocked(validatePrerequisites);
const mockFormatPlan = vi.mocked(formatPlan);
const mockFormatValidation = vi.mocked(formatValidation);

/** Helper to build a minimal ExecutionPlan for testing. */
function makePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    scriptTitle: "Test Demo",
    totalScenes: 1,
    totalActs: 1,
    estimatedDurationSec: 10,
    prerequisites: [],
    acts: [],
    risks: [],
    ...overrides,
  };
}

describe("createPlanCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("command configuration", () => {
    it("returns a Commander Command instance", () => {
      const cmd = createPlanCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it("has the correct name", () => {
      const cmd = createPlanCommand();
      expect(cmd.name()).toBe("plan");
    });

    it("has a description", () => {
      const cmd = createPlanCommand();
      expect(cmd.description()).toContain("Analyze");
    });

    it("requires a <script> argument", () => {
      const cmd = createPlanCommand();
      const args = cmd.registeredArguments;
      expect(args).toHaveLength(1);
      expect(args[0].name()).toBe("script");
      expect(args[0].required).toBe(true);
    });

    it("registers --validate option", () => {
      const cmd = createPlanCommand();
      const opt = cmd.options.find((o) => o.long === "--validate");
      expect(opt).toBeDefined();
    });

    it("registers --timing option", () => {
      const cmd = createPlanCommand();
      const opt = cmd.options.find((o) => o.long === "--timing");
      expect(opt).toBeDefined();
    });

    it("registers --json option", () => {
      const cmd = createPlanCommand();
      const opt = cmd.options.find((o) => o.long === "--json");
      expect(opt).toBeDefined();
    });

    it("registers --no-color option", () => {
      const cmd = createPlanCommand();
      const opt = cmd.options.find((o) => o.long === "--no-color");
      expect(opt).toBeDefined();
    });
  });

  describe("option parsing", () => {
    /** Create command with no-op action to prevent async side effects during parsing. */
    function createOptionTestCmd(): Command {
      const cmd = createPlanCommand();
      cmd.action(() => {});
      return cmd;
    }

    it("parses --validate flag", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "plan", "script.md", "--validate"]);
      expect(cmd.opts().validate).toBe(true);
    });

    it("parses --timing flag", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "plan", "script.md", "--timing"]);
      expect(cmd.opts().timing).toBe(true);
    });

    it("parses --json flag", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "plan", "script.md", "--json"]);
      expect(cmd.opts().json).toBe(true);
    });

    it("parses --no-color flag", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "plan", "script.md", "--no-color"]);
      expect(cmd.opts().color).toBe(false);
    });

    it("defaults color to true when --no-color is absent", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "plan", "script.md"]);
      expect(cmd.opts().color).toBe(true);
    });
  });

  describe("action execution", () => {
    /** Helper to run the plan command action with mocks wired up. */
    async function runAction(
      args: string[] = ["node", "plan", "demo.md"],
    ): Promise<void> {
      const plan = makePlan();
      const scriptContent = "# Demo Markdown";
      const parsedScript = { meta: { title: "Test" }, acts: [] };

      mockReadFile.mockResolvedValue(scriptContent);
      mockParse.mockReturnValue(parsedScript as ReturnType<typeof parse>);
      mockGeneratePlan.mockReturnValue(plan);
      mockFormatPlan.mockReturnValue("formatted plan output");

      const cmd = createPlanCommand();
      // Prevent commander from calling process.exit on missing args
      cmd.exitOverride();
      await cmd.parseAsync(args);
    }

    it("reads the script file", async () => {
      await runAction();
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining("demo.md"),
        "utf-8",
      );
    });

    it("parses the script content", async () => {
      await runAction();
      expect(mockParse).toHaveBeenCalledWith("# Demo Markdown");
    });

    it("generates a plan from the parsed script", async () => {
      await runAction();
      expect(mockGeneratePlan).toHaveBeenCalled();
    });

    it("outputs JSON when --json is passed", async () => {
      const plan = makePlan({ scriptTitle: "JSON Test" });
      mockReadFile.mockResolvedValue("content");
      mockParse.mockReturnValue({
        meta: { title: "T" },
        acts: [],
      } as ReturnType<typeof parse>);
      mockGeneratePlan.mockReturnValue(plan);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      const cmd = createPlanCommand();
      cmd.exitOverride();
      await cmd.parseAsync(["node", "plan", "demo.md", "--json"]);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"scriptTitle": "JSON Test"'),
      );
      logSpy.mockRestore();
    });

    it("formats and prints the plan for non-JSON output", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      await runAction();

      expect(mockFormatPlan).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith("formatted plan output");
      logSpy.mockRestore();
    });

    it("runs validation when --validate is passed and plan passes", async () => {
      const plan = makePlan();
      const validation: ValidationResult = { passed: true, checks: [] };

      mockReadFile.mockResolvedValue("content");
      mockParse.mockReturnValue({
        meta: { title: "T" },
        acts: [],
      } as ReturnType<typeof parse>);
      mockGeneratePlan.mockReturnValue(plan);
      mockFormatPlan.mockReturnValue("plan");
      mockValidatePrerequisites.mockResolvedValue(validation);
      mockFormatValidation.mockReturnValue("validation output");

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      const cmd = createPlanCommand();
      cmd.exitOverride();
      await cmd.parseAsync(["node", "plan", "demo.md", "--validate"]);

      expect(mockValidatePrerequisites).toHaveBeenCalledWith(plan);
      expect(mockFormatValidation).toHaveBeenCalledWith(validation);
      expect(logSpy).toHaveBeenCalledWith("validation output");
      logSpy.mockRestore();
    });

    it("exits with code 1 when validation fails", async () => {
      const plan = makePlan();
      const validation: ValidationResult = {
        passed: false,
        checks: [
          {
            name: "ffmpeg",
            status: "fail",
            message: "not found",
            durationMs: 5,
          },
        ],
      };

      mockReadFile.mockResolvedValue("content");
      mockParse.mockReturnValue({
        meta: { title: "T" },
        acts: [],
      } as ReturnType<typeof parse>);
      mockGeneratePlan.mockReturnValue(plan);
      mockFormatPlan.mockReturnValue("plan");
      mockValidatePrerequisites.mockResolvedValue(validation);
      mockFormatValidation.mockReturnValue("fail output");

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      vi.spyOn(console, "log").mockImplementation(() => undefined);

      const cmd = createPlanCommand();
      await cmd.parseAsync(["node", "plan", "demo.md", "--validate"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it("exits with code 1 on read error", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT: file not found"));

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const cmd = createPlanCommand();
      await cmd.parseAsync(["node", "plan", "missing.md"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Plan failed"));
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
