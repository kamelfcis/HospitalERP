/**
 * useLoadInvoice — تحميل فاتورة مبيعات موجودة وتعبئة الحالة
 *
 * المسؤولية:
 *  1. تعبئة form من بيانات الفاتورة المحمّلة
 *  2. تحويل سطور الفاتورة لـ SalesLineLocal
 *  3. جلب الأرصدة المتاحة وخيارات الصلاحية لكل صنف (draft فقط)
 *
 * لا يُنفِّذ أي API بنفسه — يعتمد على نتيجة useQuery المُمرَّرة إليه.
 */
import { useEffect, useRef } from "react";
import { genId } from "@/lib/invoice-lines";
import type { SalesInvoiceWithDetails } from "@shared/schema";
import type { SalesLineLocal } from "../types";
import type { InvoiceFormHandlers } from "./useInvoiceForm";

interface UseLoadInvoiceParams {
  invoiceDetail:    SalesInvoiceWithDetails | undefined;
  isNew:            boolean;
  warehouses?:      { id: string }[];
  form:             InvoiceFormHandlers;
  setLines:         React.Dispatch<React.SetStateAction<SalesLineLocal[]>>;
}

export function useLoadInvoice({
  invoiceDetail, isNew, warehouses, form, setLines,
}: UseLoadInvoiceParams) {
  const loadedIdRef = useRef<string | null>(null);

  // ── إعادة ضبط الفاتورة الجديدة ──────────────────────────────────────────
  useEffect(() => {
    if (!isNew) return;
    form.resetForm({ warehouseId: warehouses?.[0]?.id || "" });
    setLines([]);
    loadedIdRef.current = null;
  }, [isNew, warehouses]);

  // ── تحميل فاتورة موجودة ──────────────────────────────────────────────────
  useEffect(() => {
    if (!invoiceDetail || isNew) return;
    if (loadedIdRef.current === invoiceDetail.id) return;
    loadedIdRef.current = invoiceDetail.id;

    // تعبئة form من البيانات المحمّلة
    form.resetForm({
      warehouseId:      invoiceDetail.warehouseId,
      invoiceDate:      invoiceDetail.invoiceDate,
      customerType:     invoiceDetail.customerType,
      customerName:     invoiceDetail.customerName     || "",
      contractCompany:  invoiceDetail.contractCompany  || "",
      discountPct:      parseFloat(String(invoiceDetail.discountPercent)) || 0,
      discountValue:    parseFloat(String(invoiceDetail.discountValue))   || 0,
      notes:            invoiceDetail.notes || "",
    });

    // تحويل سطور الفاتورة
    const mapped: SalesLineLocal[] = (invoiceDetail.lines || []).map((ln: any) => ({
      tempId:           ln.id || genId(),
      itemId:           ln.itemId,
      item:             ln.item || null,
      unitLevel:        ln.unitLevel || "major",
      qty:              parseFloat(String(ln.qty))       || 0,
      salePrice:        parseFloat(String(ln.salePrice)) || 0,
      baseSalePrice:    parseFloat(String(ln.salePrice)) || 0,
      lineTotal:        parseFloat(String(ln.lineTotal)) || 0,
      expiryMonth:      ln.expiryMonth ?? null,
      expiryYear:       ln.expiryYear  ?? null,
      lotId:            ln.lotId       ?? null,
      fefoLocked:       !!(ln.expiryMonth && ln.expiryYear),
    }));
    setLines(mapped);

    // بيانات مكملة فقط للمسودات
    if (invoiceDetail.status !== "draft" || !invoiceDetail.warehouseId) return;

    const allItemIds   = Array.from(new Set(mapped.map((l) => l.itemId)));
    const expiryItemIds= Array.from(new Set(
      mapped.filter((l) => l.item?.hasExpiry).map((l) => l.itemId)
    ));

    // 1. أرصدة المخزون
    if (allItemIds.length > 0) {
      Promise.all(
        allItemIds.map(async (itemId) => {
          try {
            const r = await fetch(`/api/items/${itemId}/availability?warehouseId=${invoiceDetail.warehouseId}`);
            const d = r.ok ? await r.json() : { availableQtyMinor: "0" };
            return { itemId, available: d.availableQtyMinor || "0" };
          } catch { return { itemId, available: "0" }; }
        })
      ).then((results) => {
        const map = new Map(results.map((r) => [r.itemId, r.available]));
        setLines((prev) => prev.map((l) => ({
          ...l,
          availableQtyMinor: map.get(l.itemId) || l.availableQtyMinor || "0",
        })));
      });
    }

    // 2. خيارات الصلاحية للأصناف ذات الصلاحية
    if (expiryItemIds.length > 0) {
      Promise.all(
        expiryItemIds.map(async (itemId) => {
          try {
            const p = new URLSearchParams({
              itemId,
              warehouseId:         invoiceDetail.warehouseId,
              requiredQtyInMinor:  "999999",
              asOfDate:            invoiceDetail.invoiceDate,
            });
            const r = await fetch(`/api/transfer/fefo-preview?${p}`);
            if (!r.ok) return { itemId, options: [] };
            const preview = await r.json();
            const options = preview.allocations
              .filter((a: any) => a.expiryMonth && a.expiryYear && parseFloat(a.availableQty) > 0)
              .map((a: any) => ({
                expiryMonth:       a.expiryMonth,
                expiryYear:        a.expiryYear,
                qtyAvailableMinor: a.availableQty,
                lotId:             a.lotId,
                lotSalePrice:      a.lotSalePrice || "0",
              }));
            return { itemId, options };
          } catch { return { itemId, options: [] }; }
        })
      ).then((results) => {
        const map = new Map(results.map((r) => [r.itemId, r.options]));
        setLines((prev) => prev.map((l) => {
          if (l.item?.hasExpiry && map.has(l.itemId)) {
            return { ...l, expiryOptions: map.get(l.itemId) };
          }
          return l;
        }));
      });
    }
  }, [invoiceDetail, isNew]);

  return { loadedIdRef };
}
