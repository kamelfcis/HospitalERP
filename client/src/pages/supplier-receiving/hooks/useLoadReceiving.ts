/**
 * useLoadReceiving — تحميل إذن استلام موجود للتعديل
 *
 * يجلب البيانات من السيرفر ويملأ:
 *   - حالة النموذج (useReceivingForm)
 *   - السطور (useReceivingLines)
 *
 * يُعيد دالة واحدة: loadReceivingForEditing(id)
 */
import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { calculateQtyInMinor, getDefaultUnitLevel } from "../types";
import type { ReceivingLineLocal } from "../types";
import type { ReceivingFormState } from "./useReceivingForm";
import type { UseReceivingLinesReturn } from "./useReceivingLines";
import type { ReceivingHeaderWithDetails } from "@shared/schema";

interface Params {
  form:          ReceivingFormState;
  lines:         UseReceivingLinesReturn;
  resetAutoSave: () => void;
  setActiveTab:  (tab: string) => void;
}

export function useLoadReceiving({
  form, lines, resetAutoSave, setActiveTab,
}: Params) {
  const { toast } = useToast();

  const loadReceivingForEditing = useCallback(async (receivingId: string) => {
    try {
      const res = await fetch(`/api/receivings/${receivingId}`);
      if (!res.ok) throw new Error("فشل تحميل إذن الاستلام");
      const receiving: ReceivingHeaderWithDetails = await res.json();

      // ── ملء بيانات الرأس ──────────────────────────────────────────────────
      form.setEditingReceivingId(receiving.id);
      form.setReceiveDate(receiving.receiveDate);
      form.setSupplierId(receiving.supplierId);
      form.setWarehouseId(receiving.warehouseId);
      form.setSupplierInvoiceNo(receiving.supplierInvoiceNo);
      form.setFormNotes(receiving.notes || "");
      form.setFormStatus(receiving.status);
      form.setFormReceivingNumber(receiving.receivingNumber);
      form.setFormCorrectionStatus((receiving as Record<string, unknown>).correctionStatus as string | null || null);
      form.setFormCorrectionOfId((receiving as Record<string, unknown>).correctionOfId as string | null || null);
      form.setFormConvertedToInvoiceId((receiving as Record<string, unknown>).convertedToInvoiceId as string | null || null);

      // ── بناء سطور التحميل ─────────────────────────────────────────────────
      const loadedLines: ReceivingLineLocal[] = (receiving.lines || []).map((line) => {
        const sp = line.salePrice ? parseFloat(line.salePrice as string) : 0;
        const pp = parseFloat(line.purchasePrice as string) || 0;
        return {
          id:                    crypto.randomUUID(),
          itemId:                line.itemId,
          item:                  line.item || null,
          unitLevel:             line.unitLevel,
          qtyEntered:            parseFloat(line.qtyEntered as string),
          qtyInMinor:            parseFloat(line.qtyInMinor as string),
          purchasePrice:         pp,
          discountPct:           (sp > 0 && pp > 0) ? Math.round(((sp - pp) / sp) * 10000) / 100 : 0,
          lineTotal:             pp * (parseFloat(line.qtyEntered as string) || 0),
          batchNumber:           line.batchNumber || "",
          expiryMonth:           line.expiryMonth ?? null,
          expiryYear:            line.expiryYear ?? null,
          salePrice:             sp || null,
          lastPurchasePriceHint: pp || null,
          lastSalePriceHint:     line.salePriceHint ? parseFloat(line.salePriceHint as string) : null,
          bonusQty:              parseFloat(line.bonusQty as string) || 0,
          bonusQtyInMinor:       parseFloat(line.bonusQtyInMinor as string) || 0,
          onHandInWarehouse:     "0",
          notes:                 line.notes || "",
          isRejected:            line.isRejected || false,
          rejectionReason:       line.rejectionReason || "",
        };
      });

      // ── جلب hints بشكل متوازٍ ─────────────────────────────────────────────
      const hintsResults = await Promise.allSettled(
        loadedLines.map((ln) =>
          fetch(`/api/items/${ln.itemId}/hints?supplierId=${receiving.supplierId}&warehouseId=${receiving.warehouseId}`)
            .then((r) => r.ok ? r.json() : null)
            .catch(() => null),
        ),
      );

      let fixedCount = 0;
      hintsResults.forEach((result, i) => {
        const hints = result.status === "fulfilled" ? result.value : null;
        if (hints) {
          loadedLines[i] = {
            ...loadedLines[i],
            onHandInWarehouse:     hints.onHandMinor || "0",
            lastPurchasePriceHint: loadedLines[i].lastPurchasePriceHint
              || (hints.lastPurchasePrice ? parseFloat(hints.lastPurchasePrice) : null),
            lastSalePriceHint: loadedLines[i].lastSalePriceHint
              || (hints.lastSalePrice ? parseFloat(hints.lastSalePrice) : null),
          };
        }
        // تصحيح وحدة الشراء للمسودات فقط
        if (receiving.status === "draft") {
          const item = loadedLines[i].item;
          if (item) {
            const expectedUnit = getDefaultUnitLevel(item);
            if (!loadedLines[i].unitLevel || (item.majorUnitName && loadedLines[i].unitLevel !== "major")) {
              loadedLines[i] = {
                ...loadedLines[i],
                unitLevel:  expectedUnit,
                qtyInMinor: calculateQtyInMinor(loadedLines[i].qtyEntered, expectedUnit, item),
              };
              fixedCount++;
            }
          }
        }
      });

      if (fixedCount > 0) {
        toast({
          title:       "تم ضبط وحدة الشراء للوحدة الكبرى",
          description: `تم تصحيح ${fixedCount} سطر`,
        });
      }

      lines.setFormLines(loadedLines);
      resetAutoSave();
      setActiveTab("form");

    } catch (err: unknown) {
      const _em = err instanceof Error ? err.message : String(err);
      toast({ title: "خطأ في تحميل إذن الاستلام", description: _em, variant: "destructive" });
    }
  }, [form, lines, resetAutoSave, setActiveTab, toast]);

  return { loadReceivingForEditing };
}
