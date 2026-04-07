import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, FileText, Search } from "lucide-react";
import { DetailModal } from "./DetailModal";
import type { ReturnRecord } from "./types";

const todayStr = () => new Date().toISOString().slice(0, 10);

export function HistoryTab() {
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate,   setToDate]   = useState(todayStr);
  const [search,   setSearch]   = useState("");
  const [viewId,   setViewId]   = useState<string | null>(null);
  const [page,     setPage]     = useState(1);

  const { data, isLoading } = useQuery<{ returns: ReturnRecord[]; total: number }>({
    queryKey: ["/api/purchase-returns", { fromDate, toDate, search, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate)   params.set("toDate",   toDate);
      if (search)   params.set("search",   search);
      return fetch(`/api/purchase-returns?${params}`).then(r => r.json());
    },
  });

  const returns = data?.returns ?? [];

  const handleClear = () => {
    setFromDate(todayStr());
    setToDate(todayStr());
    setSearch("");
    setPage(1);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-muted/30 p-3 rounded-lg">
        {/* Date range — من first (right), إلى second (left) in RTL */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">من تاريخ</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm"
            data-testid="filter-from-date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
          <Input
            type="date"
            value={toDate}
            onChange={e => { setToDate(e.target.value); setPage(1); }}
            className="h-8 w-36 text-sm"
            data-testid="filter-to-date"
          />
        </div>

        {/* Free-text search */}
        <div className="space-y-1 flex-1 min-w-[180px]">
          <Label className="text-xs text-muted-foreground">بحث (مورد / فاتورة مورد / رقم فاتورة)</Label>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ابحث…"
              className="h-8 text-sm pr-7"
              data-testid="filter-search"
            />
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={handleClear} data-testid="btn-clear-filters">
          <RotateCcw className="h-4 w-4 ml-1" /> مسح
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : returns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">لا توجد مرتجعات مشتريات.</div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-right p-3">رقم المرتجع</th>
                <th className="text-right p-3">التاريخ</th>
                <th className="text-right p-3">المورد</th>
                <th className="text-right p-3">فاتورة الشراء</th>
                <th className="text-right p-3">فاتورة المورد</th>
                <th className="text-right p-3">المخزن</th>
                <th className="text-center p-3">قبل الضريبة</th>
                <th className="text-center p-3">ض.ق.م</th>
                <th className="text-center p-3">الإجمالي</th>
                <th className="text-center p-3">القيد</th>
                <th className="text-center p-3"></th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => (
                <tr
                  key={r.id}
                  className="border-b hover:bg-muted/20 cursor-pointer"
                  onClick={() => setViewId(r.id)}
                  data-testid={`row-return-${r.id}`}
                >
                  <td className="p-3 font-mono">RT-{String(r.returnNumber).padStart(4, "0")}</td>
                  <td className="p-3">{formatDateShort(r.returnDate)}</td>
                  <td className="p-3">{r.supplierNameAr}</td>
                  <td className="p-3 font-mono">#{r.invoiceNumber}</td>
                  <td className="p-3 font-mono text-muted-foreground">{r.supplierInvoiceNo || "—"}</td>
                  <td className="p-3">{r.warehouseNameAr}</td>
                  <td className="p-3 text-center">{formatCurrency(r.subtotal)}</td>
                  <td className="p-3 text-center">{formatCurrency(r.taxTotal)}</td>
                  <td className="p-3 text-center font-medium text-primary">{formatCurrency(r.grandTotal)}</td>
                  <td className="p-3 text-center">
                    <Badge
                      variant={r.journalStatus === "posted" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {r.journalStatus === "posted" ? "مُرحَّل" : r.journalStatus ?? "—"}
                    </Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Button variant="ghost" size="sm" data-testid={`btn-view-return-${r.id}`}>
                      <FileText className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(data?.total ?? 0) > 50 && (
        <div className="flex justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page >= Math.ceil((data?.total ?? 0) / 50)}
            onClick={() => setPage(p => p + 1)}
          >
            التالي
          </Button>
          <span className="text-sm text-muted-foreground py-1 px-2">
            صفحة {page} من {Math.ceil((data?.total ?? 0) / 50)}
          </span>
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            السابق
          </Button>
        </div>
      )}

      {viewId && <DetailModal returnId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}
