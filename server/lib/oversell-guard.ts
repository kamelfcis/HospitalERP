/**
 * oversell-guard.ts
 * ─────────────────
 * Guard logic for Deferred Cost Issue (الصرف بدون رصيد).
 *
 * Rules (all must be TRUE for oversell to be allowed):
 *  1. Feature flag  `enable_deferred_cost_issue` = 'true'  in system_settings
 *  2. Item          `allow_oversell`              = true    in items
 *
 * This module DOES NOT check user permissions — permission checks happen
 * at the route level before the finalize call reaches this guard.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

/** Cache the feature-flag value for 30 seconds to avoid a DB round-trip per line */
let _flagCachedAt = 0;
let _flagValue = false;

async function isFeatureFlagEnabled(): Promise<boolean> {
  const now = Date.now();
  if (now - _flagCachedAt < 30_000) return _flagValue;
  const res = await db.execute(
    sql`SELECT value FROM system_settings WHERE key = 'enable_deferred_cost_issue' LIMIT 1`
  );
  const row = res.rows?.[0] as { value?: string } | undefined;
  _flagValue = row?.value === "true";
  _flagCachedAt = now;
  return _flagValue;
}

/** Force-clear the cache (used after updating the flag via the settings API) */
export function clearOversellFlagCache(): void {
  _flagCachedAt = 0;
}

export interface OversellGuardResult {
  /** true = oversell is permitted for this item */
  allowed: boolean;
  /** false = feature flag is off */
  featureFlagEnabled: boolean;
  /** false = item does not have allow_oversell = true */
  itemAllowed: boolean;
}

/**
 * Check whether a specific item is allowed to be oversold.
 *
 * @param itemId   The item's primary key
 * @param tx       Optional Drizzle transaction to use (avoids a separate DB connection inside a TX)
 */
export async function checkOversellAllowed(
  itemId: string,
  tx?: typeof db
): Promise<OversellGuardResult> {
  const flagEnabled = await isFeatureFlagEnabled();
  if (!flagEnabled) {
    return { allowed: false, featureFlagEnabled: false, itemAllowed: false };
  }

  const conn = tx ?? db;
  const res = await conn.execute(
    sql`SELECT allow_oversell FROM items WHERE id = ${itemId} LIMIT 1`
  );
  const row = res.rows?.[0] as { allow_oversell?: boolean } | undefined;
  const itemAllowed = row?.allow_oversell === true;

  return {
    allowed: itemAllowed,
    featureFlagEnabled: true,
    itemAllowed,
  };
}
