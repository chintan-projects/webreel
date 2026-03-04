/**
 * Discovery types — shared across WebProbe, ProjectScanner, and ScriptChecker.
 *
 * These types capture ground truth about a target application that the LLM
 * uses to generate accurate, executable Demo Markdown scripts.
 */

// ─── Web Probe Types ─────────────────────────────────────────────────

/** An interactive element discovered via the accessibility tree. */
export interface DiscoveredElement {
  /** ARIA role (e.g., "button", "link", "textbox", "heading"). */
  readonly role: string;
  /** Accessible name — button text, label text, aria-label. */
  readonly name: string;
  /** Best CSS selector for targeting this element. */
  readonly selector: string;
  /** Visible text content (may differ from accessible name). */
  readonly textContent?: string;
  /** HTML tag name (lowercase). */
  readonly tagName: string;
  /** Bounding box in viewport coordinates. */
  readonly boundingBox?: BoundingBox;
}

/** Bounding box in CSS pixels from the viewport origin. */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A link discovered on a probed page. */
export interface DiscoveredLink {
  /** Link visible text. */
  readonly text: string;
  /** Resolved absolute URL. */
  readonly href: string;
}

/** A single page discovered during the web probe crawl. */
export interface DiscoveredPage {
  /** Full URL of the page. */
  readonly url: string;
  /** Page title from <title> or document.title. */
  readonly title: string;
  /** Interactive elements extracted from the accessibility tree. */
  readonly elements: readonly DiscoveredElement[];
  /** Links found on this page. */
  readonly links: readonly DiscoveredLink[];
  /** Screenshot as PNG buffer (omitted when screenshots disabled). */
  readonly screenshot?: Buffer;
}

/** Site map entry — lightweight summary of a discovered page. */
export interface SiteMapEntry {
  readonly url: string;
  readonly title: string;
  readonly elementCount: number;
  readonly linkCount: number;
}

/** Complete result of a web probe session. */
export interface WebProbeResult {
  /** The URL the probe started from. */
  readonly entryUrl: string;
  /** All pages discovered during the crawl. */
  readonly pages: readonly DiscoveredPage[];
  /** Lightweight site map for quick reference. */
  readonly siteMap: readonly SiteMapEntry[];
}

/** Options for the web probe. */
export interface WebProbeOptions {
  /** Maximum link depth to follow (default: 3). */
  readonly maxDepth?: number;
  /** Maximum number of pages to visit (default: 20). */
  readonly maxPages?: number;
  /** Capture screenshots for each page (default: false). */
  readonly captureScreenshots?: boolean;
  /** Viewport dimensions (default: 1280x720). */
  readonly viewport?: { readonly width: number; readonly height: number };
  /** Timeout per page navigation in ms (default: 15000). */
  readonly pageTimeoutMs?: number;
}

// ─── Project Scanner Types ───────────────────────────────────────────

/** A start/build command discovered from project files. */
export interface DiscoveredCommand {
  /** The full command string (e.g., "make dev", "npm run dev"). */
  readonly command: string;
  /** Where this command was found. */
  readonly source: string;
  /** The script/target name (e.g., "dev", "start"). */
  readonly name: string;
}

/** A port number discovered from project configuration. */
export interface DiscoveredPort {
  readonly port: number;
  readonly source: string;
}

/** An environment variable name discovered from config files. */
export interface DiscoveredEnvVar {
  /** Variable name (never the value). */
  readonly name: string;
  readonly source: string;
}

/** A dependency from package.json or similar. */
export interface DiscoveredDependency {
  readonly name: string;
  readonly version: string;
}

/** Complete result of scanning a project directory. */
export interface ProjectScanResult {
  /** Commands that can start/build/serve the project. */
  readonly startCommands: readonly DiscoveredCommand[];
  /** Port numbers the project listens on. */
  readonly ports: readonly DiscoveredPort[];
  /** Environment variable names (no values). */
  readonly envVars: readonly DiscoveredEnvVar[];
  /** Key dependencies that hint at framework/stack. */
  readonly dependencies: readonly DiscoveredDependency[];
  /** Detected framework (e.g., "next", "vite", "express"). */
  readonly framework?: string;
  /** Truncated README content for LLM context. */
  readonly readme?: string;
}

/** Options for the project scanner. */
export interface ProjectScanOptions {
  /** Maximum README length in characters (default: 12000). */
  readonly maxReadmeChars?: number;
}

// ─── App Context (combined) ──────────────────────────────────────────

/** Combined discovery context passed to the authoring pipeline. */
export interface AppContext {
  readonly webProbe?: WebProbeResult;
  readonly projectScan?: ProjectScanResult;
}

// ─── Script Checker Types ────────────────────────────────────────────

/** Severity of a script check issue. */
export type CheckSeverity = "error" | "warning";

/** A single issue found by the script checker. */
export interface ScriptCheckIssue {
  readonly severity: CheckSeverity;
  readonly sceneName: string;
  readonly actionIndex: number;
  readonly actionType: string;
  readonly message: string;
  readonly suggestion?: string;
  readonly discoveredAlternatives?: readonly DiscoveredElement[];
}

/** Complete result of a script check. */
export interface ScriptCheckReport {
  /** Whether the script passed all checks (no errors). */
  readonly passed: boolean;
  /** All issues found. */
  readonly issues: readonly ScriptCheckIssue[];
}
