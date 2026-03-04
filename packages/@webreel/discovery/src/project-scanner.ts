/**
 * Project Scanner — static analysis of project files.
 *
 * Scans a project directory for startup commands, port configurations,
 * environment variables, dependencies, and README content. Produces a
 * ProjectScanResult that gives the LLM ground truth about how to run
 * and interact with the target project.
 */

import { readFile, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ProjectScanResult,
  ProjectScanOptions,
  DiscoveredCommand,
  DiscoveredPort,
  DiscoveredEnvVar,
  DiscoveredDependency,
} from "./types.js";

const DEFAULT_MAX_README_CHARS = 12_000;

/** Well-known script names that indicate a start/dev/serve command. */
const START_SCRIPT_NAMES = new Set([
  "dev",
  "start",
  "serve",
  "preview",
  "develop",
  "watch",
  "run",
]);

/** Well-known Makefile targets that indicate a start/dev command. */
const MAKE_TARGET_NAMES = new Set([
  "dev",
  "start",
  "serve",
  "run",
  "up",
  "local",
  "develop",
]);

/** Frameworks detected from dependency names. */
const FRAMEWORK_DETECTORS: ReadonlyMap<string, string> = new Map([
  ["next", "next"],
  ["nuxt", "nuxt"],
  ["@remix-run/react", "remix"],
  ["vite", "vite"],
  ["@angular/core", "angular"],
  ["svelte", "svelte"],
  ["@sveltejs/kit", "sveltekit"],
  ["express", "express"],
  ["fastify", "fastify"],
  ["hono", "hono"],
  ["gatsby", "gatsby"],
  ["astro", "astro"],
]);

/**
 * Scan a project directory for commands, ports, env vars, and metadata.
 *
 * @param dirPath - Absolute path to the project root.
 * @param options - Optional scan configuration.
 * @returns Structured project scan result.
 */
export async function scanProject(
  dirPath: string,
  options?: ProjectScanOptions,
): Promise<ProjectScanResult> {
  const maxReadmeChars = options?.maxReadmeChars ?? DEFAULT_MAX_README_CHARS;

  // Run all file scans in parallel
  const [
    packageJsonResult,
    makefileResult,
    envResult,
    dockerComposeResult,
    readmeResult,
  ] = await Promise.all([
    scanPackageJson(dirPath),
    scanMakefile(dirPath),
    scanEnvFiles(dirPath),
    scanDockerCompose(dirPath),
    scanReadme(dirPath, maxReadmeChars),
  ]);

  const startCommands: DiscoveredCommand[] = [
    ...packageJsonResult.commands,
    ...makefileResult.commands,
    ...dockerComposeResult.commands,
  ];

  const ports: DiscoveredPort[] = [
    ...packageJsonResult.ports,
    ...dockerComposeResult.ports,
  ];

  const envVars: DiscoveredEnvVar[] = [...envResult.envVars];

  const dependencies: DiscoveredDependency[] = [...packageJsonResult.dependencies];

  const framework = detectFramework(dependencies);

  return {
    startCommands,
    ports,
    envVars,
    dependencies,
    framework,
    readme: readmeResult,
  };
}

// ─── package.json scanner ────────────────────────────────────────────

interface PackageJsonScanResult {
  readonly commands: DiscoveredCommand[];
  readonly ports: DiscoveredPort[];
  readonly dependencies: DiscoveredDependency[];
}

async function scanPackageJson(dirPath: string): Promise<PackageJsonScanResult> {
  const result: PackageJsonScanResult = {
    commands: [],
    ports: [],
    dependencies: [],
  };

  const content = await tryReadFile(join(dirPath, "package.json"));
  if (!content) return result;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return result;
  }

  // Extract scripts
  const scripts = pkg["scripts"] as Record<string, string> | undefined;
  if (scripts) {
    for (const [name, script] of Object.entries(scripts)) {
      if (START_SCRIPT_NAMES.has(name)) {
        result.commands.push({
          command: `npm run ${name}`,
          source: "package.json",
          name,
        });
      }
      // Scan script values for port numbers
      const portMatch = /(?:--port\s+|--port=|PORT=|:)(\d{4,5})\b/.exec(script);
      if (portMatch) {
        result.ports.push({
          port: parseInt(portMatch[1]!, 10),
          source: `package.json scripts.${name}`,
        });
      }
    }
  }

  // Extract dependencies for framework detection
  const deps = {
    ...(pkg["dependencies"] as Record<string, string> | undefined),
    ...(pkg["devDependencies"] as Record<string, string> | undefined),
  };

  for (const [name, version] of Object.entries(deps)) {
    if (FRAMEWORK_DETECTORS.has(name)) {
      result.dependencies.push({ name, version });
    }
  }

  // Check for workspace/monorepo patterns that hint at ports
  const proxyPort = extractPortFromProxy(pkg);
  if (proxyPort) {
    result.ports.push({ port: proxyPort, source: "package.json proxy" });
  }

  return result;
}

function extractPortFromProxy(pkg: Record<string, unknown>): number | null {
  const proxy = pkg["proxy"] as string | undefined;
  if (!proxy) return null;
  const match = /:(\d{4,5})\b/.exec(proxy);
  return match ? parseInt(match[1]!, 10) : null;
}

// ─── Makefile scanner ────────────────────────────────────────────────

interface MakefileScanResult {
  readonly commands: DiscoveredCommand[];
}

async function scanMakefile(dirPath: string): Promise<MakefileScanResult> {
  const result: MakefileScanResult = { commands: [] };

  const content = await tryReadFile(join(dirPath, "Makefile"));
  if (!content) return result;

  // Parse Makefile targets: lines starting with a word followed by ':'
  const targetPattern = /^([a-zA-Z_][\w-]*)\s*:/gm;
  let match: RegExpExecArray | null;
  while ((match = targetPattern.exec(content)) !== null) {
    const target = match[1]!;
    if (MAKE_TARGET_NAMES.has(target)) {
      result.commands.push({
        command: `make ${target}`,
        source: "Makefile",
        name: target,
      });
    }
  }

  return result;
}

// ─── Environment file scanner ────────────────────────────────────────

interface EnvScanResult {
  readonly envVars: DiscoveredEnvVar[];
}

async function scanEnvFiles(dirPath: string): Promise<EnvScanResult> {
  const envVars: DiscoveredEnvVar[] = [];
  const candidates = [
    ".env.example",
    ".env.local.example",
    ".env.sample",
    ".env.template",
  ];

  for (const filename of candidates) {
    const content = await tryReadFile(join(dirPath, filename));
    if (!content) continue;

    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const name = trimmed.slice(0, eqIdx).trim();
        if (/^[A-Z_][A-Z0-9_]*$/i.test(name)) {
          envVars.push({ name, source: filename });
        }
      }
    }
  }

  return { envVars };
}

// ─── Docker Compose scanner ─────────────────────────────────────────

interface DockerComposeScanResult {
  readonly commands: DiscoveredCommand[];
  readonly ports: DiscoveredPort[];
}

async function scanDockerCompose(dirPath: string): Promise<DockerComposeScanResult> {
  const result: DockerComposeScanResult = { commands: [], ports: [] };
  const candidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];

  for (const filename of candidates) {
    const content = await tryReadFile(join(dirPath, filename));
    if (!content) continue;

    result.commands.push({
      command: "docker compose up",
      source: filename,
      name: "docker-compose",
    });

    // Parse YAML for port mappings
    try {
      const compose = parseYaml(content) as Record<string, unknown>;
      const services = compose["services"] as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!services) continue;

      for (const [, service] of Object.entries(services)) {
        const ports = service["ports"] as string[] | undefined;
        if (!ports) continue;
        for (const portMapping of ports) {
          // "3000:3000" or "8080:80" — extract the host port (left side)
          const hostPort = /^(\d{2,5}):/.exec(String(portMapping));
          if (hostPort) {
            result.ports.push({
              port: parseInt(hostPort[1]!, 10),
              source: filename,
            });
          }
        }
      }
    } catch {
      // YAML parse failed — we already captured the docker compose command
    }

    break; // Only process the first compose file found
  }

  return result;
}

// ─── README scanner ─────────────────────────────────────────────────

async function scanReadme(
  dirPath: string,
  maxChars: number,
): Promise<string | undefined> {
  const candidates = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
  for (const name of candidates) {
    const content = await tryReadFile(join(dirPath, name));
    if (content) {
      return smartTruncateReadme(content, maxChars);
    }
  }
  return undefined;
}

/**
 * Smart-truncate a README: prioritize setup/quickstart sections.
 *
 * Extracts key sections (Quick Start, Install, Setup, Usage, Run, etc.)
 * and prepends them so the LLM always sees how to actually run the project,
 * even if the README is long and the setup info is buried.
 */
function smartTruncateReadme(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  const setupPattern =
    /^(#{1,3})\s+(quick\s*start|install|setup|usage|getting\s*started|run|development|prerequisites|commands).*/gim;
  const sections: string[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (setupPattern.test(line)) {
      const headingLevel = (line.match(/^#+/) ?? [""])[0].length;
      const sectionLines = [line];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i]!;
        const nextHeading = nextLine.match(/^(#+)\s/);
        if (nextHeading && nextHeading[1]!.length <= headingLevel) break;
        sectionLines.push(nextLine);
        i++;
      }
      sections.push(sectionLines.join("\n"));
    } else {
      i++;
    }
    setupPattern.lastIndex = 0;
  }

  if (sections.length > 0) {
    const setupContent = sections.join("\n\n");
    const remaining = maxChars - setupContent.length - 200;
    const intro = remaining > 0 ? content.slice(0, remaining) + "\n\n[...]\n\n" : "";
    const result = intro + "## KEY SECTIONS (extracted for accuracy)\n\n" + setupContent;
    return result.length > maxChars
      ? result.slice(0, maxChars) + "\n\n[truncated]"
      : result;
  }

  return content.slice(0, maxChars) + "\n\n[truncated]";
}

// ─── Framework detection ─────────────────────────────────────────────

function detectFramework(
  dependencies: readonly DiscoveredDependency[],
): string | undefined {
  for (const dep of dependencies) {
    const framework = FRAMEWORK_DETECTORS.get(dep.name);
    if (framework) return framework;
  }
  return undefined;
}

// ─── Utilities ───────────────────────────────────────────────────────

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
