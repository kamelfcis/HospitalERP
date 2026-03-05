import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Warehouse } from "@shared/schema";
import type { PrepItem, PrepLine, BulkField, BulkOp } from "../types";

export function usePreparationData() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const [lines, setLines] = useState<PrepLine[]>([]);
  const [queried, setQueried] = useState(false);
  const [excludeCovered, setExcludeCovered] = useState(true);
  const [sortDestAsc, setSortDestAsc] = useState<boolean | null>(null);
  const [sortSourceAsc, setSortSourceAsc] = useState<boolean | null>(null);
  const [bulkThreshold, setBulkThreshold] = useState("");
  const [bulkOp, setBulkOp] = useState<BulkOp>("gt");
  const [bulkField, setBulkField] = useState<BulkField>("dest_stock");

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const queryEnabled =
    !!sourceWarehouseId && !!destWarehouseId && !!dateFrom && !!dateTo && sourceWarehouseId !== destWarehouseId;

  const { isFetching, refetch } = useQuery<PrepItem[]>({
    queryKey: ["/api/transfer-preparation/query", sourceWarehouseId, destWarehouseId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ sourceWarehouseId, destWarehouseId, dateFrom, dateTo });
      const res = await fetch(`/api/transfer-preparation/query?${params}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "خطأ في الاستعلام");
      }
      return res.json();
    },
    enabled: false,
    gcTime: 0,
  });

  const handleQuery = useCallback(async () => {
    if (!queryEnabled) {
      toast({ title: "تنبيه", description: "يرجى اختيار المخزنين والفترة", variant: "destructive" });
      return;
    }
    try {
      const result = await refetch();
      if (result.data) {
        setLines(result.data.map((item) => ({ ...item, _excluded: false, _transferQty: "" })));
        setQueried(true);
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  }, [queryEnabled, refetch, toast]);

  const visibleLines = useMemo(() => {
    let result = lines.filter((l) => !l._excluded);
    result = result.filter((l) => (parseFloat(l.source_stock) || 0) > 0);

    if (excludeCovered) {
      result = result.filter((l) => {
        const destStock = parseFloat(l.dest_stock) || 0;
        const totalSold = parseFloat(l.total_sold) || 0;
        return destStock < totalSold;
      });
    }

    if (sortSourceAsc !== null) {
      result = [...result].sort((a, b) => {
        const aVal = parseFloat(a.source_stock) || 0;
        const bVal = parseFloat(b.source_stock) || 0;
        return sortSourceAsc ? aVal - bVal : bVal - aVal;
      });
    } else if (sortDestAsc !== null) {
      result = [...result].sort((a, b) => {
        const aVal = parseFloat(a.dest_stock) || 0;
        const bVal = parseFloat(b.dest_stock) || 0;
        return sortDestAsc ? aVal - bVal : bVal - aVal;
      });
    }

    return result;
  }, [lines, excludeCovered, sortDestAsc, sortSourceAsc]);

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
        const val = parseFloat(l[bulkField]) || 0;
        let match = false;
        if (bulkOp === "gt") match = val > threshold;
        else if (bulkOp === "lt") match = val < threshold;
        else match = Math.abs(val - threshold) < 0.01;
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
        const destStock = parseFloat(l.dest_stock) || 0;
        const totalSold = parseFloat(l.total_sold) || 0;
        const sourceStock = parseFloat(l.source_stock) || 0;
        const needed = Math.max(0, totalSold - destStock);
        const suggested = Math.min(needed, sourceStock);
        return { ...l, _transferQty: suggested > 0 ? String(suggested) : "" };
      }),
    );
    toast({ title: "تم", description: "تم ملء الكميات المقترحة (الناقص بحد أقصى رصيد المصدر)" });
  }, [toast]);

  const createTransferMutation = useMutation({
    mutationFn: async (payload: {
      transferDate: string;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      lines: any[];
    }) => {
      const res = await apiRequest("POST", "/api/transfers", payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
      toast({ title: "تم إنشاء إذن التحويل", description: `رقم التحويل: ${data.transferNumber}` });
      navigate("/store-transfers");
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateTransfer = useCallback(
    (transferDate: string) => {
      const errors: string[] = [];
      const transferLines = visibleLines
        .filter((l) => parseFloat(l._transferQty) > 0)
        .map((l, idx) => {
          const entered = parseFloat(l._transferQty);
          const srcStock = parseFloat(l.source_stock) || 0;
          const capped = Math.min(entered, srcStock);
          if (entered > srcStock) {
            errors.push(
              `${l.name_ar}: الكمية (${entered}) أكبر من رصيد المصدر (${srcStock}) — تم تعديلها إلى ${capped}`,
            );
          }
          return { itemId: l.item_id, unitLevel: "minor", qtyEntered: capped, qtyInMinor: capped, lineNo: idx + 1, notes: "" };
        })
        .filter((l) => l.qtyEntered > 0);

      if (transferLines.length === 0) {
        toast({ title: "تنبيه", description: "لا توجد أصناف بكميات للتحويل", variant: "destructive" });
        return;
      }
      if (errors.length > 0) {
        toast({ title: "تم تعديل بعض الكميات", description: errors.join("\n"), variant: "default" });
      }

      createTransferMutation.mutate({
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        lines: transferLines,
      });
    },
    [visibleLines, sourceWarehouseId, destWarehouseId, createTransferMutation, toast],
  );

  const linesWithQty = visibleLines.filter((l) => parseFloat(l._transferQty) > 0).length;
  const totalItems = lines.filter((l) => !l._excluded).length;
  const excludedCount = lines.filter((l) => l._excluded).length;
  const sourceName = warehouses?.find((w) => w.id === sourceWarehouseId)?.nameAr || "";
  const destName = warehouses?.find((w) => w.id === destWarehouseId)?.nameAr || "";

  return {
    sourceWarehouseId, setSourceWarehouseId,
    destWarehouseId, setDestWarehouseId,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    warehouses,
    queryEnabled, isFetching, handleQuery,
    queried,
    lines, visibleLines,
    excludeCovered, setExcludeCovered,
    sortDestAsc, setSortDestAsc,
    sortSourceAsc, setSortSourceAsc,
    bulkThreshold, setBulkThreshold,
    bulkOp, setBulkOp,
    bulkField, setBulkField,
    handleExcludeItem, handleBulkExclude, handleResetExclusions,
    handleQtyChange, handleFillSuggested,
    handleCreateTransfer, isCreating: createTransferMutation.isPending,
    linesWithQty, totalItems, excludedCount,
    sourceName, destName,
  };
}
