import { Express } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import multer from "multer";
import * as XLSX from "xlsx";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { auditLog } from "../route-helpers";
import { db } from "../db";
import { pool } from "../db";
import {
  insertItemSchema,
  insertItemFormTypeSchema,
  insertItemUomSchema,
} from "@shared/schema";
import { validateItemUnits, computeMajorToMinor } from "../inventory-helpers";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

export function registerItemsCrudCoreRoutes(app: Express, storage: any) {
  app.get("/api/items", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string | undefined;
      const category = req.query.category as string | undefined;
      const isToxic = req.query.isToxic !== undefined ? req.query.isToxic === "true" : undefined;
      const formTypeId = req.query.formTypeId as string | undefined;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === "true" : undefined;
      const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
      const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;

      const result = await storage.getItems({
        page,
        limit,
        search,
        category,
        isToxic,
        formTypeId,
        isActive,
        minPrice,
        maxPrice,
      });
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

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

  app.post("/api/items/import", requireAuth, checkPermission(PERMISSIONS.ITEMS_CREATE), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "لم يتم رفع ملف" });

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (raw.length === 0) return res.status(400).json({ message: "الملف فارغ أو لا يحتوي على بيانات" });

      const { rows: ftRows } = await pool.query(`SELECT id, name_ar FROM item_form_types`);
      const formTypeMap: Record<string, string> = {};
      for (const ft of ftRows) formTypeMap[ft.name_ar.trim().toLowerCase()] = ft.id;

      const catMap: Record<string, string> = {
        "دواء": "drug", "drug": "drug",
        "مستلزمات": "supply", "supply": "supply",
        "خدمة": "service", "service": "service",
      };
      const boolMap: Record<string, boolean> = {
        "نعم": true, "yes": true, "true": true, "1": true,
        "لا": false, "no": false, "false": false, "0": false,
      };

      const getVal = (row: Record<string, any>, ...keys: string[]): string => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return String(row[k]).trim();
        }
        return "";
      };

      const errors: string[] = [];
      const CHUNK = 200;
      const validRows: any[] = [];

      for (let i = 0; i < raw.length; i++) {
        const row = raw[i];
        const rowNum = i + 3;

        const itemCode = getVal(row, "كود الصنف *", "كود الصنف", "item_code", "كود");
        const nameAr   = getVal(row, "الاسم العربي *", "الاسم العربي", "name_ar");

        if (!itemCode) { errors.push(`سطر ${rowNum}: كود الصنف فارغ — تخطي`); continue; }
        if (!nameAr)   { errors.push(`سطر ${rowNum}: الاسم العربي فارغ — تخطي`); continue; }

        const catRaw = getVal(row, "التصنيف", "category").toLowerCase();
        const cat = catMap[catRaw] || "drug";

        const ftName = getVal(row, "نوع الشكل", "form_type").toLowerCase();
        let ftId: string | null = null;
        if (ftName) {
          if (formTypeMap[ftName]) {
            ftId = formTypeMap[ftName];
          } else {
            const origName = getVal(row, "نوع الشكل", "form_type");
            const newId = crypto.randomUUID();
            await pool.query(
              `INSERT INTO item_form_types (id, name_ar) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [newId, origName]
            );
            const { rows: newFt } = await pool.query(`SELECT id FROM item_form_types WHERE LOWER(name_ar)=$1`, [ftName]);
            ftId = newFt[0]?.id || null;
            if (ftId) formTypeMap[ftName] = ftId;
          }
        }

        const parseDec = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
        const parseBool = (v: string) => boolMap[v.toLowerCase()] ?? false;

        validRows.push({
          item_code: itemCode,
          barcode:   getVal(row, "باركود", "barcode") || null,
          name_ar: nameAr,
          name_en: getVal(row, "الاسم الإنجليزي", "name_en") || itemCode,
          category: cat,
          form_type_id: ftId,
          purchase_price_last: parseDec(getVal(row, "سعر الشراء", "purchase_price_last")) ?? 0,
          sale_price_current:  parseDec(getVal(row, "سعر البيع",  "sale_price_current"))  ?? 0,
          major_unit_name:  getVal(row, "الوحدة الكبرى",   "major_unit_name")  || null,
          medium_unit_name: getVal(row, "الوحدة المتوسطة", "medium_unit_name") || null,
          minor_unit_name:  getVal(row, "الوحدة الصغرى",   "minor_unit_name")  || null,
          major_to_medium: parseDec(getVal(row, "كبرى←متوسطة", "major_to_medium")),
          major_to_minor:  parseDec(getVal(row, "كبرى←صغرى",   "major_to_minor")),
          medium_to_minor: parseDec(getVal(row, "متوسطة←صغرى", "medium_to_minor")),
          has_expiry:            parseBool(getVal(row, "ذو صلاحية",  "has_expiry")),
          is_toxic:              parseBool(getVal(row, "مادة سامة",  "is_toxic")),
          allow_fractional_sale: parseBool(getVal(row, "بيع كسري",   "allow_fractional_sale")),
          description: getVal(row, "وصف", "description") || null,
        });
      }

      for (let vi = validRows.length - 1; vi >= 0; vi--) {
        const r = validRows[vi];
        if (r.category === "service") continue;
        const unitErrors = validateItemUnits({
          majorUnitName:  r.major_unit_name,
          mediumUnitName: r.medium_unit_name,
          minorUnitName:  r.minor_unit_name,
          majorToMedium:  r.major_to_medium,
          majorToMinor:   r.major_to_minor,
          mediumToMinor:  r.medium_to_minor,
        });
        if (unitErrors.length > 0) {
          errors.push(`صنف ${r.item_code}: ${unitErrors.join("، ")} — تم التخطي`);
          validRows.splice(vi, 1);
          continue;
        }
        const computed = computeMajorToMinor({
          majorUnitName:  r.major_unit_name,
          mediumUnitName: r.medium_unit_name,
          minorUnitName:  r.minor_unit_name,
          majorToMedium:  r.major_to_medium,
          majorToMinor:   r.major_to_minor,
          mediumToMinor:  r.medium_to_minor,
        });
        if (computed !== null) r.major_to_minor = parseFloat(computed);
      }

      const deduped = Object.values(
        validRows.reduce((acc: Record<string, any>, row: any) => {
          acc[row.item_code] = row;
          return acc;
        }, {})
      );

      const codeToId: Record<string, string> = {};

      for (let s = 0; s < deduped.length; s += CHUNK) {
        const chunk = deduped.slice(s, s + CHUNK);
        const placeholders: string[] = [];
        const values: any[] = [];
        let idx = 1;
        for (const r of chunk) {
          placeholders.push(
            `($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`
          );
          values.push(
            crypto.randomUUID(),
            r.item_code, r.name_ar, r.name_en, r.category, r.is_toxic,
            r.form_type_id, r.purchase_price_last, r.sale_price_current,
            r.major_unit_name, r.medium_unit_name, r.minor_unit_name,
            r.major_to_medium, r.major_to_minor, r.medium_to_minor,
            r.has_expiry, r.allow_fractional_sale, r.description
          );
        }
        const { rows: returned } = await pool.query(`
          INSERT INTO items (
            id, item_code, name_ar, name_en, category, is_toxic,
            form_type_id, purchase_price_last, sale_price_current,
            major_unit_name, medium_unit_name, minor_unit_name,
            major_to_medium, major_to_minor, medium_to_minor,
            has_expiry, allow_fractional_sale, description
          ) VALUES ${placeholders.join(",")}
          ON CONFLICT (item_code) DO UPDATE SET
            name_ar               = EXCLUDED.name_ar,
            name_en               = EXCLUDED.name_en,
            category              = EXCLUDED.category,
            is_toxic              = EXCLUDED.is_toxic,
            form_type_id          = COALESCE(EXCLUDED.form_type_id, items.form_type_id),
            purchase_price_last   = EXCLUDED.purchase_price_last,
            sale_price_current    = EXCLUDED.sale_price_current,
            major_unit_name       = COALESCE(NULLIF(EXCLUDED.major_unit_name,''), items.major_unit_name),
            medium_unit_name      = COALESCE(NULLIF(EXCLUDED.medium_unit_name,''), items.medium_unit_name),
            minor_unit_name       = COALESCE(NULLIF(EXCLUDED.minor_unit_name,''), items.minor_unit_name),
            major_to_medium       = COALESCE(EXCLUDED.major_to_medium, items.major_to_medium),
            major_to_minor        = COALESCE(EXCLUDED.major_to_minor,  items.major_to_minor),
            medium_to_minor       = COALESCE(EXCLUDED.medium_to_minor, items.medium_to_minor),
            has_expiry            = EXCLUDED.has_expiry,
            allow_fractional_sale = EXCLUDED.allow_fractional_sale,
            description           = COALESCE(NULLIF(EXCLUDED.description,''), items.description),
            updated_at            = NOW()
          RETURNING id, item_code
        `, values);

        for (const row of returned) codeToId[row.item_code] = row.id;
      }

      const barcodeRows = deduped.filter((r: any) => r.barcode && codeToId[r.item_code]);
      if (barcodeRows.length > 0) {
        const bPh: string[] = [];
        const bVals: any[] = [];
        let bi = 1;
        for (const r of barcodeRows) {
          bPh.push(`($${bi++},$${bi++},$${bi++})`);
          bVals.push(codeToId[r.item_code], r.barcode, "EAN13");
        }
        await pool.query(`
          INSERT INTO item_barcodes (item_id, barcode_value, barcode_type)
          VALUES ${bPh.join(",")}
          ON CONFLICT (barcode_value) DO NOTHING
        `, bVals);
      }

      const dupCount = validRows.length - deduped.length;
      res.json({
        success: true,
        total:   deduped.length,
        skipped: errors.length + dupCount,
        errors:  [
          ...errors.slice(0, 50),
          ...(dupCount > 0 ? [`${dupCount} صنف مكرر في الملف — تم الاحتفاظ بآخر قيمة`] : []),
        ],
      });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:id", async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id as string);
      if (!item) {
        return res.status(404).json({ message: "الصنف غير موجود" });
      }
      const txResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM inventory_lots       WHERE item_id = ${req.params.id}
          UNION ALL
          SELECT 1 FROM purchase_transactions WHERE item_id = ${req.params.id}
          UNION ALL
          SELECT 1 FROM sales_transactions    WHERE item_id = ${req.params.id}
        ) AS has_transactions
      `);
      const txRow = (txResult as any).rows?.[0];
      res.json({ ...item, hasTransactions: txRow?.has_transactions === true || txRow?.has_transactions === "true" });
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/items", requireAuth, checkPermission(PERMISSIONS.ITEMS_CREATE), async (req, res) => {
    try {
      const parsed = insertItemSchema.parse(req.body);

      const errors: string[] = [];
      if (!parsed.itemCode?.trim()) errors.push("كود الصنف مطلوب");
      if (!parsed.nameAr?.trim()) errors.push("الاسم العربي مطلوب");
      if (!parsed.nameEn?.trim()) errors.push("الاسم الإنجليزي مطلوب");
      if (!parsed.formTypeId) errors.push("نوع الشكل مطلوب");

      const isServiceItem = parsed.category === "service";

      if (!isServiceItem) {
        const unitErrors = validateItemUnits({
          majorUnitName:  parsed.majorUnitName,
          mediumUnitName: parsed.mediumUnitName,
          minorUnitName:  parsed.minorUnitName,
          majorToMedium:  parsed.majorToMedium,
          majorToMinor:   parsed.majorToMinor,
          mediumToMinor:  parsed.mediumToMinor,
        });
        errors.push(...unitErrors);
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: errors.join("، ") });
      }

      const uniqueness = await storage.checkItemUniqueness(parsed.itemCode ?? undefined, parsed.nameAr ?? undefined, parsed.nameEn ?? undefined);
      const uniqueErrors: string[] = [];
      if (!uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
      if (!uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
      if (!uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");

      if (uniqueErrors.length > 0) {
        return res.status(409).json({ message: uniqueErrors.join("، ") });
      }

      if (parsed.category === "service") {
        parsed.hasExpiry = false;
        parsed.majorUnitName = null;
        parsed.mediumUnitName = null;
        parsed.minorUnitName = null;
        parsed.majorToMedium = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      } else if (parsed.category === "drug" && parsed.hasExpiry === undefined) {
        parsed.hasExpiry = true;
      }
      if (!parsed.mediumUnitName?.trim()) {
        parsed.mediumUnitName = null;
        parsed.majorToMedium = null;
      }
      if (!parsed.minorUnitName?.trim()) {
        parsed.minorUnitName = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      }
      const computedMajorToMinor = computeMajorToMinor({
        majorUnitName:  parsed.majorUnitName,
        mediumUnitName: parsed.mediumUnitName,
        minorUnitName:  parsed.minorUnitName,
        majorToMedium:  parsed.majorToMedium,
        majorToMinor:   parsed.majorToMinor,
        mediumToMinor:  parsed.mediumToMinor,
      });
      if (computedMajorToMinor !== null) parsed.majorToMinor = computedMajorToMinor;

      const item = await storage.createItem(parsed);
      res.status(201).json(item);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.put("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_EDIT), async (req, res) => {
    try {
      const itemId = req.params.id as string;
      const parsed = insertItemSchema.partial().parse(req.body);

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) return res.status(404).json({ message: "الصنف غير موجود" });

      const conversionFields = [
        "majorToMinor", "majorToMedium", "mediumToMinor",
        "majorUnitName", "mediumUnitName", "minorUnitName",
      ] as const;
      const normalizeUnitVal = (v: unknown): string | null => {
        if (v == null) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
      };
      const conversionChanged = conversionFields.some((f) => {
        if (!(f in parsed)) return false;
        const requested = normalizeUnitVal(parsed[f]);
        const current   = normalizeUnitVal(currentItem[f]);
        return requested !== current;
      });

      if (conversionChanged) {
        const countsResult = await db.execute(sql`
          SELECT
            (SELECT COUNT(*)::int FROM inventory_lots        WHERE item_id = ${itemId}) AS lot_count,
            (SELECT COUNT(*)::int FROM purchase_transactions  WHERE item_id = ${itemId}) AS purchase_count,
            (SELECT COUNT(*)::int FROM sales_transactions     WHERE item_id = ${itemId}) AS sales_count
        `);
        const counts = (countsResult as any).rows?.[0];

        const lotCount      = parseInt(String(counts?.lot_count      ?? "0"), 10);
        const purchaseCount = parseInt(String(counts?.purchase_count ?? "0"), 10);
        const salesCount    = parseInt(String(counts?.sales_count    ?? "0"), 10);
        const total = lotCount + purchaseCount + salesCount;

        if (total > 0) {
          await auditLog({
            tableName: "items",
            recordId: itemId,
            action: "CONVERSION_EDIT_BLOCKED",
            oldValues: {
              majorToMinor:  currentItem.majorToMinor,
              majorToMedium: currentItem.majorToMedium,
              mediumToMinor: currentItem.mediumToMinor,
            },
            newValues: {
              majorToMinor:  parsed.majorToMinor,
              majorToMedium: parsed.majorToMedium,
              mediumToMinor: parsed.mediumToMinor,
              lotCount, purchaseCount, salesCount,
            },
            userId: (req as any).session?.userId,
          });
          return res.status(409).json({
            message: `لا يمكن تعديل معاملات التحويل أو أسماء الوحدات — يوجد ${lotCount} دفعة، ${purchaseCount} حركة شراء، ${salesCount} حركة بيع على هذا الصنف`,
          });
        }
      }

      const effectiveMajorName  = parsed.majorUnitName  !== undefined ? parsed.majorUnitName  : currentItem.majorUnitName;
      const effectiveMediumName = parsed.mediumUnitName !== undefined ? parsed.mediumUnitName : currentItem.mediumUnitName;
      const effectiveMinorName  = parsed.minorUnitName  !== undefined ? parsed.minorUnitName  : currentItem.minorUnitName;
      const effectiveMajorToMedium = parsed.majorToMedium !== undefined ? parsed.majorToMedium : currentItem.majorToMedium;
      const effectiveMajorToMinor  = parsed.majorToMinor  !== undefined ? parsed.majorToMinor  : currentItem.majorToMinor;
      const effectiveMediumToMinor = parsed.mediumToMinor !== undefined ? parsed.mediumToMinor : currentItem.mediumToMinor;

      const isService = (parsed.category ?? currentItem.category) === "service";
      if (!isService) {
        const convErrors = validateItemUnits({
          majorUnitName:  effectiveMajorName,
          mediumUnitName: effectiveMediumName,
          minorUnitName:  effectiveMinorName,
          majorToMedium:  effectiveMajorToMedium,
          majorToMinor:   effectiveMajorToMinor,
          mediumToMinor:  effectiveMediumToMinor,
        });
        if (convErrors.length > 0) return res.status(400).json({ message: convErrors.join("، ") });
      }

      if (parsed.itemCode || parsed.nameAr || parsed.nameEn) {
        const uniqueness = await storage.checkItemUniqueness(parsed.itemCode ?? undefined, parsed.nameAr ?? undefined, parsed.nameEn ?? undefined, itemId);
        const uniqueErrors: string[] = [];
        if (parsed.itemCode && !uniqueness.codeUnique) uniqueErrors.push("كود الصنف مسجل بالفعل");
        if (parsed.nameAr && !uniqueness.nameArUnique) uniqueErrors.push("الاسم العربي مسجل بالفعل");
        if (parsed.nameEn && !uniqueness.nameEnUnique) uniqueErrors.push("الاسم الإنجليزي مسجل بالفعل");
        if (uniqueErrors.length > 0) {
          return res.status(409).json({ message: uniqueErrors.join("، ") });
        }
      }

      if (parsed.mediumUnitName !== undefined && !parsed.mediumUnitName?.trim()) {
        parsed.mediumUnitName = null;
        parsed.majorToMedium = null;
      }
      if (parsed.minorUnitName !== undefined && !parsed.minorUnitName?.trim()) {
        parsed.minorUnitName = null;
        parsed.majorToMinor = null;
        parsed.mediumToMinor = null;
      }

      const putComputedMajorToMinor = computeMajorToMinor({
        majorUnitName:  effectiveMajorName,
        mediumUnitName: effectiveMediumName,
        minorUnitName:  effectiveMinorName,
        majorToMedium:  effectiveMajorToMedium,
        majorToMinor:   effectiveMajorToMinor,
        mediumToMinor:  effectiveMediumToMinor,
      });
      if (putComputedMajorToMinor !== null) parsed.majorToMinor = putComputedMajorToMinor;

      const item = await storage.updateItem(itemId, parsed);
      if (!item) return res.status(404).json({ message: "الصنف غير موجود" });
      res.json(item);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message: _em });
    }
  });

  app.delete("/api/items/:id", requireAuth, checkPermission(PERMISSIONS.ITEMS_DELETE), async (req, res) => {
    try {
      await storage.deleteItem(req.params.id as string);
      res.status(204).send();
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : "").includes("violates foreign key constraint") || (error as { code?: string }).code === "23503") {
        res.status(409).json({ message: "لا يمكن حذف هذا الصنف لوجود حركات مرتبطة به. يمكنك إلغاء تفعيله بدلاً من ذلك." });
      } else {
        res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
    }
  });

  app.get("/api/form-types", async (req, res) => {
    try {
      const formTypes = await storage.getItemFormTypes();
      res.json(formTypes);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/form-types", requireAuth, checkPermission(PERMISSIONS.ITEMS_CREATE), async (req, res) => {
    try {
      const validated = insertItemFormTypeSchema.parse(req.body);
      const formType = await storage.createItemFormType(validated);
      res.status(201).json(formType);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: (error instanceof Error ? error.message : String(error)) });
    }
  });

  app.get("/api/uoms", async (req, res) => {
    try {
      const uoms = await storage.getItemUoms();
      res.json(uoms);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.post("/api/uoms", requireAuth, checkPermission(PERMISSIONS.ITEMS_CREATE), async (req, res) => {
    try {
      const parsed = insertItemUomSchema.parse(req.body);
      const uom = await storage.createItemUom(parsed);
      res.status(201).json(uom);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        res.status(409).json({ message: "كود الوحدة مسجل بالفعل" });
      } else {
        res.status(400).json({ message: (error instanceof Error ? error.message : String(error)) });
      }
    }
  });

  app.get("/api/items/:id/last-purchases", async (req, res) => {
    try {
      const fromDate = (req.query.fromDate as string) || undefined;
      const limit = fromDate ? 500 : 5;
      const purchases = await storage.getLastPurchases(req.params.id as string, limit, fromDate);
      res.json(purchases);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:id/avg-sales", async (req, res) => {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
      const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];

      const result = await storage.getAverageSales(req.params.id as string, startDate, endDate);
      res.json(result);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.get("/api/items/:id/consumables", requireAuth, async (req, res) => {
    try {
      const rows = await storage.getItemConsumables(req.params.id);
      res.json(rows);
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });

  app.put("/api/items/:id/consumables", requireAuth, async (req, res) => {
    try {
      const lineSchema = z.object({
        consumableItemId: z.string().min(1),
        quantity: z.string(),
        unitLevel: z.string(),
        notes: z.string().nullable().optional(),
      });
      const lines = z.array(lineSchema).parse(req.body);
      const rows = await storage.replaceItemConsumables(req.params.id, lines);
      res.json(rows);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) return res.status(422).json({ errors: error.errors });
      const _em = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: _em });
    }
  });
}
