import { Express } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { PERMISSIONS } from "@shared/permissions";
import { requireAuth, checkPermission } from "./_shared";
import { pool } from "../db";
import { validateItemUnits, computeMajorToMinor } from "../inventory-helpers";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export function registerItemsListImportRoutes(app: Express, _storage: any) {
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
}
