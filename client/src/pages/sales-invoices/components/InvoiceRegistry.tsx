import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Plus, ShoppingCart, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber, formatDateShort } from "@/lib/formatters";
import { salesInvoiceStatusLabels, customerTypeLabels } from "@shared/schema";
import type { SalesInvoiceWithDetails, Warehouse } from "@shared/schema";
import { useMemo } from "react";

// Minimal type matching /api/sales-invoices/pharmacists — no users.view required
interface PharmacistOption { id: string; fullName: string; role: string; }

interface RegistryTotals {
  subtotal: number;
  discountValue: number;
  netTotal: number;
}

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
  filterPharmacistId: string;
  filterWarehouseId: string;
  filterSearch: string;
  listLoading: boolean;
  deletePending: boolean;
  deleteVariables: string | undefined;
  confirmDeleteId: string | null;
  warehouses: Warehouse[] | undefined;
  pharmacistUsers: PharmacistOption[];
  totals: RegistryTotals;
  seedLoading: boolean;
  quickTestLoading: boolean;
  onSetPage: (p: number) => void;
  onSetFilterDateFrom: (v: string) => void;
  onSetFilterDateTo: (v: string) => void;
  onSetFilterStatus: (v: string) => void;
  onSetFilterCustomerType: (v: string) => void;
  onSetFilterPharmacistId: (v: string) => void;
  onSetFilterWarehouseId: (v: string) => void;
  onSetFilterSearch: (v: string) => void;
  canCreate?: boolean;
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
  filterDateFrom, filterDateTo, filterStatus, filterCustomerType, filterPharmacistId, filterWarehouseId, filterSearch,
  listLoading, deletePending, deleteVariables, confirmDeleteId,
  warehouses, pharmacistUsers, totals,
  seedLoading, quickTestLoading,
  canCreate = true,
  onSetPage, onSetFilterDateFrom, onSetFilterDateTo, onSetFilterStatus, onSetFilterCustomerType, onSetFilterPharmacistId, onSetFilterWarehouseId, onSetFilterSearch,
  onNewInvoice, onOpenInvoice, onDeleteClick, onConfirmDelete, onCancelDelete, onSeedDemo, onQuickTest,
}: Props) {
  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.nameAr || "";

  // ملخص الصيادلة — يُحسب من بيانات الصفحة الحالية
  const pharmacistSummary = useMemo(() => {
    const map = new Map<string, { name: string; count: number; subtotal: number; discountValue: number; netTotal: number; itemCount: number }>();
    for (const inv of invoices) {
      const row = inv as SalesInvoiceWithDetails & { pharmacistName?: string; itemCount?: number };
      const name = row.pharmacistName || "—";
      const key = name;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        existing.subtotal += parseFloat(String(inv.subtotal)) || 0;
        existing.discountValue += parseFloat(String(inv.discountValue)) || 0;
        existing.netTotal += parseFloat(String(inv.netTotal)) || 0;
        existing.itemCount += row.itemCount || 0;
      } else {
        map.set(key, {
          name,
          count: 1,
          subtotal: parseFloat(String(inv.subtotal)) || 0,
          discountValue: parseFloat(String(inv.discountValue)) || 0,
          netTotal: parseFloat(String(inv.netTotal)) || 0,
          itemCount: row.itemCount || 0,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.netTotal - a.netTotal);
  }, [invoices]);

  const hasInvoices = invoices.length > 0;

  return (
    <div className="p-4 space-y-3" dir="rtl">

      {/* شريط العنوان + الأزرار */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-bold text-foreground">فواتير البيع</h1>
          <span className="text-xs text-muted-foreground">({totalInvoices} فاتورة)</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canCreate && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* شريط الفلاتر */}
      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap text-[12px]">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">من:</span>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => { onSetFilterDateFrom(e.target.value); onSetPage(1); }}
            className="peachtree-input w-[130px]"
            data-testid="input-filter-date-from"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">إلى:</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => { onSetFilterDateTo(e.target.value); onSetPage(1); }}
            className="peachtree-input w-[130px]"
            data-testid="input-filter-date-to"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">الحالة:</span>
          <select
            value={filterStatus}
            onChange={(e) => { onSetFilterStatus(e.target.value); onSetPage(1); }}
            className="peachtree-select"
            data-testid="select-filter-status"
          >
            <option value="all">الكل</option>
            <option value="draft">مسودة</option>
            <option value="finalized">نهائي</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">نوع العميل:</span>
          <select
            value={filterCustomerType}
            onChange={(e) => { onSetFilterCustomerType(e.target.value); onSetPage(1); }}
            className="peachtree-select"
            data-testid="select-filter-customer-type"
          >
            <option value="all">الكل</option>
            <option value="cash">نقدي</option>
            <option value="credit">آجل</option>
            <option value="contract">تعاقد</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">الصيدلي:</span>
          <select
            value={filterPharmacistId}
            onChange={(e) => { onSetFilterPharmacistId(e.target.value); onSetPage(1); }}
            className="peachtree-select min-w-[130px]"
            data-testid="select-filter-pharmacist"
          >
            <option value="all">الكل</option>
            {pharmacistUsers.map(u => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">المخزن:</span>
          <select
            value={filterWarehouseId}
            onChange={(e) => { onSetFilterWarehouseId(e.target.value); onSetPage(1); }}
            className="peachtree-select min-w-[130px]"
            data-testid="select-filter-warehouse"
          >
            <option value="all">الكل</option>
            {(warehouses || []).map(w => (
              <option key={w.id} value={w.id}>{w.nameAr}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => onSetFilterSearch(e.target.value)}
            placeholder="بحث..."
            className="peachtree-input w-[150px]"
            data-testid="input-filter-search"
          />
        </div>
      </div>

      {/* الجدول */}
      {listLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : (
        <div className="overflow-auto rounded border border-border">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-invoices">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="w-8">#</th>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>الصيدلي</th>
                <th>نوع العميل</th>
                <th>العميل</th>
                <th>المخزن</th>
                <th className="text-center">عدد الأصناف</th>
                <th className="text-center">الإجمالي</th>
                <th className="text-center">الخصم</th>
                <th className="text-center">الصافي</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => {
                const row = inv as SalesInvoiceWithDetails & { pharmacistName?: string; itemCount?: number; warehouse?: Warehouse };
                return (
                  <tr
                    key={inv.id}
                    className="peachtree-grid-row cursor-pointer"
                    onClick={() => onOpenInvoice(inv.id)}
                    data-testid={`row-invoice-${inv.id}`}
                  >
                    <td className="text-center">{(page - 1) * pageSize + i + 1}</td>
                    <td className="text-center font-mono">{inv.invoiceNumber}</td>
                    <td className="text-center">{formatDateShort(inv.invoiceDate)}</td>
                    <td className="text-right">{row.pharmacistName || "—"}</td>
                    <td className="text-center">{customerTypeLabels[inv.customerType] || inv.customerType}</td>
                    <td>{inv.customerName || "—"}</td>
                    <td>{row.warehouse?.nameAr || warehouseName(inv.warehouseId)}</td>
                    <td className="text-center font-medium">{row.itemCount ?? 0}</td>
                    <td className="text-center peachtree-amount">{formatNumber(inv.subtotal)}</td>
                    <td className="text-center peachtree-amount">{formatNumber(inv.discountValue)}</td>
                    <td className="text-center peachtree-amount font-bold">{formatNumber(inv.netTotal)}</td>
                    <td className="text-center">{statusBadge(inv.status)}</td>
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {canCreate && inv.status === "draft" && (
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
                );
              })}

              {invoices.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center text-muted-foreground py-6">لا توجد فواتير</td>
                </tr>
              )}
            </tbody>

            {/* صف الإجماليات */}
            {hasInvoices && (
              <tfoot>
                <tr className="bg-muted/60 border-t-2 border-border font-bold text-[12px]">
                  <td colSpan={8} className="text-right px-3 py-1.5 text-muted-foreground">
                    إجمالي الصفحة ({invoices.length} فاتورة)
                  </td>
                  <td className="text-center peachtree-amount px-3 py-1.5">{formatNumber(totals.subtotal)}</td>
                  <td className="text-center peachtree-amount px-3 py-1.5 text-orange-600">{formatNumber(totals.discountValue)}</td>
                  <td className="text-center peachtree-amount px-3 py-1.5 text-green-700">{formatNumber(totals.netTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ترقيم الصفحات */}
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

      {/* ملخص بالصيدلي */}
      {hasInvoices && pharmacistSummary.length > 0 && (
        <div className="rounded border border-border overflow-hidden">
          <div className="bg-muted/40 px-3 py-1.5 text-[11px] font-bold text-muted-foreground border-b border-border">
            ملخص حسب الصيدلي
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-muted/20 border-b border-border text-muted-foreground">
                <th className="text-right px-3 py-1.5 font-medium">الصيدلي</th>
                <th className="text-center px-3 py-1.5 font-medium">عدد الفواتير</th>
                <th className="text-center px-3 py-1.5 font-medium">عدد الأصناف</th>
                <th className="text-center px-3 py-1.5 font-medium">الإجمالي</th>
                <th className="text-center px-3 py-1.5 font-medium">الخصم</th>
                <th className="text-center px-3 py-1.5 font-medium">الصافي</th>
              </tr>
            </thead>
            <tbody>
              {pharmacistSummary.map((row, i) => (
                <tr
                  key={row.name}
                  className={i % 2 === 0 ? "bg-background" : "bg-muted/10"}
                  data-testid={`row-pharmacist-summary-${i}`}
                >
                  <td className="text-right px-3 py-1">{row.name}</td>
                  <td className="text-center px-3 py-1">{row.count}</td>
                  <td className="text-center px-3 py-1">{row.itemCount}</td>
                  <td className="text-center px-3 py-1 peachtree-amount">{formatNumber(row.subtotal)}</td>
                  <td className="text-center px-3 py-1 peachtree-amount text-orange-600">{formatNumber(row.discountValue)}</td>
                  <td className="text-center px-3 py-1 peachtree-amount font-bold text-green-700">{formatNumber(row.netTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* مربع حوار تأكيد الحذف */}
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
