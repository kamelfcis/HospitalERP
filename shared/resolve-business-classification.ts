/**
 * ════════════════════════════════════════════════════════════════════════
 *  resolveBusinessClassification — الملف الوحيد لمنطق الاشتقاق
 *  لا يجوز كتابة أي if/switch مشابه في أي ملف آخر
 * ════════════════════════════════════════════════════════════════════════
 *
 * القواعد الحاكمة:
 *  1. Stay Engine (sourceType='STAY_ENGINE') → دائماً 'accommodation'
 *  2. الخدمات: service.businessClassification أولاً → fallback على serviceType
 *  3. الأصناف: item.businessClassification أولاً  → fallback على lineType
 *  4. الـ fallback يُسجَّل كـ CLASSIFICATION_FALLBACK_USED warning
 */

export type BusinessClassification =
  | "drug"
  | "consumable"
  | "equipment"
  | "gas"
  | "medical_service"
  | "lab"
  | "radiology"
  | "accommodation"
  | "operating_room"
  | "device";

export const BUSINESS_CLASSIFICATION_LABELS: Record<BusinessClassification, string> = {
  drug:           "دواء",
  consumable:     "مستهلك",
  equipment:      "جهاز",
  gas:            "غاز طبي",
  medical_service:"خدمة طبية",
  lab:            "تحليل",
  radiology:      "أشعة",
  accommodation:  "إقامة",
  operating_room: "غرفة عمليات",
  device:         "معدة طبية",
};

/** الألوان المقابلة لكل تصنيف (Tailwind classes) */
export const BUSINESS_CLASSIFICATION_COLORS: Record<BusinessClassification, string> = {
  drug:           "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400 border-green-300",
  consumable:     "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400 border-orange-300",
  equipment:      "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400 border-purple-300",
  gas:            "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400 border-cyan-300",
  medical_service:"bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border-blue-300",
  lab:            "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 border-indigo-300",
  radiology:      "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400 border-violet-300",
  accommodation:  "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400 border-sky-300",
  operating_room: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-300",
  device:         "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400 border-teal-300",
};

// serviceType → businessClassification mapping
const SERVICE_TYPE_MAP: Record<string, BusinessClassification> = {
  ACCOMMODATION:  "accommodation",
  OPERATING_ROOM: "operating_room",
  DEVICE:         "device",
  GAS:            "gas",
  SERVICE:        "medical_service",
  OTHER:          "medical_service",
};

// lineType → businessClassification fallback for items
const LINE_TYPE_FALLBACK_MAP: Record<string, BusinessClassification> = {
  drug:       "drug",
  consumable: "consumable",
  equipment:  "equipment",
};

interface ResolveInput {
  lineType: "drug" | "consumable" | "equipment" | "service";
  sourceType?: string | null;

  // للخدمات
  serviceBusinessClassification?: string | null;
  serviceType?: string | null;
  serviceId?: string | null;

  // للأصناف
  itemBusinessClassification?: string | null;
  itemId?: string | null;
}

interface Logger {
  warn(event: string, data: Record<string, unknown>): void;
}

/**
 * يشتق business_classification لبند الفاتورة.
 * يُستدعى عند إضافة البند فقط — النتيجة تُخزَّن كـ snapshot على السطر.
 */
export function resolveBusinessClassification(
  input: ResolveInput,
  logger?: Logger,
): BusinessClassification {

  // ── 1. Stay Engine — مؤكد دائماً ────────────────────────────────────────────
  if (input.sourceType === "STAY_ENGINE") {
    return "accommodation";
  }

  // ── 2. خدمة ─────────────────────────────────────────────────────────────────
  if (input.lineType === "service") {
    // master data أولاً
    if (input.serviceBusinessClassification) {
      return input.serviceBusinessClassification as BusinessClassification;
    }
    // fallback على serviceType
    const mapped = SERVICE_TYPE_MAP[input.serviceType ?? "SERVICE"];
    if (mapped) {
      logger?.warn("CLASSIFICATION_FALLBACK_USED", {
        reason:      "service.business_classification is null — fell back to serviceType",
        serviceType: input.serviceType,
        serviceId:   input.serviceId,
        result:      mapped,
      });
      return mapped;
    }
    logger?.warn("CLASSIFICATION_FALLBACK_USED", {
      reason:      "service.business_classification is null AND serviceType unrecognized — defaulting to medical_service",
      serviceType: input.serviceType,
      serviceId:   input.serviceId,
      result:      "medical_service",
    });
    return "medical_service";
  }

  // ── 3. صنف ──────────────────────────────────────────────────────────────────
  if (input.itemBusinessClassification) {
    return input.itemBusinessClassification as BusinessClassification;
  }
  // fallback على lineType
  const ltMapped = LINE_TYPE_FALLBACK_MAP[input.lineType];
  if (ltMapped) {
    logger?.warn("CLASSIFICATION_FALLBACK_USED", {
      reason:   "item.business_classification is null — fell back to lineType",
      lineType: input.lineType,
      itemId:   input.itemId,
      result:   ltMapped,
    });
    return ltMapped;
  }

  logger?.warn("CLASSIFICATION_FALLBACK_USED", {
    reason:   "unresolved classification — defaulting to consumable",
    lineType: input.lineType,
    itemId:   input.itemId,
  });
  return "consumable";
}

/** للاستخدام في الـ Frontend (بدون logger) */
export function resolveBusinessClassificationClient(
  input: ResolveInput,
): BusinessClassification {
  return resolveBusinessClassification(input, undefined);
}

/** helper للـ backfill و reporting */
export function isAmbiguousClassification(
  lineType: string,
  sourceType: string | null,
  serviceType: string | null,
  serviceBusinessClassification: string | null,
): boolean {
  if (lineType !== "service") return false;
  if (sourceType === "STAY_ENGINE") return false;
  if (serviceBusinessClassification) return false;
  const st = (serviceType || "SERVICE").toUpperCase();
  return st === "SERVICE" || st === "OTHER" || !SERVICE_TYPE_MAP[st];
}
