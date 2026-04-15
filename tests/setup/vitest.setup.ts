/**
 * Global Vitest setup — runs before test files in each worker.
 * @see https://vitest.dev/config/#setupfiles
 */
import "@testing-library/jest-dom/vitest";
import { config as loadEnv } from "dotenv";
import path from "node:path";

const LIVE = process.env.VITEST_LIVE_API === "1";

if (LIVE) {
  loadEnv({ path: path.resolve(process.cwd(), ".env") });
  loadEnv({ path: path.resolve(process.cwd(), ".env.test") });
}

// Do NOT ping /health here: with VITEST_LIVE_API=1 the whole repo is included in the run,
// so offline-only files would fail setup when the dev server is stopped. HTTP tests use
// tests/live-session.ts — the first login() surfaces ECONNREFUSED with a clear message.
