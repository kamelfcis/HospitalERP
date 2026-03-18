/**
 * server/lib/logger.ts — الـ logger المركزي للنظام
 *
 * المبادئ:
 *  - Production: JSON مضغوط قابل للتحليل الآلي
 *  - Development: pino-pretty ملوَّن وقابل للقراءة
 *  - الإخفاء: key-based + pattern-aware لمنع تسريب بيانات حساسة
 *  - لا يُسجَّل body الطلب كاملاً — فقط metadata محددة
 */

import pino from "pino";

// ── مفاتيح حساسة — تُخفى دائماً ───────────────────────────────────────────
const SENSITIVE_KEY_SET = new Set([
  "password", "passwd", "pass",
  "secret", "secrets",
  "token", "accessToken", "access_token", "refreshToken", "refresh_token",
  "authorization", "cookie", "set-cookie",
  "session", "sessionId", "session_id",
  "apiKey", "api_key", "apiSecret", "api_secret",
  "privateKey", "private_key",
  "auth", "credentials",
  "pin", "cvv", "cardNumber", "card_number",
]);

// ── أنماط حساسة — تطابق أسماء المفاتيح بالـ regex ─────────────────────────
const SENSITIVE_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /token(?!_count|ize)/i,
  /auth(?:orization|entication)?$/i,
  /cookie/i,
  /session/i,
  /private[_-]?key/i,
  /api[_-]?key/i,
  /credential/i,
  /national[_-]?id/i,
  /ssn/i,
  /patient[_-]?phone/i,
];

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_KEY_SET.has(lower)) return true;
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

/**
 * sanitize — يُعمَّق في الكائنات ويُخفي القيم الحساسة.
 * آمن للاستخدام على أي بيانات قبل تسجيلها.
 * لا يُعدِّل الكائن الأصلي — يُعيد نسخة جديدة.
 */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[DEPTH_LIMIT]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

// ── تهيئة الـ logger ────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== "production";

const pinoOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),

  // إخفاء حقول HTTP المعروفة الحساسة على مستوى pino
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.headers['set-cookie']",
      "req.headers['x-api-key']",
      "*.password",
      "*.passwd",
      "*.secret",
      "*.token",
    ],
    censor: REDACTED,
  },
};

export const logger = isDev
  ? pino(pinoOptions, pino.transport({ target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } }))
  : pino(pinoOptions);
