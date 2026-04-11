import { Express } from "express";
import { z } from "zod";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { insertInventoryLotSchema } from "@shared/schema";
import { convertPriceToMinor } from "../inventory-helpers";

export function registerItemsMasterLotsBarcodes(app: Express, storage: any) {
  app.get("/api/items/:id/lots", async (req, res) => {
    try {
      const lots = await storage.getLots(req.params.id as string);
      res.json(lots);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/lots", requireAuth, checkPermission(PERMISSIONS.RECEIVING_CREATE), async (req, res) => {
    try {
      const validated = insertInventoryLotSchema.parse(req.body);
      const item = await storage.getItem(validated.itemId);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      if (item.category === "service") {
        return res.status(400).json({ message: "الخدمات لا يمكن إنشاء دفعات مخزنية لها" });
      }
      if (!item.hasExpiry && validated.expiryDate) {
        return res.status(400).json({ message: "هذا الصنف لا يدعم تاريخ الصلاحية" });
      }
      if (item.hasExpiry && !validated.expiryDate) {
        return res.status(400).json({ message: "تاريخ الصلاحية مطلوب لهذا الصنف" });
      }
      if (parseFloat(validated.qtyInMinor || "0") <= 0) {
        return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
      }
      const unitLevel = req.body.unitLevel || "minor";
      if (validated.purchasePrice && unitLevel !== "minor") {
        const price = parseFloat(validated.purchasePrice);
        validated.purchasePrice = convertPriceToMinor(price, unitLevel, {
          nameAr:         item.nameAr,
          majorToMinor:   item.majorToMinor,
          majorToMedium:  item.majorToMedium,
          mediumToMinor:  item.mediumToMinor,
        }).toFixed(4);
      }
      const lot = await storage.createLot(validated);
      res.status(201).json(lot);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.get("/api/fefo/preview", async (req, res) => {
    try {
      const { itemId, requiredQtyInMinor, asOfDate } = req.query;
      if (!itemId || !requiredQtyInMinor) {
        return res.status(400).json({ message: "itemId و requiredQtyInMinor مطلوبان" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const result = await storage.getFefoPreview(
        itemId as string,
        parseFloat(requiredQtyInMinor as string),
        date
      );
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:id/barcodes", async (req, res) => {
    try {
      const barcodes = await storage.getItemBarcodes(req.params.id as string);
      res.json(barcodes);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/items/:id/barcodes", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const { barcodeValue, barcodeType } = req.body;
      if (!barcodeValue || !barcodeValue.trim()) {
        return res.status(400).json({ message: "قيمة الباركود مطلوبة" });
      }
      const normalized = barcodeValue.trim();
      if (!/^[a-zA-Z0-9\-\.]+$/.test(normalized)) {
        return res.status(400).json({ message: "الباركود يجب أن يحتوي على أرقام وحروف إنجليزية فقط" });
      }
      const barcode = await storage.createItemBarcode({
        itemId: req.params.id as string,
        barcodeValue: normalized,
        barcodeType: barcodeType || null,
        isActive: true,
      });
      res.status(201).json(barcode);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "23505" || (error instanceof Error ? error.message : String(error)).includes("unique") || (error instanceof Error ? error.message : String(error)).includes("duplicate")) {
        return res.status(409).json({ message: "هذا الباركود مسجل بالفعل لصنف آخر" });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/barcodes/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const barcode = await storage.deactivateBarcode(req.params.id as string);
      if (!barcode) {
        return res.status(404).json({ message: "الباركود غير موجود" });
      }
      res.json(barcode);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/barcode/resolve", async (req, res) => {
    try {
      const { value } = req.query;
      if (!value || !(value as string).trim()) {
        return res.status(400).json({ message: "قيمة البحث مطلوبة" });
      }
      const result = await storage.resolveBarcode(value as string);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
