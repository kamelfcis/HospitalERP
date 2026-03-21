import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

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
  salesInvoiceCount: number;
  returnsTotal: number;
  returnInvoiceCount: number;
  netTotal: number;
  transferredToTreasury: number;
  variance: number;
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
          {Array.from({ length: 13 }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function SummaryTable({ rows, isLoading }: SummaryTableProps) {
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
                <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                  لا توجد ورديات تطابق معايير البحث
                </TableCell>
              </TableRow>
            ) : (
              rows.map(row => (
                <TableRow key={row.shiftId} className="hover:bg-muted/30" data-testid={`row-shift-${row.shiftId}`}>
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
                  <TableCell className="text-right tabular-nums text-blue-700 dark:text-blue-400" data-testid={`text-credit-${row.shiftId}`}>
                    {fmtMoney(row.creditSalesTotal)}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
