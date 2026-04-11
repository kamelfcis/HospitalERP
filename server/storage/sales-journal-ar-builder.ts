import type { InsertJournalLine, AccountMapping } from "@shared/schema";
import { logAcctEvent } from "../lib/accounting-event-logger";
import { roundMoney } from "../finance-helpers";

export interface ArBuilderParams {
  invoiceId: string;
  invoice: any;
  mappingMap: Map<string, AccountMapping>;
  debitAccountId: string;
  grossRevenue: number;
  startLineNum: number;
}

export interface ArBuilderResult {
  lines: InsertJournalLine[];
  nextLineNum: number;
  contractEffectiveVat: number;
}

export async function buildArLines(params: ArBuilderParams): Promise<ArBuilderResult> {
  const { invoiceId, invoice, mappingMap, debitAccountId, grossRevenue, startLineNum } = params;
  const journalLineData: InsertJournalLine[] = [];
  let lineNum = startLineNum;
  let contractEffectiveVat = -1;

  const isContract = invoice.customerType === "contract";
  const patientShareTotal = parseFloat((invoice as any).patientShareTotal || "0");
  const companyShareTotal = parseFloat((invoice as any).companyShareTotal || "0");
  const sharesSum = parseFloat(roundMoney(patientShareTotal + companyShareTotal));
  const canSplitAR = isContract && sharesSum > 0.001;
  const discountValue = parseFloat(invoice.discountValue || "0");
  const netTotal = parseFloat(invoice.netTotal || "0");

  if (canSplitAR) {
    const patientARMapping = mappingMap.get("pharmacy_patient_receivable");
    const companyARMapping = mappingMap.get("pharmacy_contract_receivable");

    const rawTaxAmount = parseFloat(invoice.totalTaxAmount || "0");
    if (rawTaxAmount > 0.001 && grossRevenue > 0.001) {
      contractEffectiveVat = parseFloat(roundMoney(rawTaxAmount * (sharesSum / grossRevenue)));
    } else {
      contractEffectiveVat = 0;
    }
    const patientVatShare: number = (sharesSum > 0.001 && patientShareTotal > 0.001)
      ? parseFloat(roundMoney(contractEffectiveVat * (patientShareTotal / sharesSum)))
      : 0;
    const companyVatShare: number = parseFloat(roundMoney(contractEffectiveVat - patientVatShare));

    const missingPatientMapping = !patientARMapping?.debitAccountId && patientShareTotal > 0.001;
    const missingCompanyMapping = !companyARMapping?.debitAccountId && companyShareTotal > 0.001;
    if (missingPatientMapping || missingCompanyMapping) {
      await logAcctEvent({
        sourceType:   "sales_invoice",
        sourceId:     invoiceId,
        eventType:    "contract_ar_split_fallback",
        status:       "completed",
        errorMessage: [
          `[تحذير] فاتورة تعاقد رُحِّلت باستخدام حساب الذمم الافتراضي بدل حسابات التعاقد المخصصة.`,
          missingPatientMapping ? `• pharmacy_patient_receivable: غير مُعيَّن (حصة مريض ${patientShareTotal.toFixed(2)} ج.م رُحِّلت على الذمم العامة).` : "",
          missingCompanyMapping ? `• pharmacy_contract_receivable: غير مُعيَّن (حصة شركة ${companyShareTotal.toFixed(2)} ج.م رُحِّلت على الذمم العامة).` : "",
          `الحل: أضف الحسابين في صفحة ربط الحسابات (Account Mappings) تحت تصنيف الصيدلية.`,
        ].filter(Boolean).join("\n"),
      });
    }

    const totalPatientAR: number = parseFloat(roundMoney(patientShareTotal + patientVatShare));
    if (totalPatientAR > 0.001) {
      const acct = patientARMapping?.debitAccountId || debitAccountId;
      journalLineData.push({
        journalEntryId: "", lineNumber: lineNum++, accountId: acct,
        debit: totalPatientAR.toFixed(2), credit: "0",
        description: `ذمة مريض — ${invoice.customerName || "عميل عقد"}`,
      });
    }
    const totalCompanyAR: number = parseFloat(roundMoney(companyShareTotal + companyVatShare));
    if (totalCompanyAR > 0.001) {
      const acct = companyARMapping?.debitAccountId || debitAccountId;
      journalLineData.push({
        journalEntryId: "", lineNumber: lineNum++, accountId: acct,
        debit: totalCompanyAR.toFixed(2), credit: "0",
        description: `ذمة شركة تأمين — ${(invoice as any).contractCompany || "شركة"}`,
      });
    }

    const contractDiscountAmount: number = parseFloat(roundMoney(grossRevenue - sharesSum));
    if (contractDiscountAmount > 0.01) {
      const discountMapping = mappingMap.get("discount_allowed");
      if (discountMapping?.debitAccountId) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: discountMapping.debitAccountId,
          debit: contractDiscountAmount.toFixed(2),
          credit: "0",
          description: "خصم تعاقدي — مخفضات الإيراد",
        });
      } else {
        await logAcctEvent({
          sourceType:   "sales_invoice",
          sourceId:     invoiceId,
          eventType:    "contract_discount_account_missing",
          status:       "completed",
          errorMessage: [
            `[تحذير] فاتورة تعاقد بها خصم تعاقدي (${contractDiscountAmount.toFixed(2)} ج.م) لكن لم يُعيَّن حساب discount_allowed.`,
            `• القيد سيُنشأ غير متوازن إذا لم يُحدَّد حساب الخصم.`,
            `الحل: أضف ربط discount_allowed في صفحة ربط الحسابات تحت فواتير المبيعات.`,
          ].join("\n"),
        });
      }
    }
  } else {
    if (isContract && netTotal > 0) {
      await logAcctEvent({
        sourceType:   "sales_invoice",
        sourceId:     invoiceId,
        eventType:    "contract_ar_no_split",
        status:       "completed",
        errorMessage: [
          `[تحذير] فاتورة تعاقد رُحِّلت على حساب الذمم العام دون تقسيم حصص.`,
          `• صافي الفاتورة: ${netTotal.toFixed(2)} ج.م`,
          `• مجموع الحصص المسجّلة: ${sharesSum.toFixed(2)} ج.م (مريض ${patientShareTotal.toFixed(2)} + شركة ${companyShareTotal.toFixed(2)})`,
          `السبب: الحصص لم تُحسب بعد (sharesSum = 0) — يرجى إعادة اعتماد الفاتورة بعد إعداد قواعد التغطية.`,
        ].join("\n"),
      });
    }
    if (debitAccountId && netTotal > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: debitAccountId,
        debit: String(netTotal.toFixed(2)),
        credit: "0",
        description: isContract ? "ذمم تعاقد — بانتظار تقسيم الحصص" : "مدينون - في انتظار التحصيل",
      });
    }

    const discountMapping = mappingMap.get("discount_allowed");
    if (discountMapping?.debitAccountId && discountValue > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: discountMapping.debitAccountId,
        debit: String(discountValue.toFixed(2)),
        credit: "0",
        description: "خصم مسموح به",
      });
    }
  }

  return { lines: journalLineData, nextLineNum: lineNum, contractEffectiveVat };
}
