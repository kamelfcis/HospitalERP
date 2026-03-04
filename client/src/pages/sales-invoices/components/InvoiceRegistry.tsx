import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Plus, ShoppingCart, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber, formatDateShort } from "@/lib/formatters";
import { salesInvoiceStatusLabels, customerTypeLabels } from "@shared/schema";
import type { SalesInvoiceWithDetails, Warehouse } from "@shared/schema";

interface Props {
  invoices: SalesInvoiceWithDetails[];
  totalInvoices: number;
  totalPages: number;
  page: number;
  pageSize: number;
  filterDateFrom: string;
  filterDateTo: string;
  filterStatus: string;
  filterCustomerType: string;
  filterSearch: string;
  listLoading: boolean;
  deletePending: boolean;
  deleteVariables: string | undefined;
  confirmDeleteId: string | null;
  warehouses: Warehouse[] | undefined;
  seedLoading: boolean;
  quickTestLoading: boolean;
  onSetPage: (p: number) => void;
  onSetFilterDateFrom: (v: string) => void;
  onSetFilterDateTo: (v: string) => void;
  onSetFilterStatus: (v: string) => void;
  onSetFilterCustomerType: (v: string) => void;
  onSetFilterSearch: (v: string) => void;
  onNewInvoice: () => void;
  onOpenInvoice: (id: string) => void;
  onDeleteClick: (id: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onSeedDemo: () => void;
  onQuickTest: () => void;
}

function statusBadge(status: string) {
  const label = salesInvoiceStatusLabels[status] || status;
  if (status === "finalized")
    return <Badge className="bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{label}</Badge>;
  if (status === "cancelled")
    return <Badge className="bg-red-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{label}</Badge>;
  return <Badge variant="secondary" data-testid="badge-status">{label}</Badge>;
}

export function InvoiceRegistry({
  invoices, totalInvoices, totalPages, page, pageSize,
  filterDateFrom, filterDateTo, filterStatus, filterCustomerType, filterSearch,
  listLoading, deletePending, deleteVariables, confirmDeleteId,
  warehouses, seedLoading, quickTestLoading,
  onSetPage, onSetFilterDateFrom, onSetFilterDateTo, onSetFilterStatus, onSetFilterCustomerType, onSetFilterSearch,
  onNewInvoice, onOpenInvoice, onDeleteClick, onConfirmDelete, onCancelDelete, onSeedDemo, onQuickTest,
}: Props) {
  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.nameAr || "";

  return (
    <div className="p-4 space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-bold text-foreground">فواتير البيع</h1>
          <span className="text-xs text-muted-foreground">({totalInvoices} فاتورة)</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={onSeedDemo} disabled={seedLoading} data-testid="button-seed-demo">
            {seedLoading ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : null}
            Seed Demo Data
          </Button>
          <Button size="sm" variant="outline" onClick={onQuickTest} disabled={quickTestLoading} data-testid="button-quick-test">
            {quickTestLoading ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : null}
            Quick Test Invoice
          </Button>
          <Button size="sm" onClick={onNewInvoice} data-testid="button-new-invoice">
            <Plus className="h-3 w-3 ml-1" />
            فاتورة جديدة
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap text-[12px]">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">من:</span>
          <input type="date" value={filterDateFrom} onChange={(e) => { onSetFilterDateFrom(e.target.value); onSetPage(1); }} className="peachtree-input w-[130px]" data-testid="input-filter-date-from" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">إلى:</span>
          <input type="date" value={filterDateTo} onChange={(e) => { onSetFilterDateTo(e.target.value); onSetPage(1); }} className="peachtree-input w-[130px]" data-testid="input-filter-date-to" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">الحالة:</span>
          <select value={filterStatus} onChange={(e) => { onSetFilterStatus(e.target.value); onSetPage(1); }} className="peachtree-select" data-testid="select-filter-status">
            <option value="all">الكل</option>
            <option value="draft">مسودة</option>
            <option value="finalized">نهائي</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">نوع العميل:</span>
          <select value={filterCustomerType} onChange={(e) => { onSetFilterCustomerType(e.target.value); onSetPage(1); }} className="peachtree-select" data-testid="select-filter-customer-type">
            <option value="all">الكل</option>
            <option value="cash">نقدي</option>
            <option value="credit">آجل</option>
            <option value="contract">تعاقد</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <input type="text" value={filterSearch} onChange={(e) => onSetFilterSearch(e.target.value)} placeholder="بحث..." className="peachtree-input w-[160px]" data-testid="input-filter-search" />
        </div>
      </div>

      {listLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-invoices">
            <thead>
              <tr className="peachtree-grid-header">
                <th>#</th>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>نوع العميل</th>
                <th>العميل</th>
                <th>المخزن</th>
                <th>الإجمالي</th>
                <th>الخصم</th>
                <th>الصافي</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr
                  key={inv.id}
                  className="peachtree-grid-row cursor-pointer"
                  onClick={() => onOpenInvoice(inv.id)}
                  data-testid={`row-invoice-${inv.id}`}
                >
                  <td className="text-center">{(page - 1) * pageSize + i + 1}</td>
                  <td className="text-center font-mono">{inv.invoiceNumber}</td>
                  <td className="text-center">{formatDateShort(inv.invoiceDate)}</td>
                  <td className="text-center">{customerTypeLabels[inv.customerType] || inv.customerType}</td>
                  <td>{inv.customerName || "-"}</td>
                  <td>{(inv as any).warehouse?.nameAr || warehouseName(inv.warehouseId)}</td>
                  <td className="text-center peachtree-amount">{formatNumber(inv.subtotal)}</td>
                  <td className="text-center peachtree-amount">{formatNumber(inv.discountValue)}</td>
                  <td className="text-center peachtree-amount font-bold">{formatNumber(inv.netTotal)}</td>
                  <td className="text-center">{statusBadge(inv.status)}</td>
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {inv.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteClick(inv.id)}
                          disabled={deletePending}
                          data-testid={`button-delete-${inv.id}`}
                        >
                          {deletePending && deleteVariables === inv.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3 text-destructive" />
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-muted-foreground py-6">لا توجد فواتير</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onSetPage(page - 1)} data-testid="button-prev-page">
            <ChevronRight className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onSetPage(page + 1)} data-testid="button-next-page">
            <ChevronLeft className="h-3 w-3" />
          </Button>
        </div>
      )}

      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) onCancelDelete(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onCancelDelete} data-testid="button-cancel-delete">إلغاء</Button>
            <Button variant="destructive" onClick={onConfirmDelete} disabled={deletePending} data-testid="button-confirm-delete">
              {deletePending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              تأكيد الحذف
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
