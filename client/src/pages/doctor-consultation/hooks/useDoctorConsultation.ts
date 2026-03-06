import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Consultation, ConsultationDrug, ServiceOrder } from "../types";

export function useDoctorConsultation(appointmentId: string) {
  const { toast } = useToast();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: consultation, isLoading } = useQuery<Consultation>({
    queryKey: ["/api/clinic-consultations", appointmentId],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-consultations/${appointmentId}`).then((r) => r.json()),
    enabled: !!appointmentId,
  });

  const [form, setForm] = useState<Consultation>({
    appointmentId,
    chiefComplaint: "",
    diagnosis: "",
    notes: "",
    drugs: [],
    serviceOrders: [],
  });

  useEffect(() => {
    if (consultation) {
      setForm({
        ...consultation,
        appointmentId,
        drugs: consultation.drugs || [],
        serviceOrders: consultation.serviceOrders || [],
      });
    }
  }, [consultation, appointmentId]);

  const saveMutation = useMutation({
    mutationFn: (data: Consultation) =>
      apiRequest("POST", "/api/clinic-consultations", {
        appointmentId: data.appointmentId,
        chiefComplaint: data.chiefComplaint,
        diagnosis: data.diagnosis,
        notes: data.notes,
        drugs: data.drugs,
        serviceOrders: data.serviceOrders,
      }).then((r) => r.json()),
    onSuccess: () => {
      setIsDirty(false);
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-consultations", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-orders"] });
    },
    onError: (err: any) => {
      setIsSaving(false);
      toast({ variant: "destructive", title: "خطأ في الحفظ", description: err.message });
    },
  });

  const debouncedSave = useCallback((data: Consultation) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsDirty(true);
    saveTimerRef.current = setTimeout(() => {
      setIsSaving(true);
      saveMutation.mutate(data);
    }, 1500);
  }, [saveMutation]);

  const updateForm = useCallback(<K extends keyof Consultation>(key: K, value: Consultation[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const addDrug = useCallback((drug: Omit<ConsultationDrug, "lineNo">) => {
    setForm((prev) => {
      const next: Consultation = {
        ...prev,
        drugs: [...prev.drugs, { ...drug, lineNo: prev.drugs.length + 1 }],
      };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const updateDrug = useCallback((lineNo: number, updates: Partial<ConsultationDrug>) => {
    setForm((prev) => {
      const next: Consultation = {
        ...prev,
        drugs: prev.drugs.map((d) => d.lineNo === lineNo ? { ...d, ...updates } : d),
      };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const removeDrug = useCallback((lineNo: number) => {
    setForm((prev) => {
      const next: Consultation = {
        ...prev,
        drugs: prev.drugs
          .filter((d) => d.lineNo !== lineNo)
          .map((d, i) => ({ ...d, lineNo: i + 1 })),
      };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const addServiceOrder = useCallback((svc: ServiceOrder) => {
    setForm((prev) => {
      const next: Consultation = {
        ...prev,
        serviceOrders: [...prev.serviceOrders, svc],
      };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const removeServiceOrder = useCallback((idx: number) => {
    setForm((prev) => {
      const next: Consultation = {
        ...prev,
        serviceOrders: prev.serviceOrders.filter((_, i) => i !== idx),
      };
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsSaving(true);
    saveMutation.mutate(form);
  }, [saveMutation, form]);

  return {
    form,
    isLoading,
    isDirty,
    isSaving,
    updateForm,
    addDrug,
    updateDrug,
    removeDrug,
    addServiceOrder,
    removeServiceOrder,
    saveNow,
  };
}
