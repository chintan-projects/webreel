import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { createAuthorCommand } from "../author.js";

describe("createAuthorCommand", () => {
  describe("command configuration", () => {
    it("returns a Commander Command instance", () => {
      const cmd = createAuthorCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it("has the correct name", () => {
      const cmd = createAuthorCommand();
      expect(cmd.name()).toBe("author");
    });

    it("has a description", () => {
      const cmd = createAuthorCommand();
      expect(cmd.description()).toContain("Author");
    });

    it("does not require a positional argument", () => {
      const cmd = createAuthorCommand();
      expect(cmd.registeredArguments).toHaveLength(0);
    });
  });

  describe("option registration", () => {
    it("registers --brief option", () => {
      const cmd = createAuthorCommand();
      const opt = cmd.options.find((o) => o.long === "--brief");
      expect(opt).toBeDefined();
      expect(opt!.flags).toContain("<path>");
    });

    it("registers --script option", () => {
      const cmd = createAuthorCommand();
      const opt = cmd.options.find((o) => o.long === "--script");
      expect(opt).toBeDefined();
      expect(opt!.flags).toContain("<path>");
    });

    it("registers -o, --output option", () => {
      const cmd = createAuthorCommand();
      const opt = cmd.options.find((o) => o.long === "--output");
      expect(opt).toBeDefined();
      expect(opt!.short).toBe("-o");
      expect(opt!.flags).toContain("<path>");
    });

    it("registers --provider option", () => {
      const cmd = createAuthorCommand();
      const opt = cmd.options.find((o) => o.long === "--provider");
      expect(opt).toBeDefined();
      expect(opt!.flags).toContain("<name>");
    });

    it("registers --model option", () => {
      const cmd = createAuthorCommand();
      const opt = cmd.options.find((o) => o.long === "--model");
      expect(opt).toBeDefined();
      expect(opt!.flags).toContain("<name>");
    });

    it("registers --analyze option", () => {
      const cmd = createAuthorCommand();
      const opt = cmd.options.find((o) => o.long === "--analyze");
      expect(opt).toBeDefined();
    });

    it("registers --verbose option", () => {
      const cmd = createAuthorCommand();
      const opt = cmd.options.find((o) => o.long === "--verbose");
      expect(opt).toBeDefined();
    });
  });

  describe("option parsing", () => {
    /** Create command with no-op action to prevent async side effects during parsing. */
    function createOptionTestCmd(): Command {
      const cmd = createAuthorCommand();
      cmd.action(() => {});
      return cmd;
    }

    it("parses --brief flag with path", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author", "--brief", "brief.yaml"]);
      expect(cmd.opts().brief).toBe("brief.yaml");
    });

    it("parses --script flag with path", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author", "--script", "demo.md"]);
      expect(cmd.opts().script).toBe("demo.md");
    });

    it("parses -o short option with path", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author", "-o", "out.md"]);
      expect(cmd.opts().output).toBe("out.md");
    });

    it("parses --output long option with path", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author", "--output", "out.md"]);
      expect(cmd.opts().output).toBe("out.md");
    });

    it("parses --provider flag with name", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author", "--provider", "openai"]);
      expect(cmd.opts().provider).toBe("openai");
    });

    it("parses --model flag with name", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author", "--model", "gpt-4"]);
      expect(cmd.opts().model).toBe("gpt-4");
    });

    it("parses --analyze flag", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author", "--analyze"]);
      expect(cmd.opts().analyze).toBe(true);
    });

    it("parses --verbose flag", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author", "--verbose"]);
      expect(cmd.opts().verbose).toBe(true);
    });

    it("defaults optional flags to undefined when absent", () => {
      const cmd = createOptionTestCmd();
      cmd.parse(["node", "author"]);
      const opts = cmd.opts();
      expect(opts.brief).toBeUndefined();
      expect(opts.script).toBeUndefined();
      expect(opts.output).toBeUndefined();
      expect(opts.provider).toBeUndefined();
      expect(opts.model).toBeUndefined();
      expect(opts.analyze).toBeUndefined();
      expect(opts.verbose).toBeUndefined();
    });

    it("parses multiple options together", () => {
      const cmd = createOptionTestCmd();
      cmd.parse([
        "node",
        "author",
        "--brief",
        "brief.yaml",
        "-o",
        "output.md",
        "--provider",
        "anthropic",
        "--model",
        "claude-sonnet-4-20250514",
        "--analyze",
        "--verbose",
      ]);
      const opts = cmd.opts();
      expect(opts.brief).toBe("brief.yaml");
      expect(opts.output).toBe("output.md");
      expect(opts.provider).toBe("anthropic");
      expect(opts.model).toBe("claude-sonnet-4-20250514");
      expect(opts.analyze).toBe(true);
      expect(opts.verbose).toBe(true);
    });
  });
});
