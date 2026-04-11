import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Printer } from "lucide-react";

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

interface StatementLine {
  txnDate:      string;
  sourceType:   string;
  sourceLabel:  string;
  sourceNumber: string;
  sourceRef:    string | null;
  description:  string;
  debit:        number;
  credit:       number;
  balance:      number;
}

interface SupplierStatementResult {
  supplierId:     string;
  nameAr:         string;
  code:           string;
  fromDate:       string;
  toDate:         string;
  openingBalance: number;
  lines:          StatementLine[];
  totalDebit:     number;
  totalCredit:    number;
  closingBalance: number;
}

const thisYear = new Date().getFullYear();
const firstOfYear = () => `${thisYear}-01-01`;
const today = () => new Date().toISOString().split("T")[0];

function balanceClass(val: number) {
  if (val > 0.005)  return "text-red-600 dark:text-red-400";
  if (val < -0.005) return "text-blue-600 dark:text-blue-400";
  return "text-green-600 dark:text-green-400";
}

export function StatementTab({ supplierId }: { supplierId: string }) {
  const [fromDate, setFromDate] = useState(firstOfYear());
  const [toDate,   setToDate]   = useState(today());

  const { data, isLoading, refetch } = useQuery<SupplierStatementResult>({
    queryKey: ["/api/supplier-payments/statement", supplierId, fromDate, toDate],
    queryFn:  async () => {
      const r = await fetch(
        `/api/supplier-payments/statement/${supplierId}?from=${fromDate}&to=${toDate}`,
        { credentials: "include" }
      );
      if (!r.ok) throw new Error("فشل تحميل كشف الحساب");
      return r.json();
    },
    enabled: !!supplierId,
    staleTime: 10_000,
  });

  const printDate = new Date().toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });

  const sourceTypeLabel: Record<string, string> = {
    purchase_invoice: "فاتورة شراء",
    purchase_return:  "مرتجع مشتريات",
    supplier_payment: "سداد",
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">

      <div className="flex items-center gap-2 flex-wrap shrink-0 no-print">
        <Label className="text-xs text-muted-foreground shrink-0">من:</Label>
        <Input
          type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="h-7 w-[130px] text-xs"
          data-testid="stmt-from"
        />
        <Label className="text-xs text-muted-foreground shrink-0">إلى:</Label>
        <Input
          type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="h-7 w-[130px] text-xs"
          data-testid="stmt-to"
        />
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          تحديث
        </Button>

        {data && (
          <>
            <div className="h-5 w-px bg-border mx-1" />
            <span className="text-xs text-muted-foreground">
              رصيد افتتاحي: <strong>{formatCurrency(String(data.openingBalance))}</strong>
            </span>
            <span className={cx("text-xs font-bold", balanceClass(data.closingBalance))}>
              الرصيد الختامي: {formatCurrency(String(data.closingBalance))}
              {data.closingBalance > 0.005 ? " (لصالح المورد)" : data.closingBalance < -0.005 ? " (لصالحنا)" : " (متوازن)"}
            </span>
            <div className="h-5 w-px bg-border mx-1" />
            <Button
              variant="outline" size="sm"
              className="h-7 px-2 text-xs gap-1 border-primary text-primary hover:bg-primary/10"
              onClick={() => window.print()}
              data-testid="button-print-statement"
            >
              <Printer className="h-3.5 w-3.5" />
              طباعة كشف الحساب
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground no-print">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>جارٍ تحميل كشف الحساب...</span>
        </div>
      ) : !data ? null : (
        <div className="flex-1 min-h-0 overflow-auto" id="stmt-print-area">

          <div className="hidden print:block mb-4 text-center">
            <h2 className="text-lg font-bold">كشف حساب مورد</h2>
            <p className="text-sm font-semibold mt-1">
              {data.nameAr} &mdash; كود: {data.code}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              الفترة من {formatDateShort(data.fromDate)} إلى {formatDateShort(data.toDate)}
              &nbsp;|&nbsp; تاريخ الطباعة: {printDate}
            </p>
            <div className="border-b border-gray-400 my-2" />
          </div>

          <div className="no-print flex gap-3 text-xs mb-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-muted">
              عدد السطور: <strong>{data.lines.length}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              إجمالي المدين: <strong>{formatCurrency(String(data.totalDebit))}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              إجمالي الدائن: <strong>{formatCurrency(String(data.totalCredit))}</strong>
            </span>
          </div>

          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm print:bg-gray-100">
              <TableRow>
                <TableHead className="text-right w-[90px] print:text-[11px]">التاريخ</TableHead>
                <TableHead className="text-right w-[110px] print:text-[11px]">نوع العملية</TableHead>
                <TableHead className="text-right w-[80px] print:text-[11px]">رقم المستند</TableHead>
                <TableHead className="text-right print:text-[11px]">رقم / مرجع</TableHead>
                <TableHead className="text-right print:text-[11px]">البيان</TableHead>
                <TableHead className="text-left w-[110px] print:text-[11px] text-red-700">مدين</TableHead>
                <TableHead className="text-left w-[110px] print:text-[11px] text-green-700">دائن</TableHead>
                <TableHead className="text-left w-[120px] print:text-[11px]">الرصيد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/30 font-semibold print:bg-gray-50">
                <TableCell className="print:text-[11px]">—</TableCell>
                <TableCell className="print:text-[11px]">رصيد افتتاحي</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="print:text-[11px]">
                  رصيد ما قبل {formatDateShort(fromDate)}
                </TableCell>
                <TableCell className="text-left font-mono print:text-[11px]">—</TableCell>
                <TableCell className="text-left font-mono print:text-[11px]">—</TableCell>
                <TableCell className={cx(
                  "text-left font-mono font-bold print:text-[11px]",
                  balanceClass(data.openingBalance)
                )}>
                  {formatCurrency(String(data.openingBalance))}
                </TableCell>
              </TableRow>

              {data.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد حركات في هذه الفترة
                  </TableCell>
                </TableRow>
              ) : (
                data.lines.map((line, idx) => (
                  <TableRow
                    key={idx}
                    className={cx(
                      "hover:bg-muted/30",
                      line.sourceType === "supplier_payment" ? "bg-green-50/50 dark:bg-green-950/20" :
                      line.sourceType === "purchase_return"  ? "bg-orange-50/50 dark:bg-orange-950/20" : ""
                    )}
                    data-testid={`stmt-row-${idx}`}
                  >
                    <TableCell className="font-mono print:text-[11px]">
                      {formatDateShort(line.txnDate)}
                    </TableCell>
                    <TableCell className="print:text-[11px]">
                      <Badge variant="outline" className={cx(
                        "text-[10px] px-1.5 font-normal print:border-0 print:p-0",
                        line.sourceType === "purchase_invoice" ? "border-blue-300 text-blue-700 bg-blue-50" :
                        line.sourceType === "purchase_return"  ? "border-orange-300 text-orange-700 bg-orange-50" :
                                                                  "border-green-300 text-green-700 bg-green-50"
                      )}>
                        {sourceTypeLabel[line.sourceType] ?? line.sourceLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono print:text-[11px]">
                      {line.sourceNumber}
                    </TableCell>
                    <TableCell className="text-muted-foreground print:text-[11px]">
                      {line.sourceRef ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate print:text-[11px]" title={line.description}>
                      {line.description}
                    </TableCell>
                    <TableCell className={cx(
                      "text-left font-mono print:text-[11px]",
                      line.debit > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"
                    )}>
                      {line.debit > 0 ? formatCurrency(String(line.debit)) : "—"}
                    </TableCell>
                    <TableCell className={cx(
                      "text-left font-mono print:text-[11px]",
                      line.credit > 0 ? "text-green-700 font-semibold" : "text-muted-foreground"
                    )}>
                      {line.credit > 0 ? formatCurrency(String(line.credit)) : "—"}
                    </TableCell>
                    <TableCell className={cx(
                      "text-left font-mono font-bold print:text-[11px]",
                      balanceClass(line.balance)
                    )}>
                      {formatCurrency(String(Math.abs(line.balance)))}
                      {" "}
                      <span className="text-[10px] font-normal opacity-70">
                        {line.balance > 0.005 ? "د" : line.balance < -0.005 ? "م" : ""}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter className="sticky bottom-0 bg-muted/90 backdrop-blur-sm print:bg-gray-100">
              <TableRow className="font-bold">
                <TableCell colSpan={5} className="text-right print:text-[11px]">
                  الإجمالي
                </TableCell>
                <TableCell className="text-left font-mono text-red-700 print:text-[11px]">
                  {formatCurrency(String(data.totalDebit))}
                </TableCell>
                <TableCell className="text-left font-mono text-green-700 print:text-[11px]">
                  {formatCurrency(String(data.totalCredit))}
                </TableCell>
                <TableCell className={cx(
                  "text-left font-mono font-bold print:text-[11px]",
                  balanceClass(data.closingBalance)
                )}>
                  {formatCurrency(String(Math.abs(data.closingBalance)))}
                  {" "}
                  <span className="text-[10px] font-normal opacity-70">
                    {data.closingBalance > 0.005 ? "دائن" : data.closingBalance < -0.005 ? "مدين" : "متوازن"}
                  </span>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          <div className="hidden print:flex mt-8 justify-between text-xs text-gray-600 px-4">
            <div className="text-center">
              <div className="border-t border-gray-400 pt-1 w-40">توقيع المدير المالي</div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 pt-1 w-40">توقيع المورد / ختمه</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
