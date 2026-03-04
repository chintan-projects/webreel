import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadPrompt, substituteVariables } from "../../prompts/prompt-loader.js";
import { readFile } from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// substituteVariables (pure function, no mocking needed)
// ---------------------------------------------------------------------------

describe("substituteVariables", () => {
  it("replaces {{key}} with value from variables map", () => {
    const result = substituteVariables("Hello {{name}}, welcome to {{place}}.", {
      name: "Alice",
      place: "Wonderland",
    });
    expect(result).toBe("Hello Alice, welcome to Wonderland.");
  });

  it("leaves unmatched {{variables}} as-is", () => {
    const result = substituteVariables("{{greeting}} {{name}}", {
      greeting: "Hi",
    });
    expect(result).toBe("Hi {{name}}");
  });

  it("handles template with no variables", () => {
    const result = substituteVariables("No placeholders here.", {});
    expect(result).toBe("No placeholders here.");
  });

  it("handles empty template", () => {
    const result = substituteVariables("", { key: "value" });
    expect(result).toBe("");
  });

  it("replaces multiple occurrences of the same variable", () => {
    const result = substituteVariables("{{x}} and {{x}}", { x: "yes" });
    expect(result).toBe("yes and yes");
  });
});

// ---------------------------------------------------------------------------
// loadPrompt
// ---------------------------------------------------------------------------

describe("loadPrompt", () => {
  it("loads bundled template when user override is not found", async () => {
    // First call (user override) fails, second call (bundled) succeeds
    mockReadFile
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce("Hello {{name}}!");

    const result = await loadPrompt("test-template", { name: "World" });
    expect(result).toBe("Hello World!");
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });

  it("loads user override when it exists", async () => {
    mockReadFile.mockResolvedValueOnce("Custom: {{name}}");

    const result = await loadPrompt("test-template", { name: "Override" });
    expect(result).toBe("Custom: Override");
    // Should only call readFile once (user override found)
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it("applies variable substitution to loaded template", async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce("Spec: {{demo_markdown_spec}}\nEnd.");

    const result = await loadPrompt("brief-to-draft", {
      demo_markdown_spec: "THE SPEC CONTENT",
    });
    expect(result).toBe("Spec: THE SPEC CONTENT\nEnd.");
  });

  it("throws error when template is not found in either location", async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockRejectedValueOnce(new Error("ENOENT"));

    await expect(loadPrompt("nonexistent")).rejects.toThrow(/not found/);
  });

  it("returns template as-is when no variables provided", async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce("No {{substitution}} here.");

    const result = await loadPrompt("raw-template");
    expect(result).toBe("No {{substitution}} here.");
  });
});
