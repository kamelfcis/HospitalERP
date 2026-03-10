import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ItemBarcode } from "@shared/schema";

export function useItemBarcodes(itemId: string | null) {
  const { toast } = useToast();
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [newBarcodeValue, setNewBarcodeValue] = useState("");
  const [newBarcodeType, setNewBarcodeType] = useState("EAN-13");

  const { data: barcodes } = useQuery<ItemBarcode[]>({
    queryKey: ["/api/items", itemId, "barcodes"],
    queryFn: async () => {
      const res = await fetch(`/api/items/${itemId}/barcodes`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!itemId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "barcodes"] });

  const addBarcodeMutation = useMutation({
    mutationFn: async (data: { barcodeValue: string; barcodeType: string }) => {
      const res = await apiRequest("POST", `/api/items/${itemId}/barcodes`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowBarcodeDialog(false);
      setNewBarcodeValue("");
      setNewBarcodeType("EAN-13");
      toast({ title: "تم إضافة الباركود بنجاح" });
    },
    onError: (e: Error) => {
      const msg = e.message || "";
      if (msg.includes("409") || msg.includes("مسجل")) {
        toast({ title: "خطأ", description: "هذا الباركود مسجل بالفعل لصنف آخر", variant: "destructive" });
      } else {
        toast({ title: "خطأ", description: msg, variant: "destructive" });
      }
    },
  });

  const deleteBarcodeMutation = useMutation({
    mutationFn: (barcodeId: string) => apiRequest("DELETE", `/api/barcodes/${barcodeId}`),
    onSuccess: () => { invalidate(); toast({ title: "تم حذف الباركود" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const handleAddBarcode = () => {
    const trimmed = newBarcodeValue.trim();
    if (!trimmed) {
      toast({ title: "خطأ", description: "قيمة الباركود مطلوبة", variant: "destructive" });
      return;
    }
    if (!/^[a-zA-Z0-9\-\.]+$/.test(trimmed)) {
      toast({ title: "خطأ", description: "الباركود يجب أن يحتوي على أرقام وحروف إنجليزية فقط", variant: "destructive" });
      return;
    }
    addBarcodeMutation.mutate({ barcodeValue: trimmed, barcodeType: newBarcodeType });
  };

  const activeBarcodes = useMemo(() => barcodes?.filter(b => b.isActive) ?? [], [barcodes]);

  return {
    barcodes,
    activeBarcodes,
    showBarcodeDialog, setShowBarcodeDialog,
    newBarcodeValue, setNewBarcodeValue,
    newBarcodeType, setNewBarcodeType,
    handleAddBarcode,
    addBarcodeMutation,
    deleteBarcodeMutation,
  };
}
