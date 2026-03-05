import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { StoreTransferWithDetails } from "@shared/schema";
import type { TransferLineLocal, ExpiryOption } from "../types";
import {
  calculateQtyInMinor,
  getDefaultUnitLevel,
  getUnitName,
  formatAvailability,
  getEffectiveMediumToMinor,
} from "../types";
import type { ItemSelectedPayload } from "@/components/ItemFastSearch/types";

export function useTransferForm() {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [transferDate, setTransferDate] = useState(today);
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<TransferLineLocal[]>([]);
  const [formStatus, setFormStatus] = useState<string>("draft");
  const [formTransferNumber, setFormTransferNumber] = useState<number | null>(null);

  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveDataRef = useRef<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [fefoLoadingIndex, setFefoLoadingIndex] = useState<number | null>(null);
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);

  const [lineExpiryOptions, setLineExpiryOptions] = useState<Record<string, ExpiryOption[]>>({});
  const [expiryDropdownLoading, setExpiryDropdownLoading] = useState<string | null>(null);

  const formLinesRef = useRef<TransferLineLocal[]>([]);
  const qtyInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingQtyRef = useRef<Map<string, string>>(new Map());
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const expiryOptionsCache = useRef<Record<string, { data: ExpiryOption[]; ts: number }>>({});

  formLinesRef.current = formLines;

  const isViewOnly = formStatus === "executed";

  const canSaveDraft =
    !!transferDate &&
    !!sourceWarehouseId &&
    !!destWarehouseId &&
    sourceWarehouseId !== destWarehouseId &&
    formLines.length > 0 &&
    formStatus === "draft";

  const resetForm = useCallback(() => {
    setEditingTransferId(null);
    setTransferDate(today);
    setSourceWarehouseId("");
    setDestWarehouseId("");
    setFormNotes("");
    setFormLines([]);
    setFormStatus("draft");
    setFormTransferNumber(null);
    setFocusedLineIdx(null);
    setFefoLoadingIndex(null);
    pendingQtyRef.current.clear();
    lastAutoSaveDataRef.current = "";
    setAutoSaveStatus("idle");
  }, [today]);

  const loadTransferForEditing = useCallback(
    async (transferId: string, onLoaded?: () => void) => {
      try {
        const res = await fetch(`/api/transfers/${transferId}`);
        if (!res.ok) throw new Error("Failed to load transfer");
        const transfer: StoreTransferWithDetails = await res.json();

        setEditingTransferId(transfer.id);
        setTransferDate(transfer.transferDate);
        setSourceWarehouseId(transfer.sourceWarehouseId);
        setDestWarehouseId(transfer.destinationWarehouseId);
        setFormNotes(transfer.notes || "");
        setFormStatus(transfer.status);
        setFormTransferNumber(transfer.transferNumber);

        const loadedLines: TransferLineLocal[] = (transfer.lines || []).map((line: any) => ({
          id: crypto.randomUUID(),
          itemId: line.itemId,
          item: line.item || null,
          unitLevel: line.unitLevel,
          qtyEntered: parseFloat(line.qtyEntered as string),
          qtyInMinor: parseFloat(line.qtyInMinor as string),
          selectedExpiryDate: line.selectedExpiryDate || null,
          selectedExpiryMonth: line.selectedExpiryMonth || null,
          selectedExpiryYear: line.selectedExpiryYear || null,
          availableQtyMinor: (line.availableAtSaveMinor as string) || "0",
          notes: line.notes || "",
          fefoLocked: true,
        }));
        setFormLines(loadedLines);
        onLoaded?.();
      } catch (err: any) {
        toast({ title: "خطأ في تحميل التحويل", description: err.message, variant: "destructive" });
      }
    },
    [toast]
  );

  const handleItemSelected = useCallback(
    ({ item, batch }: ItemSelectedPayload) => {
      const unitLevel = getDefaultUnitLevel(item);
      const qtyEntered = 1;
      const qtyInMinor = calculateQtyInMinor(qtyEntered, unitLevel, item);

      const newLine: TransferLineLocal = {
        id: crypto.randomUUID(),
        itemId: item.id,
        item,
        unitLevel,
        qtyEntered,
        qtyInMinor,
        selectedExpiryDate: batch?.expiryDate || null,
        selectedExpiryMonth: (batch as any)?.expiryMonth || null,
        selectedExpiryYear: (batch as any)?.expiryYear || null,
        availableQtyMinor: (batch as any)?.qtyAvailableMinor || item.availableQtyMinor || "0",
        notes: "",
        fefoLocked: !!batch || !item.hasExpiry,
        lotSalePrice: (batch as any)?.lotSalePrice,
      };

      setFormLines((prev) => [...prev, newLine]);
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    },
    []
  );

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
    [focusedLineIdx]
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

      const qtyInMinor = calculateQtyInMinor(qtyEntered, line.unitLevel, line.item);
      const totalAvail = parseFloat(line.item?.availableQtyMinor || "0");
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
              displayQty = minorQty / (parseFloat(line.item.majorToMinor) || 1);
            } else if (line.unitLevel === "medium") {
              displayQty = minorQty / getEffectiveMediumToMinor(line.item);
            }
            const rounded = Math.round(displayQty * 10000) / 10000;
            if (Math.abs(rounded - Math.round(rounded)) < 0.005) return Math.round(rounded);
            return rounded;
          };

          const newLines: TransferLineLocal[] = preview.allocations
            .filter((a: any) => parseFloat(a.allocatedQty) > 0)
            .map((alloc: any) => ({
              id: crypto.randomUUID(),
              itemId: line.itemId,
              item: line.item,
              unitLevel: line.unitLevel,
              qtyEntered: convertMinorToDisplay(parseFloat(alloc.allocatedQty)),
              qtyInMinor: parseFloat(alloc.allocatedQty),
              selectedExpiryDate: alloc.expiryDate || null,
              selectedExpiryMonth: alloc.expiryMonth || null,
              selectedExpiryYear: alloc.expiryYear || null,
              availableQtyMinor: alloc.qtyAvailableMinor || "0",
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
            const opts = preview.allocations.map((a: any) => ({
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
        } catch (err: any) {
          toast({ title: "خطأ في توزيع الصلاحية", description: err.message, variant: "destructive" });
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
    [sourceWarehouseId, transferDate, toast]
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
          availableQtyMinor: String(availMinor),
          fefoLocked: true,
          lotSalePrice: opt?.lotSalePrice || undefined,
        };
        return copy;
      });
    },
    [toast, fetchExpiryOptions]
  );

  const handleUnitChange = useCallback(
    async (lineId: string, newUnitLevel: string) => {
      const lines = formLinesRef.current;
      const index = lines.findIndex((l) => l.id === lineId);
      const line = lines[index];
      if (!line) return;

      if (line.item?.hasExpiry) {
        const sameItemLines = lines.filter((l) => l.itemId === line.itemId);
        const totalQtyInMinor = sameItemLines.reduce((sum, l) => sum + l.qtyInMinor, 0);

        if (totalQtyInMinor <= 0) {
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
            requiredQtyInMinor: String(totalQtyInMinor),
            asOfDate: transferDate,
          });
          const res = await fetch(`/api/transfer/fefo-preview?${params}`);
          const preview = await res.json();

          if (!preview.fulfilled) {
            toast({ title: "الكمية غير متاحة بهذه الوحدة", variant: "destructive" });
            setFefoLoadingIndex(null);
            return;
          }

          const convertMinorToDisplay = (minorQty: number): number => {
            let displayQty = minorQty;
            if (newUnitLevel === "major") displayQty = minorQty / (parseFloat(line.item.majorToMinor) || 1);
            else if (newUnitLevel === "medium") displayQty = minorQty / getEffectiveMediumToMinor(line.item);
            const rounded = Math.round(displayQty * 10000) / 10000;
            if (Math.abs(rounded - Math.round(rounded)) < 0.005) return Math.round(rounded);
            return rounded;
          };

          const newLines: TransferLineLocal[] = preview.allocations
            .filter((a: any) => parseFloat(a.allocatedQty) > 0)
            .map((alloc: any) => ({
              id: crypto.randomUUID(),
              itemId: line.itemId,
              item: line.item,
              unitLevel: newUnitLevel,
              qtyEntered: convertMinorToDisplay(parseFloat(alloc.allocatedQty)),
              qtyInMinor: parseFloat(alloc.allocatedQty),
              selectedExpiryDate: alloc.expiryDate || null,
              selectedExpiryMonth: alloc.expiryMonth || null,
              selectedExpiryYear: alloc.expiryYear || null,
              availableQtyMinor: alloc.qtyAvailableMinor || "0",
              notes: line.notes,
              fefoLocked: true,
              lotSalePrice: alloc.lotSalePrice,
            }));

          const sameItemIndexes = lines
            .map((l, i) => (l.itemId === line.itemId ? i : -1))
            .filter((i) => i >= 0)
            .reverse();

          setFormLines((prev) => {
            let copy = [...prev];
            sameItemIndexes.forEach((idx) => copy.splice(idx, 1));
            const insertAt = Math.min(...sameItemIndexes.map((i) => i).reverse());
            copy.splice(insertAt, 0, ...newLines);
            return copy;
          });
        } catch (err: any) {
          toast({ title: "خطأ في تغيير الوحدة", description: err.message, variant: "destructive" });
        } finally {
          setFefoLoadingIndex(null);
        }
      } else {
        const qtyInMinor = calculateQtyInMinor(line.qtyEntered, newUnitLevel, line.item);
        setFormLines((prev) => {
          const copy = [...prev];
          copy[index] = { ...copy[index], unitLevel: newUnitLevel, qtyInMinor };
          return copy;
        });
      }
    },
    [sourceWarehouseId, transferDate, toast]
  );

  const buildAutoSavePayload = useCallback(() => {
    return {
      header: {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        notes: formNotes,
      },
      lines: formLines.map((l) => ({
        itemId: l.itemId,
        unitLevel: l.unitLevel,
        qtyEntered: String(l.qtyEntered),
        qtyInMinor: String(l.qtyInMinor),
        selectedExpiryDate: l.selectedExpiryDate || undefined,
        expiryMonth: l.selectedExpiryMonth || undefined,
        expiryYear: l.selectedExpiryYear || undefined,
        availableAtSaveMinor: l.availableQtyMinor || undefined,
        notes: l.notes || undefined,
      })),
      existingId: editingTransferId || undefined,
    };
  }, [transferDate, sourceWarehouseId, destWarehouseId, formNotes, formLines, editingTransferId]);

  const performAutoSave = useCallback(async () => {
    if (formStatus !== "draft" || !sourceWarehouseId || !destWarehouseId) return;
    const payload = buildAutoSavePayload();
    const dataStr = JSON.stringify(payload);
    if (dataStr === lastAutoSaveDataRef.current) return;

    setAutoSaveStatus("saving");
    try {
      const res = await fetch("/api/transfers/auto-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: dataStr,
      });
      if (!res.ok) throw new Error("Auto-save failed");
      const result = await res.json();
      lastAutoSaveDataRef.current = dataStr;
      setAutoSaveStatus("saved");
      if (!editingTransferId && result.id) {
        setEditingTransferId(result.id);
        if (result.transferNumber) setFormTransferNumber(result.transferNumber);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    } catch {
      setAutoSaveStatus("error");
    }
  }, [formStatus, sourceWarehouseId, destWarehouseId, buildAutoSavePayload, editingTransferId]);

  useEffect(() => {
    if (formStatus !== "draft" || !sourceWarehouseId || !destWarehouseId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { performAutoSave(); }, 15000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [formStatus, sourceWarehouseId, destWarehouseId, transferDate, formNotes, formLines, performAutoSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (formStatus !== "draft" || !sourceWarehouseId || !destWarehouseId) return;
      const payload = buildAutoSavePayload();
      const dataStr = JSON.stringify(payload);
      if (dataStr === lastAutoSaveDataRef.current) return;
      navigator.sendBeacon("/api/transfers/auto-save", new Blob([dataStr], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [formStatus, sourceWarehouseId, destWarehouseId, buildAutoSavePayload]);

  return {
    editingTransferId,
    setEditingTransferId,
    transferDate,
    setTransferDate,
    sourceWarehouseId,
    setSourceWarehouseId,
    destWarehouseId,
    setDestWarehouseId,
    formNotes,
    setFormNotes,
    formLines,
    setFormLines,
    formStatus,
    setFormStatus,
    formTransferNumber,
    setFormTransferNumber,
    autoSaveStatus,
    setAutoSaveStatus,
    lastAutoSaveDataRef,
    modalOpen,
    setModalOpen,
    fefoLoadingIndex,
    focusedLineIdx,
    setFocusedLineIdx,
    lineExpiryOptions,
    expiryDropdownLoading,
    formLinesRef,
    qtyInputRefs,
    pendingQtyRef,
    barcodeInputRef,
    isViewOnly,
    canSaveDraft,
    resetForm,
    loadTransferForEditing,
    handleItemSelected,
    handleDeleteLine,
    handleQtyConfirm,
    loadExpiryOptionsForLine,
    handleExpiryChange,
    handleUnitChange,
  };
}
