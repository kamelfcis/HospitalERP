/**
 * useBarcodeScanner — قراءة الباركود وإضافة الصنف للفاتورة
 *
 * المسؤولية:
 *  1. قراءة قيمة الباركود وتحليله عبر /api/barcode/resolve
 *  2. البحث عن الصنف بالكود
 *  3. استدعاء addItemToLines لإضافته للفاتورة
 *  4. إعادة التركيز لحقل الإدخال بعد العملية
 */
import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface UseBarcodeScanner {
  warehouseId:      string;
  addItemToLines:   (item: any) => Promise<void>;
  barcodeInputRef:  React.RefObject<HTMLInputElement>;
}

export function useBarcodeScanner({
  warehouseId, addItemToLines, barcodeInputRef,
}: UseBarcodeScanner) {
  const { toast } = useToast();
  const [barcodeInput,   setBarcodeInput]   = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  const handleBarcodeScan = useCallback(async () => {
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeLoading(true);
    try {
      // 1. حلِّل الباركود
      const res = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error("barcode_resolve_failed");
      const data = await res.json();

      if (!data.found || !data.itemCode) {
        toast({ title: "لم يتم العثور على الصنف", variant: "destructive" });
        return;
      }

      // 2. ابحث عن الصنف بالكود
      const params = new URLSearchParams({
        warehouseId,
        mode:             "CODE",
        q:                data.itemCode,
        page:             "1",
        pageSize:         "1",
        includeZeroStock: "true",
      });
      const itemRes = await fetch(`/api/items/search?${params}`);
      if (!itemRes.ok) throw new Error("item_search_failed");
      const itemData = await itemRes.json();
      const items    = itemData.data || itemData.items || itemData;

      if (!Array.isArray(items) || items.length === 0) {
        toast({ title: "لم يتم العثور على الصنف", variant: "destructive" });
        return;
      }

      // 3. أضف للفاتورة
      await addItemToLines(items[0]);

    } catch (err: any) {
      if (err.message !== "barcode_resolve_failed" && err.message !== "item_search_failed") {
        toast({ title: "خطأ في قراءة الباركود", variant: "destructive" });
      }
    } finally {
      setBarcodeInput("");
      setBarcodeLoading(false);
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  }, [barcodeInput, warehouseId, addItemToLines, toast, barcodeInputRef]);

  return {
    barcodeInput,
    setBarcodeInput,
    barcodeLoading,
    handleBarcodeScan,
  };
}
