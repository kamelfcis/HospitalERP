/*
 * ═══════════════════════════════════════════════════════════════
 *  _shared.ts — Barrel Re-export (نقطة تجميع واحدة)
 * ═══════════════════════════════════════════════════════════════
 *
 *  هذا الملف يُجمّع كل الـ exports من الملفات الأربعة المنطقية:
 *
 *  _auth.ts       → requireAuth, checkPermission
 *  _sse.ts        → SSE clients & broadcast functions
 *  _validation.ts → Zod schemas & validateReceivingLines
 *  _utils.ts      → DOC_PREFIXES, formatters, account type maps
 *
 *  لا تضع كوداً هنا — أضفه في الملف المناسب من الأربعة أعلاه.
 * ═══════════════════════════════════════════════════════════════
 */

export * from "./_auth";
export * from "./_sse";
export * from "./_validation";
export * from "./_utils";
