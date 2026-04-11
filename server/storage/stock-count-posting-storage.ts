import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import {
  stockCountSessions,
  inventoryLotMovements,
  journalEntries,
  journalLines,
  type StockCountSession,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";
import { scheduleInventorySnapshotRefresh } from "../lib/inventory-snapshot-scheduler";
import { auditLog } from "../route-helpers";
import { logger } from "../lib/logger";
import { resolveCostCenters } from "../lib/cost-center-resolver";

const stockCountPostingStorage = {

  async postStockCountSession(
    this: DatabaseStorage,
    sessionId: string,
    userId: string
  ): Promise<StockCountSession> {
    const result = await db.transaction(async (tx) => {

      const sessionRaw = await tx.execute(sql`
        SELECT s.*, w.gl_account_id AS wh_gl_account_id, w.name_ar AS wh_name
        FROM stock_count_sessions s
        JOIN warehouses w ON w.id = s.warehouse_id
        WHERE s.id = ${sessionId}
        FOR UPDATE
      `);
      const s = (sessionRaw as any).rows[0];
      if (!s) throw new Error("جلسة الجرد غير موجودة");
      if (s.status !== "draft") throw new Error(`لا يمكن ترحيل جلسة بحالة "${s.status}" — ربما تم ترحيلها بالفعل.`);

      const totalLinesRaw = await tx.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM stock_count_lines WHERE session_id = ${sessionId}
      `);
      const totalLines = Number((totalLinesRaw as any).rows[0]?.cnt ?? 0);
      if (totalLines === 0) throw new Error("لا يمكن ترحيل جلسة جرد فارغة — أضف أصنافاً أولاً.");

      const whHasGL = !!s.wh_gl_account_id;
      const linesWithDiffRaw = await tx.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM stock_count_lines
        WHERE session_id = ${sessionId} AND ABS(difference_minor::numeric) > 0.0001
      `);
      const hasDifferences = Number((linesWithDiffRaw as any).rows[0]?.cnt ?? 0) > 0;

      let periodId: string | null = null;
      if (whHasGL && hasDifferences) {
        const periodRaw = await tx.execute(sql`
          SELECT id FROM fiscal_periods
          WHERE start_date <= ${s.count_date}::date
            AND end_date   >= ${s.count_date}::date
            AND is_closed = FALSE
          LIMIT 1
        `);
        const period = (periodRaw as any).rows[0];
        if (!period) {
          throw new Error(
            `لا توجد فترة محاسبية مفتوحة لتاريخ الجرد (${s.count_date}). ` +
            `افتح فترة محاسبية مناسبة أو غيّر تاريخ الجرد.`
          );
        }
        periodId = period.id;
      }

      const dupRaw = await tx.execute(sql`
        SELECT session_number FROM stock_count_sessions
        WHERE warehouse_id = ${s.warehouse_id}
          AND count_date   = ${s.count_date}::date
          AND status       = 'posted'
          AND id          <> ${sessionId}
        LIMIT 1
      `);
      if ((dupRaw as any).rows.length > 0) {
        const dupNum = (dupRaw as any).rows[0].session_number;
        throw new Error(
          `يوجد جرد مُرحَّل (#${dupNum}) لنفس المستودع في تاريخ ${s.count_date}. ` +
          `لا يمكن ترحيل جردين لنفس المستودع في يوم واحد.`
        );
      }

      const lineRaw = await tx.execute(sql`
        SELECT l.*, i.name_ar AS item_name
        FROM stock_count_lines l
        JOIN items i ON i.id = l.item_id
        WHERE l.session_id = ${sessionId}
          AND ABS(l.difference_minor::numeric) > 0.0001
      `);
      const diffLines = (lineRaw as any).rows as any[];

      for (const line of diffLines) {
        const diff      = parseFloat(line.difference_minor);
        const absDiff   = Math.abs(diff);
        const isSurplus = diff > 0;

        if (line.lot_id) {
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${diff.toFixed(4)}::numeric,
                updated_at   = NOW()
            WHERE id = ${line.lot_id}
          `);
          await tx.insert(inventoryLotMovements).values({
            lotId:             line.lot_id,
            warehouseId:       s.warehouse_id,
            txDate:            new Date(s.count_date),
            txType:            "adj" as const,
            qtyChangeInMinor:  line.difference_minor,
            unitCost:          line.unit_cost,
            referenceType:     "stock_count",
            referenceId:       sessionId,
          });

        } else if (isSurplus) {
          const latestLotRaw = await tx.execute(sql`
            SELECT id FROM inventory_lots
            WHERE item_id      = ${line.item_id}
              AND warehouse_id = ${s.warehouse_id}
              AND is_active    = TRUE
            ORDER BY received_date DESC, created_at DESC
            LIMIT 1
            FOR UPDATE
          `);
          const targetLotId = (latestLotRaw as any).rows[0]?.id;
          if (!targetLotId) {
            throw new Error(
              `لا يوجد lot نشط للصنف "${line.item_name}" في المستودع لإضافة الفائض إليه. ` +
              `حدّد lot بشكل صريح عند إدخال سطر الجرد.`
            );
          }
          await tx.execute(sql`
            UPDATE inventory_lots
            SET qty_in_minor = qty_in_minor + ${absDiff.toFixed(4)}::numeric,
                updated_at   = NOW()
            WHERE id = ${targetLotId}
          `);
          await tx.insert(inventoryLotMovements).values({
            lotId:            targetLotId,
            warehouseId:      s.warehouse_id,
            txDate:           new Date(s.count_date),
            txType:           "adj" as const,
            qtyChangeInMinor: absDiff.toFixed(4),
            unitCost:         line.unit_cost,
            referenceType:    "stock_count",
            referenceId:      sessionId,
          });

        } else {
          let remaining = absDiff;
          const fefoLotsRaw = await tx.execute(sql`
            SELECT id, qty_in_minor FROM inventory_lots
            WHERE item_id      = ${line.item_id}
              AND warehouse_id = ${s.warehouse_id}
              AND is_active    = TRUE
              AND qty_in_minor > 0
            ORDER BY expiry_year  ASC NULLS FIRST,
                     expiry_month ASC NULLS FIRST,
                     received_date ASC
            FOR UPDATE
          `);
          for (const lot of (fefoLotsRaw as any).rows as any[]) {
            if (remaining <= 0.0001) break;
            const available = parseFloat(lot.qty_in_minor);
            const deduct    = Math.min(remaining, available);
            await tx.execute(sql`
              UPDATE inventory_lots
              SET qty_in_minor = qty_in_minor - ${deduct.toFixed(4)}::numeric,
                  updated_at   = NOW()
              WHERE id = ${lot.id}
            `);
            await tx.insert(inventoryLotMovements).values({
              lotId:            lot.id,
              warehouseId:      s.warehouse_id,
              txDate:           new Date(s.count_date),
              txType:           "adj" as const,
              qtyChangeInMinor: (-deduct).toFixed(4),
              unitCost:         line.unit_cost,
              referenceType:    "stock_count",
              referenceId:      sessionId,
            });
            remaining -= deduct;
          }
          if (remaining > 0.0001) {
            throw new Error(
              `الرصيد الفعلي للصنف "${line.item_name}" في المستودع أقل من العجز المُسجَّل ` +
              `(متبقٍّ بدون تسوية: ${remaining.toFixed(4)}). ` +
              `راجع سطور الجرد أو حدّد lot بشكل صريح.`
            );
          }
        }
      }

      let journalEntryId: string | null = null;

      if (whHasGL && hasDifferences && periodId) {
        const totalsRaw = await tx.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN difference_minor::numeric > 0 THEN ABS(difference_value::numeric) ELSE 0 END), 0) AS surplus_value,
            COALESCE(SUM(CASE WHEN difference_minor::numeric < 0 THEN ABS(difference_value::numeric) ELSE 0 END), 0) AS shortage_value
          FROM stock_count_lines
          WHERE session_id = ${sessionId}
        `);
        const totals      = (totalsRaw as any).rows[0];
        const surplusVal  = parseFloat(totals.surplus_value);
        const shortageVal = parseFloat(totals.shortage_value);

        if (surplusVal > 0 || shortageVal > 0) {
          const mappingsRaw = await tx.execute(sql`
            SELECT line_type, debit_account_id, credit_account_id
            FROM account_mappings
            WHERE transaction_type = 'stock_count_adjustment' AND is_active = TRUE
          `);
          const mappings: Record<string, { debitAccountId?: string; creditAccountId?: string }> = {};
          for (const m of (mappingsRaw as any).rows as any[]) {
            mappings[m.line_type] = {
              debitAccountId:  m.debit_account_id,
              creditAccountId: m.credit_account_id,
            };
          }

          const gainMapping = mappings["stock_gain"];
          const lossMapping = mappings["stock_loss"];

          if (!gainMapping?.creditAccountId && surplusVal > 0) {
            throw new Error(
              `لا يوجد حساب دائن (إيراد فوائض الجرد) مُعرَّف في ربط الحسابات ` +
              `(نوع: stock_count_adjustment | نوع السطر: stock_gain). ` +
              `يرجى إضافة الربط في صفحة "ربط الحسابات".`
            );
          }
          if (!lossMapping?.debitAccountId && shortageVal > 0) {
            throw new Error(
              `لا يوجد حساب مدين (خسائر عجز الجرد) مُعرَّف في ربط الحسابات ` +
              `(نوع: stock_count_adjustment | نوع السطر: stock_loss). ` +
              `يرجى إضافة الربط في صفحة "ربط الحسابات".`
            );
          }

          const jLines: { lineNumber: number; accountId: string; debit: string; credit: string; description: string }[] = [];
          let lineNum = 1;

          if (surplusVal > 0) {
            jLines.push({ lineNumber: lineNum++, accountId: s.wh_gl_account_id,           debit: surplusVal.toFixed(2), credit: "0.00",                  description: `فوائض جرد مخزن — جلسة #${s.session_number}` });
            jLines.push({ lineNumber: lineNum++, accountId: gainMapping!.creditAccountId!, debit: "0.00",                credit: surplusVal.toFixed(2),  description: `إيراد فوائض جرد — جلسة #${s.session_number}` });
          }
          if (shortageVal > 0) {
            jLines.push({ lineNumber: lineNum++, accountId: lossMapping!.debitAccountId!,  debit: shortageVal.toFixed(2), credit: "0.00",                 description: `خسائر عجز جرد — جلسة #${s.session_number}` });
            jLines.push({ lineNumber: lineNum++, accountId: s.wh_gl_account_id,            debit: "0.00",                 credit: shortageVal.toFixed(2), description: `عجز مخزن — جلسة #${s.session_number}` });
          }

          const totalDebit  = jLines.reduce((s, l) => s + parseFloat(l.debit),  0);
          const totalCredit = jLines.reduce((s, l) => s + parseFloat(l.credit), 0);
          if (Math.abs(totalDebit - totalCredit) > 0.005) {
            throw new Error(
              `القيد المحاسبي غير متوازن: مدين=${totalDebit.toFixed(2)} دائن=${totalCredit.toFixed(2)}. ` +
              `يرجى مراجعة المنطق المحاسبي.`
            );
          }

          const entryNumber = await this.getNextEntryNumber();
          const [entry] = await tx.insert(journalEntries).values({
            entryNumber,
            entryDate:        s.count_date,
            periodId,
            description:      `قيد جرد مخزني — ${s.wh_name} — جلسة #${s.session_number}`,
            reference:        `SC-${s.session_number}`,
            sourceType:       "stock_count",
            sourceDocumentId: sessionId,
            status:           "posted" as const,
            totalDebit:       totalDebit.toFixed(2),
            totalCredit:      totalCredit.toFixed(2),
          }).returning();

          const stockCountJournalLines = await resolveCostCenters(
            jLines.map((l) => ({
              journalEntryId: entry.id,
              lineNumber:     l.lineNumber,
              accountId:      l.accountId,
              debit:          l.debit,
              credit:         l.credit,
              description:    l.description,
            }))
          );
          await tx.insert(journalLines).values(stockCountJournalLines);

          journalEntryId = entry.id;
          logger.info(
            { sessionId, sessionNumber: s.session_number, surplusVal, shortageVal, journalEntryId, entryNumber },
            "[STOCK_COUNT] journal posted"
          );
        }
      }

      const [updated] = await tx.update(stockCountSessions)
        .set({
          status:         "posted",
          postedBy:       userId,
          postedAt:       new Date(),
          journalEntryId: journalEntryId ?? undefined,
        })
        .where(eq(stockCountSessions.id, sessionId))
        .returning();

      logger.info(
        { sessionId, sessionNumber: s.session_number, userId, journalEntryId, totalLines, diffLines: diffLines.length },
        "[STOCK_COUNT] session posted"
      );
      return updated;
    });

    auditLog({
      tableName: "stock_count_sessions",
      recordId:  result.id,
      action:    "post",
      userId,
      newValues: {
        sessionNumber:  result.sessionNumber,
        warehouseId:    result.warehouseId,
        countDate:      result.countDate,
        journalEntryId: result.journalEntryId,
        postedBy:       userId,
      },
    }).catch(() => {});

    scheduleInventorySnapshotRefresh("stock_count_post");

    return result;
  },

};

export default stockCountPostingStorage;
