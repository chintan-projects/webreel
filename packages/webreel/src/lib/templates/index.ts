import { blankTemplate } from "./blank.js";
import { productWalkthroughTemplate } from "./product-walkthrough.js";
import { cliDemoTemplate } from "./cli-demo.js";
import { apiDemoTemplate } from "./api-demo.js";

/** All available template names. */
export const TEMPLATE_NAMES = [
  "blank",
  "product-walkthrough",
  "cli-demo",
  "api-demo",
] as const;

/** Union type of valid template name strings. */
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

/** Variables that can be passed to any template. */
export interface TemplateVars {
  readonly title?: string;
  readonly url?: string;
  readonly [key: string]: string | undefined;
}

/** Metadata about a single template. */
export interface TemplateInfo {
  readonly name: TemplateName;
  readonly description: string;
}

/** Get template info for all available templates. */
export function listTemplates(): readonly TemplateInfo[] {
  return [
    { name: "blank", description: "Minimal single-scene browser demo" },
    {
      name: "product-walkthrough",
      description: "Multi-act product feature walkthrough",
    },
    {
      name: "cli-demo",
      description: "Terminal-based CLI tool demonstration",
    },
    {
      name: "api-demo",
      description: "API documentation and live demo",
    },
  ];
}

/** Get rendered template content by name. Throws if the template name is unknown. */
export function getTemplate(name: string, vars: TemplateVars = {}): string {
  switch (name) {
    case "blank":
      return blankTemplate(vars);
    case "product-walkthrough":
      return productWalkthroughTemplate(vars);
    case "cli-demo":
      return cliDemoTemplate(vars);
    case "api-demo":
      return apiDemoTemplate(vars);
    default:
      throw new Error(
        `Unknown template: "${name}". Available: ${TEMPLATE_NAMES.join(", ")}`,
      );
  }
}
