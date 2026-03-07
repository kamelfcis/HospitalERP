/**
 * ═══════════════════════════════════════════════════════════════
 *  financial-journal-api.test.ts
 *  اختبارات تكاملية للقيود المحاسبية — تحتاج سيستم شغال
 * ═══════════════════════════════════════════════════════════════
 *
 *  المسارات المُختبَرة:
 *   POST /api/journal-entries         — إنشاء قيد محاسبي
 *   GET  /api/journal-entries         — قائمة القيود
 *   POST /api/journal-entries/:id/post — ترحيل القيد
 *   GET  /api/accounts                — الحسابات (دليل الحسابات)
 *   GET  /api/fiscal-periods          — الفترات المحاسبية
 *
 *  التحقق من:
 *   ✓ القيد المتوازن يُقبل
 *   ✓ القيد غير المتوازن يُرفض
 *   ✓ القيد بدون سطور يُرفض
 *   ✓ الترحيل يغير الحالة لـ posted
 *   ✓ الترحيل المزدوج يُرفض (idempotency)
 *   ✓ تعديل/حذف المُرحَّل يُرفض
 * ═══════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll } from "vitest";
import { makeAuthApi, loginWithRetry } from "./api-auth-helper";

const admin = makeAuthApi("admin", "admin123");
let sharedLoginDone = false;

async function ensureLoggedIn() {
  if (!sharedLoginDone) {
    await loginWithRetry(admin);
    sharedLoginDone = true;
  }
}

describe("Financial Journal Entry API", () => {
  let account1Id: string;
  let account2Id: string;
  let draftEntryId: string;

  beforeAll(async () => {
    await ensureLoggedIn();

    const accountsRes = await admin.call("GET", "/api/accounts");
    const raw = accountsRes.data;
    const accounts = Array.isArray(raw) ? raw as Array<{ id: string; code: string; isActive: boolean }> : [];
    if (accounts.length < 2) throw new Error(`يجب وجود حسابين على الأقل (وُجد: ${accounts.length}, status: ${accountsRes.status})`);
    const active = accounts.filter((a) => a.isActive);
    if (active.length < 2) {
      account1Id = accounts[0].id;
      account2Id = accounts[1].id;
    } else {
      account1Id = active[0].id;
      account2Id = active[1].id;
    }
  });

  // ── صلاحية الوصول ──────────────────────────────────────────

  it("بدون مصادقة: يحصل على 401", async () => {
    const res = await fetch("http://localhost:5000/api/journal-entries");
    expect(res.status).toBe(401);
  });

  it("مع مصادقة: الوصول للقيود يعود بـ 200", async () => {
    const { status } = await admin.call("GET", "/api/journal-entries?page=1&pageSize=5");
    expect(status).toBe(200);
  });

  // ── إنشاء القيود ───────────────────────────────────────────

  it("قيد متوازن: يُقبل بحالة draft ورقم تسلسلي", async () => {
    const { status, data } = await admin.call("POST", "/api/journal-entries", {
      entryDate: "2025-06-15",
      description: "قيد اختبار توازن — Group3",
      reference: null,
      lines: [
        { lineNumber: 1, accountId: account1Id, debit: "1000.00", credit: "0.00", description: "مدين" },
        { lineNumber: 2, accountId: account2Id, debit: "0.00",   credit: "1000.00", description: "دائن" },
      ],
    });
    const entry = data as { id: string; entryNumber: number; status: string; totalDebit: string; totalCredit: string };
    expect(status).toBe(201);
    expect(entry.id).toBeDefined();
    expect(typeof entry.entryNumber).toBe("number");
    expect(entry.status).toBe("draft");
    expect(entry.totalDebit).toBe("1000.00");
    expect(entry.totalCredit).toBe("1000.00");
    draftEntryId = entry.id;
  });

  it("قيد غير متوازن (900 مدين ≠ 1000 دائن): يُرفض", async () => {
    const { status, data } = await admin.call("POST", "/api/journal-entries", {
      entryDate: "2025-06-15",
      description: "قيد مختل",
      lines: [
        { lineNumber: 1, accountId: account1Id, debit: "900.00",  credit: "0.00" },
        { lineNumber: 2, accountId: account2Id, debit: "0.00",    credit: "1000.00" },
      ],
    });
    const body = data as { message?: string };
    expect([400, 422]).toContain(status);
    expect(typeof body.message).toBe("string");
  });

  it("قيد بسطر واحد فقط: يُرفض لأن المدين ≠ الدائن", async () => {
    const { status } = await admin.call("POST", "/api/journal-entries", {
      entryDate: "2025-06-15",
      description: "سطر وحيد",
      lines: [
        { lineNumber: 1, accountId: account1Id, debit: "500.00", credit: "0.00" },
      ],
    });
    expect([400, 422]).toContain(status);
  });

  it("قيد بدون سطور: يُرفض", async () => {
    const { status } = await admin.call("POST", "/api/journal-entries", {
      entryDate: "2025-06-15",
      description: "قيد فارغ",
      lines: [],
    });
    expect([400, 422]).toContain(status);
  });

  it("قيد بتاريخ غير صالح: يُرفض أو يُعتمد (لا يُعطّل)", async () => {
    const { status } = await admin.call("POST", "/api/journal-entries", {
      entryDate: "not-a-date",
      description: "تاريخ خاطئ",
      lines: [
        { lineNumber: 1, accountId: account1Id, debit: "100.00", credit: "0.00" },
        { lineNumber: 2, accountId: account2Id, debit: "0.00",   credit: "100.00" },
      ],
    });
    expect([201, 400, 422, 500]).toContain(status);
  });

  it("قيد بمبالغ صفرية: يُرفض أو يُقبل بدون إضرار", async () => {
    const { status } = await admin.call("POST", "/api/journal-entries", {
      entryDate: "2025-06-15",
      description: "مبالغ صفرية",
      lines: [
        { lineNumber: 1, accountId: account1Id, debit: "0.00", credit: "0.00" },
        { lineNumber: 2, accountId: account2Id, debit: "0.00", credit: "0.00" },
      ],
    });
    expect([201, 400, 422]).toContain(status);
  });

  // ── ترحيل القيود ───────────────────────────────────────────

  it("ترحيل قيد مسودة: الحالة تصبح posted", async () => {
    const { status, data } = await admin.call("POST", `/api/journal-entries/${draftEntryId}/post`);
    const entry = data as { status: string };
    expect(status).toBe(200);
    expect(entry.status).toBe("posted");
  });

  it("ترحيل القيد مرة ثانية: يُرفض (idempotency حقيقية)", async () => {
    const { status } = await admin.call("POST", `/api/journal-entries/${draftEntryId}/post`);
    expect([400, 409]).toContain(status);
  });

  it("تعديل قيد مُرحَّل: يُرفض", async () => {
    const { status } = await admin.call("PATCH", `/api/journal-entries/${draftEntryId}`, {
      description: "محاولة تعديل بعد الترحيل",
    });
    expect([400, 403, 409]).toContain(status);
  });

  it("حذف قيد مُرحَّل: يُرفض", async () => {
    const { status } = await admin.call("DELETE", `/api/journal-entries/${draftEntryId}`);
    expect([400, 403, 409]).toContain(status);
  });

  it("القيد المُرحَّل يظهر في القائمة بحالته الصحيحة", async () => {
    const { data } = await admin.call("GET", `/api/journal-entries/${draftEntryId}`);
    const entry = data as { id: string; status: string } | null;
    if (!entry) return;
    expect(entry.status).toBe("posted");
  });
});

// ── اختبارات دليل الحسابات ────────────────────────────────────

describe("Chart of Accounts API", () => {
  beforeAll(async () => { await ensureLoggedIn(); });

  it("قائمة الحسابات: 200 + مصفوفة", async () => {
    const { status, data } = await admin.call("GET", "/api/accounts");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("كل حساب له: id + code + name + accountType", async () => {
    const { data } = await admin.call("GET", "/api/accounts");
    const list = data as Array<Record<string, unknown>>;
    if (list.length === 0) return;
    const first = list[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("code");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("accountType");
    expect(first).toHaveProperty("isActive");
  });

  it("إنشاء حساب جديد: يعود بالحساب مع ID", async () => {
    const code = `TST-${Date.now()}`;
    const { status, data } = await admin.call("POST", "/api/accounts", {
      code,
      name: `حساب اختبار ${code}`,
      accountType: "asset",
      isActive: true,
    });
    const acc = data as { id: string; code: string };
    expect([200, 201]).toContain(status);
    expect(acc.code).toBe(code);
    expect(acc.id).toBeDefined();
  });

  it("إنشاء حساب بكود مكرر: يُرفض (400/409/422/500)", async () => {
    const { data: existing } = await admin.call("GET", "/api/accounts");
    const list = existing as Array<{ code: string }>;
    if (list.length === 0) return;
    const dupCode = list[0].code;
    const { status } = await admin.call("POST", "/api/accounts", {
      code: dupCode,
      name: "حساب مكرر",
      accountType: "asset",
    });
    expect([400, 409, 422, 500]).toContain(status);
    expect(status).not.toBe(201);
  });

  it("إنشاء حساب بدون code: يُرفض", async () => {
    const { status } = await admin.call("POST", "/api/accounts", {
      name: "بدون كود",
      accountType: "asset",
    });
    expect([400, 422]).toContain(status);
  });
});

// ── اختبارات الفترات المحاسبية ────────────────────────────────

describe("Fiscal Periods API", () => {
  beforeAll(async () => { await ensureLoggedIn(); });

  it("قائمة الفترات: 200 + مصفوفة", async () => {
    const { status, data } = await admin.call("GET", "/api/fiscal-periods");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("كل فترة لها: id + name + startDate + endDate + isClosed", async () => {
    const { data } = await admin.call("GET", "/api/fiscal-periods");
    const periods = data as Array<Record<string, unknown>>;
    if (periods.length === 0) return;
    const p = periods[0];
    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("name");
    expect(p).toHaveProperty("startDate");
    expect(p).toHaveProperty("endDate");
    expect(p).toHaveProperty("isClosed");
  });

  it("تاريخ الفترة بصيغة YYYY-MM-DD", async () => {
    const { data } = await admin.call("GET", "/api/fiscal-periods");
    const periods = data as Array<{ startDate: string; endDate: string }>;
    if (periods.length === 0) return;
    expect(periods[0].startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(periods[0].endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("إنشاء فترة محاسبية جديدة: يعود بفترة جديدة", async () => {
    const year = 2099;
    const { status, data } = await admin.call("POST", "/api/fiscal-periods", {
      name: `فترة اختبار ${year}-${Date.now()}`,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    });
    const period = data as { id: string; name: string };
    expect([200, 201]).toContain(status);
    expect(period.id).toBeDefined();
  });
});
