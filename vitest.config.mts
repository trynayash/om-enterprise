import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside the React server runtime; it is a build-time guard only.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        // Text recognition of scanned files: seconds per page, so kept apart from the fast unit tests.
        extends: true,
        test: { name: "ocr", include: ["tests/ocr/**/*.test.ts"], environment: "node", globalSetup: ["tests/ocr/global-setup.ts"], testTimeout: 300_000, hookTimeout: 120_000 },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
