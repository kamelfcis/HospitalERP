/**
 * Patient Deduplication Service
 * Normalization + weighted duplicate scoring engine
 */

// ─── Arabic Name Normalization ─────────────────────────────────────────────────

/**
 * Normalize an Arabic full name for deduplication matching.
 * Returns a canonical lowercase key suitable for comparison (NOT for display).
 */
export function normalizeArabicName(name: string | null | undefined): string {
  if (!name) return "";
  let n = name.trim();

  // Collapse repeated whitespace
  n = n.replace(/\s+/g, " ");

  // Unify Alef variants (أ إ آ ا → ا)
  n = n.replace(/[أإآ]/g, "ا");

  // Unify final/medial ya (ى → ي)
  n = n.replace(/ى/g, "ي");

  // Normalize taa marbuta (ة → ه) for matching only
  n = n.replace(/ة/g, "ه");

  // Remove tatweel / kashida
  n = n.replace(/ـ/g, "");

  // Remove diacritics (harakat: فتحة كسرة ضمة تنوين شدة سكون)
  n = n.replace(/[\u064B-\u065F]/g, "");

  // Remove common punctuation, keep Arabic letters, digits and spaces
  n = n.replace(/[^\u0600-\u06FF0-9a-zA-Z ]/g, "");

  // Collapse spaces again after removals
  n = n.replace(/\s+/g, " ").trim().toLowerCase();

  return n;
}

// ─── Phone Normalization ──────────────────────────────────────────────────────

/**
 * Normalize Egyptian mobile and landline numbers.
 * Returns 11-digit local format (01xxxxxxxxx) or country-code format stripped down.
 * Returns empty string if clearly not a phone number.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  let p = phone.trim();

  // Remove spaces, dashes, parentheses, dots
  p = p.replace(/[\s\-().+]/g, "");

  // Remove non-digit chars
  p = p.replace(/\D/g, "");

  // Strip leading country code variants: 002, 20
  if (p.startsWith("002")) p = p.slice(3);
  else if (p.startsWith("20") && p.length > 11) p = p.slice(2);

  return p;
}

// ─── National ID Normalization ─────────────────────────────────────────────────

/**
 * Normalize Egyptian national ID (14 digits).
 * Strips spaces and non-digit characters.
 */
export function normalizeNationalId(nid: string | null | undefined): string {
  if (!nid) return "";
  const cleaned = nid.replace(/\D/g, "").trim();
  return cleaned;
}

// ─── Normalized Identity Bundle ────────────────────────────────────────────────

export interface PatientIdentityInput {
  fullName?: string | null;
  phone?: string | null;
  nationalId?: string | null;
  age?: number | null;
}

export interface NormalizedPatientIdentity {
  normalizedFullName: string;
  normalizedPhone: string;
  normalizedNationalId: string;
}

export function normalizePatientIdentity(input: PatientIdentityInput): NormalizedPatientIdentity {
  return {
    normalizedFullName: normalizeArabicName(input.fullName),
    normalizedPhone: normalizePhone(input.phone),
    normalizedNationalId: normalizeNationalId(input.nationalId),
  };
}

// ─── Duplicate Scoring Engine ──────────────────────────────────────────────────

export type DuplicateStatus = "none" | "warning" | "block";

export interface DuplicateCandidate {
  patientId: string;
  patientCode: string | null;
  fullName: string;
  phone: string | null;
  nationalId: string | null;
  age: number | null;
  gender: string | null;
  score: number;
  reasons: string[];
}

export interface DuplicateCheckResult {
  duplicateStatus: DuplicateStatus;
  candidates: DuplicateCandidate[];
  recommendedAction: string;
}

export const DEDUP_BLOCK_THRESHOLD = 90;
export const DEDUP_WARN_THRESHOLD = 70;

/**
 * Score a single candidate patient against the incoming patient data.
 * Uses the pre-normalized values for both incoming and candidate.
 */
export function scoreCandidateMatch(
  incoming: NormalizedPatientIdentity & { age?: number | null },
  candidate: {
    normalizedFullName: string | null;
    normalizedPhone: string | null;
    normalizedNationalId: string | null;
    age: number | null;
  },
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const inName = incoming.normalizedFullName;
  const inPhone = incoming.normalizedPhone;
  const inNid = incoming.normalizedNationalId;

  const cName = candidate.normalizedFullName ?? "";
  const cPhone = candidate.normalizedPhone ?? "";
  const cNid = candidate.normalizedNationalId ?? "";

  // ── Strong signals ──────────────────────────────────────────────────────────

  // National ID exact match (strongest possible)
  if (inNid && cNid && inNid === cNid) {
    score += 100;
    reasons.push("رقم هوية متطابق");
  }

  // Phone exact match
  if (inPhone && cPhone && inPhone === cPhone) {
    score += 70;
    reasons.push("رقم الهاتف متطابق");
  }

  // Full name exact match (normalized)
  const nameExact = inName && cName && inName === cName;
  if (nameExact) {
    score += 40;
    reasons.push("الاسم متطابق تماماً");
  }

  // ── Medium signals ──────────────────────────────────────────────────────────

  // Name similar (partial token overlap) when not exact
  if (!nameExact && inName && cName) {
    const simScore = nameSimilarityScore(inName, cName);
    if (simScore >= 0.8) {
      score += 30;
      reasons.push("الاسم متشابه جداً");
    } else if (simScore >= 0.6) {
      score += 15;
      reasons.push("الاسم متشابه جزئياً");
    }
  }

  // Age match bonus (weak, only adds when combined with name)
  if (
    incoming.age != null &&
    candidate.age != null &&
    Math.abs(incoming.age - candidate.age) <= 2
  ) {
    score += 10;
    reasons.push("العمر متقارب");
  }

  return { score, reasons };
}

/**
 * Simple token-based name similarity: fraction of incoming tokens found in candidate.
 */
function nameSimilarityScore(a: string, b: string): number {
  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (tokensA.length === 0) return 0;
  const matched = tokensA.filter(t => tokensB.has(t)).length;
  return matched / tokensA.length;
}

/**
 * Map a raw score to a DuplicateStatus.
 */
export function scoreToStatus(maxScore: number): DuplicateStatus {
  if (maxScore >= DEDUP_BLOCK_THRESHOLD) return "block";
  if (maxScore >= DEDUP_WARN_THRESHOLD) return "warning";
  return "none";
}

/**
 * Map status to a human-readable recommended action (Arabic).
 */
export function statusToRecommendedAction(status: DuplicateStatus): string {
  switch (status) {
    case "block":
      return "يجب استخدام الملف الموجود أو التواصل مع المشرف لمراجعة التكرار";
    case "warning":
      return "يُرجى التحقق من المرضى المشابهين قبل الاستمرار بإنشاء ملف جديد";
    case "none":
    default:
      return "لا يوجد تكرار محتمل — يمكن الاستمرار";
  }
}
