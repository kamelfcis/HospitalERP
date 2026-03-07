// ============================================================
//  useSSE — hook مشترك لإدارة اتصال SSE
//
//  يفتح EventSource واحد لـ URL معين، ويُشغّل callback
//  مخصص لكل نوع حدث. يُغلق الاتصال عند unmount أو تغير URL.
//
//  المعاملات:
//   url      — عنوان SSE أو null لتعطيل الاتصال
//   handlers — { "event_name": callback } لكل حدث مدعوم
//
//  السلوك عند الخطأ:
//   يُغلق الاتصال المكسور ويُعيد الفتح بعد 3 ثوان تلقائياً
// ============================================================
import { useEffect, useRef } from "react";

type EventHandlers = Record<string, () => void>;

export function useSSE(url: string | null, handlers: EventHandlers): void {
  const handlersRef = useRef<EventHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!url) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      es = new EventSource(url as string, { withCredentials: true });

      for (const [event, _] of Object.entries(handlersRef.current)) {
        es.addEventListener(event, () => {
          handlersRef.current[event]?.();
        });
      }

      es.onerror = () => {
        es?.close();
        es = null;
        if (!cancelled) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, [url]);
}
