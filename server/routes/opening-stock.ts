/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Opening Stock Routes — مسارات الرصيد الافتتاحي
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET    /api/opening-stock              — قائمة الوثائق
 *  POST   /api/opening-stock              — إنشاء وثيقة جديدة
 *  GET    /api/opening-stock/template     — تحميل نموذج Excel
 *  GET    /api/opening-stock/:id          — وثيقة واحدة مع سطورها
 *  PUT    /api/opening-stock/:id          — تحديث الرأس
 *  DELETE /api/opening-stock/:id          — حذف الوثيقة
 *  POST   /api/opening-stock/:id/lines    — إضافة / تعديل سطر
 *  DELETE /api/opening-stock/:id/lines/:lineId — حذف سطر
 *  GET    /api/opening-stock/:id/export   — تصدير السطور Excel
 *  POST   /api/opening-stock/:id/import  — استيراد سطور من Excel
 *  POST   /api/opening-stock/:id/post    — ترحيل الوثيقة
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Express } from "express";
import multer from "multer";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { logger } from "../lib/logger";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { storage } from "../storage";
import {
  buildXlsxBuffer,
  parseXlsxBuffer,
  getVal,
  parseDec,
  sendXlsxResponse,
} from "../lib/excel-helpers";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // multer memory storage

const PERM = PERMISSIONS.OPENING_STOCK_MANAGE;

export function registerOpeningStockRoutes(app: Express) {
  // ── قائمة الوثائق ────────────────────────────────────────────────────────
  app.get("/api/opening-stock", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      const list = await storage.getOpeningStockHeaders();
      res.json(list);
    } catch (e) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── نموذج Excel فارغ (قبل الـ :id لئلا يتعارض) ──────────────────────────
  app.get("/api/opening-stock/template", requireAuth, checkPermission(PERM), async (_req, res) => {
    try {
      const columns = [
        { header: "كود الصنف *",    key: "itemCode",      hint: "item_code الصنف",       width: 18 },
        { header: "الوحدة *",        key: "unitLevel",     hint: "major / medium / minor", width: 14 },
        { header: "الكمية *",        key: "qtyInUnit",     hint: "رقم موجب",               width: 12 },
        { header: "سعر الشراء (ج.م)",key: "purchasePrice", hint: "بالجنيه المصري",         width: 18 },
        { header: "سعر البيع (ج.م)", key: "salePrice",     hint: "بالجنيه المصري",         width: 18 },
        { header: "رقم التشغيلة",    key: "batchNo",       hint: "اختياري",                width: 16 },
        { header: "شهر الصلاحية",    key: "expiryMonth",   hint: "1-12 اختياري",           width: 14 },
        { header: "سنة الصلاحية",    key: "expiryYear",    hint: "مثال: 2026 اختياري",     width: 14 },
        { header: "ملاحظات",         key: "lineNotes",     hint: "اختياري",                width: 22 },
      ];
      const buf = buildXlsxBuffer(columns, [], "الرصيد الافتتاحي");
      sendXlsxResponse(res as any, buf, "نموذج_الرصيد_الافتتاحي.xlsx");
    } catch (e) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── إنشاء وثيقة جديدة ────────────────────────────────────────────────────
  app.post("/api/opening-stock", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      const { warehouseId, postDate, notes } = req.body;
      if (!warehouseId) return res.status(400).json({ message: "warehouseId مطلوب" });
      if (!postDate)    return res.status(400).json({ message: "postDate مطلوب" });

      const createdBy = (req as any).session?.userId ?? null;
      const header = await storage.createOpeningStockHeader({ warehouseId, postDate, notes, createdBy });
      res.status(201).json(header);
    } catch (e) {
      res.status(400).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── جلب وثيقة واحدة ──────────────────────────────────────────────────────
  app.get("/api/opening-stock/:id", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      const doc = await storage.getOpeningStockHeader(req.params.id);
      if (!doc) return res.status(404).json({ message: "الوثيقة غير موجودة" });
      res.json(doc);
    } catch (e) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── تحديث الرأس ──────────────────────────────────────────────────────────
  app.put("/api/opening-stock/:id", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      const updated = await storage.updateOpeningStockHeader(req.params.id, req.body);
      res.json(updated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("مُرحَّلة") ? 409 : 400).json({ message: msg });
    }
  });

  // ── حذف الوثيقة ──────────────────────────────────────────────────────────
  app.delete("/api/opening-stock/:id", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      await storage.deleteOpeningStockHeader(req.params.id);
      res.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("مُرحَّلة") ? 409 : 400).json({ message: msg });
    }
  });

  // ── إضافة / تعديل سطر ────────────────────────────────────────────────────
  app.post("/api/opening-stock/:id/lines", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      const {
        lineId, itemId, unitLevel, qtyInUnit, purchasePrice, salePrice,
        batchNo, expiryMonth, expiryYear, lineNotes,
      } = req.body;

      if (!itemId)    return res.status(400).json({ message: "itemId مطلوب" });
      if (!unitLevel) return res.status(400).json({ message: "unitLevel مطلوب" });
      const qty = parseFloat(qtyInUnit);
      if (!(qty > 0)) return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });

      const line = await storage.upsertOpeningStockLine(req.params.id, {
        lineId:        lineId || undefined,
        itemId,
        unitLevel,
        qtyInUnit:     qty,
        purchasePrice: parseFloat(purchasePrice) || 0,
        salePrice:     parseFloat(salePrice) || 0,
        batchNo:       batchNo || null,
        expiryMonth:   expiryMonth ? parseInt(expiryMonth) : null,
        expiryYear:    expiryYear  ? parseInt(expiryYear)  : null,
        lineNotes:     lineNotes || null,
      });
      res.status(lineId ? 200 : 201).json(line);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("مُرحَّلة") ? 409 : 400).json({ message: msg });
    }
  });

  // ── حذف سطر ──────────────────────────────────────────────────────────────
  app.delete("/api/opening-stock/:id/lines/:lineId", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      await storage.deleteOpeningStockLine(req.params.id, req.params.lineId);
      res.status(204).send();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(msg.includes("مُرحَّلة") ? 409 : 400).json({ message: msg });
    }
  });

  // ── تصدير السطور Excel ───────────────────────────────────────────────────
  app.get("/api/opening-stock/:id/export", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      const doc = await storage.getOpeningStockHeader(req.params.id);
      if (!doc) return res.status(404).json({ message: "الوثيقة غير موجودة" });

      const columns = [
        { header: "كود الصنف",     key: "itemCode",      width: 18 },
        { header: "اسم الصنف",     key: "itemNameAr",    width: 28 },
        { header: "الوحدة",        key: "unitLevel",     width: 12 },
        { header: "الكمية",        key: "qtyInUnit",     width: 12 },
        { header: "كمية التخزين",  key: "qtyInMinor",    width: 14 },
        { header: "سعر الشراء",    key: "purchasePrice", width: 14 },
        { header: "سعر البيع",     key: "salePrice",     width: 14 },
        { header: "رقم التشغيلة",  key: "batchNo",       width: 16 },
        { header: "شهر الصلاحية",  key: "expiryMonth",   width: 14 },
        { header: "سنة الصلاحية",  key: "expiryYear",    width: 14 },
        { header: "ملاحظات",       key: "lineNotes",     width: 22 },
      ];

      const dataRows = (doc.lines ?? []).map((l: any) => [
        l.itemCode ?? "",
        l.itemNameAr ?? "",
        l.unitLevel ?? "",
        l.qtyInUnit ?? "",
        l.qtyInMinor ?? "",
        l.purchasePrice ?? "",
        l.salePrice ?? "",
        l.batchNo ?? "",
        l.expiryMonth ?? "",
        l.expiryYear ?? "",
        l.lineNotes ?? "",
      ]);

      const buf = buildXlsxBuffer(columns, dataRows, "الرصيد الافتتاحي");
      sendXlsxResponse(res as any, buf, `رصيد_افتتاحي_${req.params.id.slice(0, 8)}.xlsx`);
    } catch (e) {
      res.status(500).json({ message: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── استيراد من Excel ─────────────────────────────────────────────────────
  app.post(
    "/api/opening-stock/:id/import",
    requireAuth,
    checkPermission(PERM),
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "لم يتم رفع ملف" });

        const rawRows = parseXlsxBuffer(req.file.buffer);
        const parsed = rawRows
          .filter((r) => getVal(r, "كود الصنف *", "كود الصنف", "itemCode").trim())
          .map((r) => {
            const itemCode     = getVal(r, "كود الصنف *", "كود الصنف", "itemCode");
            const unitLevel    = (getVal(r, "الوحدة *", "الوحدة", "unitLevel") || "major").toLowerCase();
            const qty          = parseDec(getVal(r, "الكمية *", "الكمية", "qtyInUnit")) ?? 0;
            const purchasePrice= parseDec(getVal(r, "سعر الشراء (ج.م)", "سعر الشراء", "purchasePrice")) ?? 0;
            const salePrice    = parseDec(getVal(r, "سعر البيع (ج.م)", "سعر البيع", "salePrice")) ?? 0;
            const batchNo      = getVal(r, "رقم التشغيلة", "batchNo") || null;
            const expiryMonthS = getVal(r, "شهر الصلاحية", "expiryMonth");
            const expiryYearS  = getVal(r, "سنة الصلاحية", "expiryYear");
            const lineNotes    = getVal(r, "ملاحظات", "lineNotes") || null;
            return {
              itemCode,
              unitLevel,
              qtyInUnit:     qty,
              purchasePrice,
              salePrice,
              batchNo,
              expiryMonth:   expiryMonthS ? parseInt(expiryMonthS) : null,
              expiryYear:    expiryYearS  ? parseInt(expiryYearS)  : null,
              lineNotes,
            };
          });

        if (!parsed.length) return res.status(400).json({ message: "لم يتم العثور على أسطر بيانات في الملف" });

        const result = await storage.importOpeningStockLines(req.params.id, parsed);
        res.json(result);
      } catch (e) {
        res.status(400).json({ message: e instanceof Error ? e.message : String(e) });
      }
    },
  );

  // ── الترحيل ──────────────────────────────────────────────────────────────
  app.post("/api/opening-stock/:id/post", requireAuth, checkPermission(PERM), async (req, res) => {
    try {
      const userId = (req as any).session?.userId ?? null;
      const { header, totalCost } = await storage.postOpeningStock(req.params.id, userId);

      // GL journal — fire-and-forget بعد نجاح الترحيل
      if (totalCost > 0) {
        const headerId = header.id;
        const postDate  = header.postDate;
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
              // generateJournalEntry returned null (e.g. no fiscal period, unmapped accounts)
              // — accounting_event_log entry already written inside generateJournalEntry
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

      res.json({ message: "تم الترحيل بنجاح", header });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg.includes("مُرحَّلة مسبقاً") || msg.includes("مرة واحدة فقط") ? 409 : 400;
      res.status(status).json({ message: msg });
    }
  });
}
