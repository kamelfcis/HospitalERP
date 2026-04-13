/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CustomerStatementPanel — كشف حساب العميل
 *  مستخرج من customer-payments/index.tsx للتقليل من الحمل المعرفي على الصفحة الرئيسية
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Input }  from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { Label }  from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Printer } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { CustomerStatementResult }    from "./useCustomerPaymentsData";

// ─── local helpers ────────────────────────────────────────────────────────────

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

const srcLabel: Record<string, string> = {
  sales_invoice:    "فاتورة بيع",
  customer_receipt: "تحصيل",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  stmtFrom:        string;
  setStmtFrom:     (v: string) => void;
  stmtTo:          string;
  setStmtTo:       (v: string) => void;
  statementData:   CustomerStatementResult | undefined;
  stmtLoading:     boolean;
  refetchStatement: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerStatementPanel({
  stmtFrom, setStmtFrom,
  stmtTo, setStmtTo,
  statementData, stmtLoading,
  refetchStatement,
}: Props) {
  const printDate = new Date().toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });

  const balCls = (v: number) =>
    v > 0.005  ? "text-red-600 dark:text-red-400"
    : v < -0.005 ? "text-blue-600 dark:text-blue-400"
    : "text-green-600 dark:text-green-400";

  return (
    <div className="flex flex-col gap-2">

      {/* Controls bar */}
      <div className="flex items-center gap-2 flex-wrap no-print">
        <Label className="text-xs text-muted-foreground">من:</Label>
        <Input type="date" value={stmtFrom} onChange={(e) => setStmtFrom(e.target.value)}
          className="h-7 w-[130px] text-xs" data-testid="stmt-from" />
        <Label className="text-xs text-muted-foreground">إلى:</Label>
        <Input type="date" value={stmtTo} onChange={(e) => setStmtTo(e.target.value)}
          className="h-7 w-[130px] text-xs" data-testid="stmt-to" />
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => refetchStatement()}>
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </Button>
        {statementData && (
          <>
            <div className="h-5 w-px bg-border mx-1" />
            <span className="text-xs text-muted-foreground">
              رصيد افتتاحي: <strong>{formatCurrency(String(statementData.openingBalance))}</strong>
            </span>
            <span className={cx("text-xs font-bold", balCls(statementData.closingBalance))}>
              الرصيد الختامي: {formatCurrency(String(Math.abs(statementData.closingBalance)))}
              {statementData.closingBalance > 0.005
                ? " (على العميل)"
                : statementData.closingBalance < -0.005
                  ? " (لصالح العميل)"
                  : " (متوازن)"}
            </span>
            <div className="h-5 w-px bg-border mx-1" />
            <Button
              variant="outline" size="sm"
              className="h-7 px-2 text-xs gap-1 border-primary text-primary hover:bg-primary/10"
              onClick={() => window.print()}
              data-testid="button-print-statement"
            >
              <Printer className="h-3.5 w-3.5" /> طباعة كشف الحساب
            </Button>
          </>
        )}
      </div>

      {/* Body */}
      {stmtLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground no-print">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>جارٍ تحميل كشف الحساب...</span>
        </div>
      ) : statementData ? (
        <div className="overflow-auto" id="stmt-print-area">

          {/* Print header */}
          <div className="hidden print:block mb-4 text-center">
            <h2 className="text-lg font-bold">كشف حساب عميل</h2>
            <p className="text-sm font-semibold mt-1">
              {statementData.name}
              {statementData.phone ? ` — هاتف: ${statementData.phone}` : ""}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              الفترة من {formatDateShort(statementData.fromDate)} إلى {formatDateShort(statementData.toDate)}
              &nbsp;|&nbsp; تاريخ الطباعة: {printDate}
            </p>
            <div className="border-b border-gray-400 my-2" />
          </div>

          {/* Summary chips */}
          <div className="no-print flex gap-3 text-xs mb-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-muted">
              عدد السطور: <strong>{statementData.lines.length}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              إجمالي المدين (فواتير): <strong>{formatCurrency(String(statementData.totalDebit))}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              إجمالي الدائن (تحصيل): <strong>{formatCurrency(String(statementData.totalCredit))}</strong>
            </span>
          </div>

          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm print:bg-gray-100">
              <TableRow>
                <TableHead className="text-right w-[90px] print:text-[11px]">التاريخ</TableHead>
                <TableHead className="text-right w-[110px] print:text-[11px]">نوع العملية</TableHead>
                <TableHead className="text-right w-[80px] print:text-[11px]">رقم المستند</TableHead>
                <TableHead className="text-right print:text-[11px]">مرجع</TableHead>
                <TableHead className="text-right print:text-[11px]">البيان</TableHead>
                <TableHead className="text-left w-[110px] print:text-[11px] text-red-700">مدين</TableHead>
                <TableHead className="text-left w-[110px] print:text-[11px] text-green-700">دائن</TableHead>
                <TableHead className="text-left w-[120px] print:text-[11px]">الرصيد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Opening balance row */}
              <TableRow className="bg-muted/30 font-semibold print:bg-gray-50">
                <TableCell className="print:text-[11px]">—</TableCell>
                <TableCell className="print:text-[11px]">رصيد افتتاحي</TableCell>
                <TableCell /><TableCell />
                <TableCell className="print:text-[11px]">رصيد ما قبل {formatDateShort(stmtFrom)}</TableCell>
                <TableCell className="text-left font-mono print:text-[11px]">—</TableCell>
                <TableCell className="text-left font-mono print:text-[11px]">—</TableCell>
                <TableCell className={cx("text-left font-mono font-bold print:text-[11px]", balCls(statementData.openingBalance))}>
                  {formatCurrency(String(statementData.openingBalance))}
                </TableCell>
              </TableRow>

              {statementData.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد حركات في هذه الفترة
                  </TableCell>
                </TableRow>
              ) : statementData.lines.map((line, idx) => (
                <TableRow
                  key={idx}
                  className={cx(
                    "hover:bg-muted/30",
                    line.sourceType === "customer_receipt" ? "bg-green-50/50 dark:bg-green-950/20" : ""
                  )}
                  data-testid={`stmt-row-${idx}`}
                >
                  <TableCell className="font-mono print:text-[11px]">{formatDateShort(line.txnDate)}</TableCell>
                  <TableCell className="print:text-[11px]">
                    <Badge variant="outline" className={cx(
                      "text-[10px] px-1.5 font-normal print:border-0 print:p-0",
                      line.sourceType === "sales_invoice"
                        ? "border-blue-300 text-blue-700 bg-blue-50"
                        : "border-green-300 text-green-700 bg-green-50"
                    )}>
                      {srcLabel[line.sourceType] ?? line.sourceLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono print:text-[11px]">{line.sourceNumber}</TableCell>
                  <TableCell className="text-muted-foreground print:text-[11px]">{line.sourceRef ?? "—"}</TableCell>
                  <TableCell className="max-w-[180px] truncate print:text-[11px]" title={line.description}>
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
                  <TableCell className={cx("text-left font-mono font-bold print:text-[11px]", balCls(line.balance))}>
                    {formatCurrency(String(Math.abs(line.balance)))}
                    {" "}
                    <span className="text-[10px] font-normal opacity-70">
                      {line.balance > 0.005 ? "ع" : line.balance < -0.005 ? "م" : ""}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="sticky bottom-0 bg-muted/90 backdrop-blur-sm print:bg-gray-100">
              <TableRow className="font-bold">
                <TableCell colSpan={5} className="text-right print:text-[11px]">الإجمالي</TableCell>
                <TableCell className="text-left font-mono text-red-700 print:text-[11px]">
                  {formatCurrency(String(statementData.totalDebit))}
                </TableCell>
                <TableCell className="text-left font-mono text-green-700 print:text-[11px]">
                  {formatCurrency(String(statementData.totalCredit))}
                </TableCell>
                <TableCell className={cx("text-left font-mono font-bold print:text-[11px]", balCls(statementData.closingBalance))}>
                  {formatCurrency(String(Math.abs(statementData.closingBalance)))}
                  {" "}
                  <span className="text-[10px] font-normal opacity-70">
                    {statementData.closingBalance > 0.005
                      ? "على العميل"
                      : statementData.closingBalance < -0.005
                        ? "لصالح العميل"
                        : "متوازن"}
                  </span>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {/* Print footer */}
          <div className="hidden print:flex mt-8 justify-between text-xs text-gray-600 px-4">
            <div className="text-center">
              <div className="border-t border-gray-400 pt-1 w-40">توقيع المدير المالي</div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 pt-1 w-40">توقيع العميل</div>
            </div>
          </div>

        </div>
      ) : null}
    </div>
  );
}
