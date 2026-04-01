import { memo, useCallback, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronLeft, Printer } from "lucide-react";
import { printShiftHandover, type ReceiptSettings } from "@/utils/receipt-printer";

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
  openingCash: number;
  cashSalesTotal: number;
  creditSalesTotal: number;
  creditCollected: number;
  supplierPaid: number;
  deliveryCollectedTotal: number;
  salesInvoiceCount: number;
  returnsTotal: number;
  returnInvoiceCount: number;
  netTotal: number;
  transferredToTreasury: number;
  variance: number;
  handoverReceiptNumber?: number | null;
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
  if (status === "stale")
    return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">متوقفة</Badge>;
  if (status === "closing")
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">في الإغلاق</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function LoadingRows() {
  return (
    <>
      {[1, 2, 3, 4, 5].map(i => (
        <TableRow key={i}>
          {Array.from({ length: 15 }).map((_, j) => (
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
      <TableCell colSpan={15} className="py-2 px-6">
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
  receiptSettings: ReceiptSettings | undefined;
}

const ShiftSummaryRow = memo(function ShiftSummaryRow({ row, isExpanded, onToggle, receiptSettings }: ShiftSummaryRowProps) {
  const hasCreditInvoices = (row.creditInvoices?.length ?? 0) > 0;

  const handlePrint = useCallback(() => {
    const settings = receiptSettings ?? { header: "", footer: "", logoText: "", autoPrint: false, showPreview: false };
    const expectedCash = row.openingCash + row.cashSalesTotal + row.creditCollected + row.deliveryCollectedTotal - row.returnsTotal - row.supplierPaid;
    printShiftHandover({
      receiptNumber:     row.handoverReceiptNumber ?? null,
      cashierName:       row.cashierName,
      unitName:          row.pharmacyName || "",
      openedAt:          row.openedAt,
      closedAt:          row.closedAt,
      openingCash:       row.openingCash,
      cashSales:         row.cashSalesTotal,
      creditSales:       row.creditSalesTotal,
      creditCollected:   row.creditCollected,
      deliveryCollected: row.deliveryCollectedTotal,
      returns:           row.returnsTotal,
      supplierPaid:      row.supplierPaid,
      netShift:          expectedCash,
      closingCash:       row.transferredToTreasury,
      variance:          row.variance,
    }, settings);
  }, [row, receiptSettings]);

  return (
    <Fragment>
      <TableRow className="hover:bg-muted/30" data-testid={`row-shift-${row.shiftId}`}>
        <TableCell className="font-mono text-xs" data-testid={`text-shift-id-${row.shiftId}`}>
          {row.handoverReceiptNumber != null ? (
            <div>
              <span className="font-bold text-sm text-foreground">
                # {String(row.handoverReceiptNumber).padStart(6, "0")}
              </span>
              <div className="text-muted-foreground">{shiftShortId(row.shiftId)}</div>
            </div>
          ) : (
            <span className="text-muted-foreground">{shiftShortId(row.shiftId)}</span>
          )}
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
          {fmtMoney(row.openingCash + row.cashSalesTotal + row.creditCollected + row.deliveryCollectedTotal - row.returnsTotal - row.supplierPaid)}
          <span className="block text-xs text-muted-foreground">
            {[
              row.openingCash > 0 && `افتتاح ${fmtMoney(row.openingCash)}`,
              `نقدي ${fmtMoney(row.cashSalesTotal)}`,
              row.creditCollected > 0 && `آجل ${fmtMoney(row.creditCollected)}`,
              row.deliveryCollectedTotal > 0 && `توصيل ${fmtMoney(row.deliveryCollectedTotal)}`,
              row.returnsTotal > 0 && `م. ${fmtMoney(row.returnsTotal)}`,
              row.supplierPaid > 0 && `مورد ${fmtMoney(row.supplierPaid)}`,
            ].filter(Boolean).join(" | ")}
          </span>
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
        <TableCell className="text-center">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handlePrint}
            title="طباعة إيصال التسليم"
            data-testid={`button-print-handover-${row.shiftId}`}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
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
  const { data: receiptSettings } = useQuery<ReceiptSettings>({
    queryKey: ["/api/receipt-settings"],
  });

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
              <TableHead className="text-right whitespace-nowrap font-semibold">المتوقع تسليمه</TableHead>
              <TableHead className="text-right whitespace-nowrap">محوّل للخزنة</TableHead>
              <TableHead className="text-center whitespace-nowrap">الحالة</TableHead>
              <TableHead className="text-center w-10">طباعة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingRows />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-12 text-muted-foreground">
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
                  receiptSettings={receiptSettings}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
