import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/formatters";
import { InvoiceDetails } from "../hooks/usePendingInvoices";

interface InvoiceDetailsPanelProps {
  selected: Set<string>;
  details: InvoiceDetails | undefined;
  aggregated: { count: number; subtotal: number; netTotal: number } | null;
  testPrefix: string;
}

export function InvoiceDetailsPanel({ selected, details, aggregated, testPrefix }: InvoiceDetailsPanelProps) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs">تفاصيل الفاتورة</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {selected.size === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">اختر فاتورة لعرض التفاصيل</p>
        ) : selected.size === 1 && details ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs" dir="rtl">
              <div className="text-muted-foreground">رقم الفاتورة:</div>
              <div data-testid={`text-${testPrefix}-detail-number`}>{details.invoiceNumber}</div>
              <div className="text-muted-foreground">الإجمالي:</div>
              <div>{formatNumber(details.subtotal)}</div>
              <div className="text-muted-foreground">الصافي:</div>
              <div className="font-medium">{formatNumber(details.netTotal)}</div>
              <div className="text-muted-foreground">بواسطة:</div>
              <div>{details.createdBy || "-"}</div>
            </div>
            {details.lines && details.lines.length > 0 && (
              <div className="border rounded-md overflow-auto">
                <Table dir="rtl" className="text-[11px]">
                  <TableHeader>
                    <TableRow className="h-7">
                      <TableHead className="text-right py-1 px-1.5">#</TableHead>
                      <TableHead className="text-right py-1 px-1.5">الكود</TableHead>
                      <TableHead className="text-right py-1 px-1.5">الصنف</TableHead>
                      <TableHead className="text-right py-1 px-1.5">الكمية</TableHead>
                      <TableHead className="text-right py-1 px-1.5">السعر</TableHead>
                      <TableHead className="text-right py-1 px-1.5">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.lines.map((line, idx) => (
                      <TableRow key={line.id} className="h-6" data-testid={`row-${testPrefix}-detail-line-${idx}`}>
                        <TableCell className="text-right py-0.5 px-1.5">{line.lineNo || idx + 1}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{line.itemCode}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{line.itemName}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.qty)}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.salePrice)}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.lineTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : selected.size === 1 ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : aggregated ? (
          <div className="space-y-2" dir="rtl">
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
              <div className="text-muted-foreground">عدد الفواتير المحددة:</div>
              <div className="font-medium" data-testid={`text-${testPrefix}-agg-count`}>{aggregated.count}</div>
              <div className="text-muted-foreground">إجمالي قبل الخصم:</div>
              <div>{formatNumber(aggregated.subtotal)}</div>
              <div className="text-muted-foreground">إجمالي الصافي:</div>
              <div className="font-medium">{formatNumber(aggregated.netTotal)}</div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
