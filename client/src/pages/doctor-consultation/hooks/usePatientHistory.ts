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

function buildUrlById(patientId: string, offset: number, excludeId: string) {
  return `/api/patients/${patientId}/previous-consultations?limit=${PAGE_SIZE}&offset=${offset}&excludeId=${excludeId}`;
}

function buildUrlByName(patientName: string, offset: number, excludeId: string) {
  const params = new URLSearchParams({
    patientName,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    excludeId,
  });
  return `/api/clinic/consultations/by-name?${params.toString()}`;
}

export function usePatientHistory(
  patientId: string | null | undefined,
  excludeAppointmentId: string,
  patientName?: string | null
) {
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<PreviousConsultation[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const initializedRef = useRef(false);

  const byId   = !!patientId;
  const byName = !patientId && !!patientName;
  const enabled = byId || byName;

  const { data: firstPage, isLoading, isError } = useQuery<HistoryPage>({
    queryKey: byId
      ? ["/api/patients", patientId, "previous-consultations", { offset: 0, excludeAppointmentId }]
      : ["/api/clinic/consultations/by-name", patientName, { offset: 0, excludeAppointmentId }],
    queryFn: async () => {
      const url = byId
        ? buildUrlById(patientId!, 0, excludeAppointmentId)
        : buildUrlByName(patientName!, 0, excludeAppointmentId);
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("فشل تحميل تاريخ المريض");
      return res.json();
    },
    enabled,
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
  }, [patientId, patientName, excludeAppointmentId]);

  async function loadMore() {
    if (!enabled || !hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextOffset = offset + PAGE_SIZE;
      const url = byId
        ? buildUrlById(patientId!, nextOffset, excludeAppointmentId)
        : buildUrlByName(patientName!, nextOffset, excludeAppointmentId);
      const res = await fetch(url, { credentials: "include" });
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
    /** 'id' = registered patient (exact FK), 'name' = cash patient name match, null = not fetching */
    matchType: enabled ? (byId ? "id" : "name") : null,
  } as const;
}
