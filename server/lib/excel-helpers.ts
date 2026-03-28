/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Excel Helpers — مساعدات Excel المشتركة
 * ═══════════════════════════════════════════════════════════════════════════
 *  يُستخدم من شاشة الأصناف وشاشة الرصيد الافتتاحي وأي شاشة مستقبلية
 *  تحتاج import/export بتنسيق xlsx موحّد.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as XLSX from "xlsx";

export interface ExcelColumn {
  header: string;
  key:    string;
  hint?:  string;
  width?: number;
}

/**
 * بناء buffer xlsx من مصفوفة أعمدة وصفوف بيانات.
 * الصف الأول: رؤوس الأعمدة (نص + تنسيق أزرق غامق)
 * الصف الثاني: تلميحات القيم المقبولة (hint)
 * الصفوف التالية: البيانات
 */
export function buildXlsxBuffer(
  columns:   ExcelColumn[],
  dataRows:  unknown[][],
  sheetName: string,
): Buffer {
  const headers = columns.map(c => c.header);
  const hints   = columns.map(c => c.hint || "");
  const rows: unknown[][] = [headers, hints, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = columns.map(c => ({ wch: c.width ?? 16 }));

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) {
      ws[addr].s = {
        font:      { bold: true, color: { rgb: "FFFFFF" } },
        fill:      { fgColor: { rgb: "1D4ED8" } },
        alignment: { horizontal: "center" },
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}

/**
 * تحليل buffer xlsx وإرجاع صفوف JSON خام.
 * يتخطى الصف الثاني (التلميحات) إذا كان الملف من نموذجنا.
 */
export function parseXlsxBuffer(buffer: Buffer): Record<string, unknown>[] {
  const wb  = XLSX.read(buffer, { type: "buffer" });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

/**
 * استخراج قيمة نصية من صف بأسماء أعمدة بديلة متعددة.
 */
export function getVal(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * تحويل نص إلى رقم عشري. يُرجع null إذا كان غير صالح.
 */
export function parseDec(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * إرسال buffer xlsx كـ HTTP response بالاسم المطلوب.
 */
export function sendXlsxResponse(
  res: { setHeader(k: string, v: string): void; send(b: Buffer): void },
  buffer: Buffer,
  filename: string,
): void {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}
