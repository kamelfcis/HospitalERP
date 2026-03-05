import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Warehouse } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Search,
  Trash2,
  ArrowLeftRight,
  Loader2,
  ArrowUpDown,
  Filter,
  FileSpreadsheet,
} from "lucide-react";

interface PrepItem {
  item_id: string;
  item_code: string;
  name_ar: string;
  has_expiry: boolean;
  minor_unit_name: string | null;
  major_unit_name: string | null;
  medium_unit_name: string | null;
  major_to_minor: string | null;
  medium_to_minor: string | null;
  total_sold: string;
  source_stock: string;
  dest_stock: string;
  nearest_expiry: string | null;
}

interface PrepLine extends PrepItem {
  _excluded: boolean;
  _transferQty: string;
}

function formatQtyInUnit(qtyMinor: number, majorToMinor: number | null, majorName: string | null, minorName: string | null): string {
  if (majorToMinor && majorToMinor > 1 && majorName) {
    const major = Math.floor(qtyMinor / majorToMinor);
    const remainder = qtyMinor % majorToMinor;
    if (major > 0 && remainder > 0) {
      return `${major} ${majorName} + ${remainder} ${minorName || "وحدة"}`;
    }
    if (major > 0) return `${major} ${majorName}`;
  }
  return `${qtyMinor} ${minorName || "وحدة"}`;
}

export default function TransferPreparation() {
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
  const [bulkOp, setBulkOp] = useState<"gt" | "lt" | "eq">("gt");
  const [bulkField, setBulkField] = useState<"dest_stock" | "source_stock" | "total_sold">("dest_stock");

  const transferDateRef = useRef<HTMLInputElement>(null);

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const queryEnabled = !!sourceWarehouseId && !!destWarehouseId && !!dateFrom && !!dateTo && sourceWarehouseId !== destWarehouseId;

  const { isFetching, refetch } = useQuery<PrepItem[]>({
    queryKey: ["/api/transfer-preparation/query", sourceWarehouseId, destWarehouseId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({
        sourceWarehouseId,
        destWarehouseId,
        dateFrom,
        dateTo,
      });
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
        setLines(result.data.map((item) => ({
          ...item,
          _excluded: false,
          _transferQty: "",
        })));
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
    setLines((prev) => prev.map((l) => l.item_id === itemId ? { ...l, _excluded: true } : l));
  }, []);

  const handleBulkExclude = useCallback(() => {
    const threshold = parseFloat(bulkThreshold);
    if (isNaN(threshold)) {
      toast({ title: "تنبيه", description: "أدخل رقماً صحيحاً", variant: "destructive" });
      return;
    }
    setLines((prev) => prev.map((l) => {
      if (l._excluded) return l;
      const val = parseFloat(l[bulkField]) || 0;
      let match = false;
      if (bulkOp === "gt") match = val > threshold;
      else if (bulkOp === "lt") match = val < threshold;
      else match = Math.abs(val - threshold) < 0.01;
      return match ? { ...l, _excluded: true } : l;
    }));
    toast({ title: "تم", description: "تم استبعاد الأصناف المطابقة" });
  }, [bulkThreshold, bulkOp, bulkField, toast]);

  const handleResetExclusions = useCallback(() => {
    setLines((prev) => prev.map((l) => ({ ...l, _excluded: false })));
  }, []);

  const handleQtyChange = useCallback((itemId: string, val: string) => {
    setLines((prev) => prev.map((l) => l.item_id === itemId ? { ...l, _transferQty: val } : l));
  }, []);

  const handleFillSuggested = useCallback(() => {
    setLines((prev) => prev.map((l) => {
      if (l._excluded) return l;
      const destStock = parseFloat(l.dest_stock) || 0;
      const totalSold = parseFloat(l.total_sold) || 0;
      const sourceStock = parseFloat(l.source_stock) || 0;
      const needed = Math.max(0, totalSold - destStock);
      const suggested = Math.min(needed, sourceStock);
      return { ...l, _transferQty: suggested > 0 ? String(suggested) : "" };
    }));
    toast({ title: "تم", description: "تم ملء الكميات المقترحة (الناقص بحد أقصى رصيد المصدر)" });
  }, [toast]);

  const createTransferMutation = useMutation({
    mutationFn: async (payload: { transferDate: string; sourceWarehouseId: string; destinationWarehouseId: string; lines: any[] }) => {
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

  const handleCreateTransfer = useCallback(() => {
    const errors: string[] = [];
    const transferLines = visibleLines
      .filter((l) => {
        const qty = parseFloat(l._transferQty);
        return qty > 0;
      })
      .map((l, idx) => {
        const entered = parseFloat(l._transferQty);
        const sourceStock = parseFloat(l.source_stock) || 0;
        const capped = Math.min(entered, sourceStock);
        if (entered > sourceStock) {
          errors.push(`${l.name_ar}: الكمية (${entered}) أكبر من رصيد المصدر (${sourceStock}) — تم تعديلها إلى ${capped}`);
        }
        return {
          itemId: l.item_id,
          unitLevel: "minor",
          qtyEntered: capped,
          qtyInMinor: capped,
          lineNo: idx + 1,
          notes: "",
        };
      })
      .filter((l) => l.qtyEntered > 0);

    if (transferLines.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد أصناف بكميات للتحويل", variant: "destructive" });
      return;
    }

    if (errors.length > 0) {
      toast({ title: "تم تعديل بعض الكميات", description: errors.join("\n"), variant: "default" });
    }

    const transferDate = transferDateRef.current?.value || new Date().toISOString().split("T")[0];

    createTransferMutation.mutate({
      transferDate,
      sourceWarehouseId,
      destinationWarehouseId: destWarehouseId,
      lines: transferLines,
    });
  }, [visibleLines, sourceWarehouseId, destWarehouseId, createTransferMutation, toast]);

  const linesWithQty = visibleLines.filter((l) => parseFloat(l._transferQty) > 0).length;
  const totalItems = lines.filter((l) => !l._excluded).length;
  const excludedCount = lines.filter((l) => l._excluded).length;

  const sourceName = warehouses?.find((w) => w.id === sourceWarehouseId)?.nameAr || "";
  const destName = warehouses?.find((w) => w.id === destWarehouseId)?.nameAr || "";

  return (
    <div className="p-4 space-y-4" dir="rtl" data-testid="page-transfer-preparation">
      <h1 className="text-xl font-bold" data-testid="text-page-title">إعداد إذن تحويل</h1>

      {/* Setup Form */}
      <div className="border rounded-lg p-4 bg-card space-y-3" data-testid="section-setup">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs">المخزن المصدر (الرئيسي)</Label>
            <Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId} data-testid="select-source-warehouse">
              <SelectTrigger data-testid="trigger-source-warehouse">
                <SelectValue placeholder="اختر المخزن المصدر" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.filter((w) => w.isActive).map((w) => (
                  <SelectItem key={w.id} value={w.id} data-testid={`option-source-${w.id}`}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">المخزن المحوّل إليه (الصيدلية / منفذ البيع)</Label>
            <Select value={destWarehouseId} onValueChange={setDestWarehouseId} data-testid="select-dest-warehouse">
              <SelectTrigger data-testid="trigger-dest-warehouse">
                <SelectValue placeholder="اختر المخزن الوجهة" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.filter((w) => w.isActive && w.id !== sourceWarehouseId).map((w) => (
                  <SelectItem key={w.id} value={w.id} data-testid={`option-dest-${w.id}`}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-date-from" />
          </div>

          <div>
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-date-to" />
          </div>

          <div>
            <Button
              onClick={handleQuery}
              disabled={!queryEnabled || isFetching}
              className="w-full"
              data-testid="button-query"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Search className="h-4 w-4 ml-1" />}
              استعلام
            </Button>
          </div>
        </div>
      </div>

      {queried && (
        <>
          {/* Filters & Bulk Actions */}
          <div className="border rounded-lg p-3 bg-card space-y-3" data-testid="section-filters">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="excludeCovered"
                  checked={excludeCovered}
                  onCheckedChange={(v) => setExcludeCovered(!!v)}
                  data-testid="checkbox-exclude-covered"
                />
                <Label htmlFor="excludeCovered" className="text-xs cursor-pointer">
                  استبعاد الأصناف التي رصيد الوجهة يغطي كمية البيع
                </Label>
              </div>

              <div className="flex items-center gap-1 border rounded px-2 py-1">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">حذف جماعي:</span>
                <Select value={bulkField} onValueChange={(v) => setBulkField(v as any)}>
                  <SelectTrigger className="h-7 text-xs w-[110px]" data-testid="select-bulk-field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dest_stock">رصيد الوجهة</SelectItem>
                    <SelectItem value="source_stock">رصيد المصدر</SelectItem>
                    <SelectItem value="total_sold">كمية البيع</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={bulkOp} onValueChange={(v) => setBulkOp(v as any)}>
                  <SelectTrigger className="h-7 text-xs w-[70px]" data-testid="select-bulk-op">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">أكبر من</SelectItem>
                    <SelectItem value="lt">أقل من</SelectItem>
                    <SelectItem value="eq">يساوي</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={bulkThreshold}
                  onChange={(e) => setBulkThreshold(e.target.value)}
                  className="h-7 w-[80px] text-xs"
                  placeholder="الكمية"
                  data-testid="input-bulk-threshold"
                />
                <Button size="sm" variant="outline" onClick={handleBulkExclude} className="h-7 text-xs" data-testid="button-bulk-exclude">
                  تطبيق
                </Button>
              </div>

              {excludedCount > 0 && (
                <Button size="sm" variant="ghost" onClick={handleResetExclusions} className="h-7 text-xs" data-testid="button-reset-exclusions">
                  إلغاء الاستبعاد ({excludedCount})
                </Button>
              )}

              <Button size="sm" variant="outline" onClick={handleFillSuggested} className="h-7 text-xs" data-testid="button-fill-suggested">
                <FileSpreadsheet className="h-3.5 w-3.5 ml-1" />
                ملء الكميات المقترحة
              </Button>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>إجمالي الأصناف: {totalItems}</span>
              <span>المعروض: {visibleLines.length}</span>
              {excludedCount > 0 && <span className="text-orange-500">مستبعد: {excludedCount}</span>}
              {linesWithQty > 0 && <span className="text-green-600">بكميات تحويل: {linesWithQty}</span>}
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto border rounded-lg" data-testid="section-results">
            <table className="w-full text-[12px]" dir="rtl" data-testid="table-preparation">
              <thead>
                <tr className="peachtree-grid-header">
                  <th className="py-1 px-2 text-center w-8">#</th>
                  <th className="py-1 px-2 text-right font-bold">اسم الصنف</th>
                  <th className="py-1 px-2 text-right whitespace-nowrap">كود الصنف</th>
                  <th className="py-1 px-2 text-right whitespace-nowrap">الوحدة</th>
                  <th className="py-1 px-2 text-center whitespace-nowrap">كمية البيع</th>
                  <th
                    className="py-1 px-2 text-center whitespace-nowrap cursor-pointer select-none"
                    onClick={() => { setSortSourceAsc((prev) => prev === null ? true : prev ? false : null); setSortDestAsc(null); }}
                    data-testid="th-source-stock-sort"
                  >
                    <span className="inline-flex items-center gap-0.5">
                      رصيد المصدر
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th
                    className="py-1 px-2 text-center whitespace-nowrap cursor-pointer select-none"
                    onClick={() => { setSortDestAsc((prev) => prev === null ? true : prev ? false : null); setSortSourceAsc(null); }}
                    data-testid="th-dest-stock-sort"
                  >
                    <span className="inline-flex items-center gap-0.5">
                      رصيد الوجهة
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th className="py-1 px-2 text-center whitespace-nowrap">أقرب صلاحية (مصدر)</th>
                  <th className="py-1 px-2 text-center whitespace-nowrap">الكمية المحوّلة</th>
                  <th className="py-1 px-2 text-center whitespace-nowrap">تنبيه</th>
                  <th className="py-1 px-2 text-center w-8">حذف</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.length > 0 ? (
                  visibleLines.map((line, idx) => {
                    const totalSold = parseFloat(line.total_sold) || 0;
                    const sourceStock = parseFloat(line.source_stock) || 0;
                    const destStock = parseFloat(line.dest_stock) || 0;
                    const transferQty = parseFloat(line._transferQty) || 0;
                    const majorToMinor = parseFloat(line.major_to_minor || "0") || null;

                    const sourceInsufficient = sourceStock <= 0;
                    const transferExceedsSource = transferQty > sourceStock;
                    const destCoversNeed = destStock >= totalSold;

                    return (
                      <tr
                        key={line.item_id}
                        className={`border-b hover:bg-muted/30 ${sourceInsufficient ? "opacity-50" : ""}`}
                        data-testid={`row-prep-${idx}`}
                      >
                        <td className="py-0.5 px-2 text-center text-muted-foreground">{idx + 1}</td>
                        <td className="py-0.5 px-2 font-medium" data-testid={`text-item-name-${idx}`}>{line.name_ar}</td>
                        <td className="py-0.5 px-2 text-muted-foreground" data-testid={`text-item-code-${idx}`}>{line.item_code}</td>
                        <td className="py-0.5 px-2 whitespace-nowrap">{line.minor_unit_name || "وحدة"}</td>
                        <td className="py-0.5 px-2 text-center font-semibold">{totalSold}</td>
                        <td className={`py-0.5 px-2 text-center ${sourceInsufficient ? "text-red-500 font-bold" : ""}`}>
                          {sourceStock > 0 ? formatQtyInUnit(sourceStock, majorToMinor, line.major_unit_name, line.minor_unit_name) : "0"}
                        </td>
                        <td className={`py-0.5 px-2 text-center ${destCoversNeed ? "text-green-600" : "text-orange-500"}`}>
                          {formatQtyInUnit(destStock, majorToMinor, line.major_unit_name, line.minor_unit_name)}
                        </td>
                        <td className="py-0.5 px-2 text-center text-muted-foreground whitespace-nowrap">
                          {line.nearest_expiry ? new Date(line.nearest_expiry).toLocaleDateString("ar-EG", { year: "numeric", month: "short" }) : "—"}
                        </td>
                        <td className="py-0.5 px-1 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={line._transferQty}
                            onChange={(e) => handleQtyChange(line.item_id, e.target.value)}
                            className={`h-7 w-[80px] text-xs text-center mx-auto ${transferExceedsSource ? "border-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
                            disabled={sourceInsufficient}
                            placeholder="0"
                            data-testid={`input-transfer-qty-${idx}`}
                          />
                        </td>
                        <td className="py-0.5 px-2 text-center" data-testid={`cell-warning-${idx}`}>
                          <div className="flex gap-0.5 items-center justify-center">
                            {sourceInsufficient && (
                              <span title="لا يوجد رصيد في المخزن المصدر" className="text-red-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                            {transferExceedsSource && !sourceInsufficient && (
                              <span title={`الكمية المحوّلة (${transferQty}) أكبر من رصيد المصدر (${sourceStock})`} className="text-orange-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-0.5 px-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleExcludeItem(line.item_id)}
                            data-testid={`button-exclude-${idx}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-muted-foreground">
                      {lines.length === 0 ? "لا توجد بيانات مبيعات في الفترة المختارة" : "جميع الأصناف مستبعدة أو مغطاة"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Action Footer */}
          {visibleLines.length > 0 && (
            <div className="border rounded-lg p-4 bg-card" data-testid="section-action">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div>
                    <Label className="text-xs">تاريخ التحويل</Label>
                    <Input
                      type="date"
                      ref={transferDateRef}
                      defaultValue={new Date().toISOString().split("T")[0]}
                      className="w-[160px]"
                      data-testid="input-transfer-date"
                    />
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">من: </span>
                    <span className="font-medium">{sourceName}</span>
                    <span className="text-muted-foreground mx-2">←</span>
                    <span className="text-muted-foreground">إلى: </span>
                    <span className="font-medium">{destName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {linesWithQty} صنف بكميات تحويل
                  </span>
                  <Button
                    onClick={handleCreateTransfer}
                    disabled={linesWithQty === 0 || createTransferMutation.isPending}
                    className="min-w-[160px]"
                    data-testid="button-create-transfer"
                  >
                    {createTransferMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-1" />
                    ) : (
                      <ArrowLeftRight className="h-4 w-4 ml-1" />
                    )}
                    إنشاء إذن تحويل
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
