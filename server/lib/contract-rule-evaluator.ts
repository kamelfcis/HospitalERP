/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contract Rule Evaluator — محرّك تقييم قواعد التغطية التأمينية
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  دالة نقية (pure function) — لا تكتب في DB، لا تجلب بيانات.
 *  المُستدعي يحمّل العقد + القواعد ثم يمرّرها هنا.
 *
 *  الـ Semantics المُقفلة:
 *    1. approvalStatus = "pending" إذا طابقت قاعدة approval_required
 *       وإلا          = "not_required"
 *    2. العقد النشط + لا استثناء = مشمول بصرف النظر عن companyCoveragePct
 *    3. companyCoveragePct يُؤخذ من العقد أو يُعامَل كـ 0
 *    4. التفسير يغطي: الأهلية + التسعير + الموافقة + السبب الاحتياطي
 *
 *  تسلسل التقييم (priority ASC = أعلى أولوية):
 *    Pass 1 — الاستبعاد (Exclusion):
 *      exclude_service → NOT_COVERED
 *      exclude_dept    → NOT_COVERED
 *    Pass 2 — الأهلية (Eligibility basis, لأغراض التفسير فقط):
 *      include_service / include_dept / serviceCategory / global_discount / fallback
 *    Pass 3 — التسعير (Pricing):
 *      fixed_price → contractPrice = fixedPrice
 *      discount_pct → contractPrice = listPrice × (1 − pct/100)
 *      global_discount → contractPrice = listPrice × (1 − pct/100)
 *      fallback → contractPrice = listPrice
 *    Pass 4 — الموافقة (Approval overlay, مستقل):
 *      approval_required → coverageStatus = "approval_required", approvalStatus = "pending"
 *    Pass 5 — حساب الحصص (Share Calculation)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ContractCoverageRule } from "@shared/schema";

// ─── Input / Output Types ─────────────────────────────────────────────────

export interface EvalContractInput {
  contract: {
    id: string;
    companyCoveragePct: string | null;
    isActive: boolean;
    startDate: string;
    endDate: string;
  };
  rules: ContractCoverageRule[];
  serviceId:       string | null;
  departmentId:    string | null;
  serviceCategory: string | null;
  // حقول الصيدلية (اختيارية — للقواعد المبنية على الأصناف)
  itemId?:         string | null;
  itemCategory?:   string | null;
  listPrice:       string;
  evaluationDate?: string;
}

export interface EvaluationResult {
  covered:            boolean;
  coverageStatus:     "covered" | "not_covered" | "approval_required";
  listPrice:          string;
  contractPrice:      string;
  companyCoveragePct: string;
  companyShareAmount: string;
  patientShareAmount: string;
  matchedRuleId:      string | null;
  matchedRuleName:    string | null;
  approvalStatus:     "pending" | "not_required";
  explanation:        string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function r2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function matchesScope(
  rule: ContractCoverageRule,
  serviceId: string | null,
  departmentId: string | null,
  serviceCategory: string | null,
  itemId?: string | null,
  itemCategory?: string | null,
): boolean {
  const ruleAny = rule as any;
  const hasAnyScope = rule.serviceId || rule.departmentId || rule.serviceCategory
                   || ruleAny.itemId || ruleAny.itemCategory;
  if (!hasAnyScope) return true;
  if (serviceId      && rule.serviceId      === serviceId)          return true;
  if (departmentId   && rule.departmentId   === departmentId)       return true;
  if (serviceCategory && rule.serviceCategory === serviceCategory)  return true;
  if (itemId         && ruleAny.itemId       === itemId)            return true;
  if (itemCategory   && ruleAny.itemCategory === itemCategory)      return true;
  return false;
}

// ─── Core Evaluator ───────────────────────────────────────────────────────

export function evaluateContractForService(input: EvalContractInput): EvaluationResult {
  const { contract, rules, serviceId, departmentId, serviceCategory,
          itemId, itemCategory, listPrice: rawListPrice } = input;

  const listPrice        = parseFloat(rawListPrice || "0") || 0;
  const companyCoveragePct = parseFloat(contract.companyCoveragePct || "0") || 0;

  const activeRules = [...rules]
    .filter(r => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  // ── Pass 1: Exclusion ────────────────────────────────────────────────────
  for (const rule of activeRules) {
    if (
      rule.ruleType === "exclude_service" &&
      serviceId &&
      rule.serviceId === serviceId
    ) {
      return {
        covered:            false,
        coverageStatus:     "not_covered",
        listPrice:          r2(listPrice),
        contractPrice:      r2(listPrice),
        companyCoveragePct: r2(companyCoveragePct),
        companyShareAmount: "0.00",
        patientShareAmount: r2(listPrice),
        matchedRuleId:      rule.id,
        matchedRuleName:    rule.ruleName,
        approvalStatus:     "not_required",
        explanation: [
          `الأهلية: الخدمة مستثناة صراحةً بموجب القاعدة "${rule.ruleName}".`,
          `التسعير: لا ينطبق — غير مشمولة.`,
          `حصة الشركة: 0.00 ج.م | حصة المريض: ${r2(listPrice)} ج.م (السعر الكامل).`,
          `الموافقة: غير مطلوبة.`,
        ].join(" "),
      };
    }

    if (
      rule.ruleType === "exclude_dept" &&
      departmentId &&
      rule.departmentId === departmentId
    ) {
      return {
        covered:            false,
        coverageStatus:     "not_covered",
        listPrice:          r2(listPrice),
        contractPrice:      r2(listPrice),
        companyCoveragePct: r2(companyCoveragePct),
        companyShareAmount: "0.00",
        patientShareAmount: r2(listPrice),
        matchedRuleId:      rule.id,
        matchedRuleName:    rule.ruleName,
        approvalStatus:     "not_required",
        explanation: [
          `الأهلية: القسم مستثنى صراحةً بموجب القاعدة "${rule.ruleName}".`,
          `التسعير: لا ينطبق — غير مشمولة.`,
          `حصة الشركة: 0.00 ج.م | حصة المريض: ${r2(listPrice)} ج.م (السعر الكامل).`,
          `الموافقة: غير مطلوبة.`,
        ].join(" "),
      };
    }

    if (
      rule.ruleType === "exclude_item_category" &&
      itemCategory &&
      (rule as any).itemCategory === itemCategory
    ) {
      return {
        covered:            false,
        coverageStatus:     "not_covered",
        listPrice:          r2(listPrice),
        contractPrice:      r2(listPrice),
        companyCoveragePct: r2(companyCoveragePct),
        companyShareAmount: "0.00",
        patientShareAmount: r2(listPrice),
        matchedRuleId:      rule.id,
        matchedRuleName:    rule.ruleName,
        approvalStatus:     "not_required",
        explanation: [
          `الأهلية: فئة الصنف مستثناة بموجب القاعدة "${rule.ruleName}".`,
          `التسعير: لا ينطبق — غير مشمولة.`,
          `حصة الشركة: 0.00 ج.م | حصة المريض: ${r2(listPrice)} ج.م (السعر الكامل).`,
          `الموافقة: غير مطلوبة.`,
        ].join(" "),
      };
    }
  }

  // ── Pass 2: Eligibility basis (for explanation) ──────────────────────────
  let eligibilityBasis = "لا توجد قاعدة تشمل صراحةً — العقد النشط يُغطي افتراضياً";

  for (const rule of activeRules) {
    if (rule.ruleType === "include_service" && serviceId && rule.serviceId === serviceId) {
      eligibilityBasis = `مشمولة صراحةً بموجب القاعدة "${rule.ruleName}"`;
      break;
    }
    if (rule.ruleType === "include_dept" && departmentId && rule.departmentId === departmentId) {
      eligibilityBasis = `القسم مشمول بموجب القاعدة "${rule.ruleName}"`;
      break;
    }
    if (
      rule.ruleType === "include_item_category" &&
      itemCategory &&
      (rule as any).itemCategory === itemCategory
    ) {
      eligibilityBasis = `فئة الصنف مشمولة بموجب القاعدة "${rule.ruleName}"`;
      break;
    }
    if (rule.ruleType === "global_discount") {
      eligibilityBasis = `مشمولة بالتغطية العامة من القاعدة "${rule.ruleName}"`;
      break;
    }
  }

  // ── Pass 3: Pricing ──────────────────────────────────────────────────────
  let pricingRule: ContractCoverageRule | null = null;
  let contractPrice = listPrice;
  let pricingBasis  = "لا توجد قاعدة تسعير مخصصة — يُطبق السعر الأساسي";

  for (const rule of activeRules) {
    if (rule.ruleType === "fixed_price" && rule.fixedPrice != null) {
      if (matchesScope(rule, serviceId, departmentId, serviceCategory, itemId, itemCategory)) {
        pricingRule   = rule;
        contractPrice = parseFloat(rule.fixedPrice) || 0;
        pricingBasis  = `سعر ثابت ${r2(contractPrice)} ج.م من القاعدة "${rule.ruleName}"`;
        break;
      }
    }
    if (rule.ruleType === "discount_pct" && rule.discountPct != null) {
      if (matchesScope(rule, serviceId, departmentId, serviceCategory, itemId, itemCategory)) {
        pricingRule   = rule;
        const pct     = parseFloat(rule.discountPct) || 0;
        contractPrice = listPrice * (1 - pct / 100);
        pricingBasis  = `خصم ${pct}% = ${r2(contractPrice)} ج.م من القاعدة "${rule.ruleName}"`;
        break;
      }
    }
    if (rule.ruleType === "global_discount" && rule.discountPct != null) {
      if (!pricingRule) {
        pricingRule   = rule;
        const pct     = parseFloat(rule.discountPct) || 0;
        contractPrice = listPrice * (1 - pct / 100);
        pricingBasis  = `خصم عام ${pct}% = ${r2(contractPrice)} ج.م من القاعدة "${rule.ruleName}"`;
        break;
      }
    }
    if (rule.ruleType === "include_service" && serviceId && rule.serviceId === serviceId) {
      if (rule.fixedPrice != null && !pricingRule) {
        pricingRule   = rule;
        contractPrice = parseFloat(rule.fixedPrice) || 0;
        pricingBasis  = `سعر ثابت ${r2(contractPrice)} ج.م من قاعدة الشمول "${rule.ruleName}"`;
        break;
      }
      if (rule.discountPct != null && !pricingRule) {
        pricingRule   = rule;
        const pct     = parseFloat(rule.discountPct) || 0;
        contractPrice = listPrice * (1 - pct / 100);
        pricingBasis  = `خصم ${pct}% = ${r2(contractPrice)} ج.م من قاعدة الشمول "${rule.ruleName}"`;
        break;
      }
    }
    if (rule.ruleType === "include_dept" && departmentId && rule.departmentId === departmentId) {
      if (rule.fixedPrice != null && !pricingRule) {
        pricingRule   = rule;
        contractPrice = parseFloat(rule.fixedPrice) || 0;
        pricingBasis  = `سعر ثابت ${r2(contractPrice)} ج.م من قاعدة شمول القسم "${rule.ruleName}"`;
        break;
      }
      if (rule.discountPct != null && !pricingRule) {
        pricingRule   = rule;
        const pct     = parseFloat(rule.discountPct) || 0;
        contractPrice = listPrice * (1 - pct / 100);
        pricingBasis  = `خصم ${pct}% = ${r2(contractPrice)} ج.م من قاعدة شمول القسم "${rule.ruleName}"`;
        break;
      }
    }
    // ── فئة الصنف (صيدلية) ────────────────────────────────────────────────
    if (
      rule.ruleType === "include_item_category" &&
      itemCategory &&
      (rule as any).itemCategory === itemCategory
    ) {
      if (rule.fixedPrice != null && !pricingRule) {
        pricingRule   = rule;
        contractPrice = parseFloat(rule.fixedPrice) || 0;
        pricingBasis  = `سعر ثابت ${r2(contractPrice)} ج.م من قاعدة فئة الصنف "${rule.ruleName}"`;
        break;
      }
      if (rule.discountPct != null && !pricingRule) {
        pricingRule   = rule;
        const pct     = parseFloat(rule.discountPct) || 0;
        contractPrice = listPrice * (1 - pct / 100);
        pricingBasis  = `خصم ${pct}% = ${r2(contractPrice)} ج.م من قاعدة فئة الصنف "${rule.ruleName}"`;
        break;
      }
    }
  }

  // ── Pass 4: Approval overlay (independent pass) ──────────────────────────
  let approvalStatus: "pending" | "not_required" = "not_required";
  let coverageStatus: "covered" | "not_covered" | "approval_required" = "covered";
  let approvalBasis = "الموافقة: غير مطلوبة.";

  for (const rule of activeRules) {
    if (rule.ruleType === "approval_required") {
      if (matchesScope(rule, serviceId, departmentId, serviceCategory, itemId, itemCategory)) {
        approvalStatus = "pending";
        coverageStatus = "approval_required";
        approvalBasis  = `الموافقة: مطلوبة بموجب القاعدة "${rule.ruleName}" — الحالة: في انتظار الموافقة.`;
        break;
      }
    }
  }

  // ── Pass 5: Share Calculation ─────────────────────────────────────────────
  // Locked: covered regardless of companyCoveragePct = 0
  // companyCoveragePct default = 0 (not 100)
  const companyShare = contractPrice * (companyCoveragePct / 100);
  const patientShare = contractPrice - companyShare;

  const fallbackNote = !pricingRule
    ? " (احتياطي: يُطبق السعر الأساسي لعدم وجود قاعدة تسعير مخصصة)"
    : "";

  const explanation = [
    `الأهلية: ${eligibilityBasis}.`,
    `التسعير: السعر الأساسي ${r2(listPrice)} ج.م — ${pricingBasis}${fallbackNote}.`,
    `حصة الشركة: ${r2(companyCoveragePct)}% = ${r2(companyShare)} ج.م | حصة المريض: ${r2(patientShare)} ج.م.`,
    approvalBasis,
  ].join(" ");

  return {
    covered:            true,
    coverageStatus,
    listPrice:          r2(listPrice),
    contractPrice:      r2(contractPrice),
    companyCoveragePct: r2(companyCoveragePct),
    companyShareAmount: r2(companyShare),
    patientShareAmount: r2(patientShare),
    matchedRuleId:      pricingRule?.id      ?? null,
    matchedRuleName:    pricingRule?.ruleName ?? null,
    approvalStatus,
    explanation,
  };
}

// ─── Batch helper ─────────────────────────────────────────────────────────

export function batchEvaluate(
  contract: EvalContractInput["contract"],
  rules: ContractCoverageRule[],
  lines: Array<{
    serviceId?:       string | null;
    departmentId?:    string | null;
    serviceCategory?: string | null;
    itemId?:          string | null;
    itemCategory?:    string | null;
    unitPrice?:       string | null;
  }>,
  evaluationDate?: string,
): EvaluationResult[] {
  return lines.map((line) =>
    evaluateContractForService({
      contract,
      rules,
      serviceId:       line.serviceId       ?? null,
      departmentId:    line.departmentId     ?? null,
      serviceCategory: line.serviceCategory  ?? null,
      itemId:          line.itemId           ?? null,
      itemCategory:    line.itemCategory     ?? null,
      listPrice:       line.unitPrice        ?? "0",
      evaluationDate,
    }),
  );
}
