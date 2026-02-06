import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeftRight, Loader2, AlertTriangle, Check, Search, Package, Trash2, Send, Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateShort } from "@/lib/formatters";
import type { Warehouse, Item, StoreTransferWithDetails } from "@shared/schema";
import { transferStatusLabels, itemCategoryLabels, unitLevelLabels } from "@shared/schema";

interface FefoAllocation {
  lotId: string;
  expiryDate: string | null;
  availableQty: string;
  allocatedQty: string;
  unitCost: string;
}

interface FefoPreviewResponse {
  fulfilled: boolean;
  shortfall?: string;
  allocations: FefoAllocation[];
}

interface TransferLineRow {
  id: string;
  itemId: string;
  item: Item | null;
  searchText: string;
  unitLevel: string;
  qtyEntered: string;
  qtyInMinor: string;
  availableQty: string;
  fefoSummary: string;
  fefoFulfilled: boolean;
  notes: string;
  isLocked: boolean;
}

function createEmptyRow(): TransferLineRow {
  return {
    id: crypto.randomUUID(),
    itemId: "",
    item: null,
    searchText: "",
    unitLevel: "minor",
    qtyEntered: "1",
    qtyInMinor: "1",
    availableQty: "",
    fefoSummary: "",
    fefoFulfilled: false,
    notes: "",
    isLocked: false,
  };
}

function calculateQtyInMinor(qtyEntered: number, unitLevel: string, item: Item): number {
  if (unitLevel === "major" && item.majorToMinor) {
    return qtyEntered * parseFloat(item.majorToMinor);
  } else if (unitLevel === "medium" && item.mediumToMinor) {
    return qtyEntered * parseFloat(item.mediumToMinor);
  }
  return qtyEntered;
}

function getDefaultUnitLevel(item: Item): string {
  if (item.majorUnitName) return "major";
  return "minor";
}

function buildFefoSummary(preview: FefoPreviewResponse, item: Item | null): string {
  if (!preview.allocations || preview.allocations.length === 0) {
    return preview.fulfilled ? "متاح" : "غير متاح";
  }
  if (item && !item.hasExpiry) {
    const total = preview.allocations.reduce((s, a) => s + parseFloat(a.allocatedQty || "0"), 0);
    return `متاح: ${total}`;
  }
  return preview.allocations.map(a => {
    const exp = a.expiryDate ? formatDateShort(a.expiryDate) : "—";
    return `(${exp}) ${a.allocatedQty}`;
  }).join(" | ");
}

export default function StoreTransfers() {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [transferDate, setTransferDate] = useState(today);
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLineRow[]>([createEmptyRow()]);
  const [activeSearchRowId, setActiveSearchRowId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (activeSearchRowId) {
        const ref = dropdownRefs.current[activeSearchRowId];
        if (ref && !ref.contains(e.target as Node)) {
          setActiveSearchRowId(null);
          setSearchResults([]);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeSearchRowId]);

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: transfers, isLoading: transfersLoading } = useQuery<StoreTransferWithDetails[]>({
    queryKey: ["/api/transfers"],
  });

  const updateLine = useCallback((rowId: string, updates: Partial<TransferLineRow>) => {
    setLines(prev => prev.map(l => l.id === rowId ? { ...l, ...updates } : l));
  }, []);

  const fetchItemSearch = useCallback(async (query: string, warehouseId: string) => {
    if (!query || !warehouseId) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ query, warehouseId, limit: "10" });
      const res = await fetch(`/api/items/lookup?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data || []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = useCallback((rowId: string, value: string) => {
    updateLine(rowId, { searchText: value });
    setActiveSearchRowId(rowId);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchItemSearch(value, sourceWarehouseId);
    }, 300);
  }, [sourceWarehouseId, fetchItemSearch, updateLine]);

  const fetchAvailability = useCallback(async (itemId: string, warehouseId: string): Promise<string> => {
    try {
      const res = await fetch(`/api/items/${itemId}/availability?warehouseId=${encodeURIComponent(warehouseId)}`);
      if (res.ok) {
        const data = await res.json();
        return data.availableQtyMinor || "0";
      }
    } catch {}
    return "0";
  }, []);

  const fetchFefoPreview = useCallback(async (itemId: string, warehouseId: string, qtyInMinor: string, asOfDate: string, item: Item | null): Promise<{ summary: string; fulfilled: boolean }> => {
    try {
      const params = new URLSearchParams({
        itemId,
        warehouseId,
        requiredQtyInMinor: qtyInMinor,
        asOfDate,
      });
      const res = await fetch(`/api/transfer/fefo-preview?${params.toString()}`);
      if (res.ok) {
        const preview: FefoPreviewResponse = await res.json();
        return {
          summary: buildFefoSummary(preview, item),
          fulfilled: preview.fulfilled,
        };
      }
    } catch {}
    return { summary: "", fulfilled: false };
  }, []);

  const lockRow = useCallback(async (rowId: string, item: Item) => {
    const defaultUnit = getDefaultUnitLevel(item);
    const qtyEntered = 1;
    const qtyInMinor = calculateQtyInMinor(qtyEntered, defaultUnit, item);

    updateLine(rowId, {
      itemId: item.id,
      item,
      searchText: `${item.itemCode} - ${item.nameAr}`,
      unitLevel: defaultUnit,
      qtyEntered: "1",
      qtyInMinor: String(qtyInMinor),
      isLocked: true,
    });

    setActiveSearchRowId(null);
    setSearchResults([]);

    const [avail, fefo] = await Promise.all([
      fetchAvailability(item.id, sourceWarehouseId),
      fetchFefoPreview(item.id, sourceWarehouseId, String(qtyInMinor), transferDate, item),
    ]);

    updateLine(rowId, {
      availableQty: avail,
      fefoSummary: fefo.summary,
      fefoFulfilled: fefo.fulfilled,
    });

    setLines(prev => {
      const last = prev[prev.length - 1];
      if (last.isLocked || last.id === rowId) {
        return [...prev, createEmptyRow()];
      }
      return prev;
    });
  }, [sourceWarehouseId, transferDate, updateLine, fetchAvailability, fetchFefoPreview]);

  const handleBarcodeResolve = useCallback(async (rowId: string, value: string) => {
    try {
      const res = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(value)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.found && data.itemId) {
          const itemRes = await fetch(`/api/items/${data.itemId}`);
          if (itemRes.ok) {
            const item = await itemRes.json();
            await lockRow(rowId, item);
            return;
          }
        }
      }
    } catch {}
  }, [lockRow]);

  const handleSearchKeyDown = useCallback((rowId: string, e: React.KeyboardEvent, value: string) => {
    if (e.key === "Enter" && value) {
      e.preventDefault();
      handleBarcodeResolve(rowId, value);
    }
  }, [handleBarcodeResolve]);

  const handleSelectItem = useCallback((rowId: string, item: Item) => {
    lockRow(rowId, item);
  }, [lockRow]);

  const handleUnitChange = useCallback(async (rowId: string, newUnit: string) => {
    setLines(prev => {
      const line = prev.find(l => l.id === rowId);
      if (!line || !line.item) return prev;
      const qtyNum = parseFloat(line.qtyEntered) || 1;
      const newQtyInMinor = calculateQtyInMinor(qtyNum, newUnit, line.item);
      return prev.map(l => l.id === rowId ? { ...l, unitLevel: newUnit, qtyInMinor: String(newQtyInMinor) } : l);
    });

    const line = lines.find(l => l.id === rowId);
    if (line && line.item && sourceWarehouseId) {
      const qtyNum = parseFloat(line.qtyEntered) || 1;
      const newQtyInMinor = calculateQtyInMinor(qtyNum, newUnit, line.item);
      const fefo = await fetchFefoPreview(line.item.id, sourceWarehouseId, String(newQtyInMinor), transferDate, line.item);
      updateLine(rowId, { fefoSummary: fefo.summary, fefoFulfilled: fefo.fulfilled });
    }
  }, [lines, sourceWarehouseId, transferDate, fetchFefoPreview, updateLine]);

  const handleQtyChange = useCallback(async (rowId: string, newQty: string) => {
    setLines(prev => {
      const line = prev.find(l => l.id === rowId);
      if (!line || !line.item) return prev.map(l => l.id === rowId ? { ...l, qtyEntered: newQty } : l);
      const qtyNum = parseFloat(newQty) || 0;
      const newQtyInMinor = calculateQtyInMinor(qtyNum, line.unitLevel, line.item);
      return prev.map(l => l.id === rowId ? { ...l, qtyEntered: newQty, qtyInMinor: String(newQtyInMinor) } : l);
    });

    const line = lines.find(l => l.id === rowId);
    if (line && line.item && sourceWarehouseId) {
      const qtyNum = parseFloat(newQty) || 0;
      if (qtyNum > 0) {
        const newQtyInMinor = calculateQtyInMinor(qtyNum, line.unitLevel, line.item);
        const fefo = await fetchFefoPreview(line.item.id, sourceWarehouseId, String(newQtyInMinor), transferDate, line.item);
        updateLine(rowId, { fefoSummary: fefo.summary, fefoFulfilled: fefo.fulfilled });
      }
    }
  }, [lines, sourceWarehouseId, transferDate, fetchFefoPreview, updateLine]);

  const handleDeleteLine = useCallback((rowId: string) => {
    setLines(prev => {
      const filtered = prev.filter(l => l.id !== rowId);
      if (filtered.length === 0 || filtered.every(l => l.isLocked)) {
        return [...filtered, createEmptyRow()];
      }
      return filtered;
    });
  }, []);

  const lockedLines = lines.filter(l => l.isLocked && l.itemId);

  const canSaveDraft =
    !!transferDate &&
    !!sourceWarehouseId &&
    !!destWarehouseId &&
    sourceWarehouseId !== destWarehouseId &&
    lockedLines.length > 0;

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        notes: notes || undefined,
        lines: lockedLines.map(l => ({
          itemId: l.itemId,
          unitLevel: l.unitLevel,
          qtyEntered: l.qtyEntered,
          qtyInMinor: l.qtyInMinor,
        })),
      };
      return apiRequest("POST", "/api/transfers", payload);
    },
    onSuccess: () => {
      toast({ title: "تم حفظ المسودة بنجاح" });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في حفظ المسودة", description: error.message, variant: "destructive" });
    },
  });

  const postTransferMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        notes: notes || undefined,
        lines: lockedLines.map(l => ({
          itemId: l.itemId,
          unitLevel: l.unitLevel,
          qtyEntered: l.qtyEntered,
          qtyInMinor: l.qtyInMinor,
        })),
      };
      const createRes = await apiRequest("POST", "/api/transfers", payload);
      const created = await createRes.json();
      await apiRequest("POST", `/api/transfers/${created.id}/post`);
      return created;
    },
    onSuccess: () => {
      toast({ title: "تم ترحيل التحويل بنجاح" });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في ترحيل التحويل", description: error.message, variant: "destructive" });
    },
  });

  const postDraftMutation = useMutation({
    mutationFn: async (transferId: string) => {
      return apiRequest("POST", `/api/transfers/${transferId}/post`);
    },
    onSuccess: () => {
      toast({ title: "تم ترحيل التحويل بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في ترحيل التحويل", description: error.message, variant: "destructive" });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (transferId: string) => {
      return apiRequest("DELETE", `/api/transfers/${transferId}`);
    },
    onSuccess: () => {
      toast({ title: "تم حذف التحويل" });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في حذف التحويل", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTransferDate(today);
    setSourceWarehouseId("");
    setDestWarehouseId("");
    setNotes("");
    setLines([createEmptyRow()]);
    setActiveSearchRowId(null);
    setSearchResults([]);
  };

  const getConversionInfo = (item: Item, unitLevel: string): string => {
    if (unitLevel === "major" && item.majorUnitName && item.majorToMinor) {
      return `1 ${item.majorUnitName} = ${item.majorToMinor} ${item.minorUnitName || "وحدة صغرى"}`;
    }
    if (unitLevel === "medium" && item.mediumUnitName && item.mediumToMinor) {
      return `1 ${item.mediumUnitName} = ${item.mediumToMinor} ${item.minorUnitName || "وحدة صغرى"}`;
    }
    return "";
  };

  const isPending = saveDraftMutation.isPending || postTransferMutation.isPending;

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center justify-between flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">تحويل مخزني بين الأقسام</h1>
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground">حركة مخزنية فقط - بدون تسعير</span>
        </div>
      </div>

      <fieldset className="peachtree-grid p-2">
        <legend className="text-xs font-semibold px-1">بيانات التحويل</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">تاريخ التحويل</Label>
            <Input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="h-6 text-[11px] px-1"
              data-testid="input-transfer-date"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">مخزن المصدر</Label>
            <Select value={sourceWarehouseId} onValueChange={(val) => { setSourceWarehouseId(val); setLines([createEmptyRow()]); }}>
              <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-source-warehouse">
                <SelectValue placeholder="اختر المخزن" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.warehouseCode} - {w.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">مخزن الوجهة</Label>
            <Select value={destWarehouseId} onValueChange={setDestWarehouseId}>
              <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-dest-warehouse">
                <SelectValue placeholder="اختر المخزن" />
              </SelectTrigger>
              <SelectContent>
                {warehouses
                  ?.filter((w) => w.id !== sourceWarehouseId)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.warehouseCode} - {w.nameAr}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
              className="h-6 text-[11px] px-1"
              data-testid="input-transfer-notes"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="py-1 px-1 text-right font-medium min-w-[200px]">الصنف</th>
                <th className="py-1 px-1 text-right font-medium min-w-[100px]">الوحدة</th>
                <th className="py-1 px-1 text-right font-medium min-w-[70px]">الكمية</th>
                <th className="py-1 px-1 text-right font-medium min-w-[70px]">المتاح</th>
                <th className="py-1 px-1 text-right font-medium min-w-[180px]">FEFO</th>
                <th className="py-1 px-1 text-center font-medium min-w-[40px]">حذف</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const isEditing = !line.isLocked;
                const isLast = idx === lines.length - 1 && isEditing;

                return (
                  <tr key={line.id} className="peachtree-grid-row">
                    <td className="py-1 px-1 relative">
                      {line.isLocked ? (
                        <div className="flex items-center gap-1">
                          <Package className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="font-mono text-muted-foreground text-[9px]">{line.item?.itemCode}</span>
                          <span className="text-[10px] truncate">{line.item?.nameAr}</span>
                          {line.item && line.unitLevel !== "minor" && (
                            <span className="text-[8px] text-muted-foreground">
                              ({getConversionInfo(line.item, line.unitLevel)})
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          className="relative"
                          ref={(el) => { dropdownRefs.current[line.id] = el; }}
                        >
                          <div className="relative">
                            <Search className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                            <Input
                              type="text"
                              value={line.searchText}
                              onChange={(e) => handleSearchChange(line.id, e.target.value)}
                              onKeyDown={(e) => handleSearchKeyDown(line.id, e, line.searchText)}
                              onFocus={() => {
                                setActiveSearchRowId(line.id);
                                if (line.searchText) fetchItemSearch(line.searchText, sourceWarehouseId);
                              }}
                              placeholder={sourceWarehouseId ? "بحث بالكود أو الاسم أو الباركود" : "اختر المخزن أولاً"}
                              disabled={!sourceWarehouseId}
                              className="h-6 text-[11px] px-1 pr-5"
                              data-testid={`input-line-search-${line.id}`}
                            />
                          </div>
                          {activeSearchRowId === line.id && searchResults.length > 0 && (
                            <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                              {searchResults.map((item: any) => (
                                <button
                                  key={item.id}
                                  className="w-full text-right px-2 py-1 text-[11px] hover-elevate cursor-pointer flex items-center gap-2"
                                  onClick={() => handleSelectItem(line.id, item)}
                                  data-testid={`item-option-${item.id}`}
                                >
                                  <span className="font-mono text-muted-foreground">{item.itemCode}</span>
                                  <span className="flex-1 truncate">{item.nameAr}</span>
                                  {item.availableQtyMinor !== undefined && (
                                    <span className="text-[9px] text-muted-foreground">({item.availableQtyMinor})</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                          {activeSearchRowId === line.id && searchLoading && (
                            <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-lg p-2 text-center">
                              <Loader2 className="h-3 w-3 animate-spin inline-block" />
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-1 px-1">
                      {line.isLocked && line.item ? (
                        <Select
                          value={line.unitLevel}
                          onValueChange={(v) => handleUnitChange(line.id, v)}
                        >
                          <SelectTrigger className="h-6 text-[10px] px-1" data-testid={`select-line-unit-${line.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {line.item.majorUnitName && (
                              <SelectItem value="major">{line.item.majorUnitName}</SelectItem>
                            )}
                            {line.item.mediumUnitName && (
                              <SelectItem value="medium">{line.item.mediumUnitName}</SelectItem>
                            )}
                            <SelectItem value="minor">{line.item.minorUnitName || "وحدة صغرى"}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="py-1 px-1">
                      {line.isLocked ? (
                        <Input
                          type="number"
                          min="1"
                          value={line.qtyEntered}
                          onChange={(e) => handleQtyChange(line.id, e.target.value)}
                          className="h-6 text-[11px] px-1 w-16"
                          data-testid={`input-line-qty-${line.id}`}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="py-1 px-1">
                      {line.isLocked && line.availableQty ? (
                        <span className="text-[10px] font-mono">{line.availableQty}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="py-1 px-1">
                      {line.isLocked && line.fefoSummary ? (
                        <span className={`text-[9px] ${line.fefoFulfilled ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {line.fefoFulfilled ? (
                            <Check className="h-3 w-3 inline-block ml-1" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 inline-block ml-1" />
                          )}
                          {line.fefoSummary}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="py-1 px-1 text-center">
                      {line.isLocked && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleDeleteLine(line.id)}
                          data-testid={`button-delete-line-${line.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] gap-1 px-2"
            disabled={!canSaveDraft || isPending}
            onClick={() => saveDraftMutation.mutate()}
            data-testid="button-save-draft"
          >
            {saveDraftMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            حفظ كمسودة
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="text-[11px] gap-1 px-2"
            disabled={!canSaveDraft || isPending}
            onClick={() => postTransferMutation.mutate()}
            data-testid="button-post-transfer"
          >
            {postTransferMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            ترحيل التحويل
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="text-[11px] gap-1 px-2"
            onClick={resetForm}
            data-testid="button-cancel"
          >
            إلغاء
          </Button>

          {lockedLines.length > 0 && (
            <span className="text-[10px] text-muted-foreground mr-auto">
              {lockedLines.length} صنف مُضاف
            </span>
          )}
        </div>
      </fieldset>

      <fieldset className="peachtree-grid p-2">
        <legend className="text-xs font-semibold px-1">سجل التحويلات</legend>
        {transfersLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-[10px]" data-testid="table-transfer-history">
            <thead>
              <tr className="bg-muted/50">
                <th className="py-1 px-1 text-right font-medium">رقم التحويل</th>
                <th className="py-1 px-1 text-right font-medium">التاريخ</th>
                <th className="py-1 px-1 text-right font-medium">من مخزن</th>
                <th className="py-1 px-1 text-right font-medium">إلى مخزن</th>
                <th className="py-1 px-1 text-right font-medium">عدد الأصناف</th>
                <th className="py-1 px-1 text-right font-medium">الحالة</th>
                <th className="py-1 px-1 text-right font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {transfers && transfers.length > 0 ? (
                transfers.map((t) => (
                  <tr key={t.id} className="border-t" data-testid={`row-transfer-${t.id}`}>
                    <td className="py-1 px-1 font-mono">{t.transferNumber}</td>
                    <td className="py-1 px-1">{formatDateShort(t.transferDate)}</td>
                    <td className="py-1 px-1">{t.sourceWarehouse?.nameAr || "—"}</td>
                    <td className="py-1 px-1">{t.destinationWarehouse?.nameAr || "—"}</td>
                    <td className="py-1 px-1">{t.lines?.length || 0} أصناف</td>
                    <td className="py-1 px-1">
                      {t.status === "executed" ? (
                        <Badge variant="default" className="text-[9px] bg-green-600">
                          {transferStatusLabels[t.status] || t.status}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">
                          {transferStatusLabels[t.status] || t.status}
                        </Badge>
                      )}
                    </td>
                    <td className="py-1 px-1">
                      {t.status === "draft" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px] gap-1 px-1 h-5"
                            disabled={postDraftMutation.isPending}
                            onClick={() => postDraftMutation.mutate(t.id)}
                            data-testid={`button-post-draft-${t.id}`}
                          >
                            {postDraftMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            ترحيل
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px] gap-1 px-1 h-5"
                            disabled={deleteDraftMutation.isPending}
                            onClick={() => deleteDraftMutation.mutate(t.id)}
                            data-testid={`button-delete-draft-${t.id}`}
                          >
                            {deleteDraftMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            حذف
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted-foreground">
                    لا توجد تحويلات مسجلة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </fieldset>
    </div>
  );
}