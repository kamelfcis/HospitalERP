/**
 * InvoiceRegistry — قائمة فواتير الشراء
 *
 * تعرض قائمة مرقمة مع فلاتر (تاريخ، مورد، حالة) وتصفح صفحات.
 * عند النقر على فاتورة → navigate إلى ?id=...
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Eye, Trash2, Loader2, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateShort, formatNumber } from "@/lib/formatters";
import { purchaseInvoiceStatusLabels } from "@shared/schema";
import type { Supplier, PurchaseInvoiceWithDetails } from "@shared/schema";

interface Props {
  suppliers: Supplier[];
}

const PAGE_SIZE = 20;

export function InvoiceRegistry({ suppliers }: Props) {
  const { toast }    = useToast();
  const [, navigate] = useLocation();

  const [filterDateFrom,   setFilterDateFrom]   = useState("");
  const [filterDateTo,     setFilterDateTo]     = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [filterStatus,     setFilterStatus]     = useState("all");
  const [page,             setPage]             = useState(1);
  const [confirmDeleteId,  setConfirmDeleteId]  = useState<string | null>(null);

  // ── قائمة الفواتير ────────────────────────────────────────────────────────
  const qsParams = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (filterStatus     !== "all") qsParams.set("status",     filterStatus);
  if (filterSupplierId !== "all") qsParams.set("supplierId", filterSupplierId);
  if (filterDateFrom) qsParams.set("dateFrom", filterDateFrom);
  if (filterDateTo)   qsParams.set("dateTo",   filterDateTo);

  const { data: listData, isLoading } = useQuery<{ data: PurchaseInvoiceWithDetails[]; total: number }>({
    queryKey: [`/api/purchase-invoices?${qsParams}`],
  });

  const invoices    = listData?.data  || [];
  const totalPages  = Math.max(1, Math.ceil((listData?.total || 0) / PAGE_SIZE));

  // ── حذف ──────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/purchase-invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم الحذف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      setConfirmDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    },
  });

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.nameAr || "";

  return (
    <div className="p-4 space-y-2" dir="rtl">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-bold text-foreground">فواتير الشراء</h1>
        <span className="text-xs text-muted-foreground">({listData?.total || 0} فاتورة)</span>
      </div>

      {/* ── فلاتر ───────────────────────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap text-[12px]">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">من:</span>
          <input type="date" value={filterDateFrom}
            onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
            className="peachtree-input w-[130px]" data-testid="input-filter-date-from" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">إلى:</span>
          <input type="date" value={filterDateTo}
            onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
            className="peachtree-input w-[130px]" data-testid="input-filter-date-to" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">المورد:</span>
          <select value={filterSupplierId}
            onChange={(e) => { setFilterSupplierId(e.target.value); setPage(1); }}
            className="peachtree-select min-w-[140px]" data-testid="select-filter-supplier">
            <option value="all">الكل</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">الحالة:</span>
          <select value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="peachtree-select" data-testid="select-filter-status">
            <option value="all">الكل</option>
            <option value="draft">مسودة</option>
            <option value="approved_costed">مُعتمد ومُسعّر</option>
          </select>
        </div>
      </div>

      {/* ── الجدول ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-invoices">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="py-1 px-2 text-right whitespace-nowrap">#</th>
                <th className="py-1 px-2 text-right whitespace-nowrap">رقم الفاتورة</th>
                <th className="py-1 px-2 text-right whitespace-nowrap">المورد</th>
                <th className="py-1 px-2 text-right whitespace-nowrap">رقم فاتورة المورد</th>
                <th className="py-1 px-2 text-right whitespace-nowrap">التاريخ</th>
                <th className="py-1 px-2 text-right whitespace-nowrap">الحالة</th>
                <th className="py-1 px-2 text-right whitespace-nowrap">الإجمالي</th>
                <th className="py-1 px-2 text-right whitespace-nowrap">صافي المستحق</th>
                <th className="py-1 px-2 text-center whitespace-nowrap">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr key={inv.id} className="peachtree-grid-row" data-testid={`row-invoice-${inv.id}`}>
                  <td className="py-0.5 px-2 text-center">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="py-0.5 px-2 text-center font-mono">{inv.invoiceNumber}</td>
                  <td className="py-0.5 px-2">{inv.supplier?.nameAr || supplierName(inv.supplierId)}</td>
                  <td className="py-0.5 px-2 text-center">{inv.supplierInvoiceNo}</td>
                  <td className="py-0.5 px-2 text-center">{formatDateShort(inv.invoiceDate)}</td>
                  <td className="py-0.5 px-2 text-center">
                    <Badge
                      className={inv.status === "approved_costed" ? "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" : ""}
                      variant={inv.status === "draft" ? "secondary" : "default"}
                      data-testid={`badge-status-${inv.id}`}
                    >
                      {purchaseInvoiceStatusLabels[inv.status] || inv.status}
                    </Badge>
                  </td>
                  <td className="py-0.5 px-2 text-center peachtree-amount">{formatNumber(inv.totalAfterVat)}</td>
                  <td className="py-0.5 px-2 text-center peachtree-amount font-bold">{formatNumber(inv.netPayable)}</td>
                  <td className="py-0.5 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon"
                        onClick={() => navigate(`/purchase-invoices?id=${inv.id}`)}
                        data-testid={`button-view-${inv.id}`}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      {inv.status === "draft" && (
                        <Button variant="ghost" size="icon"
                          onClick={() => setConfirmDeleteId(inv.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${inv.id}`}>
                          {deleteMutation.isPending && deleteMutation.variables === inv.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Trash2 className="h-3 w-3 text-destructive" />}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={9} className="text-center text-muted-foreground py-6">لا توجد فواتير</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── تصفح الصفحات ────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Button variant="outline" size="sm" disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page">
            <ChevronRight className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">
            <ChevronLeft className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* ── تأكيد الحذف ─────────────────────────────────────────────────── */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} data-testid="button-cancel-delete">إلغاء</Button>
            <Button variant="destructive"
              onClick={() => { if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId); }}
              disabled={deleteMutation.isPending} data-testid="button-confirm-delete">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              تأكيد الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
