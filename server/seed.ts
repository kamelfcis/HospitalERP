import { db } from "./db";
import { accounts, costCenters, fiscalPeriods, journalEntries, journalLines } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  try {
    // Check if already seeded
    const existingAccounts = await db.select().from(accounts).limit(1);
    if (existingAccounts.length > 0) {
      console.log("Database already seeded");
      return;
    }

    console.log("Seeding database...");

    // Seed Chart of Accounts - Main Categories
    const accountsData = [
      // Assets - أصول (1xxx)
      { code: "1000", name: "الأصول", accountType: "asset" as const, level: 1, parentId: null },
      { code: "1100", name: "الأصول المتداولة", accountType: "asset" as const, level: 2, parentId: null },
      { code: "1101", name: "الصندوق", accountType: "asset" as const, level: 3, parentId: null, openingBalance: "50000" },
      { code: "1102", name: "البنك - الحساب الجاري", accountType: "asset" as const, level: 3, parentId: null, openingBalance: "500000" },
      { code: "1103", name: "العملاء", accountType: "asset" as const, level: 3, parentId: null, openingBalance: "120000" },
      { code: "1104", name: "المخزون الطبي", accountType: "asset" as const, level: 3, parentId: null, openingBalance: "200000" },
      { code: "1200", name: "الأصول الثابتة", accountType: "asset" as const, level: 2, parentId: null },
      { code: "1201", name: "المباني والإنشاءات", accountType: "asset" as const, level: 3, parentId: null, openingBalance: "3000000" },
      { code: "1202", name: "الأجهزة الطبية", accountType: "asset" as const, level: 3, parentId: null, openingBalance: "1500000" },
      { code: "1203", name: "الأثاث والتجهيزات", accountType: "asset" as const, level: 3, parentId: null, openingBalance: "300000" },
      { code: "1204", name: "السيارات والمركبات", accountType: "asset" as const, level: 3, parentId: null, openingBalance: "400000" },
      
      // Liabilities - خصوم (2xxx)
      { code: "2000", name: "الخصوم", accountType: "liability" as const, level: 1, parentId: null },
      { code: "2100", name: "الخصوم المتداولة", accountType: "liability" as const, level: 2, parentId: null },
      { code: "2101", name: "الموردين", accountType: "liability" as const, level: 3, parentId: null, openingBalance: "180000" },
      { code: "2102", name: "الرواتب المستحقة", accountType: "liability" as const, level: 3, parentId: null, openingBalance: "85000" },
      { code: "2103", name: "ضريبة القيمة المضافة", accountType: "liability" as const, level: 3, parentId: null, openingBalance: "25000" },
      { code: "2200", name: "الخصوم طويلة الأجل", accountType: "liability" as const, level: 2, parentId: null },
      { code: "2201", name: "قروض البنك", accountType: "liability" as const, level: 3, parentId: null, openingBalance: "1000000" },
      
      // Equity - حقوق الملكية (3xxx)
      { code: "3000", name: "حقوق الملكية", accountType: "equity" as const, level: 1, parentId: null },
      { code: "3001", name: "رأس المال", accountType: "equity" as const, level: 2, parentId: null, openingBalance: "4000000" },
      { code: "3002", name: "الاحتياطيات", accountType: "equity" as const, level: 2, parentId: null, openingBalance: "500000" },
      { code: "3003", name: "الأرباح المحتجزة", accountType: "equity" as const, level: 2, parentId: null, openingBalance: "280000" },
      
      // Revenue - إيرادات (4xxx)
      { code: "4000", name: "الإيرادات", accountType: "revenue" as const, level: 1, parentId: null, requiresCostCenter: true },
      { code: "4100", name: "إيرادات العيادات الخارجية", accountType: "revenue" as const, level: 2, parentId: null, requiresCostCenter: true },
      { code: "4101", name: "إيرادات الكشف الطبي", accountType: "revenue" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "4102", name: "إيرادات الاستشارات", accountType: "revenue" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "4200", name: "إيرادات التنويم", accountType: "revenue" as const, level: 2, parentId: null, requiresCostCenter: true },
      { code: "4201", name: "إيرادات الإقامة", accountType: "revenue" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "4202", name: "إيرادات العمليات الجراحية", accountType: "revenue" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "4300", name: "إيرادات المختبرات", accountType: "revenue" as const, level: 2, parentId: null, requiresCostCenter: true },
      { code: "4400", name: "إيرادات الأشعة", accountType: "revenue" as const, level: 2, parentId: null, requiresCostCenter: true },
      { code: "4500", name: "إيرادات الصيدلية", accountType: "revenue" as const, level: 2, parentId: null, requiresCostCenter: true },
      
      // Expenses - مصروفات (5xxx)
      { code: "5000", name: "المصروفات", accountType: "expense" as const, level: 1, parentId: null, requiresCostCenter: true },
      { code: "5100", name: "مصروفات الرواتب والأجور", accountType: "expense" as const, level: 2, parentId: null, requiresCostCenter: true },
      { code: "5101", name: "رواتب الأطباء", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5102", name: "رواتب التمريض", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5103", name: "رواتب الإداريين", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5200", name: "المستلزمات الطبية", accountType: "expense" as const, level: 2, parentId: null, requiresCostCenter: true },
      { code: "5201", name: "الأدوية", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5202", name: "المستهلكات الطبية", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5300", name: "مصروفات تشغيلية", accountType: "expense" as const, level: 2, parentId: null, requiresCostCenter: true },
      { code: "5301", name: "الكهرباء والمياه", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5302", name: "الصيانة والإصلاحات", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5303", name: "التأمينات", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5400", name: "مصروفات إدارية", accountType: "expense" as const, level: 2, parentId: null, requiresCostCenter: true },
      { code: "5401", name: "مصروفات مكتبية", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
      { code: "5402", name: "مصروفات النظافة", accountType: "expense" as const, level: 3, parentId: null, requiresCostCenter: true },
    ];

    for (const account of accountsData) {
      await db.insert(accounts).values({
        ...account,
        openingBalance: account.openingBalance || "0",
        isActive: true,
        requiresCostCenter: account.requiresCostCenter || false,
      });
    }

    console.log("Accounts seeded");

    // Seed Cost Centers
    const costCentersData = [
      { code: "CC001", name: "قسم الباطنة", description: "قسم الأمراض الباطنية" },
      { code: "CC002", name: "قسم الجراحة", description: "قسم الجراحة العامة" },
      { code: "CC003", name: "قسم الأطفال", description: "قسم طب الأطفال" },
      { code: "CC004", name: "قسم النساء والتوليد", description: "قسم أمراض النساء والتوليد" },
      { code: "CC005", name: "قسم العظام", description: "قسم جراحة العظام" },
      { code: "CC006", name: "قسم القلب", description: "قسم أمراض القلب" },
      { code: "CC007", name: "المختبر", description: "قسم المختبرات والتحاليل" },
      { code: "CC008", name: "الأشعة", description: "قسم الأشعة التشخيصية" },
      { code: "CC009", name: "الصيدلية", description: "صيدلية المستشفى" },
      { code: "CC010", name: "الإدارة العامة", description: "الإدارة العامة للمستشفى" },
    ];

    for (const cc of costCentersData) {
      await db.insert(costCenters).values({
        ...cc,
        isActive: true,
      });
    }

    console.log("Cost centers seeded");

    // Seed Fiscal Periods
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Create monthly periods for current year
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(currentYear, month, 1);
      const endDate = new Date(currentYear, month + 1, 0);
      const monthNames = [
        "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
      ];
      
      await db.insert(fiscalPeriods).values({
        name: `${monthNames[month]} ${currentYear}`,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        isClosed: month < today.getMonth(), // Close past months
      });
    }

    console.log("Fiscal periods seeded");

    // Get some accounts and cost centers for journal entries
    const allAccounts = await db.select().from(accounts);
    const allCostCenters = await db.select().from(costCenters);
    
    const getAccountByCode = (code: string) => allAccounts.find(a => a.code === code);
    const getCostCenterByCode = (code: string) => allCostCenters.find(c => c.code === code);

    // Seed some sample journal entries
    const currentDate = today.toISOString().split('T')[0];
    const yesterday = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
    const twoDaysAgo = new Date(today.getTime() - 2 * 86400000).toISOString().split('T')[0];

    // Entry 1: Revenue from consultation
    const [entry1] = await db.insert(journalEntries).values({
      entryNumber: 1,
      entryDate: twoDaysAgo,
      description: "إيرادات كشف طبي - قسم الباطنة",
      status: "posted",
      totalDebit: "5000.00",
      totalCredit: "5000.00",
      reference: "INV-001",
      postedAt: new Date(),
    }).returning();

    await db.insert(journalLines).values([
      {
        journalEntryId: entry1.id,
        lineNumber: 1,
        accountId: getAccountByCode("1101")!.id,
        description: "تحصيل نقدي",
        debit: "5000.00",
        credit: "0",
      },
      {
        journalEntryId: entry1.id,
        lineNumber: 2,
        accountId: getAccountByCode("4101")!.id,
        costCenterId: getCostCenterByCode("CC001")!.id,
        description: "إيراد كشف طبي",
        debit: "0",
        credit: "5000.00",
      },
    ]);

    // Entry 2: Salary payment
    const [entry2] = await db.insert(journalEntries).values({
      entryNumber: 2,
      entryDate: yesterday,
      description: "صرف رواتب التمريض - قسم الجراحة",
      status: "posted",
      totalDebit: "25000.00",
      totalCredit: "25000.00",
      reference: "PAY-001",
      postedAt: new Date(),
    }).returning();

    await db.insert(journalLines).values([
      {
        journalEntryId: entry2.id,
        lineNumber: 1,
        accountId: getAccountByCode("5102")!.id,
        costCenterId: getCostCenterByCode("CC002")!.id,
        description: "رواتب التمريض",
        debit: "25000.00",
        credit: "0",
      },
      {
        journalEntryId: entry2.id,
        lineNumber: 2,
        accountId: getAccountByCode("1102")!.id,
        description: "تحويل بنكي",
        debit: "0",
        credit: "25000.00",
      },
    ]);

    // Entry 3: Medical supplies purchase
    const [entry3] = await db.insert(journalEntries).values({
      entryNumber: 3,
      entryDate: yesterday,
      description: "شراء مستلزمات طبية - المختبر",
      status: "posted",
      totalDebit: "15000.00",
      totalCredit: "15000.00",
      reference: "PO-001",
      postedAt: new Date(),
    }).returning();

    await db.insert(journalLines).values([
      {
        journalEntryId: entry3.id,
        lineNumber: 1,
        accountId: getAccountByCode("5202")!.id,
        costCenterId: getCostCenterByCode("CC007")!.id,
        description: "مستهلكات طبية للمختبر",
        debit: "15000.00",
        credit: "0",
      },
      {
        journalEntryId: entry3.id,
        lineNumber: 2,
        accountId: getAccountByCode("2101")!.id,
        description: "مستحق للمورد",
        debit: "0",
        credit: "15000.00",
      },
    ]);

    // Entry 4: Draft entry for surgery revenue
    const [entry4] = await db.insert(journalEntries).values({
      entryNumber: 4,
      entryDate: currentDate,
      description: "إيرادات عملية جراحية - قسم العظام",
      status: "draft",
      totalDebit: "45000.00",
      totalCredit: "45000.00",
      reference: "INV-002",
    }).returning();

    await db.insert(journalLines).values([
      {
        journalEntryId: entry4.id,
        lineNumber: 1,
        accountId: getAccountByCode("1103")!.id,
        description: "مستحق من العميل",
        debit: "45000.00",
        credit: "0",
      },
      {
        journalEntryId: entry4.id,
        lineNumber: 2,
        accountId: getAccountByCode("4202")!.id,
        costCenterId: getCostCenterByCode("CC005")!.id,
        description: "إيراد عملية جراحية",
        debit: "0",
        credit: "45000.00",
      },
    ]);

    // Entry 5: Laboratory revenue
    const [entry5] = await db.insert(journalEntries).values({
      entryNumber: 5,
      entryDate: currentDate,
      description: "إيرادات تحاليل مخبرية",
      status: "draft",
      totalDebit: "3500.00",
      totalCredit: "3500.00",
      reference: "INV-003",
    }).returning();

    await db.insert(journalLines).values([
      {
        journalEntryId: entry5.id,
        lineNumber: 1,
        accountId: getAccountByCode("1101")!.id,
        description: "تحصيل نقدي",
        debit: "3500.00",
        credit: "0",
      },
      {
        journalEntryId: entry5.id,
        lineNumber: 2,
        accountId: getAccountByCode("4300")!.id,
        costCenterId: getCostCenterByCode("CC007")!.id,
        description: "إيراد تحاليل",
        debit: "0",
        credit: "3500.00",
      },
    ]);

    console.log("Journal entries seeded");
    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}
