/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  opening-stock-service.ts
 *  منطق مستند الرصيد الافتتاحي — الترحيل + استيراد Excel
 *
 *  المسؤوليات:
 *    - parseImportedOpeningStockRows()  — تحويل صفوف Excel إلى كائنات منظّمة
 *    - executePostOpeningStock()        — ترحيل المستند + GL journal (fire-and-forget)
 *
 *  ما يبقى في المسار:
 *    - طلب الملف / التحقق من وجوده
 *    - استدعاء الـ service
 *    - إرجاع الـ response
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { storage }     from "../storage";
import { logger }      from "../lib/logger";
import { logAcctEvent} from "../lib/accounting-event-logger";
import { getVal, parseDec } from "../lib/excel-helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedOpeningStockRow {
  itemCode:      string;
  unitLevel:     string;
  qtyInUnit:     number;
  purchasePrice: number;
  salePrice:     number;
  batchNo:       string | null;
  expiryMonth:   number | null;
  expiryYear:    number | null;
  lineNotes:     string | null;
}

// ─── Row mapper (pure) ────────────────────────────────────────────────────────

export function parseImportedOpeningStockRows(
  rawRows: Record<string, string>[],
): ParsedOpeningStockRow[] {
  return rawRows
    .filter((r) => getVal(r, "كود الصنف *", "كود الصنف", "itemCode").trim())
    .map((r) => {
      const expiryMonthS = getVal(r, "شهر الصلاحية", "expiryMonth");
      const expiryYearS  = getVal(r, "سنة الصلاحية",  "expiryYear");
      return {
        itemCode:      getVal(r, "كود الصنف *", "كود الصنف", "itemCode"),
        unitLevel:     (getVal(r, "الوحدة *", "الوحدة", "unitLevel") || "major").toLowerCase(),
        qtyInUnit:     parseDec(getVal(r, "الكمية *", "الكمية", "qtyInUnit")) ?? 0,
        purchasePrice: parseDec(getVal(r, "سعر الشراء (ج.م)", "سعر الشراء", "purchasePrice")) ?? 0,
        salePrice:     parseDec(getVal(r, "سعر البيع (ج.م)",  "سعر البيع",  "salePrice"))     ?? 0,
        batchNo:       getVal(r, "رقم التشغيلة", "batchNo") || null,
        expiryMonth:   expiryMonthS ? parseInt(expiryMonthS) : null,
        expiryYear:    expiryYearS  ? parseInt(expiryYearS)  : null,
        lineNotes:     getVal(r, "ملاحظات", "lineNotes") || null,
      };
    });
}

// ─── Post orchestration ───────────────────────────────────────────────────────

export async function executePostOpeningStock(
  id: string,
  userId: string | null,
): Promise<{ message: string; header: any }> {
  const { header, totalCost } = await storage.postOpeningStock(id, userId);

  // GL journal — fire-and-forget بعد نجاح الترحيل
  if (totalCost > 0) {
    const headerId = header.id as string;
    const postDate = header.postDate as string;

    setImmediate(async () => {
      try {
        const entry = await storage.generateJournalEntry({
          sourceType:       "opening_stock",
          sourceDocumentId: headerId,
          reference:        `OS-${headerId.slice(0, 8).toUpperCase()}`,
          description:      `رصيد افتتاحي للمخزون — ${postDate}`,
          entryDate:        postDate,
          lines: [
            { lineType: "inventory",      amount: totalCost.toFixed(2) },
            { lineType: "opening_equity", amount: totalCost.toFixed(2) },
          ],
        });
        if (!entry) {
          logger.warn({ headerId }, "[OPENING_STOCK] GL journal not created — see accounting_event_log");
        }
      } catch (glErr: any) {
        logger.warn({ glErr: glErr?.message }, "[OPENING_STOCK] GL journal failed — logged for retry");
        logAcctEvent({
          sourceType:   "opening_stock",
          sourceId:     headerId,
          eventType:    "opening_stock_journal_failed",
          status:       "needs_retry",
          errorMessage: `فشل إنشاء قيد الرصيد الافتتاحي: ${glErr?.message ?? String(glErr)}`,
        }).catch(() => {});
      }
    });
  }

  return { message: "تم الترحيل بنجاح", header };
}
