import { storage } from "../server/storage";

export async function createTestAccount(overrides: Record<string, any> = {}) {
  const code = `TEST${Date.now()}`;
  return storage.createAccount({
    accountCode: overrides.accountCode || code,
    nameAr: overrides.nameAr || `حساب اختبار ${code}`,
    nameEn: overrides.nameEn || `Test Account ${code}`,
    accountType: overrides.accountType || "asset",
    parentId: overrides.parentId || null,
    level: overrides.level || 1,
    isActive: overrides.isActive ?? true,
  });
}

export async function createOpenFiscalPeriod(overrides: Record<string, any> = {}) {
  return storage.createFiscalPeriod({
    periodName: overrides.periodName || `فترة اختبار ${Date.now()}`,
    startDate: overrides.startDate || "2025-01-01",
    endDate: overrides.endDate || "2025-12-31",
    status: "open",
  });
}

export async function createClosedFiscalPeriod(overrides: Record<string, any> = {}) {
  const period = await storage.createFiscalPeriod({
    periodName: overrides.periodName || `فترة مقفولة ${Date.now()}`,
    startDate: overrides.startDate || "2024-01-01",
    endDate: overrides.endDate || "2024-12-31",
    status: "open",
  });
  await storage.updateFiscalPeriod(period.id, { status: "closed" });
  return { ...period, status: "closed" as const };
}

export async function createDraftJournalEntry(periodId?: string) {
  const accounts = await storage.getAccounts();
  let acc1 = accounts[0];
  let acc2 = accounts[1];
  if (!acc1) acc1 = await createTestAccount({ accountCode: `A${Date.now()}` });
  if (!acc2) acc2 = await createTestAccount({ accountCode: `B${Date.now()}` });

  return storage.createJournalEntry({
    entryDate: "2025-06-15",
    description: `قيد اختبار ${Date.now()}`,
    reference: null,
    periodId: periodId || null,
    lines: [
      { lineNumber: 1, accountId: acc1.id, debit: "1000.00", credit: "0", description: "مدين" },
      { lineNumber: 2, accountId: acc2.id, debit: "0", credit: "1000.00", description: "دائن" },
    ],
  });
}

export function expectApiError(status: number) {
  return {
    status,
    hasMessage: (body: any) => {
      return typeof body.message === "string" && body.message.length > 0;
    },
    hasCode: (body: any) => {
      return typeof body.code === "string" && body.code.length > 0;
    },
  };
}
