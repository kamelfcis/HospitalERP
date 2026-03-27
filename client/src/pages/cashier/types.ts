// ============================================================
//  شاشة تحصيل الكاشير — الأنواع المركزية
//  CASHIER COLLECTION — CENTRAL TYPES
//
//  📌 قاعدة: كل type جديد يضاف هنا وليس داخل مكوّن أو hook
// ============================================================

// ── وحدة العمل ────────────────────────────────────────────
export type UnitType = "pharmacy" | "department";

// ── بيانات وحدة (صيدلية أو قسم) ──────────────────────────
export interface CashierUnit {
  id: string;
  code: string;
  nameAr: string;
  type: UnitType;
}

// ── وردية كاشير (كما يعود من API /my-open-shift) ──────────
export interface CashierShift {
  id: string;
  cashierId: string;
  cashierName: string;
  unitType: string;
  pharmacyId: string | null;
  departmentId: string | null;
  glAccountId: string | null;
  status: "open" | "closed" | "stale" | "closing" | string;
  openingCash: string;
  closingCash: string;
  expectedCash: string;
  variance: string;
  openedAt: string;
  closedAt: string | null;
  // ── حقول دورة الحياة (Task #19) ─────────────────────────
  businessDate: string | null;
  closedBy: string | null;
  staleAt: string | null;
  staleReason: string | null;
  handoverReceiptNumber: number | null;
}

// ── إجماليات الوردية (جلسة مالية كاملة) ──────────────────
export interface ShiftTotals {
  openingCash: string;
  totalCollected: string;
  collectCount: number;
  totalDeferred: string;
  deferredCount: number;
  totalRefunded: string;
  refundCount: number;
  netCash: string;
  netCollected: string;
  hoursOpen: number;
  isStale: boolean;
  creditCollected: string;
  creditCount: number;
  supplierPaid?: string;
  supplierPaidCount?: number;
  deliveryCollected?: string;
  deliveryCollectedCount?: number;
}

// ── حساب GL المرتبط بالمستخدم (خزنة الكاشير) ─────────────
export interface UserGlAccount {
  glAccountId: string;
  code: string;
  name: string;
  hasPassword: boolean;
}

// ── فاتورة معلّقة (في قائمة انتظار التحصيل) ──────────────
export interface PendingInvoice {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  customerType: string;
  customerName: string | null;
  subtotal: string;
  discountValue: string;
  netTotal: string;
  createdBy: string | null;
  /** الاسم الكامل لمنشئ الفاتورة (مشتق من جدول users بناءً على createdBy = UUID) */
  pharmacistName: string | null;
  status: string;
  createdAt: string;
  /** وقت إنشاء الفاتورة كـ ISO string (تاريخ + وقت) */
  invoiceDateTime: string | null;
  warehouseName: string | null;
  /** معرّف الصيدلية التابعة لها المستودع (للتمييز بين الوحدات) */
  warehousePharmacyId: string | null;
  /** معرّف الوردية التي حجزت الفاتورة (قراءة فقط — لا يكتبه GET) */
  claimedByShiftId: string | null;
  claimedAt: string | null;
}

// ── تفاصيل فاتورة مع أصنافها (panel العرض) ───────────────
export interface InvoiceDetails extends PendingInvoice {
  lines: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  lineNo: number;
  itemId: string;
  qty: string;
  salePrice: string;
  lineTotal: string;
  itemName: string;
  itemCode: string;
}

// ── نتيجة التحقق قبل إغلاق الوردية ──────────────────────
export type ShiftCloseReasonCode =
  | "CLEAN"                      // لا فواتير معلّقة — إغلاق مباشر
  | "PENDING_NO_OTHER_SHIFT"     // فواتير معلّقة ولا وردية أخرى — محجوب
  | "PENDING_OTHER_SHIFT_EXISTS" // فواتير معلّقة وهناك وردية أخرى — مسموح بتحذير
  | "STALE"                      // الوردية منتهية الصلاحية
  | "NOT_OPEN"
  | "NOT_FOUND"
  | "ALREADY_CLOSED"
  | string;

export interface ShiftCloseValidation {
  canClose: boolean;
  pendingCount: number;
  hasOtherOpenShift: boolean;
  otherShift: {
    id: string;
    cashierName: string;
    unitType: string;
    openedAt: string;
  } | null;
  reasonCode: ShiftCloseReasonCode;
  isStale: boolean;
  hoursOpen: number;
}

// ── إجمالي مختار (اختيار متعدد في الجدول) ────────────────
export interface SelectionAggregated {
  count: number;
  subtotal: number;
  netTotal: number;
}
