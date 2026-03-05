import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import type { PrepItem, PrepLine, BulkField, BulkOp, SortDir } from "../types";
import { getMajorToMinor, toMajor, valInMajor } from "../types";

export function useLines() {
  const { toast } = useToast();

  const [lines, setLines] = useState<PrepLine[]>([]);
  const [excludeCovered, setExcludeCovered] = useState(true);
  const [sortSourceAsc, setSortSourceAsc] = useState<SortDir>(null);
  const [sortDestAsc, setSortDestAsc] = useState<SortDir>(null);
  const [bulkThreshold, setBulkThreshold] = useState("");
  const [bulkOp, setBulkOp] = useState<BulkOp>("gt");
  const [bulkField, setBulkField] = useState<BulkField>("dest_stock");

  const loadItems = useCallback((items: PrepItem[]) => {
    setLines(items.map((item) => ({ ...item, _excluded: false, _transferQty: "" })));
  }, []);

  const visibleLines = useMemo(() => {
    let result = lines.filter((l) => !l._excluded);
    result = result.filter((l) => (parseFloat(l.source_stock) || 0) > 0);

    if (excludeCovered) {
      result = result.filter((l) => {
        const m2m = getMajorToMinor(l);
        return toMajor(parseFloat(l.dest_stock) || 0, m2m) < toMajor(parseFloat(l.total_sold) || 0, m2m);
      });
    }

    if (sortSourceAsc !== null) {
      result = [...result].sort((a, b) => {
        const diff = (parseFloat(a.source_stock) || 0) - (parseFloat(b.source_stock) || 0);
        return sortSourceAsc ? diff : -diff;
      });
    } else if (sortDestAsc !== null) {
      result = [...result].sort((a, b) => {
        const diff = (parseFloat(a.dest_stock) || 0) - (parseFloat(b.dest_stock) || 0);
        return sortDestAsc ? diff : -diff;
      });
    }

    return result;
  }, [lines, excludeCovered, sortSourceAsc, sortDestAsc]);

  const handleExcludeItem = useCallback((itemId: string) => {
    setLines((prev) => prev.map((l) => (l.item_id === itemId ? { ...l, _excluded: true } : l)));
  }, []);

  const handleBulkExclude = useCallback(() => {
    const threshold = parseFloat(bulkThreshold);
    if (isNaN(threshold)) {
      toast({ title: "تنبيه", description: "أدخل رقماً صحيحاً", variant: "destructive" });
      return;
    }
    setLines((prev) =>
      prev.map((l) => {
        if (l._excluded) return l;
        const val = valInMajor(l, bulkField);
        const match =
          bulkOp === "gt" ? val > threshold :
          bulkOp === "lt" ? val < threshold :
          Math.abs(val - threshold) < 0.01;
        return match ? { ...l, _excluded: true } : l;
      }),
    );
    toast({ title: "تم", description: "تم استبعاد الأصناف المطابقة" });
  }, [bulkThreshold, bulkOp, bulkField, toast]);

  const handleResetExclusions = useCallback(() => {
    setLines((prev) => prev.map((l) => ({ ...l, _excluded: false })));
  }, []);

  const handleQtyChange = useCallback((itemId: string, val: string) => {
    setLines((prev) => prev.map((l) => (l.item_id === itemId ? { ...l, _transferQty: val } : l)));
  }, []);

  const handleFillSuggested = useCallback(() => {
    setLines((prev) =>
      prev.map((l) => {
        if (l._excluded) return l;
        const m2m = getMajorToMinor(l);
        const needed = Math.max(0,
          toMajor(parseFloat(l.total_sold) || 0, m2m) - toMajor(parseFloat(l.dest_stock) || 0, m2m)
        );
        const suggested = Math.min(needed, toMajor(parseFloat(l.source_stock) || 0, m2m));
        const rounded = Math.ceil(suggested);
        return { ...l, _transferQty: rounded > 0 ? String(rounded) : "" };
      }),
    );
    toast({ title: "تم", description: "تم ملء الكميات المقترحة بالوحدة الكبرى (الناقص بحد أقصى رصيد المصدر)" });
  }, [toast]);

  const linesWithQty = visibleLines.filter((l) => parseFloat(l._transferQty) > 0).length;
  const totalItems = lines.filter((l) => !l._excluded).length;
  const excludedCount = lines.filter((l) => l._excluded).length;

  return {
    loadItems,
    visibleLines, linesCount: lines.length,
    excludeCovered, setExcludeCovered,
    sortSourceAsc, setSortSourceAsc,
    sortDestAsc, setSortDestAsc,
    bulkField, setBulkField,
    bulkOp, setBulkOp,
    bulkThreshold, setBulkThreshold,
    handleBulkExclude, handleResetExclusions,
    handleQtyChange, handleExcludeItem, handleFillSuggested,
    linesWithQty, totalItems, excludedCount,
  };
}
