import { logAcctEvent } from "../lib/accounting-event-logger";
import type { InsertJournalLine, AccountMapping } from "@shared/schema";

export function buildSalesCreditLines(
  invoiceId: string,
  invoice: any,
  cogsDrugs: number,
  cogsSupplies: number,
  revenueDrugs: number,
  revenueSupplies: number,
  inventoryAccountId: string | null,
  mappingMap: Map<string, AccountMapping>,
  startLineNum: number,
  contractEffectiveVat: number,
): InsertJournalLine[] {
  const journalLineData: InsertJournalLine[] = [];
  let lineNum = startLineNum;

  const totalCogs = cogsDrugs + cogsSupplies;
  const hasInventoryAccount = !!inventoryAccountId;

  if (!hasInventoryAccount && totalCogs > 0.001) {
    logAcctEvent({
      sourceType:   "sales_invoice",
      sourceId:     invoiceId,
      eventType:    "sales_invoice_cogs_skipped",
      status:       "completed",
      errorMessage: `[تحذير] تم إهمال سطور تكلفة البضاعة (${totalCogs.toFixed(2)} ج.م) — لم يُعيَّن حساب GL للمخزن/الصيدلية ولا حساب مخزون احتياطي في ربط الحسابات. القيد سيُنشأ متوازناً (مدينون = إيرادات) لكن بدون قيود التكلفة. أضف حساب GL للمخزن في إعدادات المستودع أو أضف ربط "مخزون" في /account-mappings لتفعيل قيود التكلفة.`,
    });
  }

  if (hasInventoryAccount) {
    const cogsDrugsMapping = mappingMap.get("cogs_drugs");
    if (cogsDrugsMapping?.debitAccountId && cogsDrugs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: cogsDrugsMapping.debitAccountId,
        debit: String(cogsDrugs.toFixed(2)),
        credit: "0",
        description: "تكلفة أدوية مباعة",
      });
    }

    const cogsSuppliesMapping = mappingMap.get("cogs_supplies");
    const cogsGeneralMapping = mappingMap.get("cogs");
    if (cogsSuppliesMapping?.debitAccountId && cogsSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: cogsSuppliesMapping.debitAccountId,
        debit: String(cogsSupplies.toFixed(2)),
        credit: "0",
        description: "تكلفة مستلزمات مباعة",
      });
    } else if (cogsGeneralMapping?.debitAccountId && cogsSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: cogsGeneralMapping.debitAccountId,
        debit: String(cogsSupplies.toFixed(2)),
        credit: "0",
        description: "تكلفة مستلزمات مباعة",
      });
    } else if (cogsDrugsMapping?.debitAccountId && cogsSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: cogsDrugsMapping.debitAccountId,
        debit: String(cogsSupplies.toFixed(2)),
        credit: "0",
        description: "تكلفة مستلزمات مباعة",
      });
    }
  }

  const revenueDrugsMapping = mappingMap.get("revenue_drugs");
  const revenueSuppliesMapping = mappingMap.get("revenue_consumables");
  const revenueGeneralMapping = mappingMap.get("revenue_general");

  if (revenueDrugsMapping?.creditAccountId && revenueDrugs > 0.001) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber: lineNum++,
      accountId: revenueDrugsMapping.creditAccountId,
      debit: "0",
      credit: String(revenueDrugs.toFixed(2)),
      description: "إيراد مبيعات أدوية",
    });
  } else if (revenueGeneralMapping?.creditAccountId && revenueDrugs > 0.001) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber: lineNum++,
      accountId: revenueGeneralMapping.creditAccountId,
      debit: "0",
      credit: String(revenueDrugs.toFixed(2)),
      description: "إيراد مبيعات أدوية",
    });
  }

  if (revenueSuppliesMapping?.creditAccountId && revenueSupplies > 0.001) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber: lineNum++,
      accountId: revenueSuppliesMapping.creditAccountId,
      debit: "0",
      credit: String(revenueSupplies.toFixed(2)),
      description: "إيراد مبيعات مستلزمات",
    });
  } else if (revenueGeneralMapping?.creditAccountId && revenueSupplies > 0.001) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber: lineNum++,
      accountId: revenueGeneralMapping.creditAccountId,
      debit: "0",
      credit: String(revenueSupplies.toFixed(2)),
      description: "إيراد مبيعات مستلزمات",
    });
  } else if (revenueDrugsMapping?.creditAccountId && revenueSupplies > 0.001) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber: lineNum++,
      accountId: revenueDrugsMapping.creditAccountId,
      debit: "0",
      credit: String(revenueSupplies.toFixed(2)),
      description: "إيراد مبيعات مستلزمات",
    });
  }

  {
    const totalTaxAmount = parseFloat(invoice.totalTaxAmount || "0");
    if (totalTaxAmount > 0.001) {
      const vatOutputMapping = mappingMap.get("vat_output");
      if (!vatOutputMapping?.creditAccountId) {
        throw new Error(
          `الفاتورة تحمل ضريبة قيمة مضافة (${totalTaxAmount.toFixed(2)} ج.م) لكن لم يُعيَّن حساب vat_output في ربط حسابات فواتير المبيعات — يرجى إضافة ربط الحساب من صفحة ربط الحسابات قبل استخدام ميزة الضريبة`
        );
      }

      if (contractEffectiveVat >= 0) {
        if (contractEffectiveVat > 0.001) {
          journalLineData.push({
            journalEntryId: "",
            lineNumber: lineNum++,
            accountId: vatOutputMapping.creditAccountId,
            debit: "0",
            credit: String(contractEffectiveVat.toFixed(2)),
            description: "ضريبة القيمة المضافة — مخرجات (تعاقد)",
          });
        }
      } else {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: vatOutputMapping.creditAccountId,
          debit: "0",
          credit: String(totalTaxAmount.toFixed(2)),
          description: "ضريبة القيمة المضافة — مخرجات",
        });
      }
    }
  }

  if (hasInventoryAccount && totalCogs > 0.001) {
    journalLineData.push({
      journalEntryId: "",
      lineNumber: lineNum++,
      accountId: inventoryAccountId!,
      debit: "0",
      credit: String(totalCogs.toFixed(2)),
      description: "مخزون مباع",
    });
  }

  return journalLineData;
}
