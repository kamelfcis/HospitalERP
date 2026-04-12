import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

/**
 * usePatientInvoiceSSE
 * يشترك في قناة SSE الخاصة بالمريض ويُلغي cache فور وصول أي حدث
 * (إضافة خدمة / دفعة / اعتماد / إغلاق نهائي)
 */
export function usePatientInvoiceSSE(patientId: string) {
  const esRef = useRef<EventSource | null>(null);
  const patientIdRef = useRef(patientId);
  patientIdRef.current = patientId;

  useEffect(() => {
    if (!patientId) return;

    const es = new EventSource(`/api/patients/${patientId}/invoice-stream`, { withCredentials: true });
    esRef.current = es;

    const invalidateAll = () => {
      const pid = patientIdRef.current;
      queryClient.invalidateQueries({ queryKey: ["/api/patients", pid, "invoices-aggregated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", pid, "invoice-lines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", pid, "payments-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", pid, "visits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", pid, "financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visits"] });
    };

    es.addEventListener("payment_added",        invalidateAll);
    es.addEventListener("invoice_finalized",    invalidateAll);
    es.addEventListener("invoice_final_closed", invalidateAll);
    es.addEventListener("invoice_updated",      invalidateAll);

    es.addEventListener("error", () => {
      es.close();
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [patientId]);
}
