import { config as loadEnv } from "dotenv";
import path from "node:path";

/**
 * Runs once before Vitest workers when `VITEST_LIVE_API=1`.
 * Seeds minimal generic account_mappings so POST /api/receivings/:id/post etc. are not blocked by 422.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.VITEST_LIVE_API !== "1") return;

  loadEnv({ path: path.resolve(process.cwd(), ".env") });
  loadEnv({ path: path.resolve(process.cwd(), ".env.test") });

  const { ensureLiveTestAccountMappings } = await import("./setup/ensure-live-test-mappings");
  await ensureLiveTestAccountMappings();
}
