/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Journal Generation Storage — توليد القيود المحاسبية
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  - buildPatientInvoiceGLLines : بناء سطور GL من فاتورة المريض
 *  - generatePatientInvoiceJournal: قيد فاتورة المريض (one-sided builder)
 *  - generateJournalEntry        : توليد قيد عام بربط الحسابات
 *  - batchPostJournalEntries     : ترحيل جماعي للمسودات
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import buildLinesMethods from "./journal-build-lines-storage";
import entryGenerationMethods from "./journal-entry-generation-storage";

const methods = {
  ...buildLinesMethods,
  ...entryGenerationMethods,
};

export default methods;
