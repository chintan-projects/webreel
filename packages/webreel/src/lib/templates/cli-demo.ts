/** Variables accepted by the CLI demo template. */
export interface CliDemoTemplateVars {
  readonly title?: string;
  readonly packageName?: string;
  readonly command?: string;
}

/** Terminal-focused CLI demo template showing installation and usage. */
export function cliDemoTemplate(vars: CliDemoTemplateVars = {}): string {
  const title = vars.title ?? "CLI Demo";
  const packageName = vars.packageName ?? "my-tool";
  const command = vars.command ?? packageName;

  return `---
title: "${title}"
viewport: { width: 1920, height: 1080 }
output:
  format: mp4
  fps: 30
---

# Setup

## Installation
surface: terminal

> First, let's install ${packageName}.

- type: "npm install -g ${packageName}"
- pause: 1500
- type: "${command} --version"
- pause: 800

# Usage

## Basic Commands
surface: terminal

> Now let's explore the basic commands.

- type: "${command} --help"
- pause: 1200
- type: "${command} init my-project"
- pause: 1000

## Advanced Usage
surface: terminal

> Here are some more advanced features you can use.

- type: "${command} run --verbose"
- pause: 1500
- type: "${command} status"
- pause: 800
`;
}
