/**
 * @webreel/discovery — App discovery for webreel.
 *
 * Probe live apps and scan project files to generate accurate demo scripts.
 */

// Types
export type {
  // Web Probe
  DiscoveredElement,
  BoundingBox,
  DiscoveredLink,
  DiscoveredPage,
  SiteMapEntry,
  WebProbeResult,
  WebProbeOptions,
  // Project Scanner
  DiscoveredCommand,
  DiscoveredPort,
  DiscoveredEnvVar,
  DiscoveredDependency,
  ProjectScanResult,
  ProjectScanOptions,
  // App Context
  AppContext,
  // Script Checker
  CheckSeverity,
  ScriptCheckIssue,
  ScriptCheckReport,
} from "./types.js";

// Web Probe
export { probeApp } from "./web-probe.js";

// Project Scanner
export { scanProject } from "./project-scanner.js";

// Script Checker
export { checkScript, formatCheckReport } from "./script-checker.js";
