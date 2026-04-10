/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient Invoice Coverage Helper
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  يُطبّق نتائج محرّك التغطية على سطور فاتورة المريض.
 *  يُستدعى في POST /api/patient-invoices و PUT /api/patient-invoices/:id
 *  بعد تحليل السطور (linesParsed) وقبل حفظها في قاعدة البيانات.
 *
 *  ترتيب التسعير (server-authoritative):
 *    1. contract_price_list  — قائمة أسعار مربوطة بالعقد
 *    2. default_price_list   — قائمة الأسعار الافتراضية
 *    3. service_base_price   — السعر الأساسي (unit_price من السطر)
 *
 *  سطور STAY_ENGINE تخضع لنفس قواعد التغطية (السعر يبقى من المحرك).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { storage } from "../storage";
import { evaluateContractForService } from "./contract-rule-evaluator";
import { resolveServicePriceBatch } from "./service-price-resolver";

/**
 * يجلب العقد + القواعد + يحلّ أسعار قوائم الأسعار ثم يُطبّق نتائج التغطية على كل سطر.
 * يُعيد نسخة جديدة من السطور مع الحقول المُحقَنة.
 * إذا لم يكن في الـ header contractId، يُعيد السطور كما هي مع تطبيق القائمة الافتراضية.
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
  // بدون عقد: نُعيد السطور كما هي (backward-compatible مع السلوك الأصلي)
  if (!contractId) return lines;

  const contract = await storage.getContractById(contractId);
  if (!contract || !contract.isActive) return lines;

  const rules = await storage.getCoverageRules(contractId);
  const contractBasePriceListId: string | null = (contract as any).basePriceListId ?? null;

  // ── تحليل أسعار قوائم الأسعار دفعة واحدة (منع N+1) ─────────────────────
  const serviceLines = lines.filter(l => l.serviceId);
  const serviceIds = [...new Set(serviceLines.map(l => l.serviceId!))];

  const priceMap = serviceIds.length > 0
    ? await resolveServicePriceBatch({
        serviceIds,
        contractBasePriceListId,
        evaluationDate,
      })
    : new Map();

  return lines.map((line) => {
    // السعر الذي يدخل محرك التغطية: من القائمة المحلولة أو unit_price الحالي
    const resolved = line.serviceId ? priceMap.get(line.serviceId) : undefined;
    const listPriceStr = resolved
      ? String(resolved.price)
      : (line.unitPrice ?? "0");

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
      listPrice:       listPriceStr,
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
      // ── audit trail للتسعير ──────────────────────────────────────────────
      priceSource:        resolved?.source ?? "service_base_price",
      priceListIdUsed:    resolved?.priceListId ?? null,
    };
  });
}
