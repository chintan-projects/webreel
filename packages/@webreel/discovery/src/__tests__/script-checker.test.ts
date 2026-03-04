import { describe, it, expect } from "vitest";
import { checkScript, formatCheckReport } from "../script-checker.js";
import type { DemoScript } from "@webreel/director";
import type {
  AppContext,
  DiscoveredPage,
  WebProbeResult,
  ProjectScanResult,
} from "../types.js";

/** Create a minimal DemoScript with the given scenes. */
function makeScript(
  scenes: Array<{
    name: string;
    surfaceType: string;
    actions: Array<{ type: string; params: Record<string, unknown> }>;
  }>,
): DemoScript {
  return {
    meta: { title: "Test Script" },
    acts: [
      {
        name: "Act 1",
        scenes: scenes.map((s) => ({
          name: s.name,
          surface: { type: s.surfaceType, options: {} },
          narration: [],
          actions: s.actions.map((a) => ({
            type: a.type,
            params: a.params,
          })),
          transitions: {},
          directorNotes: [],
        })),
      },
    ],
  };
}

/** A probe result with one page containing two buttons and a link. */
const sampleProbe: WebProbeResult = {
  entryUrl: "http://localhost:3000",
  pages: [
    {
      url: "http://localhost:3000",
      title: "Home",
      elements: [
        {
          role: "button",
          name: "Run Test",
          selector: '[data-testid="run-test"]',
          textContent: "Run Test",
          tagName: "button",
        },
        {
          role: "button",
          name: "Submit Form",
          selector: "button.submit-btn",
          textContent: "Submit Form",
          tagName: "button",
        },
        {
          role: "link",
          name: "Dashboard",
          selector: 'a[href="/dashboard"]',
          textContent: "Dashboard",
          tagName: "a",
        },
      ],
      links: [{ text: "Dashboard", href: "http://localhost:3000/dashboard" }],
    },
    {
      url: "http://localhost:3000/dashboard",
      title: "Dashboard",
      elements: [
        {
          role: "button",
          name: "Export Data",
          selector: "#export-btn",
          textContent: "Export Data",
          tagName: "button",
        },
      ],
      links: [],
    },
  ],
  siteMap: [
    { url: "http://localhost:3000", title: "Home", elementCount: 3, linkCount: 1 },
    {
      url: "http://localhost:3000/dashboard",
      title: "Dashboard",
      elementCount: 1,
      linkCount: 0,
    },
  ],
};

const sampleScan: ProjectScanResult = {
  startCommands: [
    { command: "make dev", source: "Makefile", name: "dev" },
    { command: "npm run dev", source: "package.json", name: "dev" },
  ],
  ports: [{ port: 3000, source: "package.json" }],
  envVars: [{ name: "DATABASE_URL", source: ".env.example" }],
  dependencies: [{ name: "next", version: "^14.0.0" }],
  framework: "next",
  readme: "# Sample",
};

describe("checkScript", () => {
  it("passes for a script using known selectors", () => {
    const script = makeScript([
      {
        name: "Click Test",
        surfaceType: "browser",
        actions: [{ type: "click", params: { selector: '[data-testid="run-test"]' } }],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("flags hallucinated selectors as errors", () => {
    const script = makeScript([
      {
        name: "Click Fake",
        surfaceType: "browser",
        actions: [{ type: "click", params: { selector: ".nonexistent-btn" } }],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);
    expect(report.passed).toBe(false);

    const issue = report.issues[0]!;
    expect(issue.severity).toBe("error");
    expect(issue.actionType).toBe("click");
    expect(issue.message).toContain(".nonexistent-btn");
    expect(issue.message).toContain("not found");
  });

  it("provides alternatives for hallucinated selectors", () => {
    const script = makeScript([
      {
        name: "Click Similar",
        surfaceType: "browser",
        actions: [{ type: "click", params: { selector: ".submit-button" } }],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);

    const issue = report.issues[0]!;
    expect(issue.discoveredAlternatives).toBeDefined();
    expect(issue.discoveredAlternatives!.length).toBeGreaterThan(0);
    // Should find the "Submit Form" button as an alternative
    const hasSubmit = issue.discoveredAlternatives!.some(
      (el) => el.name === "Submit Form",
    );
    expect(hasSubmit).toBe(true);
  });

  it("warns for text-based targeting that doesn't match", () => {
    const script = makeScript([
      {
        name: "Click By Text",
        surfaceType: "browser",
        actions: [{ type: "click", params: { text: "Nonexistent Button" } }],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);

    // Text not found is a warning (not error) since text can appear dynamically
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues[0]!.severity).toBe("warning");
  });

  it("passes for text-based targeting that matches", () => {
    const script = makeScript([
      {
        name: "Click Run",
        surfaceType: "browser",
        actions: [{ type: "click", params: { text: "Run Test" } }],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("warns for unknown navigate URLs", () => {
    const script = makeScript([
      {
        name: "Go to Unknown",
        surfaceType: "browser",
        actions: [
          { type: "navigate", params: { url: "http://localhost:3000/settings" } },
        ],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);

    const navIssue = report.issues.find((i) => i.actionType === "navigate");
    expect(navIssue).toBeDefined();
    expect(navIssue!.severity).toBe("warning");
    expect(navIssue!.message).toContain("/settings");
  });

  it("passes for known navigate URLs", () => {
    const script = makeScript([
      {
        name: "Go to Dashboard",
        surfaceType: "browser",
        actions: [
          { type: "navigate", params: { url: "http://localhost:3000/dashboard" } },
        ],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);

    const navIssues = report.issues.filter((i) => i.actionType === "navigate");
    expect(navIssues).toHaveLength(0);
  });

  it("skips browser checks when no web probe data", () => {
    const script = makeScript([
      {
        name: "Click Anything",
        surfaceType: "browser",
        actions: [{ type: "click", params: { selector: ".anything" } }],
      },
    ]);

    const context: AppContext = { projectScan: sampleScan };
    const report = checkScript(script, context);
    // No web probe data — browser checks are skipped
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("allows common shell commands in terminal scenes", () => {
    const script = makeScript([
      {
        name: "Terminal Setup",
        surfaceType: "terminal",
        actions: [
          { type: "run", params: { command: "git clone https://example.com/repo.git" } },
          { type: "run", params: { command: "cd repo" } },
          { type: "run", params: { command: "npm install" } },
        ],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("passes for known project commands in terminal scenes", () => {
    const script = makeScript([
      {
        name: "Start Dev",
        surfaceType: "terminal",
        actions: [{ type: "run", params: { command: "make dev" } }],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("handles title surface scenes without issues", () => {
    const script = makeScript([
      {
        name: "Title Card",
        surfaceType: "title",
        actions: [],
      },
    ]);

    const context: AppContext = { webProbe: sampleProbe, projectScan: sampleScan };
    const report = checkScript(script, context);
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });
});

describe("formatCheckReport", () => {
  it("formats a passing report", () => {
    const report = { passed: true, issues: [] };
    const formatted = formatCheckReport(report);
    expect(formatted).toContain("passed");
  });

  it("formats a failing report with issues and alternatives", () => {
    const report = {
      passed: false,
      issues: [
        {
          severity: "error" as const,
          sceneName: "Click Test",
          actionIndex: 0,
          actionType: "click",
          message: 'Selector ".fake" not found.',
          suggestion: 'Use button "Run Test" instead',
          discoveredAlternatives: [
            {
              role: "button",
              name: "Run Test",
              selector: '[data-testid="run-test"]',
              tagName: "button",
            },
          ],
        },
      ],
    };

    const formatted = formatCheckReport(report);
    expect(formatted).toContain("FAILED");
    expect(formatted).toContain("Click Test");
    expect(formatted).toContain(".fake");
    expect(formatted).toContain("Run Test");
    expect(formatted).toContain('[data-testid="run-test"]');
  });
});
