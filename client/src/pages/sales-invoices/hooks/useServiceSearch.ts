import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { getUnitName, calculateQtyInMinor } from "../utils";

export function useServiceSearch(
  warehouseId: string,
  invoiceDate: string,
  addItemToLines: (itemData: any, overrides?: { qty?: number; unitLevel?: string }) => Promise<void>
) {
  const { toast } = useToast();
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceResults, setServiceResults] = useState<any[]>([]);
  const [serviceSearchLoading, setServiceSearchLoading] = useState(false);
  const [addingServiceId, setAddingServiceId] = useState<string | null>(null);
  const serviceSearchRef = useRef<HTMLInputElement>(null);
  const serviceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onServiceSearchChange = useCallback((q: string) => {
    setServiceSearch(q);
    if (serviceDebounceRef.current) clearTimeout(serviceDebounceRef.current);
    if (!q || q.length < 2) { setServiceResults([]); return; }
    setServiceSearchLoading(true);
    serviceDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/services?search=${encodeURIComponent(q)}&active=true&page=1&pageSize=20`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setServiceResults(data.data || []);
        }
      } catch {} finally { setServiceSearchLoading(false); }
    }, 300);
  }, []);

  const addServiceConsumables = useCallback(async (serviceId: string, serviceName: string) => {
    if (!warehouseId) {
      toast({ title: "اختر المخزن أولاً", variant: "destructive" });
      return;
    }
    setAddingServiceId(serviceId);
    try {
      const res = await fetch(`/api/services/${serviceId}/consumables`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل تحميل المستهلكات");
      const consumables = await res.json();

      if (!consumables || consumables.length === 0) {
        toast({ title: serviceName, description: "لا توجد مستهلكات مرتبطة بهذه الخدمة" });
        setAddingServiceId(null);
        return;
      }

      const warnings: string[] = [];
      let addedCount = 0;

      for (const cons of consumables) {
        if (!cons.item) continue;
        const itemRes = await fetch(`/api/items/${cons.itemId}`, { credentials: "include" });
        if (!itemRes.ok) continue;
        const itemData = await itemRes.json();

        const qtyMinor = calculateQtyInMinor(parseFloat(cons.quantity), cons.unitLevel, itemData);

        if (warehouseId) {
          try {
            const stockRes = await fetch(
              `/api/transfer/fefo-preview?itemId=${cons.itemId}&warehouseId=${warehouseId}&requiredQtyInMinor=${qtyMinor}&asOfDate=${invoiceDate}`
            );
            if (stockRes.ok) {
              const stockData = await stockRes.json();
              if (!stockData.fulfilled) {
                warnings.push(
                  `${itemData.nameAr}: الكمية غير كافية (المطلوب: ${cons.quantity} ${getUnitName(itemData, cons.unitLevel)})`
                );
              }
            }
          } catch {}
        }

        await addItemToLines(itemData, { qty: parseFloat(cons.quantity) || 1, unitLevel: cons.unitLevel || "major" });
        addedCount++;
      }

      if (warnings.length > 0) {
        toast({
          title: `تنبيه مخزون - ${serviceName}`,
          description: warnings.join(" | "),
          variant: "destructive",
          duration: 8000,
        });
      }
      if (addedCount > 0) {
        toast({ title: `تمت إضافة مستهلكات: ${serviceName}`, description: `تم إضافة ${addedCount} صنف` });
      }
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      toast({ title: "خطأ", description: _em, variant: "destructive" });
    } finally {
      setAddingServiceId(null);
    }
  }, [warehouseId, invoiceDate, addItemToLines, toast]);

  const openServiceModal = useCallback(() => {
    setServiceModalOpen(true);
    setServiceSearch("");
    setServiceResults([]);
    setTimeout(() => serviceSearchRef.current?.focus(), 100);
  }, []);

  return {
    serviceModalOpen, setServiceModalOpen,
    serviceSearch,
    serviceResults,
    serviceSearchLoading,
    addingServiceId,
    serviceSearchRef,
    onServiceSearchChange,
    addServiceConsumables,
    openServiceModal,
  };
}
