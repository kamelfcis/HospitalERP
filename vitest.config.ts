import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Tests that call the real HTTP server on port 5000 — run only with `npm run dev` + `VITEST_LIVE_API=1`. */
const liveHttpTestFiles = [
  "tests/api-integration.test.ts",
  "tests/bug-fixes.test.ts",
  "tests/clinic-intake.test.ts",
  "tests/financial-journal-api.test.ts",
  "tests/fiscal-immutability-concurrency.test.ts",
  "tests/invoice-discount-bidirectional.test.ts",
  "tests/item-master-validation.test.ts",
  "tests/production-hardening.test.ts",
  "tests/qty-editability.test.ts",
  "tests/receiving-filters.test.ts",
  "tests/receiving-validation-correction.test.ts",
  "tests/sales-invoice-workflow.test.ts",
  "tests/stock-count-qty-scale.test.ts",
] as const;

/**
 * Vitest — single runner for:
 * - Node: tests directory, .test.ts (API integration, business logic)
 * - jsdom: client/src, .test.tsx / .test.jsx (React / RTL)
 *
 * Path aliases mirror vite.config.ts and tsconfig.json.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@":       path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    globals:       true,
    testTimeout:   30_000,
    globalSetup:   "./tests/global-setup.ts",
    setupFiles:    ["./tests/setup/vitest.setup.ts"],
    include:       [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "client/src/**/*.test.ts",
      "client/src/**/*.test.tsx",
    ],
    exclude: [
      "node_modules",
      "dist",
      ".tmp",
      "**/node_modules/**",
      // Scaffolding only — imports `server/storage` → `db.ts` (needs DATABASE_URL even for no-op tests)
      "tests/templates/**",
      ...(process.env.VITEST_LIVE_API === "1" ? [] : [...liveHttpTestFiles]),
    ],
    environment:   "node",
    environmentMatchGlobs: [
      ["client/src/**/*.test.tsx", "jsdom"],
      ["client/src/**/*.test.jsx", "jsdom"],
      ["**/*.rtl.test.tsx", "jsdom"],
      ["**/*.rtl.test.jsx", "jsdom"],
    ],
    coverage: {
      provider:         "v8",
      reporter:         ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/**",
        "dist/**",
        "tests/setup/**",
        "**/*.d.ts",
        "**/*.config.*",
        "script/**",
        "client/index.html",
      ],
    },
  },
});
