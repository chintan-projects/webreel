/**
 * Script Checker — pre-render validation of generated Demo Markdown.
 *
 * Validates a DemoScript IR against discovered app context. Catches
 * hallucinated selectors, fabricated URLs, and impossible commands
 * before the renderer burns time trying to execute them.
 */

import type { DemoScript, Scene, ActionDirective } from "@webreel/director";
import type {
  AppContext,
  ScriptCheckReport,
  ScriptCheckIssue,
  DiscoveredElement,
  DiscoveredPage,
  WebProbeResult,
  ProjectScanResult,
} from "./types.js";

/** Action types that reference CSS selectors or text for element targeting. */
const ELEMENT_TARGETING_ACTIONS = new Set([
  "click",
  "hover",
  "wait_for_selector",
  "select",
  "drag",
  "scroll",
]);

/** Action types that reference URLs. */
const URL_ACTIONS = new Set(["navigate"]);

/** Common shell commands that don't need to be in the project. */
const COMMON_COMMANDS = new Set([
  "cd",
  "ls",
  "cat",
  "echo",
  "clear",
  "mkdir",
  "cp",
  "mv",
  "git",
  "curl",
  "wget",
  "pip",
  "npm",
  "npx",
  "yarn",
  "pnpm",
  "node",
  "python",
  "python3",
  "docker",
  "docker-compose",
]);

/**
 * Check a DemoScript against discovered app context.
 *
 * @param script - The parsed DemoScript IR to validate.
 * @param context - Discovery context (web probe + project scan results).
 * @returns Report with issues found.
 */
export function checkScript(script: DemoScript, context: AppContext): ScriptCheckReport {
  const issues: ScriptCheckIssue[] = [];

  for (const act of script.acts) {
    for (const scene of act.scenes) {
      const surfaceType = scene.surface.type;

      for (let i = 0; i < scene.actions.length; i++) {
        const action = scene.actions[i]!;

        if (surfaceType === "browser") {
          checkBrowserAction(action, i, scene.name, context, issues);
        } else if (surfaceType === "terminal") {
          checkTerminalAction(action, i, scene.name, context, issues);
        }
      }
    }
  }

  const passed = !issues.some((issue) => issue.severity === "error");
  return { passed, issues };
}

/**
 * Format a ScriptCheckReport into a human-readable string suitable
 * for feeding back to the LLM as error context during retries.
 */
export function formatCheckReport(report: ScriptCheckReport): string {
  if (report.passed && report.issues.length === 0) {
    return "Script check passed — all selectors, URLs, and commands verified.";
  }

  const lines: string[] = [
    `Script check ${report.passed ? "passed with warnings" : "FAILED"}: ${report.issues.length} issue(s) found.\n`,
  ];

  for (const issue of report.issues) {
    const prefix = issue.severity === "error" ? "ERROR" : "WARN";
    lines.push(
      `[${prefix}] Scene "${issue.sceneName}", action ${issue.actionIndex + 1} (${issue.actionType}):`,
    );
    lines.push(`  ${issue.message}`);
    if (issue.suggestion) {
      lines.push(`  Suggestion: ${issue.suggestion}`);
    }
    if (issue.discoveredAlternatives && issue.discoveredAlternatives.length > 0) {
      lines.push("  Available elements on this page:");
      for (const alt of issue.discoveredAlternatives.slice(0, 10)) {
        lines.push(`    - ${alt.role} "${alt.name}" → selector: ${alt.selector}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Browser Action Checks ──────────────────────────────────────────

function checkBrowserAction(
  action: ActionDirective,
  actionIndex: number,
  sceneName: string,
  context: AppContext,
  issues: ScriptCheckIssue[],
): void {
  const { webProbe } = context;
  if (!webProbe) return; // No probe data — skip browser checks

  if (ELEMENT_TARGETING_ACTIONS.has(action.type)) {
    checkElementTarget(action, actionIndex, sceneName, webProbe, issues);
  }

  if (URL_ACTIONS.has(action.type)) {
    checkNavigateUrl(action, actionIndex, sceneName, webProbe, issues);
  }
}

function checkElementTarget(
  action: ActionDirective,
  actionIndex: number,
  sceneName: string,
  probe: WebProbeResult,
  issues: ScriptCheckIssue[],
): void {
  const selector = action.params["selector"] as string | undefined;
  const text = action.params["text"] as string | undefined;

  // If targeting by text, check if the text exists on any page
  if (text && !selector) {
    const found = probe.pages.some((page) =>
      page.elements.some(
        (el) =>
          el.name.toLowerCase().includes(text.toLowerCase()) ||
          (el.textContent ?? "").toLowerCase().includes(text.toLowerCase()),
      ),
    );
    if (!found) {
      const alternatives = findSimilarElements(text, probe.pages);
      issues.push({
        severity: "warning",
        sceneName,
        actionIndex,
        actionType: action.type,
        message: `Text "${text}" not found on any probed page.`,
        suggestion:
          alternatives.length > 0
            ? `Similar elements found. Consider using: text: "${alternatives[0]!.name}"`
            : "Check that this text is visible on the page at the time of interaction.",
        discoveredAlternatives: alternatives,
      });
    }
    return;
  }

  // If targeting by selector, check if it exists on any page
  if (selector) {
    const found = probe.pages.some((page) =>
      page.elements.some((el) => el.selector === selector),
    );
    if (!found) {
      // Try to find elements with similar selectors or matching text
      const alternatives = findAlternativesForSelector(selector, probe.pages);
      issues.push({
        severity: "error",
        sceneName,
        actionIndex,
        actionType: action.type,
        message: `Selector "${selector}" not found on any probed page.`,
        suggestion:
          alternatives.length > 0
            ? `Found similar: ${alternatives[0]!.role} "${alternatives[0]!.name}" → selector: ${alternatives[0]!.selector}`
            : "This selector may be hallucinated. Use text-based targeting or check the actual page.",
        discoveredAlternatives: alternatives,
      });
    }
  }
}

function checkNavigateUrl(
  action: ActionDirective,
  actionIndex: number,
  sceneName: string,
  probe: WebProbeResult,
  issues: ScriptCheckIssue[],
): void {
  const url = action.params["url"] as string | undefined;
  if (!url) return;

  // Check if the URL is in the site map
  const isKnown = probe.siteMap.some((entry) => {
    try {
      const entryPath = new URL(entry.url).pathname;
      const targetPath = new URL(url, probe.entryUrl).pathname;
      return entryPath === targetPath;
    } catch {
      return false;
    }
  });

  if (!isKnown) {
    const knownPaths = probe.siteMap.map((entry) => {
      try {
        return new URL(entry.url).pathname;
      } catch {
        return entry.url;
      }
    });
    issues.push({
      severity: "warning",
      sceneName,
      actionIndex,
      actionType: action.type,
      message: `URL "${url}" not found in site map.`,
      suggestion: `Known routes: ${knownPaths.join(", ")}`,
    });
  }
}

// ─── Terminal Action Checks ─────────────────────────────────────────

function checkTerminalAction(
  action: ActionDirective,
  actionIndex: number,
  sceneName: string,
  context: AppContext,
  issues: ScriptCheckIssue[],
): void {
  const { projectScan } = context;
  if (!projectScan) return;

  if (action.type === "run") {
    checkRunCommand(action, actionIndex, sceneName, projectScan, issues);
  }
}

function checkRunCommand(
  action: ActionDirective,
  actionIndex: number,
  sceneName: string,
  scan: ProjectScanResult,
  issues: ScriptCheckIssue[],
): void {
  const command = action.params["command"] as string | undefined;
  if (!command) return;

  // Extract the base command (first word)
  const baseCommand = command.trim().split(/\s+/)[0]!;

  // Common shell commands are always fine
  if (COMMON_COMMANDS.has(baseCommand)) return;

  // Check if the command matches any discovered start command
  const isKnown = scan.startCommands.some(
    (cmd) =>
      command.includes(cmd.command) ||
      cmd.command.includes(command) ||
      // "make dev" matches "make dev SOME_FLAG=1"
      command.startsWith(cmd.command),
  );

  if (!isKnown && baseCommand === "make") {
    // Check Makefile targets specifically
    const target = command.split(/\s+/)[1];
    if (target) {
      const knownTargets = scan.startCommands
        .filter((c) => c.source === "Makefile")
        .map((c) => c.name);
      issues.push({
        severity: "warning",
        sceneName,
        actionIndex,
        actionType: action.type,
        message: `Make target "${target}" not found in Makefile scan.`,
        suggestion:
          knownTargets.length > 0
            ? `Known targets: ${knownTargets.join(", ")}`
            : "No Makefile targets were discovered.",
      });
    }
  }
}

// ─── Similarity Helpers ─────────────────────────────────────────────

function findSimilarElements(
  text: string,
  pages: readonly DiscoveredPage[],
): DiscoveredElement[] {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const candidates: Array<{ element: DiscoveredElement; score: number }> = [];

  for (const page of pages) {
    for (const el of page.elements) {
      const elName = el.name.toLowerCase();
      const elText = (el.textContent ?? "").toLowerCase();

      // Word-level overlap scoring
      let score = 0;
      for (const word of words) {
        if (word.length < 2) continue;
        if (elName.includes(word)) score += 2;
        if (elText.includes(word)) score += 1;
      }
      if (score > 0) {
        candidates.push({ element: el, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5).map((c) => c.element);
}

function findAlternativesForSelector(
  selector: string,
  pages: readonly DiscoveredPage[],
): DiscoveredElement[] {
  // Extract hints from the selector: class names, tag names, text patterns
  const classMatch = /\.([a-zA-Z][\w-]*)/.exec(selector);
  const tagMatch = /^([a-z]+)/i.exec(selector);
  const hints: string[] = [];

  if (classMatch) {
    // Split class name by hyphens for word matching
    hints.push(...classMatch[1]!.split("-").filter((w) => w.length > 2));
  }
  if (tagMatch) {
    hints.push(tagMatch[1]!.toLowerCase());
  }

  if (hints.length === 0) return getAllInteractiveElements(pages);

  const candidates: Array<{ element: DiscoveredElement; score: number }> = [];

  for (const page of pages) {
    for (const el of page.elements) {
      let score = 0;
      const elLower = `${el.selector} ${el.name} ${el.textContent ?? ""}`.toLowerCase();

      for (const hint of hints) {
        if (elLower.includes(hint.toLowerCase())) score += 1;
      }

      // Boost elements with matching tag
      if (tagMatch && el.tagName === tagMatch[1]!.toLowerCase()) score += 1;

      if (score > 0) {
        candidates.push({ element: el, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5).map((c) => c.element);
}

function getAllInteractiveElements(
  pages: readonly DiscoveredPage[],
): DiscoveredElement[] {
  const elements: DiscoveredElement[] = [];
  for (const page of pages) {
    for (const el of page.elements) {
      if (["button", "link", "tab", "menuitem"].includes(el.role)) {
        elements.push(el);
      }
    }
  }
  return elements.slice(0, 10);
}
