/**
 * ═══════════════════════════════════════════════════════════════
 *  api-auth-helper.ts — مساعد المصادقة للاختبارات التكاملية
 * ═══════════════════════════════════════════════════════════════
 *
 *  يحل مشكلة الـ session في الاختبارات:
 *  - يُسجّل دخول مرة واحدة (beforeAll)
 *  - يحفظ الـ cookie ويُرسلها مع كل طلب
 *  - يدعم اختبارات تحتاج صلاحيات مختلفة
 * ═══════════════════════════════════════════════════════════════
 */

/** Override with `TEST_BASE_URL` when the dev server is not on 127.0.0.1:5000 */
export const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5000";

export class AuthenticatedApi {
  private cookie = "";
  private username: string;
  private password: string;

  constructor(
    username = process.env.TEST_ADMIN_USERNAME ?? "admin",
    password = process.env.TEST_ADMIN_PASSWORD ?? "admin123",
  ) {
    this.username = username;
    this.password = password;
  }

  async login() {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Login failed: cannot reach ${BASE_URL} (${detail}). ` +
          `Start the API (npm run dev) or set TEST_BASE_URL to the correct host:port.`,
      );
    }
    if (!res.ok) throw new Error(`Login failed: ${res.status} — ${this.username}`);

    // Node.js 18+ fetch: getSetCookie() returns array; fallback to get()
    const cookies: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
        ? ((res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie())
        : [res.headers.get("set-cookie") || ""];

    const sessionCookie = cookies
      .map((c) => c.split(";")[0])
      .filter((c) => c.startsWith("connect.sid"))
      .join("; ");

    if (sessionCookie) this.cookie = sessionCookie;
    return res;
  }

  async call(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
    const opts: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  isLoggedIn() {
    return this.cookie !== "";
  }
}

export function makeAuthApi(
  username = process.env.TEST_ADMIN_USERNAME ?? "admin",
  password = process.env.TEST_ADMIN_PASSWORD ?? "admin123",
) {
  return new AuthenticatedApi(username, password);
}

/**
 * تسجيل دخول مع إعادة المحاولة حتى 3 مرات
 * يحل مشكلة التشغيل المتوازي للاختبارات
 */
export async function loginWithRetry(api: AuthenticatedApi, retries = 3, delayMs = 300) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await api.login();
      if (api.isLoggedIn()) return;
    } catch (e) {
      if (attempt === retries) throw e;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
