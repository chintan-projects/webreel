import { describe, it, expect } from "vitest";
import { getTemplate, listTemplates, TEMPLATE_NAMES } from "../templates/index.js";
import { blankTemplate } from "../templates/blank.js";
import { productWalkthroughTemplate } from "../templates/product-walkthrough.js";
import { cliDemoTemplate } from "../templates/cli-demo.js";
import { apiDemoTemplate } from "../templates/api-demo.js";

describe("TEMPLATE_NAMES", () => {
  it("contains all expected template names", () => {
    expect(TEMPLATE_NAMES).toEqual([
      "blank",
      "product-walkthrough",
      "cli-demo",
      "api-demo",
    ]);
  });
});

describe("listTemplates", () => {
  it("returns info for all registered templates", () => {
    const templates = listTemplates();
    expect(templates).toHaveLength(TEMPLATE_NAMES.length);
    for (const t of templates) {
      expect(TEMPLATE_NAMES).toContain(t.name);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("returns readonly array", () => {
    const a = listTemplates();
    const b = listTemplates();
    expect(a).toEqual(b);
  });
});

describe("getTemplate", () => {
  it("throws for unknown template name", () => {
    expect(() => getTemplate("nonexistent")).toThrow('Unknown template: "nonexistent"');
  });

  it("error message includes available template names", () => {
    expect(() => getTemplate("bad")).toThrow(TEMPLATE_NAMES.join(", "));
  });

  it("returns content for each registered template name", () => {
    for (const name of TEMPLATE_NAMES) {
      const content = getTemplate(name);
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("passes vars through to templates", () => {
    const content = getTemplate("blank", {
      title: "Custom Title",
      url: "https://custom.dev",
    });
    expect(content).toContain("Custom Title");
    expect(content).toContain("https://custom.dev");
  });
});

describe("blankTemplate", () => {
  it("renders valid Demo Markdown with frontmatter", () => {
    const content = blankTemplate();
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('title: "My Demo"');
    expect(content).toContain("viewport: { width: 1920, height: 1080 }");
    expect(content).toContain("format: mp4");
    expect(content).toContain("fps: 30");
  });

  it("contains a scene with surface and url", () => {
    const content = blankTemplate();
    expect(content).toContain("surface: browser");
    expect(content).toContain("url: https://example.com");
  });

  it("contains narration and actions", () => {
    const content = blankTemplate();
    expect(content).toContain("> Welcome to My Demo.");
    expect(content).toContain("- pause: 1000");
    expect(content).toContain('- click: "Get Started"');
  });

  it("uses custom vars when provided", () => {
    const content = blankTemplate({
      title: "Test App",
      url: "https://test.app",
    });
    expect(content).toContain('title: "Test App"');
    expect(content).toContain("url: https://test.app");
    expect(content).toContain("> Welcome to Test App.");
  });

  it("uses defaults when no vars provided", () => {
    const content = blankTemplate({});
    expect(content).toContain('title: "My Demo"');
    expect(content).toContain("url: https://example.com");
  });
});

describe("productWalkthroughTemplate", () => {
  it("renders two acts with multiple scenes", () => {
    const content = productWalkthroughTemplate();
    expect(content).toContain("# Getting Started");
    expect(content).toContain("## Landing Page");
    expect(content).toContain("## Sign Up");
    expect(content).toContain("# Core Features");
    expect(content).toContain("## Dashboard");
    expect(content).toContain("## Key Feature");
  });

  it("contains narration blocks", () => {
    const content = productWalkthroughTemplate();
    expect(content).toContain("> Let me show you how to get started");
    expect(content).toContain("> Creating an account is quick and easy.");
  });

  it("contains click, type, and scroll actions", () => {
    const content = productWalkthroughTemplate();
    expect(content).toContain('- click: "Sign Up"');
    expect(content).toContain('- type: "user@example.com"');
    expect(content).toContain("- scroll: 300");
  });

  it("uses custom productName var", () => {
    const content = productWalkthroughTemplate({
      productName: "Acme Dashboard",
    });
    expect(content).toContain("Acme Dashboard");
  });

  it("uses custom title and url", () => {
    const content = productWalkthroughTemplate({
      title: "Acme Tour",
      url: "https://acme.dev",
    });
    expect(content).toContain('title: "Acme Tour"');
    expect(content).toContain("url: https://acme.dev");
  });
});

describe("cliDemoTemplate", () => {
  it("uses terminal surface", () => {
    const content = cliDemoTemplate();
    expect(content).toContain("surface: terminal");
    expect(content).not.toContain("surface: browser");
  });

  it("renders setup and usage acts", () => {
    const content = cliDemoTemplate();
    expect(content).toContain("# Setup");
    expect(content).toContain("## Installation");
    expect(content).toContain("# Usage");
    expect(content).toContain("## Basic Commands");
    expect(content).toContain("## Advanced Usage");
  });

  it("includes install and help commands with defaults", () => {
    const content = cliDemoTemplate();
    expect(content).toContain('- type: "npm install -g my-tool"');
    expect(content).toContain('- type: "my-tool --help"');
  });

  it("uses custom packageName and command", () => {
    const content = cliDemoTemplate({
      packageName: "@acme/cli",
      command: "acme",
    });
    expect(content).toContain('- type: "npm install -g @acme/cli"');
    expect(content).toContain('- type: "acme --help"');
    expect(content).toContain('- type: "acme init my-project"');
  });

  it("derives command from packageName when command not provided", () => {
    const content = cliDemoTemplate({ packageName: "my-cli" });
    expect(content).toContain('- type: "my-cli --help"');
  });
});

describe("apiDemoTemplate", () => {
  it("renders overview and live demo acts", () => {
    const content = apiDemoTemplate();
    expect(content).toContain("# API Overview");
    expect(content).toContain("## Documentation");
    expect(content).toContain("# Live Demo");
    expect(content).toContain("## API Request");
  });

  it("uses browser surface", () => {
    const content = apiDemoTemplate();
    expect(content).toContain("surface: browser");
  });

  it("includes default API endpoint in actions", () => {
    const content = apiDemoTemplate();
    expect(content).toContain('- click: "/api/v1/resource"');
  });

  it("uses custom apiEndpoint var", () => {
    const content = apiDemoTemplate({
      apiEndpoint: "/v2/users",
    });
    expect(content).toContain('- click: "/v2/users"');
    expect(content).toContain("/v2/users");
  });

  it("uses custom url in documentation and playground links", () => {
    const content = apiDemoTemplate({ url: "https://api.acme.io" });
    expect(content).toContain("url: https://api.acme.io/docs");
    expect(content).toContain("url: https://api.acme.io/playground");
  });
});

describe("all templates produce valid Demo Markdown structure", () => {
  for (const name of TEMPLATE_NAMES) {
    it(`${name} has frontmatter delimiters`, () => {
      const content = getTemplate(name);
      const parts = content.split("---");
      expect(parts.length).toBeGreaterThanOrEqual(3);
    });

    it(`${name} has at least one act heading`, () => {
      const content = getTemplate(name);
      expect(content).toMatch(/^# .+/m);
    });

    it(`${name} has at least one scene heading`, () => {
      const content = getTemplate(name);
      expect(content).toMatch(/^## .+/m);
    });

    it(`${name} has at least one action`, () => {
      const content = getTemplate(name);
      expect(content).toMatch(/^- (click|type|pause|scroll|key): /m);
    });
  }
});
