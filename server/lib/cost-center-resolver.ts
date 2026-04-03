/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Cost Center Resolver — حل مراكز التكلفة للسطور المحاسبية
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  يوفر هذا الملف وظيفة مركزية لربط السطور المحاسبية بمراكز التكلفة
 *  بشكل تلقائي من خلال قراءة الحساب الافتراضي المرتبط بكل حساب.
 *
 *  الاستخدام:
 *    import { resolveCostCenters } from "../lib/cost-center-resolver";
 *    const lines = await resolveCostCenters(rawLines);
 *    await db.insert(journalLines).values(lines);
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { db } from "../db";
import { accounts } from "@shared/schema";
import { inArray } from "drizzle-orm";

interface LineWithAccount {
  accountId: string;
  costCenterId?: string | null;
  [key: string]: any;
}

/**
 * يكمل خانة costCenterId في كل سطر من السطور المحاسبية
 * إذا كان السطر لا يحمل مركز تكلفة صريح، يتم استخدام القيمة
 * الافتراضية من الحساب (defaultCostCenterId).
 */
export async function resolveCostCenters<T extends LineWithAccount>(lines: T[]): Promise<T[]> {
  const linesNeedingCC = lines.filter(l => !l.costCenterId);
  if (linesNeedingCC.length === 0) return lines;

  const accountIds = [...new Set(linesNeedingCC.map(l => l.accountId))];
  const accountRows = await db
    .select({ id: accounts.id, defaultCostCenterId: accounts.defaultCostCenterId })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));

  const ccMap = new Map<string, string | null>(
    accountRows.map(r => [r.id, r.defaultCostCenterId ?? null])
  );

  return lines.map(line => {
    if (line.costCenterId) return line;
    const cc = ccMap.get(line.accountId) ?? null;
    return cc ? { ...line, costCenterId: cc } : line;
  });
}
