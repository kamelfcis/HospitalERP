import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Admission } from "@shared/schema";

interface UseAdmissionsMutationsParams {
  onCreateSuccess: () => void;
  admSelectedAdmission: Admission | null;
  setAdmSelectedAdmission: (a: Admission | null) => void;
}

export function useAdmissionsMutations({
  onCreateSuccess,
  admSelectedAdmission,
  setAdmSelectedAdmission,
}: UseAdmissionsMutationsParams) {
  const { toast } = useToast();

  const admCreateMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/admissions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions"] });
      toast({ title: "تم إنشاء الإقامة بنجاح" });
      onCreateSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const admDischargeMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admissions/${id}/discharge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions"] });
      toast({ title: "تم خروج المريض بنجاح" });
      if (admSelectedAdmission) {
        setAdmSelectedAdmission({ ...admSelectedAdmission, status: "discharged" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const admConsolidateMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admissions/${id}/consolidate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions"] });
      toast({ title: "تم تجميع الفواتير بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  return { admCreateMutation, admDischargeMutation, admConsolidateMutation };
}
