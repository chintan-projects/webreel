/** Variables accepted by the product walkthrough template. */
export interface ProductWalkthroughTemplateVars {
  readonly title?: string;
  readonly url?: string;
  readonly productName?: string;
}

/** Multi-act product walkthrough template with landing, sign-up, dashboard, and feature scenes. */
export function productWalkthroughTemplate(
  vars: ProductWalkthroughTemplateVars = {},
): string {
  const title = vars.title ?? "Product Walkthrough";
  const url = vars.url ?? "https://example.com";
  const productName = vars.productName ?? "our product";

  return `---
title: "${title}"
viewport: { width: 1920, height: 1080 }
output:
  format: mp4
  fps: 30
---

# Getting Started

## Landing Page
surface: browser
url: ${url}

> Let me show you how to get started with ${productName}.

- pause: 1000
- scroll: 300
- pause: 500
- click: "Sign Up"
- pause: 800

## Sign Up
surface: browser
url: ${url}/signup

> Creating an account is quick and easy.

- click: "Email"
- type: "user@example.com"
- pause: 300
- click: "Password"
- type: "secure-password"
- pause: 300
- click: "Create Account"
- pause: 1000

# Core Features

## Dashboard
surface: browser
url: ${url}/dashboard

> Once you're in, you'll see your personalized dashboard.

- pause: 1000
- scroll: 200
- pause: 500
- click: "Projects"
- pause: 800

## Key Feature
surface: browser
url: ${url}/dashboard/feature

> Here's where the magic happens. Let me walk you through the key feature.

- pause: 500
- click: "New Project"
- pause: 300
- type: "My First Project"
- pause: 300
- click: "Create"
- pause: 1000
`;
}
