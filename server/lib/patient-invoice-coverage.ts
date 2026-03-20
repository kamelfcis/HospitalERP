/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient Invoice Coverage Helper
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  يُطبّق نتائج محرّك التغطية على سطور فاتورة المريض.
 *  يُستدعى في POST /api/patient-invoices و PUT /api/patient-invoices/:id
 *  بعد تحليل السطور (linesParsed) وقبل حفظها في قاعدة البيانات.
 *
 *  لا يُعدّل سطور STAY_ENGINE — هذه يتحكم فيها محرّك الإقامة فقط.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { storage } from "../storage";
import { evaluateContractForService } from "./contract-rule-evaluator";

/**
 * يجلب العقد + القواعد ثم يُطبّق نتائج التغطية على كل سطر.
 * يُعيد نسخة جديدة من السطور مع الحقول المُحقَنة.
 * إذا لم يكن في الـ header contractId، يُعيد السطور كما هي.
 */
export async function applyContractCoverage<
  L extends {
    serviceId?: string | null;
    departmentId?: string | null;
    unitPrice?: string | null;
    sourceType?: string | null;
  },
>(
  contractId: string | null | undefined,
  lines: L[],
  evaluationDate?: string,
): Promise<L[]> {
  if (!contractId) return lines;

  const contract = await storage.getContractById(contractId);
  if (!contract || !contract.isActive) return lines;

  const rules = await storage.getCoverageRules(contractId);

  return lines.map((line) => {
    if (line.sourceType === "STAY_ENGINE") return line;

    const result = evaluateContractForService({
      contract: {
        id:                 contract.id,
        companyCoveragePct: contract.companyCoveragePct,
        isActive:           contract.isActive,
        startDate:          contract.startDate,
        endDate:            contract.endDate,
      },
      rules,
      serviceId:       line.serviceId       ?? null,
      departmentId:    line.departmentId     ?? null,
      serviceCategory: null,
      listPrice:       line.unitPrice        ?? "0",
      evaluationDate,
    });

    return {
      ...line,
      listPrice:          result.listPrice,
      contractPrice:      result.contractPrice,
      companyShareAmount: result.companyShareAmount,
      patientShareAmount: result.patientShareAmount,
      coverageStatus:     result.coverageStatus,
      approvalStatus:     result.approvalStatus,
      contractRuleId:     result.matchedRuleId,
    };
  });
}
