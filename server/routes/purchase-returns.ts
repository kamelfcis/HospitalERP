/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Purchase Returns Routes — مسارات مرتجعات المشتريات
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Express, Request, Response } from "express";
import { requireAuth }           from "./_shared";
import { storage }               from "../storage";
import { assertUserWarehouseAllowed } from "../lib/warehouse-guard";
import {
  getApprovedInvoicesForSupplier,
  getPurchaseInvoiceLinesForReturn,
  getAvailableLots,
  getNextReturnNumber,
  createPurchaseReturn,
  listPurchaseReturns,
  getPurchaseReturnById,
} from "../storage/purchase-returns-storage";

export function registerPurchaseReturnRoutes(app: Express) {

  // ── GET /api/purchase-returns/invoices/:supplierId ─────────────────────────
  app.get("/api/purchase-returns/invoices/:supplierId", requireAuth, async (req: Request, res: Response) => {
    try {
      const invoices = await getApprovedInvoicesForSupplier(req.params.supplierId);
      res.json(invoices);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/purchase-returns/invoice-lines/:invoiceId ────────────────────
  app.get("/api/purchase-returns/invoice-lines/:invoiceId", requireAuth, async (req: Request, res: Response) => {
    try {
      const lines = await getPurchaseInvoiceLinesForReturn(req.params.invoiceId);
      res.json(lines);
    } catch (err: any) {
      console.error("[PR] invoice-lines error:", err.message, err.stack?.split("\n")[1]);
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/purchase-returns/lots ────────────────────────────────────────
  // ?itemId=xxx&warehouseId=xxx
  app.get("/api/purchase-returns/lots", requireAuth, async (req: Request, res: Response) => {
    try {
      const { itemId, warehouseId, isFreeItem } = req.query as Record<string, string>;
      if (!itemId || !warehouseId) {
        return res.status(400).json({ message: "itemId و warehouseId مطلوبان." });
      }
      const lots = await getAvailableLots(itemId, warehouseId, isFreeItem === "true");
      res.json(lots);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/purchase-returns/next-number ─────────────────────────────────
  app.get("/api/purchase-returns/next-number", requireAuth, async (_req: Request, res: Response) => {
    try {
      const next = await getNextReturnNumber();
      res.json({ nextNumber: next });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/purchase-returns ─────────────────────────────────────────────
  // ?supplierId=&purchaseInvoiceId=&fromDate=&toDate=&page=&pageSize=
  app.get("/api/purchase-returns", requireAuth, async (req: Request, res: Response) => {
    try {
      const { supplierId, purchaseInvoiceId, fromDate, toDate, page, pageSize } = req.query as Record<string, string>;
      const result = await listPurchaseReturns({
        supplierId,
        purchaseInvoiceId,
        fromDate,
        toDate,
        page:     page     ? parseInt(page,     10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 50,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/purchase-returns/:id ─────────────────────────────────────────
  app.get("/api/purchase-returns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const doc = await getPurchaseReturnById(req.params.id);
      if (!doc) return res.status(404).json({ message: "المرتجع غير موجود." });
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── POST /api/purchase-returns ────────────────────────────────────────────
  app.post("/api/purchase-returns", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const body = req.body;

      // Basic presence checks
      if (!body.purchaseInvoiceId) {
        return res.status(400).json({ message: "فاتورة الشراء الأصلية مطلوبة." });
      }
      if (!body.supplierId) {
        return res.status(400).json({ message: "المورد مطلوب." });
      }
      if (!body.warehouseId) {
        return res.status(400).json({ message: "المخزن مطلوب." });
      }

      const whGuardMsg = await assertUserWarehouseAllowed(req.session.userId!, body.warehouseId, storage);
      if (whGuardMsg) return res.status(403).json({ message: whGuardMsg });

      if (!body.returnDate) {
        return res.status(400).json({ message: "تاريخ المرتجع مطلوب." });
      }
      if (!Array.isArray(body.lines) || body.lines.length === 0) {
        return res.status(400).json({ message: "يجب إضافة سطر واحد على الأقل." });
      }

      for (const line of body.lines) {
        if (!line.purchaseInvoiceLineId) {
          return res.status(400).json({ message: "كل سطر يجب أن يحتوي على purchaseInvoiceLineId." });
        }
        if (!line.lotId) {
          return res.status(400).json({ message: "كل سطر يجب أن يحتوي على lotId." });
        }
        const qty = parseFloat(line.qtyReturned);
        if (!qty || qty <= 0) {
          return res.status(400).json({ message: "الكمية المرتجعة يجب أن تكون أكبر من صفر." });
        }
      }

      const result = await createPurchaseReturn({
        purchaseInvoiceId: body.purchaseInvoiceId,
        supplierId:        body.supplierId,
        warehouseId:       body.warehouseId,
        returnDate:        body.returnDate,
        notes:             body.notes ?? null,
        createdBy:         user?.username ?? null,
        lines: body.lines.map((l: any) => ({
          purchaseInvoiceLineId: l.purchaseInvoiceLineId,
          lotId:                 l.lotId,
          qtyReturned:           parseFloat(l.qtyReturned),
          bonusQtyReturned:      l.bonusQtyReturned != null ? parseFloat(l.bonusQtyReturned) : undefined,
          vatRateOverride:       l.vatRateOverride  != null ? parseFloat(l.vatRateOverride)  : undefined,
        })),
      });

      res.status(201).json(result);
    } catch (err: any) {
      const status = err.message?.includes("غير موجود") ? 404 :
                     err.message?.includes("تتجاوز")   ? 422 : 400;
      res.status(status).json({ message: err.message });
    }
  });
}
