import { db } from "./db";
import { accounts, costCenters } from "@shared/schema";

export async function seedDatabase() {
  try {
    const existingAccounts = await db.select().from(accounts).limit(1);
    if (existingAccounts.length > 0) {
      console.log("Database already seeded (accounts and cost centers exist).");
      return;
    }

    console.log("Seeding database...");

    const accountsData = [
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
      { code: "2000", name: "الخصوم", accountType: "liability" as const, level: 1, parentId: null },
      { code: "2100", name: "الخصوم المتداولة", accountType: "liability" as const, level: 2, parentId: null },
      { code: "2101", name: "الموردين", accountType: "liability" as const, level: 3, parentId: null, openingBalance: "180000" },
      { code: "2102", name: "الرواتب المستحقة", accountType: "liability" as const, level: 3, parentId: null, openingBalance: "85000" },
      { code: "2103", name: "ضريبة القيمة المضافة", accountType: "liability" as const, level: 3, parentId: null, openingBalance: "25000" },
      { code: "2200", name: "الخصوم طويلة الأجل", accountType: "liability" as const, level: 2, parentId: null },
      { code: "2201", name: "قروض البنك", accountType: "liability" as const, level: 3, parentId: null, openingBalance: "1000000" },
      { code: "3000", name: "حقوق الملكية", accountType: "equity" as const, level: 1, parentId: null },
      { code: "3001", name: "رأس المال", accountType: "equity" as const, level: 2, parentId: null, openingBalance: "4000000" },
      { code: "3002", name: "الاحتياطيات", accountType: "equity" as const, level: 2, parentId: null, openingBalance: "500000" },
      { code: "3003", name: "الأرباح المحتجزة", accountType: "equity" as const, level: 2, parentId: null, openingBalance: "280000" },
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
    console.log("Database seeding completed (accounts and cost centers only).");

  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}
