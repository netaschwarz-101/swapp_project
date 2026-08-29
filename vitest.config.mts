import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Unit tests only (pure logic: lib/trade-machine.ts, lib/validation/*) —
// tests/e2e is Playwright's, kept out of Vitest's include so the two
// runners never try to pick up each other's files (see docs/test-plan.md).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
});
