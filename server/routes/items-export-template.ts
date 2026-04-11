import { Express } from "express";
import * as XLSX from "xlsx";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { pool } from "../db";

const ITEM_COLUMNS = [
  { header: "كود الصنف *",          key: "item_code" },
  { header: "باركود",               key: "barcode" },
  { header: "الاسم العربي *",        key: "name_ar" },
  { header: "الاسم الإنجليزي",       key: "name_en" },
  { header: "التصنيف",               key: "category",              hint: "دواء | مستلزمات | خدمة" },
  { header: "نوع الشكل",             key: "form_type" },
  { header: "سعر الشراء",            key: "purchase_price_last" },
  { header: "سعر البيع",             key: "sale_price_current" },
  { header: "الوحدة الكبرى",         key: "major_unit_name" },
  { header: "الوحدة المتوسطة",       key: "medium_unit_name" },
  { header: "الوحدة الصغرى",         key: "minor_unit_name" },
  { header: "كبرى←متوسطة",           key: "major_to_medium" },
  { header: "كبرى←صغرى",             key: "major_to_minor" },
  { header: "متوسطة←صغرى",           key: "medium_to_minor" },
  { header: "ذو صلاحية",             key: "has_expiry",            hint: "نعم | لا" },
  { header: "مادة سامة",             key: "is_toxic",              hint: "نعم | لا" },
  { header: "بيع كسري",              key: "allow_fractional_sale", hint: "نعم | لا" },
  { header: "وصف",                   key: "description" },
];

export { ITEM_COLUMNS };

export function registerItemsExportTemplate(app: Express, _storage: any) {
  app.get("/api/items/export-template", requireAuth, checkPermission(PERMISSIONS.ITEMS_VIEW), async (req, res) => {
    try {
      const includeData = req.query.includeData === "true";
      const wb = XLSX.utils.book_new();
      const headers = ITEM_COLUMNS.map(c => c.header);
      const hints   = ITEM_COLUMNS.map(c => c.hint || "");
      let rows: any[][] = [headers, hints];

      if (includeData) {
        const { rows: items } = await pool.query(`
          SELECT i.item_code,
                 (SELECT ib.barcode_value FROM item_barcodes ib
                  WHERE ib.item_id = i.id AND ib.is_active = true
                  ORDER BY ib.created_at LIMIT 1) AS barcode,
                 i.name_ar, i.name_en,
                 CASE i.category WHEN 'drug' THEN 'دواء' WHEN 'supply' THEN 'مستلزمات' WHEN 'service' THEN 'خدمة' ELSE i.category END AS category,
                 ft.name_ar AS form_type,
                 i.purchase_price_last, i.sale_price_current,
                 i.major_unit_name, i.medium_unit_name, i.minor_unit_name,
                 i.major_to_medium, i.major_to_minor, i.medium_to_minor,
                 CASE WHEN i.has_expiry THEN 'نعم' ELSE 'لا' END AS has_expiry,
                 CASE WHEN i.is_toxic THEN 'نعم' ELSE 'لا' END AS is_toxic,
                 CASE WHEN i.allow_fractional_sale THEN 'نعم' ELSE 'لا' END AS allow_fractional_sale,
                 i.description
          FROM items i
          LEFT JOIN item_form_types ft ON ft.id = i.form_type_id
          ORDER BY i.item_code
        `);
        for (const item of items) {
          rows.push(ITEM_COLUMNS.map(c => item[c.key] ?? ""));
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = ITEM_COLUMNS.map((_c, i) => ({ wch: i < 2 ? 20 : i < 4 ? 18 : 14 }));

      const headerRange = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) {
          ws[addr].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "1D4ED8" } },
            alignment: { horizontal: "center" },
          };
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
      const filename = includeData ? "items-export.xlsx" : "items-template.xlsx";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(buf);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
