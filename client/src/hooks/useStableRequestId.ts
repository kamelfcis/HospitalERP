import { useRef, useCallback } from "react";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Provides a stable request ID for idempotent confirm dialogs.
 *
 * Usage pattern:
 *   const { requestId, refresh, clear } = useStableRequestId();
 *
 *   // When confirm dialog OPENS → call refresh() to get a fresh UUID.
 *   // That UUID is then held stable for the lifetime of that dialog session
 *   // (including retries on network failure).
 *   // On success or permanent failure → call clear() so the next open
 *   // of the dialog gets a brand-new UUID.
 *
 * This prevents the common mistake of generating a new UUID on every
 * render or every retry, which would break server-side idempotency guards.
 */
export function useStableRequestId() {
  const idRef = useRef<string | null>(null);

  const refresh = useCallback((): string => {
    const id = generateUUID();
    idRef.current = id;
    return id;
  }, []);

  const clear = useCallback(() => {
    idRef.current = null;
  }, []);

  const current = useCallback((): string => {
    if (!idRef.current) {
      idRef.current = generateUUID();
    }
    return idRef.current;
  }, []);

  return { refresh, clear, current };
}
