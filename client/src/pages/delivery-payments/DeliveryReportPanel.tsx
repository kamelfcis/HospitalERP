/*
 * DeliveryReportPanel
 * Extracted from delivery-payments/index.tsx second pass.
 * Renders the "report" tab: the list of collected delivery receipts.
 * No local state — pure display component.
 */

import { memo }                from "react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Button }              from "@/components/ui/button";
import { Badge }               from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Hash, Loader2 } from "lucide-react";
import type { ReportRow }      from "./hooks/useDeliveryPaymentsData";

const PM_LABELS: Record<string, string> = {
  cash: "نقدي", bank: "بنك", card: "بطاقة", check: "شيك",
};

interface DeliveryReportPanelProps {
  reportData:    ReportRow[] | undefined;
  reportLoading: boolean;
  refetchReport: () => void;
}

export const DeliveryReportPanel = memo(function DeliveryReportPanel({
  reportData,
  reportLoading,
  refetchReport,
}: DeliveryReportPanelProps) {
  return (
    <div className="border rounded-md overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <span className="text-[12px] font-semibold">إيصالات التوصيل</span>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetchReport()}>
          <RefreshCw className="h-3 w-3 ml-1" />
          تحديث
        </Button>
      </div>
      <Table className="text-[12px]">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-right px-2">#</TableHead>
            <TableHead className="text-right px-2">التاريخ</TableHead>
            <TableHead className="text-right px-2">المبلغ</TableHead>
            <TableHead className="text-right px-2">طريقة الدفع</TableHead>
            <TableHead className="text-right px-2">المرجع</TableHead>
            <TableHead className="text-right px-2">الكاشير</TableHead>
            <TableHead className="text-right px-2">عدد الفواتير</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reportLoading && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                <Loader2 className="h-5 w-5 animate-spin inline" />
              </TableCell>
            </TableRow>
          )}
          {!reportLoading && (!reportData || reportData.length === 0) && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                لا توجد إيصالات
              </TableCell>
            </TableRow>
          )}
          {reportData?.map((r) => (
            <TableRow key={r.receiptId} data-testid={`row-receipt-${r.receiptId}`}>
              <TableCell className="px-2 font-mono">
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  {r.receiptNumber}
                </span>
              </TableCell>
              <TableCell className="px-2">{formatDateShort(r.receiptDate)}</TableCell>
              <TableCell className="px-2 text-right font-semibold">
                {formatCurrency(r.totalAmount)}
              </TableCell>
              <TableCell className="px-2">
                <Badge variant="outline" className="text-[9px]">
                  {PM_LABELS[r.paymentMethod] ?? r.paymentMethod}
                </Badge>
              </TableCell>
              <TableCell className="px-2 text-muted-foreground">
                {r.reference ?? "—"}
              </TableCell>
              <TableCell className="px-2">{r.cashierName ?? "—"}</TableCell>
              <TableCell className="px-2 text-center">
                <Badge variant="secondary" className="text-[9px]">{r.invoiceCount}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
});
