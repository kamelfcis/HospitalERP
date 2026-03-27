import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

interface ReceiptSettings {
  header: string;
  footer: string;
  logoText: string;
  autoPrint: boolean;
  showPreview: boolean;
}

const SETTING_KEYS = ["receipt_header", "receipt_footer", "receipt_logo_text", "receipt_auto_print", "receipt_show_preview"];

const DEFAULTS: ReceiptSettings = {
  header: "الصيدلية",
  footer: "شكرًا لزيارتكم",
  logoText: "",
  autoPrint: true,
  showPreview: false,
};

async function loadReceiptSettings(): Promise<ReceiptSettings> {
  const rows = await db.execute(
    sql`SELECT key, value FROM system_settings WHERE key IN ('receipt_header','receipt_footer','receipt_logo_text','receipt_auto_print','receipt_show_preview')`
  );
  const map: Record<string, string> = {};
  for (const row of rows.rows as { key: string; value: string }[]) {
    map[row.key] = row.value;
  }
  return {
    header:      map["receipt_header"]      ?? DEFAULTS.header,
    footer:      map["receipt_footer"]      ?? DEFAULTS.footer,
    logoText:    map["receipt_logo_text"]   ?? DEFAULTS.logoText,
    autoPrint:   (map["receipt_auto_print"]  ?? "true") === "true",
    showPreview: (map["receipt_show_preview"] ?? "false") === "true",
  };
}

async function saveReceiptSetting(key: string, value: string) {
  await db.execute(
    sql`INSERT INTO system_settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  );
}

export function registerReceiptSettingsRoutes(app: Express) {
  app.get("/api/receipt-settings", async (_req, res) => {
    const settings = await loadReceiptSettings();
    res.json(settings);
  });

  app.put("/api/receipt-settings", async (req, res) => {
    const { header, footer, logoText, autoPrint, showPreview } = req.body as Partial<ReceiptSettings>;
    if (header !== undefined)      await saveReceiptSetting("receipt_header",       String(header));
    if (footer !== undefined)      await saveReceiptSetting("receipt_footer",       String(footer));
    if (logoText !== undefined)    await saveReceiptSetting("receipt_logo_text",    String(logoText));
    if (autoPrint !== undefined)   await saveReceiptSetting("receipt_auto_print",   autoPrint ? "true" : "false");
    if (showPreview !== undefined) await saveReceiptSetting("receipt_show_preview", showPreview ? "true" : "false");
    const updated = await loadReceiptSettings();
    res.json(updated);
  });

  app.get("/api/cashier/receipt-data/:invoiceId", async (req, res) => {
    const { invoiceId } = req.params;

    const headerRows = await db.execute(sql`
      SELECT
        h.id,
        h.invoice_number,
        h.invoice_date,
        h.created_at,
        h.customer_name,
        h.customer_type,
        h.subtotal,
        h.discount_value,
        h.net_total,
        w.name_ar AS warehouse_name,
        cr.collected_by,
        cr.collected_at,
        cr.receipt_number
      FROM sales_invoice_headers h
      JOIN warehouses w ON w.id = h.warehouse_id
      LEFT JOIN cashier_receipts cr ON cr.invoice_id = h.id
      WHERE h.id = ${invoiceId}
      LIMIT 1
    `);

    if (!headerRows.rows.length) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const h = headerRows.rows[0] as Record<string, unknown>;

    const lineRows = await db.execute(sql`
      SELECT
        l.line_no,
        l.qty,
        l.unit_level,
        l.sale_price,
        l.line_total,
        i.name_ar AS item_name,
        i.major_unit_name,
        i.medium_unit_name,
        i.minor_unit_name
      FROM sales_invoice_lines l
      JOIN items i ON i.id = l.item_id
      WHERE l.invoice_id = ${invoiceId}
      ORDER BY l.line_no
    `);

    const lines = (lineRows.rows as Record<string, unknown>[]).map((l) => {
      const unitLevel = l.unit_level as string;
      const unitName =
        unitLevel === "major"  ? (l.major_unit_name  as string | null) ?? "وحدة" :
        unitLevel === "medium" ? (l.medium_unit_name as string | null) ?? "وحدة" :
                                  (l.minor_unit_name  as string | null) ?? "وحدة";
      return {
        itemName:  l.item_name as string,
        qty:       Number(l.qty),
        unitName,
        salePrice: Number(l.sale_price),
        lineTotal: Number(l.line_total),
      };
    });

    const collectedAt = h.collected_at as Date | null;
    const createdAt   = h.created_at  as Date;

    const displayDate = collectedAt ?? createdAt;
    const invoiceDate = String(h.invoice_date).slice(0, 10);
    const invoiceTime = displayDate
      ? new Date(displayDate).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
      : "";

    return res.json({
      invoiceId:     h.id,
      invoiceNumber: Number(h.invoice_number),
      receiptNumber: h.receipt_number ?? null,
      invoiceDate,
      invoiceTime,
      warehouseName: h.warehouse_name ?? "",
      cashierName:   (h.collected_by as string | null) ?? "",
      customerName:  (h.customer_name as string | null) ?? "",
      customerType:  h.customer_type as string,
      subtotal:      Number(h.subtotal),
      discountValue: Number(h.discount_value),
      netTotal:      Number(h.net_total),
      lines,
    });
  });
}
