import { useCallback, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { TransferLineLocal, ExpiryOption } from "../../types";
import {
  calculateQtyInMinor,
  getUnitName,
  formatAvailability,
  getEffectiveMediumToMinor,
} from "../../types";

interface TransferFefoAllocation {
  allocatedQty: string;
  expiryDate?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  qtyAvailableMinor?: string | null;
  lotSalePrice?: string | null;
}

interface UseTransferLinesProps {
  formLines: TransferLineLocal[];
  setFormLines: React.Dispatch<React.SetStateAction<TransferLineLocal[]>>;
  sourceWarehouseId: string;
  transferDate: string;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
}

export function useTransferLines({
  formLines,
  setFormLines,
  sourceWarehouseId,
  transferDate,
  barcodeInputRef,
}: UseTransferLinesProps) {
  const { toast } = useToast();
  const [fefoLoadingIndex, setFefoLoadingIndex] = useState<number | null>(null);
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);
  const [lineExpiryOptions, setLineExpiryOptions] = useState<Record<string, ExpiryOption[]>>({});
  const [expiryDropdownLoading, setExpiryDropdownLoading] = useState<string | null>(null);

  const formLinesRef = useRef<TransferLineLocal[]>([]);
  formLinesRef.current = formLines;

  const qtyInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingQtyRef = useRef<Map<string, string>>(new Map());
  const expiryOptionsCache = useRef<Record<string, { data: ExpiryOption[]; ts: number }>>({});

  const handleDeleteLine = useCallback(
    (index: number) => {
      const line = formLinesRef.current[index];
      if (line) {
        pendingQtyRef.current.delete(line.id);
        qtyInputRefs.current.delete(line.id);
      }
      if (focusedLineIdx === index) {
        setFocusedLineIdx(null);
      } else if (focusedLineIdx !== null && focusedLineIdx > index) {
        setFocusedLineIdx(focusedLineIdx - 1);
      }
      setFormLines((prev) => prev.filter((_, i) => i !== index));
    },
    [focusedLineIdx, setFormLines]
  );

  const handleQtyConfirm = useCallback(
    async (lineId: string) => {
      const lines = formLinesRef.current;
      const index = lines.findIndex((l) => l.id === lineId);
      const line = lines[index];
      if (!line) return;
      const pendingVal = pendingQtyRef.current.get(lineId);
      const qtyEntered = parseFloat(pendingVal ?? String(line.qtyEntered)) || 0;
      if (qtyEntered <= 0) {
        toast({ title: "كمية غير صحيحة", variant: "destructive" });
        setTimeout(() => qtyInputRefs.current.get(lineId)?.focus(), 50);
        return;
      }

      if (qtyEntered === line.qtyEntered && line.fefoLocked) {
        pendingQtyRef.current.delete(lineId);
        return;
      }

      const qtyInMinor = calculateQtyInMinor(Number(qtyEntered), line.unitLevel, line.item);
      const totalAvail = parseFloat(String(line.item?.availableQtyMinor || "0"));
      if (qtyInMinor > totalAvail) {
        toast({
          title: "الكمية غير متاحة",
          description: `المطلوب: ${qtyEntered} ${getUnitName(line.item, line.unitLevel)} — المتاح: ${formatAvailability(String(totalAvail), line.unitLevel, line.item)}`,
          variant: "destructive",
        });
        setTimeout(() => qtyInputRefs.current.get(lineId)?.focus(), 50);
        return;
      }

      pendingQtyRef.current.delete(lineId);

      if (line.item?.hasExpiry) {
        setFefoLoadingIndex(index);
        try {
          const params = new URLSearchParams({
            itemId: line.itemId,
            warehouseId: sourceWarehouseId,
            requiredQtyInMinor: String(qtyInMinor),
            asOfDate: transferDate,
          });
          const res = await fetch(`/api/transfer/fefo-preview?${params}`);
          const preview = await res.json();

          if (!preview.fulfilled) {
            const shortfall = parseFloat(preview.shortfall);
            toast({
              title: "الكمية غير متاحة",
              description: `العجز: ${formatAvailability(String(shortfall), line.unitLevel, line.item)}`,
              variant: "destructive",
            });
            setFefoLoadingIndex(null);
            pendingQtyRef.current.set(lineId, String(qtyEntered));
            setTimeout(() => qtyInputRefs.current.get(lineId)?.focus(), 50);
            return;
          }

          const convertMinorToDisplay = (minorQty: number): number => {
            let displayQty = minorQty;
            if (line.unitLevel === "major") {
              displayQty = minorQty / (parseFloat(String(line.item?.majorToMinor || "0")) || 1);
            } else if (line.unitLevel === "medium") {
              displayQty = minorQty / getEffectiveMediumToMinor(line.item);
            }
            const rounded = Math.round(displayQty * 10000) / 10000;
            if (Math.abs(rounded - Math.round(rounded)) < 0.005) return Math.round(rounded);
            return rounded;
          };

          const newLines: TransferLineLocal[] = preview.allocations
            .filter((a: TransferFefoAllocation) => parseFloat(a.allocatedQty) > 0)
            .map((alloc: TransferFefoAllocation) => ({
              id: crypto.randomUUID(),
              itemId: line.itemId,
              item: line.item,
              unitLevel: line.unitLevel,
              qtyEntered: convertMinorToDisplay(parseFloat(alloc.allocatedQty)),
              qtyInMinor: parseFloat(alloc.allocatedQty),
              selectedExpiryDate: alloc.expiryDate || null,
              selectedExpiryMonth: alloc.expiryMonth || null,
              selectedExpiryYear: alloc.expiryYear || null,
              availableQtyMinor: line.item?.availableQtyMinor || "0",
              notes: line.notes,
              fefoLocked: true,
              lotSalePrice: alloc.lotSalePrice,
            }));

          setFormLines((prev) => {
            const copy = [...prev];
            copy.splice(index, 1, ...newLines);
            return copy;
          });

          setLineExpiryOptions((prev) => {
            const opts = preview.allocations.map((a: TransferFefoAllocation) => ({
              expiryDate: a.expiryDate,
              expiryMonth: a.expiryMonth,
              expiryYear: a.expiryYear,
              qtyAvailableMinor: a.qtyAvailableMinor,
              lotSalePrice: a.lotSalePrice,
            }));
            const update: Record<string, ExpiryOption[]> = {};
            newLines.forEach((nl) => { update[nl.id] = opts; });
            return { ...prev, ...update };
          });

          if (newLines.length > 1) {
            toast({ title: `تم التوزيع على ${newLines.length} دفعات (FEFO)` });
          }
        } catch (err: unknown) {
          toast({ title: "خطأ في توزيع الصلاحية", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
        } finally {
          setFefoLoadingIndex(null);
        }
      } else {
        setFormLines((prev) => {
          const copy = [...prev];
          copy[index] = { ...copy[index], qtyEntered, qtyInMinor, fefoLocked: true };
          return copy;
        });
      }

      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    },
    [sourceWarehouseId, transferDate, toast, setFormLines, barcodeInputRef]
  );

  const fetchExpiryOptions = useCallback(
    async (itemId: string): Promise<ExpiryOption[]> => {
      const cacheKey = `${itemId}_${sourceWarehouseId}`;
      const cached = expiryOptionsCache.current[cacheKey];
      if (cached && Date.now() - cached.ts < 60000) return cached.data;

      const params = new URLSearchParams({ warehouseId: sourceWarehouseId, asOfDate: transferDate });
      const res = await fetch(`/api/items/${itemId}/expiry-options?${params.toString()}`);
      if (!res.ok) return [];
      const data: ExpiryOption[] = await res.json();
      expiryOptionsCache.current[cacheKey] = { data, ts: Date.now() };
      return data;
    },
    [sourceWarehouseId, transferDate]
  );

  const loadExpiryOptionsForLine = useCallback(
    async (lineId: string, itemId: string) => {
      if (lineExpiryOptions[lineId]) return;
      setExpiryDropdownLoading(lineId);
      try {
        const opts = await fetchExpiryOptions(itemId);
        setLineExpiryOptions((prev) => ({ ...prev, [lineId]: opts }));
      } finally {
        setExpiryDropdownLoading(null);
      }
    },
    [lineExpiryOptions, fetchExpiryOptions]
  );

  const handleExpiryChange = useCallback(
    async (lineId: string, expiryKey: string) => {
      const lines = formLinesRef.current;
      const index = lines.findIndex((l) => l.id === lineId);
      const line = lines[index];
      if (!line) return;

      const [monthStr, yearStr] = expiryKey.split("/");
      const month = parseInt(monthStr);
      const year = parseInt(yearStr);

      const options = await fetchExpiryOptions(line.itemId);
      const opt = options.find((o) => o.expiryMonth === month && o.expiryYear === year);
      const availMinor = opt ? parseFloat(opt.qtyAvailableMinor) : 0;

      const qtyInMinor = line.qtyInMinor;
      if (qtyInMinor > availMinor) {
        toast({
          title: "الكمية تتجاوز المتاح لهذه الصلاحية",
          description: `المتاح: ${formatAvailability(String(availMinor), line.unitLevel, line.item)}`,
          variant: "destructive",
        });
      }

      setFormLines((prev) => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          selectedExpiryDate: opt?.expiryDate || null,
          selectedExpiryMonth: month,
          selectedExpiryYear: year,
          fefoLocked: true,
          lotSalePrice: opt?.lotSalePrice || undefined,
        };
        return copy;
      });
    },
    [toast, fetchExpiryOptions, setFormLines]
  );

  const handleUnitChange = useCallback(
    async (lineId: string, newUnitLevel: string) => {
      const lines = formLinesRef.current;
      const index = lines.findIndex((l) => l.id === lineId);
      const line = lines[index];
      if (!line) return;

      if (line.item?.hasExpiry) {
        // تغيير الوحدة يُعيد الكمية لـ 1 في الوحدة الجديدة ويشغّل FEFO لوحدة واحدة فقط
        const oneUnitInMinor = calculateQtyInMinor(1, newUnitLevel, line.item);

        if (oneUnitInMinor <= 0) {
          setFormLines((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], unitLevel: newUnitLevel };
            return copy;
          });
          return;
        }

        setFefoLoadingIndex(index);
        try {
          const params = new URLSearchParams({
            itemId: line.itemId,
            warehouseId: sourceWarehouseId,
            requiredQtyInMinor: String(oneUnitInMinor),
            asOfDate: transferDate,
          });
          const res = await fetch(`/api/transfer/fefo-preview?${params}`);
          const preview = await res.json();

          if (!preview.fulfilled) {
            toast({ title: "الكمية غير متاحة بهذه الوحدة", variant: "destructive" });
            setFefoLoadingIndex(null);
            return;
          }

          // أول تخصيص يكون السطر الرئيسي بكمية 1 في الوحدة الجديدة
          const firstAlloc = preview.allocations.find(
            (a: TransferFefoAllocation) => parseFloat(a.allocatedQty) > 0,
          );
          if (!firstAlloc) {
            toast({ title: "الكمية غير متاحة بهذه الوحدة", variant: "destructive" });
            setFefoLoadingIndex(null);
            return;
          }

          const sameItemIndexes = lines
            .map((l, i) => (l.itemId === line.itemId ? i : -1))
            .filter((i) => i >= 0)
            .reverse();

          const newLine: TransferLineLocal = {
            id: crypto.randomUUID(),
            itemId: line.itemId,
            item: line.item,
            unitLevel: newUnitLevel,
            qtyEntered: 1,
            qtyInMinor: oneUnitInMinor,
            selectedExpiryDate: firstAlloc.expiryDate || null,
            selectedExpiryMonth: firstAlloc.expiryMonth || null,
            selectedExpiryYear: firstAlloc.expiryYear || null,
            availableQtyMinor: line.item?.availableQtyMinor || "0",
            notes: line.notes,
            fefoLocked: true,
            lotSalePrice: firstAlloc.lotSalePrice,
          };

          setFormLines((prev) => {
            let copy = [...prev];
            sameItemIndexes.forEach((idx) => copy.splice(idx, 1));
            const insertAt = Math.min(...sameItemIndexes.map((i) => i).reverse());
            copy.splice(insertAt, 0, newLine);
            return copy;
          });
        } catch (err: unknown) {
          toast({ title: "خطأ في تغيير الوحدة", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
        } finally {
          setFefoLoadingIndex(null);
        }
      } else {
        // صنف بدون صلاحية: تغيير الوحدة يُعيد الكمية لـ 1 في الوحدة الجديدة
        setFormLines((prev) => {
          const copy = [...prev];
          copy[index] = {
            ...copy[index],
            unitLevel: newUnitLevel,
            qtyEntered: 1,
            qtyInMinor: calculateQtyInMinor(1, newUnitLevel, line.item),
          };
          return copy;
        });
      }
    },
    [sourceWarehouseId, transferDate, toast, setFormLines]
  );

  return {
    handleDeleteLine,
    handleQtyConfirm,
    fetchExpiryOptions,
    loadExpiryOptionsForLine,
    handleExpiryChange,
    handleUnitChange,
    fefoLoadingIndex,
    focusedLineIdx,
    setFocusedLineIdx,
    lineExpiryOptions,
    setLineExpiryOptions,
    expiryDropdownLoading,
    qtyInputRefs,
    pendingQtyRef,
    formLinesRef,
  };
}
