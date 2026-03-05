/**
 * useReceivingLines — حالة سطور إذن الاستلام
 *
 * - CRUD على السطور
 * - حساب الإجماليات
 * - التحقق من صحة السطور قبل الحفظ
 * - إضافة صنف من البحث أو الاسكنر (مع جلب hints)
 */
import { useState, useCallback, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  ReceivingLineLocal, LineError,
  calculateQtyInMinor, getDefaultUnitLevel, buildLinePayload,
} from "../types";

export interface UseReceivingLinesReturn {
  formLines: ReceivingLineLocal[];
  setFormLines: React.Dispatch<React.SetStateAction<ReceivingLineLocal[]>>;
  lineErrors: LineError[];
  setLineErrors: React.Dispatch<React.SetStateAction<LineError[]>>;
  grandTotal: number;
  updateLine: (index: number, updates: Partial<ReceivingLineLocal>) => void;
  handleDeleteLine: (index: number) => void;
  addItemLine: (item: any, supplierId: string, warehouseId: string) => Promise<ReceivingLineLocal | null>;
  validateLines: () => LineError[];
  resetLines: () => void;
  // refs للتركيز على حقول السطور
  qtyInputRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
  salePriceInputRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
  expiryInputRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  focusedLineIdx: number | null;
  setFocusedLineIdx: (v: number | null) => void;
  lineFieldFocusedRef: React.MutableRefObject<boolean>;
  // بناء payload
  buildLinesPayload: () => ReturnType<typeof buildLinePayload>[];
}

async function fetchHints(itemId: string, supplierId: string, warehouseId: string) {
  try {
    const params = new URLSearchParams();
    if (supplierId) params.set("supplierId", supplierId);
    if (warehouseId) params.set("warehouseId", warehouseId);
    const res = await fetch(`/api/items/${itemId}/hints?${params}`);
    if (res.ok) return res.json();
  } catch {}
  return null;
}

export function useReceivingLines(): UseReceivingLinesReturn {
  const { toast } = useToast();
  const [formLines, setFormLines]   = useState<ReceivingLineLocal[]>([]);
  const [lineErrors, setLineErrors] = useState<LineError[]>([]);
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);

  const qtyInputRefs       = useRef<Map<number, HTMLInputElement>>(new Map());
  const salePriceInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const expiryInputRefs    = useRef<Map<number, HTMLDivElement>>(new Map());
  const lineFieldFocusedRef = useRef(false);

  const grandTotal = useMemo(
    () => formLines.reduce((sum, l) => sum + l.lineTotal, 0),
    [formLines],
  );

  const updateLine = useCallback((index: number, updates: Partial<ReceivingLineLocal>) => {
    setLineErrors([]);
    setFormLines((prev) => {
      const copy = [...prev];
      const line = { ...copy[index], ...updates };
      if ("qtyEntered" in updates || "bonusQty" in updates || "unitLevel" in updates) {
        const qty    = updates.qtyEntered ?? line.qtyEntered;
        const bonus  = updates.bonusQty ?? line.bonusQty;
        const unit   = updates.unitLevel ?? line.unitLevel;
        line.qtyEntered      = qty;
        line.bonusQty        = bonus;
        line.qtyInMinor      = calculateQtyInMinor(qty, unit, line.item);
        line.bonusQtyInMinor = calculateQtyInMinor(bonus, unit, line.item);
        line.unitLevel       = unit;
      }
      copy[index] = line;
      return copy;
    });
  }, []);

  const handleDeleteLine = useCallback((index: number) => {
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addItemLine = useCallback(async (
    item: any,
    supplierId: string,
    warehouseId: string,
  ): Promise<ReceivingLineLocal | null> => {
    const unitLevel  = getDefaultUnitLevel(item);
    const qtyEntered = 1;
    const qtyInMinor = calculateQtyInMinor(qtyEntered, unitLevel, item);

    const hints = await fetchHints(item.id, supplierId, warehouseId);
    const lastPurchasePrice  = hints?.lastPurchasePrice ? parseFloat(hints.lastPurchasePrice) : 0;
    const currentSalePrice   = hints?.currentSalePrice  ? parseFloat(hints.currentSalePrice)  : 0;
    const lastSalePrice      = hints?.lastSalePrice     ? parseFloat(hints.lastSalePrice)      : null;

    const newLine: ReceivingLineLocal = {
      id: crypto.randomUUID(),
      itemId: item.id,
      item,
      unitLevel,
      qtyEntered,
      qtyInMinor,
      purchasePrice:       lastPurchasePrice,
      lineTotal:           0,
      batchNumber:         "",
      expiryMonth:         null,
      expiryYear:          null,
      salePrice:           currentSalePrice || null,
      lastPurchasePriceHint: lastPurchasePrice || null,
      lastSalePriceHint:   lastSalePrice,
      bonusQty:            0,
      bonusQtyInMinor:     0,
      onHandInWarehouse:   hints?.onHandMinor || "0",
      notes:               "",
      isRejected:          false,
      rejectionReason:     "",
    };

    setFormLines((prev) => [...prev, newLine]);
    toast({ title: `تمت إضافة: ${item.nameAr}` });
    return newLine;
  }, [toast]);

  const validateLines = useCallback((): LineError[] => {
    const errors: LineError[] = [];
    for (let i = 0; i < formLines.length; i++) {
      const line = formLines[i];
      if (line.isRejected) continue;
      if (line.salePrice == null || line.salePrice <= 0) {
        errors.push({ lineIndex: i, field: "salePrice", messageAr: "سعر البيع مطلوب" });
      }
      if (line.item?.hasExpiry) {
        if (
          line.expiryMonth == null || line.expiryYear == null ||
          line.expiryMonth < 1 || line.expiryMonth > 12 || line.expiryYear < 2000
        ) {
          errors.push({ lineIndex: i, field: "expiry", messageAr: "تاريخ الصلاحية مطلوب" });
        }
      }
    }
    return errors;
  }, [formLines]);

  const resetLines = useCallback(() => {
    setFormLines([]);
    setLineErrors([]);
    setFocusedLineIdx(null);
  }, []);

  const buildLinesPayload = useCallback(
    () => formLines.map(buildLinePayload),
    [formLines],
  );

  return {
    formLines, setFormLines,
    lineErrors, setLineErrors,
    grandTotal,
    updateLine,
    handleDeleteLine,
    addItemLine,
    validateLines,
    resetLines,
    qtyInputRefs, salePriceInputRefs, expiryInputRefs,
    focusedLineIdx, setFocusedLineIdx,
    lineFieldFocusedRef,
    buildLinesPayload,
  };
}
