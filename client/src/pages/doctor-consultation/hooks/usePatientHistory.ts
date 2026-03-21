import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 5;

export interface PreviousConsultationDrug {
  drug_name: string;
  dose?: string;
  frequency?: string;
  duration?: string;
}

export interface PreviousConsultation {
  id: string;
  chiefComplaint?: string;
  diagnosis?: string;
  notes?: string;
  followUpPlan?: string;
  followUpAfterDays?: number | null;
  followUpReason?: string | null;
  suggestedFollowUpDate?: string | null;
  consultationFee?: string;
  discountValue?: string;
  finalAmount?: string;
  paymentStatus?: string;
  visitDate?: string;
  createdAt?: string;
  turnNumber?: number;
  doctorName?: string;
  clinicName?: string;
  serviceCount?: number;
  pharmacyCount?: number;
  drugs: PreviousConsultationDrug[];
}

interface HistoryPage {
  data: PreviousConsultation[];
  hasMore: boolean;
}

function buildUrl(patientId: string, offset: number, excludeAppointmentId: string) {
  return `/api/patients/${patientId}/previous-consultations?limit=${PAGE_SIZE}&offset=${offset}&excludeId=${excludeAppointmentId}`;
}

export function usePatientHistory(
  patientId: string | null | undefined,
  excludeAppointmentId: string
) {
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<PreviousConsultation[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const initializedRef = useRef(false);

  const { data: firstPage, isLoading, isError } = useQuery<HistoryPage>({
    queryKey: ["/api/patients", patientId, "previous-consultations", { offset: 0, excludeAppointmentId }],
    queryFn: async () => {
      const res = await fetch(buildUrl(patientId!, 0, excludeAppointmentId));
      if (!res.ok) throw new Error("فشل تحميل تاريخ المريض");
      return res.json();
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (firstPage && !initializedRef.current) {
      setAccumulated(firstPage.data);
      setHasMore(firstPage.hasMore);
      setOffset(0);
      initializedRef.current = true;
    }
  }, [firstPage]);

  useEffect(() => {
    initializedRef.current = false;
    setAccumulated([]);
    setOffset(0);
    setHasMore(false);
  }, [patientId, excludeAppointmentId]);

  async function loadMore() {
    if (!patientId || !hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextOffset = offset + PAGE_SIZE;
      const res = await fetch(buildUrl(patientId, nextOffset, excludeAppointmentId));
      if (!res.ok) throw new Error("فشل تحميل مزيد من الزيارات");
      const page: HistoryPage = await res.json();
      setAccumulated(prev => [...prev, ...page.data]);
      setHasMore(page.hasMore);
      setOffset(nextOffset);
    } catch (e) {
      console.error("[usePatientHistory] loadMore failed:", e);
    } finally {
      setIsLoadingMore(false);
    }
  }

  return {
    visits: accumulated,
    isLoading,
    isError,
    isLoadingMore,
    hasMore,
    loadMore,
  };
}
