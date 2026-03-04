import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import type { SalesLineLocal } from "../types";
import {
  genId,
  calculateQtyInMinor,
  computeUnitPriceFromBase,
  convertMinorToDisplayQty,
} from "../utils";

export function useInvoiceLines(
  warehouseId: string,
  invoiceDate: string,
  barcodeInputRef: React.RefObject<HTMLInputElement>
) {
  const { toast } = useToast();
  const [lines, setLines] = useState<SalesLineLocal[]>([]);
  const [fefoLoading, setFefoLoading] = useState(false);
  const linesRef = useRef<SalesLineLocal[]>([]);
  linesRef.current = lines;
  const pendingQtyRef = useRef<Map<string, string>>(new Map());

  const updateLine = useCallback((index: number, patch: Partial<SalesLineLocal>) => {
    setLines((prev) => {
      const updated = [...prev];
      const target = updated[index];
      if (patch.unitLevel && target.fefoLocked) {
        const newUnit = patch.unitLevel;
        return updated.map((ln) => {
          if (ln.itemId !== target.itemId) return ln;
          const lineSalePrice = computeUnitPriceFromBase(ln.baseSalePrice, newUnit, ln.item);
          const oldMinor = calculateQtyInMinor(ln.qty, ln.unitLevel, ln.item);
          const newQty = convertMinorToDisplayQty(oldMinor, newUnit, ln.item);
          const total = +(newQty * lineSalePrice).toFixed(2);
          return { ...ln, unitLevel: newUnit, salePrice: lineSalePrice, qty: newQty, lineTotal: total };
        });
      }
      const ln = { ...target, ...patch };
      if (patch.unitLevel) {
        ln.salePrice = computeUnitPriceFromBase(ln.baseSalePrice, ln.unitLevel, ln.item);
      }
      ln.lineTotal = +(ln.qty * ln.salePrice).toFixed(2);
      updated[index] = ln;
      return updated;
    });
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const fetchExpiryOptions = useCallback(async (itemId: string, lineIndex: number) => {
    if (!warehouseId) return;
    try {
      const params = new URLSearchParams({ itemId, warehouseId, requiredQtyInMinor: "999999", asOfDate: invoiceDate });
      const res = await fetch(`/api/transfer/fefo-preview?${params}`);
      if (res.ok) {
        const preview = await res.json();
        const opts = preview.allocations
          .filter((a: any) => a.expiryMonth && a.expiryYear && parseFloat(a.availableQty) > 0)
          .map((a: any) => ({
            expiryMonth: a.expiryMonth as number,
            expiryYear: a.expiryYear as number,
            qtyAvailableMinor: a.availableQty as string,
            lotId: a.lotId as string,
            lotSalePrice: a.lotSalePrice || "0",
          }));
        setLines((prev) => {
          const updated = [...prev];
          updated[lineIndex] = { ...updated[lineIndex], expiryOptions: opts };
          return updated;
        });
      }
    } catch {}
  }, [warehouseId, invoiceDate]);

  const addItemToLines = useCallback(async (itemData: any, overrides?: { qty?: number; unitLevel?: string }) => {
    let baseSalePrice = parseFloat(String(itemData.salePriceCurrent)) || 0;
    let priceSource = "item";
    if (warehouseId) {
      try {
        const priceRes = await fetch(`/api/pricing?itemId=${itemData.id}&warehouseId=${warehouseId}`);
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const resolved = parseFloat(priceData.price);
          if (resolved > 0) baseSalePrice = resolved;
          if (priceData.source) priceSource = priceData.source;
        }
      } catch {}
    }
    const isDeptPrice = priceSource === "department";

    if (itemData.hasExpiry && warehouseId) {
      const currentLines = linesRef.current;
      const existingLinesForItem = currentLines.filter((l) => l.itemId === itemData.id);
      const existingTotalMinor = existingLinesForItem.reduce(
        (sum, l) => sum + calculateQtyInMinor(l.qty, l.unitLevel, l.item),
        0
      );
      const overrideQty = overrides?.qty ?? 1;
      const overrideUnit = overrides?.unitLevel ?? "major";
      const additionalMinor = calculateQtyInMinor(overrideQty, overrideUnit, itemData);
      const totalRequiredMinor = existingTotalMinor + additionalMinor;
      const unitLevel = overrides?.unitLevel ?? (existingLinesForItem.length > 0 ? existingLinesForItem[0].unitLevel : "major");

      setFefoLoading(true);
      try {
        const fefoParams = new URLSearchParams({
          itemId: itemData.id,
          warehouseId,
          requiredQtyInMinor: String(totalRequiredMinor),
          asOfDate: invoiceDate,
        });
        const res = await fetch(`/api/transfer/fefo-preview?${fefoParams.toString()}`);
        if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
        const preview = await res.json();

        if (!preview.fulfilled) {
          toast({
            title: "الكمية غير متاحة",
            description: preview.shortfall ? `العجز: ${preview.shortfall}` : undefined,
            variant: "destructive",
          });
          setFefoLoading(false);
          return;
        }

        const allLotsParams = new URLSearchParams({
          itemId: itemData.id,
          warehouseId,
          requiredQtyInMinor: "999999",
          asOfDate: invoiceDate,
        });
        const allLotsRes = await fetch(`/api/transfer/fefo-preview?${allLotsParams.toString()}`);
        const allLotsPreview = allLotsRes.ok ? await allLotsRes.json() : { allocations: [] };
        const allExpiryOptions = allLotsPreview.allocations
          .filter((a: any) => a.expiryMonth && a.expiryYear && parseFloat(a.availableQty) > 0)
          .map((a: any) => ({
            expiryMonth: a.expiryMonth as number,
            expiryYear: a.expiryYear as number,
            qtyAvailableMinor: a.availableQty as string,
            lotId: a.lotId as string,
            lotSalePrice: a.lotSalePrice || "0",
          }));

        const newFefoLines: SalesLineLocal[] = preview.allocations
          .filter((a: any) => parseFloat(a.allocatedQty) > 0)
          .map((alloc: any) => {
            const allocMinor = parseFloat(alloc.allocatedQty);
            const displayQty = convertMinorToDisplayQty(allocMinor, unitLevel, itemData);
            const lineBaseSalePrice = isDeptPrice
              ? baseSalePrice
              : (parseFloat(alloc.lotSalePrice || "0") > 0 ? parseFloat(alloc.lotSalePrice) : baseSalePrice);
            const lineSalePrice = computeUnitPriceFromBase(lineBaseSalePrice, unitLevel, itemData);
            return {
              tempId: genId(),
              itemId: itemData.id,
              item: itemData,
              unitLevel,
              qty: displayQty,
              salePrice: lineSalePrice,
              baseSalePrice: lineBaseSalePrice,
              lineTotal: +(displayQty * lineSalePrice).toFixed(2),
              expiryMonth: alloc.expiryMonth || null,
              expiryYear: alloc.expiryYear || null,
              lotId: alloc.lotId || null,
              fefoLocked: true,
              priceSource,
              availableQtyMinor: itemData.availableQtyMinor || "0",
              expiryOptions: allExpiryOptions,
            } as SalesLineLocal;
          });

        setLines((prev) => {
          const filtered = prev.filter((l) => l.itemId !== itemData.id);
          return [...filtered, ...newFefoLines];
        });

      } catch (err: any) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err.message, variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
      return;
    }

    const targetUnit = overrides?.unitLevel ?? "major";
    const targetQty = overrides?.qty ?? 1;

    if (!overrides) {
      const existingIdx = linesRef.current.findIndex(
        (l) => l.itemId === itemData.id && l.unitLevel === targetUnit
      );
      if (existingIdx >= 0) {
        updateLine(existingIdx, { qty: linesRef.current[existingIdx].qty + targetQty });
        return;
      }
    }

    const salePrice = computeUnitPriceFromBase(baseSalePrice, targetUnit, itemData);
    const newLine: SalesLineLocal = {
      tempId: genId(),
      itemId: itemData.id,
      item: itemData,
      unitLevel: targetUnit,
      qty: targetQty,
      salePrice,
      baseSalePrice,
      lineTotal: +(targetQty * salePrice).toFixed(2),
      expiryMonth: null,
      expiryYear: null,
      lotId: null,
      fefoLocked: false,
      priceSource,
      availableQtyMinor: itemData.availableQtyMinor || "0",
    };

    setLines((prev) => [...prev, newLine]);
  }, [updateLine, warehouseId, invoiceDate, toast]);

  const handleQtyConfirm = useCallback(async (tempId: string) => {
    const currentLines = linesRef.current;
    const index = currentLines.findIndex((l) => l.tempId === tempId);
    const line = currentLines[index];
    if (!line) return;

    const pendingVal = pendingQtyRef.current.get(tempId);
    const qtyEntered = parseFloat(pendingVal ?? String(line.qty)) || 0;
    if (qtyEntered <= 0) {
      toast({ title: "كمية غير صحيحة", variant: "destructive" });
      return;
    }
    pendingQtyRef.current.delete(tempId);

    if (line.item?.hasExpiry && warehouseId) {
      const allLinesForItem = currentLines.filter((l) => l.itemId === line.itemId);
      const otherLinesMinor = allLinesForItem
        .filter((l) => l.tempId !== tempId)
        .reduce((sum, l) => sum + calculateQtyInMinor(l.qty, l.unitLevel, l.item), 0);
      const thisLineMinor = calculateQtyInMinor(qtyEntered, line.unitLevel, line.item);
      const totalRequiredMinor = otherLinesMinor + thisLineMinor;

      if (totalRequiredMinor <= 0) return;

      setFefoLoading(true);
      try {
        const fefoParams = new URLSearchParams({
          itemId: line.itemId,
          warehouseId,
          requiredQtyInMinor: String(totalRequiredMinor),
          asOfDate: invoiceDate,
        });
        const res = await fetch(`/api/transfer/fefo-preview?${fefoParams.toString()}`);
        if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
        const preview = await res.json();

        if (!preview.fulfilled) {
          toast({
            title: "الكمية غير متاحة",
            description: preview.shortfall ? `العجز: ${preview.shortfall}` : undefined,
            variant: "destructive",
          });
          setFefoLoading(false);
          return;
        }

        const unitLevel = line.unitLevel;
        const itemData = line.item;
        const itemCardPrice = parseFloat(String(itemData?.salePriceCurrent)) || 0;

        let deptBaseSalePrice = 0;
        let redistribIsDeptPrice = false;
        if (warehouseId) {
          try {
            const priceRes = await fetch(`/api/pricing?itemId=${line.itemId}&warehouseId=${warehouseId}`);
            if (priceRes.ok) {
              const priceData = await priceRes.json();
              if (priceData.source === "department") {
                redistribIsDeptPrice = true;
                deptBaseSalePrice = parseFloat(priceData.price) || 0;
              }
            }
          } catch {}
        }

        const allLotsParams2 = new URLSearchParams({
          itemId: line.itemId,
          warehouseId,
          requiredQtyInMinor: "999999",
          asOfDate: invoiceDate,
        });
        const allLotsRes2 = await fetch(`/api/transfer/fefo-preview?${allLotsParams2.toString()}`);
        const allLotsPreview2 = allLotsRes2.ok ? await allLotsRes2.json() : { allocations: [] };
        const redistribExpiryOptions = allLotsPreview2.allocations
          .filter((a: any) => a.expiryMonth && a.expiryYear && parseFloat(a.availableQty) > 0)
          .map((a: any) => ({
            expiryMonth: a.expiryMonth as number,
            expiryYear: a.expiryYear as number,
            qtyAvailableMinor: a.availableQty as string,
            lotId: a.lotId as string,
            lotSalePrice: a.lotSalePrice || "0",
          }));

        const newFefoLines: SalesLineLocal[] = preview.allocations
          .filter((a: any) => parseFloat(a.allocatedQty) > 0)
          .map((alloc: any) => {
            const allocMinor = parseFloat(alloc.allocatedQty);
            const displayQty = convertMinorToDisplayQty(allocMinor, unitLevel, itemData);
            const lineBase = redistribIsDeptPrice
              ? deptBaseSalePrice
              : (parseFloat(alloc.lotSalePrice || "0") > 0 ? parseFloat(alloc.lotSalePrice) : itemCardPrice);
            const linePrice = computeUnitPriceFromBase(lineBase, unitLevel, itemData);
            return {
              tempId: genId(),
              itemId: line.itemId,
              item: itemData,
              unitLevel,
              qty: displayQty,
              salePrice: linePrice,
              baseSalePrice: lineBase,
              lineTotal: +(displayQty * linePrice).toFixed(2),
              expiryMonth: alloc.expiryMonth || null,
              expiryYear: alloc.expiryYear || null,
              lotId: alloc.lotId || null,
              fefoLocked: true,
              priceSource: redistribIsDeptPrice ? "department" : (parseFloat(alloc.lotSalePrice || "0") > 0 ? "lot" : "item"),
              availableQtyMinor: line.availableQtyMinor || "0",
              expiryOptions: redistribExpiryOptions,
            } as SalesLineLocal;
          });

        setLines((prev) => {
          const filtered = prev.filter((l) => l.itemId !== line.itemId);
          return [...filtered, ...newFefoLines];
        });

      } catch (err: any) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err.message, variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
    } else {
      updateLine(index, { qty: qtyEntered });
    }

    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }, [warehouseId, invoiceDate, toast, updateLine, barcodeInputRef]);

  return {
    lines, setLines,
    fefoLoading,
    linesRef,
    pendingQtyRef,
    updateLine,
    removeLine,
    addItemToLines,
    handleQtyConfirm,
    fetchExpiryOptions,
  };
}
