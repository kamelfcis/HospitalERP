/**
 * ReceivingRegistry — سجل أذونات الاستلام (تبويب السجل)
 *
 * فلتر + جدول + pagination.
 * لا يحمل أي حالة form — orchestrator فقط يمرر ما يحتاجه.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw, Search, X, ChevronLeft, ChevronRight, Eye, Trash2 } from "lucide-react";
import { Loader2 } from "lucide-react";
import { formatDateShort } from "@/lib/formatters";
import { receivingStatusLabels } from "@shared/schema";
import type { ReceivingHeaderWithDetails, Warehouse } from "@shared/schema";
import { SupplierCombobox } from "@/components/SupplierCombobox";

interface Props {
  warehouses: Warehouse[];
  onOpen:   (id: string) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string) => void;
  onCorrect: (id: string) => void;
  deletePending:  boolean;
  correctPending: boolean;
  convertPending: boolean;
}

const PAGE_SIZE = 20;

export function ReceivingRegistry({
  warehouses,
  onOpen, onDelete, onConvert, onCorrect,
  deletePending, correctPending, convertPending,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [filterFromDate, setFilterFromDate]     = useState(today);
  const [filterToDate, setFilterToDate]         = useState(today);
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterWarehouseId, setFilterWarehouseId] = useState("");
  const [filterStatus, setFilterStatus]         = useState("ALL");
  const [filterSearch, setFilterSearch]         = useState("");
  const [debouncedSearch, setDebouncedSearch]   = useState("");
  const [page, setPage]                         = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(filterSearch.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [filterSearch]);

  const buildQS = () => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filterFromDate) p.set("fromDate", filterFromDate);
    if (filterToDate)   p.set("toDate", filterToDate);
    if (filterSupplierId && filterSupplierId !== "all") p.set("supplierId", filterSupplierId);
    if (filterWarehouseId && filterWarehouseId !== "all") p.set("warehouseId", filterWarehouseId);
    if (filterStatus && filterStatus !== "ALL") p.set("statusFilter", filterStatus);
    if (debouncedSearch) p.set("search", debouncedSearch);
    return p.toString();
  };

  const { data, isLoading } = useQuery<{ data: ReceivingHeaderWithDetails[]; total: number; totalCostSum: string }>({
    queryKey: ["/api/receivings", page, filterFromDate, filterToDate, filterSupplierId, filterWarehouseId, filterStatus, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/receivings?${buildQS()}`);
      if (!res.ok) throw new Error("فشل جلب السجل");
      return res.json();
    },
  });

  const receivings     = data?.data       || [];
  const total          = data?.total      || 0;
  const totalCostSum   = parseFloat(data?.totalCostSum || "0");
  const totalPages     = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleReset = () => {
    setFilterFromDate(today); setFilterToDate(today);
    setFilterSupplierId(""); setFilterWarehouseId("");
    setFilterStatus("ALL"); setFilterSearch("");
    setDebouncedSearch(""); setPage(1);
  };

  return (
    <div className="space-y-2" dir="rtl">
      {/* ── فلاتر ── */}
      <div className="peachtree-toolbar peachtree-toolbar-stack space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* بحث نصي */}
          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input type="text" value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); setPage(1); }}
              placeholder="ابحث برقم فاتورة المورد أو اسم المورد"
              className="h-7 text-[11px] pr-7 pl-7" data-testid="filter-search" />
            {filterSearch && (
              <button type="button" onClick={() => { setFilterSearch(""); setDebouncedSearch(""); setPage(1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="button-clear-search">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* من / إلى */}
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground whitespace-nowrap">من</Label>
            <Input type="date" value={filterFromDate} onChange={(e) => { setFilterFromDate(e.target.value); setPage(1); }}
              className="h-7 text-[11px] px-1 w-[120px]" data-testid="filter-from-date" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground whitespace-nowrap">إلى</Label>
            <Input type="date" value={filterToDate} onChange={(e) => { setFilterToDate(e.target.value); setPage(1); }}
              className="h-7 text-[11px] px-1 w-[120px]" data-testid="filter-to-date" />
          </div>
          {/* مورد */}
          <div className="w-[200px]" data-testid="filter-supplier">
            <SupplierCombobox
              value={filterSupplierId}
              onChange={(v) => { setFilterSupplierId(v); setPage(1); }}
              placeholder="كل الموردين"
              className="h-7 text-[11px]"
              clearable
            />
          </div>
          {/* مستودع */}
          <Select value={filterWarehouseId || "all"} onValueChange={(v) => { setFilterWarehouseId(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-7 text-[11px] px-1 w-[140px]" data-testid="filter-warehouse">
              <SelectValue placeholder="كل المستودعات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المستودعات</SelectItem>
              {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouseCode} - {w.nameAr}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* حالة */}
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="h-7 text-[11px] px-1 w-[180px]" data-testid="filter-status">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">الكل</SelectItem>
              <SelectItem value="DRAFT">مسودة</SelectItem>
              <SelectItem value="POSTED">تم الترحيل فقط</SelectItem>
              <SelectItem value="CONVERTED">تم التحويل إلى فاتورة شراء</SelectItem>
              <SelectItem value="CORRECTED">مُصحَّح</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-reset-filters">
            <RotateCcw className="h-3 w-3 ml-1" /> إعادة تعيين
          </Button>
        </div>
        {filterFromDate && filterToDate && filterFromDate > filterToDate && (
          <p className="text-[10px] text-destructive" data-testid="text-date-error">
            تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية
          </p>
        )}
      </div>

      {/* ── جدول السجل ── */}
      <div className="peachtree-grid">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]" dir="rtl" data-testid="table-receiving-log">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th className="py-1 px-2 text-right font-medium">رقم الاستلام</th>
                    <th className="py-1 px-2 text-right font-medium">التاريخ</th>
                    <th className="py-1 px-2 text-right font-medium">المورد</th>
                    <th className="py-1 px-2 text-right font-medium">فاتورة المورد</th>
                    <th className="py-1 px-2 text-right font-medium">المستودع</th>
                    <th className="py-1 px-2 text-right font-medium">الحالة</th>
                    <th className="py-1 px-2 text-right font-medium">الإجمالي</th>
                    <th className="py-1 px-2 text-right font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {receivings.length > 0 ? receivings.map((r) => (
                    <tr key={r.id} className="peachtree-grid-row" data-testid={`row-receiving-${r.id}`}>
                      <td className="py-1 px-2 font-mono">{r.receivingNumber}</td>
                      <td className="py-1 px-2">{formatDateShort(r.receiveDate)}</td>
                      <td className="py-1 px-2">{r.supplier?.nameAr || "—"}</td>
                      <td className="py-1 px-2">{r.supplierInvoiceNo}</td>
                      <td className="py-1 px-2">{r.warehouse?.nameAr || "—"}</td>
                      <td className="py-1 px-2">
                        <div className="flex items-center gap-1">
                          <StatusBadge status={r.status} />
                          {r.convertedToInvoiceId && (
                            <Badge variant="default" className="text-[9px] bg-blue-600 no-default-hover-elevate no-default-active-elevate">تم التحويل</Badge>
                          )}
                          {r.correctionStatus === "corrected" && (
                            <Badge variant="default" className="text-[9px] bg-orange-600 no-default-hover-elevate no-default-active-elevate">مُصحَّح</Badge>
                          )}
                          {r.correctionStatus === "correction" && (
                            <Badge variant="default" className="text-[9px] bg-purple-600 no-default-hover-elevate no-default-active-elevate">تصحيح</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 font-mono">
                        {parseFloat(r.totalCost || "0").toFixed(2)}
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" onClick={() => onOpen(r.id)} data-testid={`button-open-receiving-${r.id}`}>
                            <Eye className="h-3 w-3 ml-1" /> فتح
                          </Button>
                          {r.status === "draft" && (
                            <Button variant="outline" size="sm" disabled={deletePending}
                              onClick={() => onDelete(r.id)} data-testid={`button-delete-draft-${r.id}`}>
                              {deletePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 ml-1" />}
                              حذف
                            </Button>
                          )}
                          {r.status === "posted_qty_only" && !r.convertedToInvoiceId && (
                            <Button variant="outline" size="sm" disabled={convertPending}
                              onClick={() => onConvert(r.id)} data-testid={`button-convert-${r.id}`}>
                              {convertPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              تحويل إلى فاتورة
                            </Button>
                          )}
                          {r.status === "posted_qty_only" && r.correctionStatus !== "corrected" && (
                            <Button variant="outline" size="sm" disabled={correctPending}
                              onClick={() => onCorrect(r.id)} data-testid={`button-correct-${r.id}`}>
                              {correctPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              تصحيح
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-muted-foreground">
                        لا توجد أذونات استلام مسجلة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── إجمالي السجل الكلي ── */}
            {!isLoading && total > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30 text-[11px]" dir="rtl" data-testid="row-receiving-totals">
                <span className="text-muted-foreground">
                  إجمالي عدد الأذونات: <span className="font-semibold text-foreground">{total}</span>
                </span>
                <span className="font-semibold text-foreground">
                  إجمالي أذونات الاستلام:{" "}
                  <span className="font-mono text-primary" data-testid="text-total-cost-sum">
                    {totalCostSum.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </span>
              </div>
            )}

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-2 text-[11px]">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="button-prev-page">
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <span className="text-muted-foreground">صفحة {page} من {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} data-testid="button-next-page">
                  <ChevronLeft className="h-3 w-3" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPosted = status === "posted" || status === "posted_qty_only";
  return isPosted ? (
    <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">
      {receivingStatusLabels[status as keyof typeof receivingStatusLabels] || status}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[9px]">
      {receivingStatusLabels[status as keyof typeof receivingStatusLabels] || status}
    </Badge>
  );
}
