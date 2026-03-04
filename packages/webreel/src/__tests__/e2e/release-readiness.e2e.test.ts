/**
 * Release readiness e2e test — validates that all packages in the monorepo
 * are structurally sound for publishing: valid package.json files, changeset
 * config, no circular dependencies, and workspace protocol for internal deps.
 *
 * No external services required. Pure filesystem validation.
 */

import { readFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../../..");

/** Relative paths from repo root to each package directory. */
const PACKAGE_PATHS: readonly string[] = [
  "packages/webreel",
  "packages/@webreel/core",
  "packages/@webreel/director",
  "packages/@webreel/surfaces",
  "packages/@webreel/annotations",
  "packages/@webreel/narrator",
] as const;

/** Names that identify internal workspace packages in dependency maps. */
const INTERNAL_PREFIXES: readonly string[] = ["@webreel/", "webreel"] as const;

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly type?: string;
  readonly main?: string;
  readonly exports?: Record<string, unknown>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

/**
 * Read and parse a package.json from the given package directory.
 */
async function readPackageJson(packageDir: string): Promise<PackageJson> {
  const filePath = join(REPO_ROOT, packageDir, "package.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as PackageJson;
}

/**
 * Check whether a dependency name belongs to the internal workspace.
 */
function isInternalDep(depName: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => depName.startsWith(prefix));
}

/**
 * Detect cycles in a directed graph using iterative DFS.
 * Returns the first cycle found as an array of node names, or null if acyclic.
 */
function detectCycle(
  graph: ReadonlyMap<string, readonly string[]>,
): readonly string[] | null {
  const WHITE = 0; // unvisited
  const GRAY = 1; // in current DFS path
  const BLACK = 2; // fully processed

  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const node of graph.keys()) {
    color.set(node, WHITE);
  }

  for (const startNode of graph.keys()) {
    if (color.get(startNode) !== WHITE) {
      continue;
    }

    const stack: string[] = [startNode];

    while (stack.length > 0) {
      const node = stack[stack.length - 1]!;
      const nodeColor = color.get(node) ?? WHITE;

      if (nodeColor === WHITE) {
        color.set(node, GRAY);
        const neighbors = graph.get(node) ?? [];

        for (const neighbor of neighbors) {
          const neighborColor = color.get(neighbor) ?? WHITE;

          if (neighborColor === GRAY) {
            // Found a cycle — reconstruct it
            const cycle: string[] = [neighbor, node];
            let current = node;
            while (parent.get(current) != null && parent.get(current) !== neighbor) {
              current = parent.get(current)!;
              cycle.push(current);
            }
            cycle.reverse();
            return cycle;
          }

          if (neighborColor === WHITE) {
            parent.set(neighbor, node);
            stack.push(neighbor);
          }
        }
      } else {
        stack.pop();
        color.set(node, BLACK);
      }
    }
  }

  return null;
}

describe("release readiness", () => {
  it("all packages have valid package.json", async () => {
    for (const packageDir of PACKAGE_PATHS) {
      const pkg = await readPackageJson(packageDir);

      expect(
        pkg.name,
        `${packageDir}/package.json must have a "name" field`,
      ).toBeTruthy();

      expect(
        pkg.version,
        `${packageDir}/package.json must have a "version" field`,
      ).toBeTruthy();

      const hasEntrypoint = pkg.main != null || pkg.exports != null;
      expect(
        hasEntrypoint,
        `${packageDir}/package.json must have either "main" or "exports"`,
      ).toBe(true);

      expect(pkg.type, `${packageDir}/package.json must have "type": "module"`).toBe(
        "module",
      );
    }
  });

  it("changeset config is valid", async () => {
    const configPath = join(REPO_ROOT, ".changeset", "config.json");

    // Verify the file exists
    await expect(
      access(configPath).then(() => true),
      ".changeset/config.json must exist",
    ).resolves.toBe(true);

    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;

    expect(
      config.access,
      '.changeset/config.json must have an "access" field',
    ).toBeDefined();

    expect(
      config.baseBranch,
      '.changeset/config.json must have a "baseBranch" field',
    ).toBeDefined();

    expect(typeof config.baseBranch, '"baseBranch" must be a string').toBe("string");
  });

  it("no circular dependencies between packages", async () => {
    const packages = new Map<string, PackageJson>();

    for (const packageDir of PACKAGE_PATHS) {
      const pkg = await readPackageJson(packageDir);
      packages.set(pkg.name, pkg);
    }

    const knownNames = new Set(packages.keys());
    const graph = new Map<string, readonly string[]>();

    for (const [name, pkg] of packages) {
      const allDeps: Record<string, string> = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      const internalDeps = Object.keys(allDeps).filter(
        (dep) => isInternalDep(dep) && knownNames.has(dep),
      );

      graph.set(name, internalDeps);
    }

    const cycle = detectCycle(graph);

    expect(
      cycle,
      cycle != null ? `circular dependency detected: ${cycle.join(" -> ")}` : "no cycles",
    ).toBeNull();
  });

  it("all packages reference compatible versions", async () => {
    const violations: string[] = [];

    for (const packageDir of PACKAGE_PATHS) {
      const pkg = await readPackageJson(packageDir);

      const allDeps: Readonly<Record<string, string>> = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const [depName, depVersion] of Object.entries(allDeps)) {
        if (!isInternalDep(depName)) {
          continue;
        }

        const usesWorkspaceProtocol = depVersion.startsWith("workspace:");

        if (!usesWorkspaceProtocol) {
          violations.push(
            `${pkg.name} depends on ${depName}@"${depVersion}" — must use workspace:* or workspace:^`,
          );
        }
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `hardcoded internal versions found:\n  ${violations.join("\n  ")}`
        : "all internal deps use workspace protocol",
    ).toHaveLength(0);
  });
});
