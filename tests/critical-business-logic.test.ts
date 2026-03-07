/**
 * ═══════════════════════════════════════════════════════════════
 *  critical-business-logic.test.ts
 *  اختبارات المنطق المالي الحرج — لا تحتاج قاعدة بيانات
 * ═══════════════════════════════════════════════════════════════
 *
 *  المجالات المُختبَرة:
 *  1. توازن القيود المحاسبية (Journal Balance)
 *  2. خوارزمية FEFO لاختيار الدُفعات
 *  3. حساب إجماليات الفاتورة مع الخصم والضريبة
 *  4. تحويلات وحدات الجرعة (Major → Minor)
 *  5. منطق Stay Engine — حساب الأيام
 * ═══════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";

// ── 1. توازن القيود المحاسبية ─────────────────────────────────

/**
 * القيد المحاسبي الصحيح: مجموع المدين = مجموع الدائن
 * هذا شرط IFRS أساسي — أي خلل يُفسد الميزانية
 */

interface JournalLine {
  debit: number;
  credit: number;
}

function isJournalBalanced(lines: JournalLine[]): boolean {
  const totalDebit  = lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}

describe("Journal Balance Validation — توازن القيد المحاسبي", () => {
  it("قيد متوازن: مدين = دائن", () => {
    const lines: JournalLine[] = [
      { debit: 1000, credit: 0 },
      { debit: 500,  credit: 0 },
      { debit: 0,    credit: 1500 },
    ];
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it("قيد غير متوازن: يُرفض", () => {
    const lines: JournalLine[] = [
      { debit: 1000, credit: 0 },
      { debit: 0,    credit: 900 },
    ];
    expect(isJournalBalanced(lines)).toBe(false);
  });

  it("قيد بقيم عشرية: دقة الجنيه المصري (قرشان)", () => {
    const lines: JournalLine[] = [
      { debit: 333.33,  credit: 0 },
      { debit: 333.33,  credit: 0 },
      { debit: 333.34,  credit: 0 },
      { debit: 0,       credit: 1000.00 },
    ];
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it("قيد فارغ: متوازن بالتعريف", () => {
    expect(isJournalBalanced([])).toBe(true);
  });

  it("سطر واحد بدون مقابل: غير متوازن", () => {
    const lines: JournalLine[] = [{ debit: 500, credit: 0 }];
    expect(isJournalBalanced(lines)).toBe(false);
  });
});

// ── 2. خوارزمية FEFO ─────────────────────────────────────────

/**
 * FEFO = First-Expired First-Out
 * الدُفعة الأقرب للانتهاء تُصرف أولاً
 *
 * الإدخال: كمية مطلوبة + قائمة دُفعات مرتبة من الأقرب للأبعد انتهاءً
 * الخرج:  قائمة allocations (lot_id + كمية)
 */

interface Lot {
  id: string;
  expiryYear: number;
  expiryMonth: number;
  availableQty: number;
}

interface Allocation {
  lotId: string;
  qty: number;
}

function allocateFEFO(requestedQty: number, lots: Lot[]): Allocation[] {
  const sorted = [...lots].sort((a, b) =>
    a.expiryYear !== b.expiryYear
      ? a.expiryYear - b.expiryYear
      : a.expiryMonth - b.expiryMonth
  );

  const allocations: Allocation[] = [];
  let remaining = requestedQty;

  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(lot.availableQty, remaining);
    if (take > 0) {
      allocations.push({ lotId: lot.id, qty: take });
      remaining -= take;
    }
  }

  return allocations;
}

describe("FEFO Batch Allocation — تخصيص الدُفعات", () => {
  const lots: Lot[] = [
    { id: "lot-march",   expiryYear: 2025, expiryMonth: 3,  availableQty: 10 },
    { id: "lot-january", expiryYear: 2025, expiryMonth: 1,  availableQty: 6  },
    { id: "lot-june",    expiryYear: 2025, expiryMonth: 6,  availableQty: 20 },
  ];

  it("يختار الأقرب انتهاءً أولاً (يناير قبل مارس)", () => {
    const result = allocateFEFO(4, lots);
    expect(result[0].lotId).toBe("lot-january");
  });

  it("يتسلسل للدُفعة التالية عند نفاذ الأولى", () => {
    const result = allocateFEFO(10, lots);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ lotId: "lot-january", qty: 6 });
    expect(result[1]).toEqual({ lotId: "lot-march",   qty: 4 });
  });

  it("كمية مطلوبة أكبر من الكل المتاح: يُعطي كل ما هو متاح", () => {
    const result = allocateFEFO(100, lots);
    const totalAllocated = result.reduce((s, a) => s + a.qty, 0);
    expect(totalAllocated).toBe(36);
  });

  it("دُفعة واحدة تكفي: لا داعي للتسلسل", () => {
    const result = allocateFEFO(5, lots);
    expect(result).toHaveLength(1);
    expect(result[0].lotId).toBe("lot-january");
    expect(result[0].qty).toBe(5);
  });

  it("كمية صفر: لا allocations", () => {
    expect(allocateFEFO(0, lots)).toHaveLength(0);
  });

  it("قائمة دُفعات فارغة: لا allocations", () => {
    expect(allocateFEFO(10, [])).toHaveLength(0);
  });

  it("ترتيب صحيح: 2024 قبل 2025 حتى لو شهر يناير 2025", () => {
    const mixed: Lot[] = [
      { id: "old-dec", expiryYear: 2024, expiryMonth: 12, availableQty: 5 },
      { id: "new-jan", expiryYear: 2025, expiryMonth: 1,  availableQty: 5 },
    ];
    const result = allocateFEFO(3, mixed);
    expect(result[0].lotId).toBe("old-dec");
  });
});

// ── 3. حساب إجماليات الفاتورة ───────────────────────────────

/**
 * الإجمالي = Σ(سعر × كمية)
 * صافي الفاتورة = الإجمالي × (1 - خصم%) × (1 + ضريبة%)
 * قاعدة التقريب: HALF_UP لأقرب قرشين
 */

function roundHalfUp(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

interface InvoiceLine {
  qty: number;
  unitPrice: number;
}

function computeInvoiceTotals(
  lines: InvoiceLine[],
  discountPercent = 0,
  taxPercent = 0,
): { subtotal: number; discountAmount: number; taxAmount: number; netTotal: number } {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const discountAmount = roundHalfUp(subtotal * discountPercent / 100);
  const afterDiscount  = subtotal - discountAmount;
  const taxAmount      = roundHalfUp(afterDiscount * taxPercent / 100);
  const netTotal       = roundHalfUp(afterDiscount + taxAmount);
  return { subtotal, discountAmount, taxAmount, netTotal };
}

describe("Invoice Total Computation — حساب إجمالي الفاتورة", () => {
  it("فاتورة بسيطة: صنفان بدون خصم أو ضريبة", () => {
    const { subtotal, netTotal } = computeInvoiceTotals([
      { qty: 2, unitPrice: 50 },
      { qty: 3, unitPrice: 30 },
    ]);
    expect(subtotal).toBe(190);
    expect(netTotal).toBe(190);
  });

  it("فاتورة مع خصم 10%", () => {
    const { subtotal, discountAmount, netTotal } = computeInvoiceTotals(
      [{ qty: 1, unitPrice: 1000 }],
      10
    );
    expect(subtotal).toBe(1000);
    expect(discountAmount).toBe(100);
    expect(netTotal).toBe(900);
  });

  it("فاتورة مع ضريبة 14% بدون خصم", () => {
    const { taxAmount, netTotal } = computeInvoiceTotals(
      [{ qty: 1, unitPrice: 1000 }],
      0,
      14
    );
    expect(taxAmount).toBe(140);
    expect(netTotal).toBe(1140);
  });

  it("خصم 10% ثم ضريبة 14% — الضريبة على المبلغ بعد الخصم", () => {
    const result = computeInvoiceTotals(
      [{ qty: 1, unitPrice: 1000 }],
      10,
      14
    );
    expect(result.discountAmount).toBe(100);
    expect(result.taxAmount).toBe(126);
    expect(result.netTotal).toBe(1026);
  });

  it("تقريب HALF_UP: 0.005 يُقرَّب لـ 0.01 وليس 0.00", () => {
    expect(roundHalfUp(0.005)).toBe(0.01);
    expect(roundHalfUp(0.004)).toBe(0.00);
  });

  it("فاتورة صفرية: كل الإجماليات صفر", () => {
    const { subtotal, netTotal } = computeInvoiceTotals([]);
    expect(subtotal).toBe(0);
    expect(netTotal).toBe(0);
  });

  it("خصم 100%: صافي صفر", () => {
    const { netTotal } = computeInvoiceTotals(
      [{ qty: 1, unitPrice: 500 }],
      100
    );
    expect(netTotal).toBe(0);
  });
});

// ── 4. تحويلات وحدات الجرعة ──────────────────────────────────

/**
 * الأدوية لها 3 مستويات: major → medium → minor
 * مثال: علبة (major=1) → شريط (medium=10) → قرص (minor=100)
 * الـ FEFO يعمل على minor units دائماً
 */

function toMinorUnits(
  qty: number,
  level: "major" | "medium" | "minor",
  majorToMinor: number,
  majorToMedium: number,
): number {
  switch (level) {
    case "major":  return qty * majorToMinor;
    case "medium": return qty * (majorToMinor / majorToMedium);
    case "minor":  return qty;
  }
}

describe("Unit Conversion — تحويل الوحدات", () => {
  const MAJOR_TO_MINOR  = 100;
  const MAJOR_TO_MEDIUM = 10;

  it("major → minor: 1 علبة = 100 قرص", () => {
    expect(toMinorUnits(1, "major", MAJOR_TO_MINOR, MAJOR_TO_MEDIUM)).toBe(100);
  });

  it("medium → minor: 1 شريط = 10 أقراص", () => {
    expect(toMinorUnits(1, "medium", MAJOR_TO_MINOR, MAJOR_TO_MEDIUM)).toBe(10);
  });

  it("minor → minor: لا تحويل", () => {
    expect(toMinorUnits(5, "minor", MAJOR_TO_MINOR, MAJOR_TO_MEDIUM)).toBe(5);
  });

  it("كسور: نصف علبة = 50 قرص", () => {
    expect(toMinorUnits(0.5, "major", MAJOR_TO_MINOR, MAJOR_TO_MEDIUM)).toBe(50);
  });
});

// ── 5. Stay Engine — حساب أيام الإقامة ──────────────────────

/**
 * hours_24 mode: كل 24 ساعة = يوم إضافي
 * اليوم الأول يُحتسب لحظة الدخول (n=0)
 */

function computeStayDays(startedAt: Date, now: Date): number {
  const elapsedMs = now.getTime() - startedAt.getTime();
  return Math.max(0, Math.floor(elapsedMs / 86_400_000)) + 1;
}

describe("Stay Engine — حساب أيام الإقامة (hours_24)", () => {
  it("دخول ومباشرة: يوم واحد", () => {
    const start = new Date("2025-01-01T10:00:00Z");
    const now   = new Date("2025-01-01T12:00:00Z");
    expect(computeStayDays(start, now)).toBe(1);
  });

  it("بعد 24 ساعة: يومان", () => {
    const start = new Date("2025-01-01T10:00:00Z");
    const now   = new Date("2025-01-02T10:00:00Z");
    expect(computeStayDays(start, now)).toBe(2);
  });

  it("بعد 3 أيام و23 ساعة: 4 أيام", () => {
    const start = new Date("2025-01-01T10:00:00Z");
    const now   = new Date("2025-01-05T09:00:00Z");
    expect(computeStayDays(start, now)).toBe(4);
  });

  it("حساب سالب مستحيل: الحد الأدنى يوم واحد", () => {
    const start = new Date("2025-01-05T10:00:00Z");
    const now   = new Date("2025-01-01T10:00:00Z");
    expect(computeStayDays(start, now)).toBe(1);
  });
});
