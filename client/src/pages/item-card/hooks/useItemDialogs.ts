import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ItemFormType, ItemUom } from "@shared/schema";

export function useItemDialogs() {
  const { toast } = useToast();

  const { data: formTypes, refetch: refetchFormTypes } = useQuery<ItemFormType[]>({
    queryKey: ["/api/form-types"],
  });

  const { data: uoms, refetch: refetchUoms } = useQuery<ItemUom[]>({
    queryKey: ["/api/uoms"],
  });

  const [showUomDialog, setShowUomDialog] = useState(false);
  const [newUomCode, setNewUomCode] = useState("");
  const [newUomNameAr, setNewUomNameAr] = useState("");
  const [newUomNameEn, setNewUomNameEn] = useState("");

  const createUomMutation = useMutation({
    mutationFn: (data: { code: string; nameAr: string; nameEn?: string }) =>
      apiRequest("POST", "/api/uoms", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/uoms"] });
      refetchUoms();
      setShowUomDialog(false);
      setNewUomCode("");
      setNewUomNameAr("");
      setNewUomNameEn("");
      toast({ title: "تم إضافة وحدة القياس بنجاح" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return {
    formTypes, refetchFormTypes,
    uoms, refetchUoms,
    showUomDialog, setShowUomDialog,
    newUomCode, setNewUomCode,
    newUomNameAr, setNewUomNameAr,
    newUomNameEn, setNewUomNameEn,
    createUomMutation,
  };
}
