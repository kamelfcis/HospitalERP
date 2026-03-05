import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import type { TransferLineLocal } from "../types";
import { calculateQtyInMinor } from "../types";

interface BarcodeScannerDeps {
  sourceWarehouseId: string;
  setFormLines: React.Dispatch<React.SetStateAction<TransferLineLocal[]>>;
  qtyInputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>;
}

export function useBarcodeScanner({ sourceWarehouseId, setFormLines, qtyInputRefs }: BarcodeScannerDeps) {
  const { toast } = useToast();
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  const handleBarcodeScan = useCallback(
    async (barcodeValue: string) => {
      if (!barcodeValue.trim() || !sourceWarehouseId || barcodeLoading) return;

      setBarcodeLoading(true);
      try {
        const resolveRes = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(barcodeValue.trim())}`);
        if (!resolveRes.ok) throw new Error("فشل البحث");
        const resolved = await resolveRes.json();
        if (!resolved.found) {
          toast({ title: "باركود غير معروف", description: barcodeValue, variant: "destructive" });
          return;
        }

        const searchRes = await fetch(
          `/api/items/search?warehouseId=${sourceWarehouseId}&mode=CODE&q=${encodeURIComponent(resolved.itemCode)}&page=1&pageSize=1&includeZeroStock=false&drugsOnly=false`
        );
        if (!searchRes.ok) throw new Error("فشل جلب بيانات الصنف");
        const searchData = await searchRes.json();
        const item = searchData.items?.[0];
        if (!item) {
          toast({ title: "الصنف غير متاح في المخزن المصدر", variant: "destructive" });
          return;
        }

        const newLineId = crypto.randomUUID();
        const newLine: TransferLineLocal = {
          id: newLineId,
          itemId: item.id,
          item,
          unitLevel: "major",
          qtyEntered: 1,
          qtyInMinor: calculateQtyInMinor(1, "major", item),
          selectedExpiryDate: null,
          selectedExpiryMonth: null,
          selectedExpiryYear: null,
          availableQtyMinor: item.availableQtyMinor || "0",
          notes: "",
          fefoLocked: false,
        };

        setFormLines((prev) => [...prev, newLine]);
        setTimeout(() => {
          const inp = qtyInputRefs.current.get(newLineId);
          if (inp) { inp.focus(); inp.select(); }
        }, 100);
      } catch (err: any) {
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      } finally {
        setBarcodeLoading(false);
        setBarcodeInput("");
      }
    },
    [sourceWarehouseId, barcodeLoading, toast, setFormLines, qtyInputRefs]
  );

  return {
    barcodeInput,
    setBarcodeInput,
    barcodeLoading,
    handleBarcodeScan,
  };
}
