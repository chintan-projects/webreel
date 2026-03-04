import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../../..");

export default defineConfig({
  test: {
    root: packageRoot,
    include: ["src/__tests__/e2e/**/*.e2e.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: "forks",
    maxConcurrency: 1,
  },
});
