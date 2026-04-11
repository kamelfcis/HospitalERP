import { Express } from "express";

export function registerItemsLookupsRoutes(app: Express, storage: any) {
  app.get("/api/items/lookup", async (req, res) => {
    try {
      const { query, warehouseId, limit } = req.query;
      if (!query || !warehouseId) {
        return res.status(400).json({ message: "query و warehouseId مطلوبة" });
      }
      const results = await storage.searchItemsForTransfer(
        query as string,
        warehouseId as string,
        limit ? parseInt(limit as string) : 10
      );
      res.json(results);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/search", async (req, res) => {
    try {
      const { warehouseId, mode, q, limit, page, pageSize, includeZeroStock, drugsOnly, excludeServices, minPrice, maxPrice } = req.query as Record<string, string | undefined>;
      if (!q) {
        return res.status(400).json({ message: "q مطلوب" });
      }
      if (warehouseId) {
        const result = await storage.searchItemsAdvanced({
          mode: (mode || 'AR') as 'AR' | 'EN' | 'CODE' | 'BARCODE',
          query: q,
          warehouseId,
          page: parseInt(page || "1") || 1,
          pageSize: parseInt(pageSize || limit || "50") || 50,
          includeZeroStock: includeZeroStock === 'true',
          drugsOnly: drugsOnly === 'true',
          excludeServices: excludeServices === 'true',
          minPrice: minPrice ? parseFloat(minPrice) : undefined,
          maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        });
        res.json(result);
      } else {
        const searchLimit = parseInt(limit || pageSize || "15") || 15;
        const searchQuery = q.replace(/%/g, '%');
        const items = await storage.searchItemsByPattern(searchQuery, searchLimit);
        res.json(items);
      }
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:itemId/expiry-options", async (req, res) => {
    try {
      const { warehouseId, asOfDate } = req.query;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const options = await storage.getExpiryOptions(req.params.itemId as string, warehouseId as string, date);
      res.json(options);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:itemId/availability-summary", async (req, res) => {
    try {
      const { asOfDate, excludeExpired } = req.query;
      const date = (asOfDate as string) || new Date().toISOString().split("T")[0];
      const exclude = excludeExpired !== "0";
      const summary = await storage.getItemAvailabilitySummary(req.params.itemId as string, date, exclude);
      res.json(summary);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:itemId/availability", async (req, res) => {
    try {
      const { warehouseId } = req.query;
      if (!warehouseId) {
        return res.status(400).json({ message: "warehouseId مطلوب" });
      }
      const qty = await storage.getItemAvailability(req.params.itemId as string, warehouseId as string);
      res.json({ availableQtyMinor: qty });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/check-unique", async (req, res) => {
    try {
      const { code, nameAr, nameEn, excludeId } = req.query as { code?: string; nameAr?: string; nameEn?: string; excludeId?: string };
      const result = await storage.checkItemUniqueness(code, nameAr, nameEn, excludeId);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
