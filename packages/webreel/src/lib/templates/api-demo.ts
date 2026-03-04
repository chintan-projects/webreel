/** Variables accepted by the API demo template. */
export interface ApiDemoTemplateVars {
  readonly title?: string;
  readonly url?: string;
  readonly apiEndpoint?: string;
}

/** Browser-based API demo template with documentation browsing and live demo. */
export function apiDemoTemplate(vars: ApiDemoTemplateVars = {}): string {
  const title = vars.title ?? "API Demo";
  const url = vars.url ?? "https://api.example.com";
  const apiEndpoint = vars.apiEndpoint ?? "/api/v1/resource";

  return `---
title: "${title}"
viewport: { width: 1920, height: 1080 }
output:
  format: mp4
  fps: 30
---

# API Overview

## Documentation
surface: browser
url: ${url}/docs

> Let's explore the API documentation for ${title}.

- pause: 1000
- scroll: 300
- pause: 500
- click: "Endpoints"
- pause: 800
- click: "${apiEndpoint}"
- pause: 500

# Live Demo

## API Request
surface: browser
url: ${url}/playground

> Now let's make a live API call to see it in action.

- pause: 800
- click: "Method"
- click: "GET"
- pause: 300
- click: "URL"
- type: "${url}${apiEndpoint}"
- pause: 500
- click: "Send Request"
- pause: 1500
`;
}
