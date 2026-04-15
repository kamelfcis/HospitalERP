/**
 * Shared session for live HTTP tests (`npm run test:live-api`).
 * Lazily logs in once per worker and reuses the connect.sid cookie on every call.
 */
import { AuthenticatedApi, loginWithRetry } from "./api-auth-helper";

let client: AuthenticatedApi | null = null;
let pending: Promise<AuthenticatedApi> | null = null;

export async function getLiveClient(): Promise<AuthenticatedApi> {
  if (client) return client;
  if (!pending) {
    pending = (async () => {
      const c = new AuthenticatedApi(
        process.env.TEST_ADMIN_USERNAME ?? "admin",
        process.env.TEST_ADMIN_PASSWORD ?? "admin123",
      );
      await loginWithRetry(c);
      client = c;
      return c;
    })();
  }
  return pending;
}

export async function liveCall(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const c = await getLiveClient();
  return c.call(method, path, body);
}
