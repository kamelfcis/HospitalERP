import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PrepLine } from "../types";
import { getMajorToMinor, toMajor, toMinor } from "../types";

export function useTransferCreation(
  sourceWarehouseId: string,
  destWarehouseId: string,
  getVisibleLines: () => PrepLine[],
) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const mutation = useMutation({
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
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateTransfer = useCallback(
    async (transferDate: string) => {
      const visibleLines = getVisibleLines();
      const errors: string[] = [];

      const itemsToTransfer = visibleLines
        .filter((l) => parseFloat(l._transferQty) > 0)
        .map((l) => {
          const m2m = getMajorToMinor(l);
          const enteredMajor = parseFloat(l._transferQty);
          const enteredMinor = toMinor(enteredMajor, m2m);
          const srcStockMinor = parseFloat(l.source_stock) || 0;
          const cappedMinor = Math.min(enteredMinor, srcStockMinor);

          if (enteredMinor > srcStockMinor) {
            errors.push(
              `${l.name_ar}: الكمية (${enteredMajor}) أكبر من رصيد المصدر (${toMajor(srcStockMinor, m2m)}) — تم تعديلها إلى ${toMajor(cappedMinor, m2m)}`,
            );
          }
          return { line: l, m2m, cappedMinor };
        })
        .filter((x) => x.cappedMinor > 0);

      if (itemsToTransfer.length === 0) {
        toast({ title: "تنبيه", description: "لا توجد أصناف بكميات للتحويل", variant: "destructive" });
        return;
      }
      if (errors.length > 0) {
        toast({ title: "تم تعديل بعض الكميات", description: errors.join("\n"), variant: "default" });
      }

      const fefoResults = await Promise.all(
        itemsToTransfer.map(async ({ line, m2m, cappedMinor }) => {
          try {
            const params = new URLSearchParams({
              itemId: line.item_id,
              warehouseId: sourceWarehouseId,
              requiredQtyInMinor: String(cappedMinor),
              asOfDate: transferDate,
            });
            const res = await fetch(`/api/transfer/fefo-preview?${params}`, { credentials: "include" });
            if (!res.ok) throw new Error("FEFO preview failed");
            const preview = await res.json();
            return { line, m2m, allocations: preview.allocations as any[] };
          } catch {
            return {
              line, m2m,
              allocations: [{ allocatedQty: String(cappedMinor), expiryMonth: null, expiryYear: null, expiryDate: null }],
            };
          }
        }),
      );

      let lineNo = 0;
      const transferLines: any[] = [];

      for (const { line, m2m, allocations } of fefoResults) {
        for (const alloc of allocations) {
          const allocMinor = parseFloat(alloc.allocatedQty) || 0;
          if (allocMinor <= 0) continue;
          lineNo++;
          transferLines.push({
            itemId: line.item_id,
            unitLevel: m2m > 1 ? "major" : "minor",
            qtyEntered: String(toMajor(allocMinor, m2m)),
            qtyInMinor: String(allocMinor),
            selectedExpiryDate: alloc.expiryDate || null,
            expiryMonth: alloc.expiryMonth || null,
            expiryYear: alloc.expiryYear || null,
            lineNo,
            notes: "",
          });
        }
      }

      if (transferLines.length === 0) {
        toast({ title: "تنبيه", description: "لا توجد أصناف بكميات للتحويل", variant: "destructive" });
        return;
      }

      mutation.mutate({
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        lines: transferLines,
      });
    },
    [getVisibleLines, sourceWarehouseId, destWarehouseId, mutation, toast],
  );

  return { handleCreateTransfer, isCreating: mutation.isPending };
}
