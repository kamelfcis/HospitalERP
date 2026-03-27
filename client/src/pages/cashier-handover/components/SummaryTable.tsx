import { memo, useCallback, useState, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronLeft } from "lucide-react";

interface CreditInvoiceItem {
  invoiceId: string;
  invoiceNumber: number;
  customerName: string | null;
  netTotal: number;
  invoiceDate: string;
}

interface HandoverShiftRow {
  shiftId: string;
  shiftDate: string | null;
  openedAt: string;
  closedAt: string | null;
  cashierId: string;
  cashierName: string;
  pharmacyName: string | null;
  unitType: string;
  status: string;
  cashSalesTotal: number;
  creditSalesTotal: number;
  deliveryCollectedTotal: number;
  salesInvoiceCount: number;
  returnsTotal: number;
  returnInvoiceCount: number;
  netTotal: number;
  transferredToTreasury: number;
  variance: number;
  creditInvoices?: CreditInvoiceItem[];
}

interface SummaryTableProps {
  rows: HandoverShiftRow[];
  isLoading: boolean;
}

function fmtMoney(n: number) {
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function shiftShortId(id: string) {
  if (id.startsWith("ts-")) return id;
  return id.slice(0, 8).toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">مفتوحة</Badge>;
  if (status === "closed")
    return <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">مغلقة</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function LoadingRows() {
  return (
    <>
      {[1, 2, 3, 4, 5].map(i => (
        <TableRow key={i}>
          {Array.from({ length: 14 }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function CreditInvoicesSubRow({ items }: { items: CreditInvoiceItem[] }) {
  return (
    <TableRow className="bg-blue-50/60 dark:bg-blue-950/20">
      <TableCell colSpan={14} className="py-2 px-6">
        <div className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1.5">
          تفاصيل فواتير الآجل ({items.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {items.map(inv => (
            <div
              key={inv.invoiceId}
              className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded px-2 py-1 text-xs"
              data-testid={`credit-inv-${inv.invoiceId}`}
            >
              <span className="font-mono text-muted-foreground">#{inv.invoiceNumber}</span>
              <span className="font-medium">{inv.customerName || "—"}</span>
              <span className="tabular-nums text-blue-700 dark:text-blue-400 font-semibold">
                {fmtMoney(inv.netTotal)}
              </span>
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}

interface ShiftSummaryRowProps {
  row: HandoverShiftRow;
  isExpanded: boolean;
  onToggle: (shiftId: string) => void;
}

const ShiftSummaryRow = memo(function ShiftSummaryRow({ row, isExpanded, onToggle }: ShiftSummaryRowProps) {
  const hasCreditInvoices = (row.creditInvoices?.length ?? 0) > 0;
  return (
    <Fragment>
      <TableRow className="hover:bg-muted/30" data-testid={`row-shift-${row.shiftId}`}>
        <TableCell className="font-mono text-xs text-muted-foreground" data-testid={`text-shift-id-${row.shiftId}`}>
          {shiftShortId(row.shiftId)}
        </TableCell>
        <TableCell className="whitespace-nowrap" data-testid={`text-date-${row.shiftId}`}>
          {row.shiftDate ?? "—"}
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm" data-testid={`text-open-${row.shiftId}`}>
          {fmtTime(row.openedAt)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm" data-testid={`text-close-${row.shiftId}`}>
          {fmtTime(row.closedAt)}
        </TableCell>
        <TableCell className="whitespace-nowrap font-medium" data-testid={`text-cashier-${row.shiftId}`}>
          {row.cashierName}
          {row.pharmacyName && (
            <span className="block text-xs text-muted-foreground">{row.pharmacyName}</span>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums text-green-700 dark:text-green-400" data-testid={`text-cash-${row.shiftId}`}>
          {fmtMoney(row.cashSalesTotal)}
        </TableCell>
        <TableCell
          className={`text-right tabular-nums text-blue-700 dark:text-blue-400 ${hasCreditInvoices ? "cursor-pointer select-none" : ""}`}
          data-testid={`text-credit-${row.shiftId}`}
          onClick={hasCreditInvoices ? () => onToggle(row.shiftId) : undefined}
        >
          <span className="flex items-center justify-end gap-1">
            {fmtMoney(row.creditSalesTotal)}
            {hasCreditInvoices && (
              isExpanded
                ? <ChevronDown className="h-3 w-3 opacity-60" />
                : <ChevronLeft className="h-3 w-3 opacity-60" />
            )}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400" data-testid={`text-delivery-${row.shiftId}`}>
          {row.deliveryCollectedTotal > 0 ? fmtMoney(row.deliveryCollectedTotal) : "—"}
        </TableCell>
        <TableCell className="text-center tabular-nums" data-testid={`text-inv-count-${row.shiftId}`}>
          {row.salesInvoiceCount}
        </TableCell>
        <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400" data-testid={`text-returns-${row.shiftId}`}>
          {fmtMoney(row.returnsTotal)}
        </TableCell>
        <TableCell className="text-center tabular-nums" data-testid={`text-ret-count-${row.shiftId}`}>
          {row.returnInvoiceCount}
        </TableCell>
        <TableCell className="text-right tabular-nums font-semibold" data-testid={`text-net-${row.shiftId}`}>
          {fmtMoney(row.netTotal)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-violet-700 dark:text-violet-400" data-testid={`text-treasury-${row.shiftId}`}>
          {fmtMoney(row.transferredToTreasury)}
          {row.variance !== 0 && (
            <span className={`block text-xs ${row.variance > 0 ? "text-orange-500" : "text-red-500"}`}>
              فرق: {fmtMoney(Math.abs(row.variance))}
            </span>
          )}
        </TableCell>
        <TableCell className="text-center" data-testid={`text-status-${row.shiftId}`}>
          <StatusBadge status={row.status} />
        </TableCell>
      </TableRow>
      {hasCreditInvoices && isExpanded && (
        <CreditInvoicesSubRow items={row.creditInvoices!} />
      )}
    </Fragment>
  );
});

export function SummaryTable({ rows, isLoading }: SummaryTableProps) {
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());

  const toggleShift = useCallback((shiftId: string) => {
    setExpandedShifts(prev => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  }, []);

  return (
    <div className="rounded-lg border overflow-hidden" dir="rtl">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-right whitespace-nowrap">الوردية</TableHead>
              <TableHead className="text-right whitespace-nowrap">التاريخ</TableHead>
              <TableHead className="text-right whitespace-nowrap">فتح</TableHead>
              <TableHead className="text-right whitespace-nowrap">إغلاق</TableHead>
              <TableHead className="text-right whitespace-nowrap">الكاشير</TableHead>
              <TableHead className="text-right whitespace-nowrap">البيع النقدي</TableHead>
              <TableHead className="text-right whitespace-nowrap">الآجل/تعاقد</TableHead>
              <TableHead className="text-right whitespace-nowrap">تحصيل التوصيل</TableHead>
              <TableHead className="text-center whitespace-nowrap">فواتير</TableHead>
              <TableHead className="text-right whitespace-nowrap">المرتجع</TableHead>
              <TableHead className="text-center whitespace-nowrap">مرتجعات</TableHead>
              <TableHead className="text-right whitespace-nowrap font-semibold">الصافي</TableHead>
              <TableHead className="text-right whitespace-nowrap">محوّل للخزنة</TableHead>
              <TableHead className="text-center whitespace-nowrap">الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingRows />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                  لا توجد ورديات تطابق معايير البحث
                </TableCell>
              </TableRow>
            ) : (
              rows.map(row => (
                <ShiftSummaryRow
                  key={row.shiftId}
                  row={row}
                  isExpanded={expandedShifts.has(row.shiftId)}
                  onToggle={toggleShift}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
