/** Variables accepted by the blank template. */
export interface BlankTemplateVars {
  readonly title?: string;
  readonly url?: string;
}

/** Minimal blank template with a single browser scene. */
export function blankTemplate(vars: BlankTemplateVars = {}): string {
  const title = vars.title ?? "My Demo";
  const url = vars.url ?? "https://example.com";

  return `---
title: "${title}"
viewport: { width: 1920, height: 1080 }
output:
  format: mp4
  fps: 30
---

# Main

## Introduction
surface: browser
url: ${url}

> Welcome to ${title}.

- pause: 1000
- click: "Get Started"
- pause: 500
`;
}
