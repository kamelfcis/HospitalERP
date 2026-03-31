import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Contract, ContractCoverageRule } from "@shared/schema";

export type EvalDomain = "service" | "pharmacy";

export interface EvalInput {
  domain:          EvalDomain;
  // خدمات المستشفى
  serviceId:       string;
  departmentId:    string;
  serviceCategory: string;
  // الصيدلية
  itemId:          string;
  itemCategory:    string;
  // مشترك
  listPrice:       string;
}

export function useCoverageRules(selectedContract: Contract | null) {
  const { toast } = useToast();

  const [evalInput, setEvalInput] = useState<EvalInput>({
    domain:          "service",
    serviceId:       "",
    departmentId:    "",
    serviceCategory: "",
    itemId:          "",
    itemCategory:    "",
    listPrice:       "",
  });
  const [evalResult, setEvalResult] = useState<any>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const { data: rules = [], isLoading: rulesLoading } = useQuery<ContractCoverageRule[]>({
    queryKey: ["/api/contracts", selectedContract?.id, "rules"],
    queryFn: () =>
      apiRequest("GET", `/api/contracts/${selectedContract!.id}/rules`).then(r => r.json()),
    enabled: !!selectedContract,
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => apiRequest("DELETE", `/api/contracts/rules/${ruleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", selectedContract?.id, "rules"] });
      toast({ title: "تم حذف القاعدة" });
    },
    onError: async (err: unknown) => {
      const body = err instanceof Response ? await err.json().catch(() => ({})) : {};
      toast({ variant: "destructive", title: "خطأ", description: body?.message ?? "حدث خطأ" });
    },
  });

  async function runEvaluate() {
    if (!selectedContract) return;
    setEvalLoading(true);
    setEvalResult(null);
    try {
      const body: Record<string, unknown> = {
        contractId: selectedContract.id,
        listPrice:  evalInput.listPrice || "0",
      };

      if (evalInput.domain === "service") {
        if (evalInput.serviceId.trim())       body.serviceId       = evalInput.serviceId.trim();
        if (evalInput.departmentId.trim())    body.departmentId    = evalInput.departmentId.trim();
        if (evalInput.serviceCategory.trim()) body.serviceCategory = evalInput.serviceCategory.trim();
      } else {
        if (evalInput.itemId.trim())       body.itemId       = evalInput.itemId.trim();
        if (evalInput.itemCategory.trim()) body.itemCategory = evalInput.itemCategory.trim();
      }

      const res = await apiRequest("POST", "/api/contracts/evaluate", body);
      setEvalResult(await res.json());
    } catch {
      toast({ variant: "destructive", title: "فشل الاختبار" });
    } finally {
      setEvalLoading(false);
    }
  }

  return {
    rules, rulesLoading,
    deleteRuleMutation,
    evalInput, setEvalInput,
    evalResult, evalLoading,
    runEvaluate,
  };
}
