import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { getUnitName, calculateQtyInMinor } from "../utils";

export function useServiceSearch(
  warehouseId: string,
  invoiceDate: string,
  _addItemToLines: (itemData: any, overrides?: { qty?: number; unitLevel?: string }) => Promise<void>,
  addServiceLine: (serviceId: string, serviceNameAr: string, salePrice: number) => void,
  addConsumableLine: (itemData: any, qty: number, unitLevel: string, serviceId: string) => Promise<void>,
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
      // جلب بيانات الخدمة للحصول على السعر الأساسي
      const serviceRes = await fetch(`/api/services/${serviceId}`, { credentials: "include" });
      if (!serviceRes.ok) throw new Error("فشل تحميل بيانات الخدمة");
      const serviceData = await serviceRes.json();

      // إضافة سطر الخدمة
      addServiceLine(serviceId, serviceData.nameAr || serviceName, parseFloat(serviceData.basePrice || "0") || 0);

      // جلب المستهلكات
      const res = await fetch(`/api/services/${serviceId}/consumables`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل تحميل المستهلكات");
      const consumables = await res.json();

      if (!consumables || consumables.length === 0) {
        toast({ title: serviceName, description: "تمت الإضافة — لا توجد مستهلكات" });
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

        const qtyNum   = parseFloat(cons.quantity) || 1;
        const unitLv   = cons.unitLevel || "major";
        const qtyMinor = calculateQtyInMinor(qtyNum, unitLv, itemData);

        let stockSufficient = true;
        try {
          const stockRes = await fetch(
            `/api/transfer/fefo-preview?itemId=${cons.itemId}&warehouseId=${warehouseId}&requiredQtyInMinor=${qtyMinor}&asOfDate=${invoiceDate}`
          );
          if (stockRes.ok) {
            const stockData = await stockRes.json();
            if (!stockData.fulfilled) {
              stockSufficient = false;
              const unit = getUnitName(itemData, unitLv);
              stockWarnings.push(
                `${itemData.nameAr}: رصيد غير كافٍ (المطلوب: ${qtyNum} ${unit})`
              );
            }
          }
        } catch {}

        if (!stockSufficient && itemData.hasExpiry) {
          skippedCount++;
          continue;
        }

        await addConsumableLine(itemData, qtyNum, unitLv, serviceId);
        addedCount++;
      }

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
          title:       `تمت إضافة الخدمة: ${serviceName}`,
          description: `سطر الخدمة + ${addedCount} مستهلك بدون قيمة`,
        });
      } else if (addedCount > 0 && skippedCount > 0) {
        toast({
          title:       `خدمة ${serviceName}`,
          description: `أُضيف ${addedCount} مستهلك — لم يُضَف ${skippedCount} بسبب نقص المخزون`,
          variant:     "destructive",
          duration:    8000,
        });
      } else if (addedCount === 0 && skippedCount > 0) {
        toast({
          title:       `لم تُضَف المستهلكات — ${serviceName}`,
          description: `جميع المستهلكات (${skippedCount}) غير متوفرة`,
          variant:     "destructive",
          duration:    8000,
        });
      } else {
        toast({ title: `تمت إضافة الخدمة: ${serviceName}` });
      }
    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      toast({ title: "خطأ", description: _em, variant: "destructive" });
    } finally {
      setAddingServiceId(null);
    }
  }, [warehouseId, invoiceDate, addConsumableLine, addServiceLine, toast]);

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
