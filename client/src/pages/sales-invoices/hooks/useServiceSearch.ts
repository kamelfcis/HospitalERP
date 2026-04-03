import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { getUnitName, calculateQtyInMinor } from "../utils";

export function useServiceSearch(
  warehouseId: string,
  invoiceDate: string,
  addItemToLines: (itemData: any, overrides?: { qty?: number; unitLevel?: string }) => Promise<void>
) {
  const { toast } = useToast();
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [addingServiceId, setAddingServiceId] = useState<string | null>(null);

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

      const stockWarnings: string[] = [];
      let addedCount   = 0;
      let skippedCount = 0;

      for (const cons of consumables) {
        if (!cons.item) continue;
        const itemRes = await fetch(`/api/items/${cons.itemId}`, { credentials: "include" });
        if (!itemRes.ok) continue;
        const itemData = await itemRes.json();

        const qtyMinor = calculateQtyInMinor(parseFloat(cons.quantity), cons.unitLevel, itemData);

        // ── فحص المخزون قبل الإضافة ────────────────────────────────────────────
        // للأصناف ذات الصلاحية (hasExpiry): لو المخزون غير كافٍ، FEFO سيرفضها.
        // نتحقق مسبقاً لنعطي رسالة واضحة ونتجنب الإضافة الوهمية.
        let stockSufficient = true;
        try {
          const stockRes = await fetch(
            `/api/transfer/fefo-preview?itemId=${cons.itemId}&warehouseId=${warehouseId}&requiredQtyInMinor=${qtyMinor}&asOfDate=${invoiceDate}`
          );
          if (stockRes.ok) {
            const stockData = await stockRes.json();
            if (!stockData.fulfilled) {
              stockSufficient = false;
              const needed = cons.quantity;
              const unit   = getUnitName(itemData, cons.unitLevel);
              stockWarnings.push(
                `${itemData.nameAr}: رصيد غير كافٍ (المطلوب: ${needed} ${unit})`
              );
            }
          }
        } catch {}

        // للأصناف ذات الصلاحية: لا تحاول الإضافة لو المخزون غير كافٍ (ستفشل FEFO صامتة)
        if (!stockSufficient && itemData.hasExpiry) {
          skippedCount++;
          continue;
        }

        await addItemToLines(itemData, { qty: parseFloat(cons.quantity) || 1, unitLevel: cons.unitLevel || "major" });
        addedCount++;
      }

      // ── رسائل النتيجة ─────────────────────────────────────────────────────────
      if (stockWarnings.length > 0) {
        toast({
          title:       `رصيد غير كافٍ — ${serviceName}`,
          description: stockWarnings.join(" | "),
          variant:     "destructive",
          duration:    9000,
        });
      }

      if (addedCount > 0 && skippedCount === 0) {
        toast({
          title:       `تمت إضافة مستهلكات: ${serviceName}`,
          description: `تم إضافة ${addedCount} صنف للفاتورة`,
        });
      } else if (addedCount > 0 && skippedCount > 0) {
        toast({
          title:       `مستهلكات ${serviceName}`,
          description: `أُضيف ${addedCount} صنف — لم يُضَف ${skippedCount} بسبب نقص المخزون`,
          variant:     "destructive",
          duration:    8000,
        });
      } else if (addedCount === 0 && skippedCount > 0) {
        toast({
          title:       `لم تُضَف أي مستهلكات — ${serviceName}`,
          description: `جميع الأصناف (${skippedCount}) غير متوفرة في المخزون`,
          variant:     "destructive",
          duration:    8000,
        });
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
  }, []);

  return {
    serviceModalOpen, setServiceModalOpen,
    addingServiceId,
    addServiceConsumables,
    openServiceModal,
  };
}
