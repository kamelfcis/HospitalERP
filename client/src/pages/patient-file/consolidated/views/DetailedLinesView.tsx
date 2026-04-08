import { memo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { fmtDate, fmtMoney, fmtQty, LINE_TYPE_LABELS } from "../../shared/formatters";
import { useInvoiceLines } from "../../hooks/useInvoiceLines";
import type { InvoiceLine } from "../../shared/types";

interface Props {
  patientId: string;
  lineTypeFilter?: string;
  departmentFilter?: string;
}

const LINE_CLASS: Record<string, string> = {
  service:    "bg-blue-50   text-blue-700   border-blue-200",
  drug:       "bg-green-50  text-green-700  border-green-200",
  consumable: "bg-amber-50  text-amber-700  border-amber-200",
  equipment:  "bg-purple-50 text-purple-700 border-purple-200",
};

const LineRow = memo(function LineRow({ line }: { line: InvoiceLine }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-line-${line.id}`}>
      <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(line.invoice_date)}</td>
      <td className="p-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{line.invoice_number}</td>
      <td className="p-2 text-xs">{line.department_name}</td>
      <td className="p-2">
        <Badge variant="outline" className={`text-xs ${LINE_CLASS[line.line_type] ?? ""}`}>
          {LINE_TYPE_LABELS[line.line_type] ?? line.line_type}
        </Badge>
      </td>
      <td className="p-2 text-sm">{line.description}</td>
      <td className="p-2 text-center font-mono text-sm">{fmtQty(line.quantity)}</td>
      <td className="p-2 text-center font-mono text-sm">{fmtMoney(line.unit_price)}</td>
      <td className="p-2 text-center font-mono text-sm text-purple-600">
        {parseFloat(line.discount_amount) > 0 ? `(${fmtMoney(line.discount_amount)})` : "—"}
      </td>
      <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(line.total_price)}</td>
    </tr>
  );
});

export const DetailedLinesView = memo(function DetailedLinesView({ patientId, lineTypeFilter, departmentFilter }: Props) {
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading, isError } = useInvoiceLines({
    patientId,
    page,
    limit,
    lineType: lineTypeFilter,
    departmentId: departmentFilter,
  });

  const goNext = useCallback(() => setPage(p => p + 1), []);
  const goPrev = useCallback(() => setPage(p => Math.max(1, p - 1)), []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return <div className="text-center py-8 text-red-500 text-sm">حدث خطأ أثناء تحميل البيانات</div>;
  }

  if (data.data.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد بنود</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted-foreground">
        يتم عرض {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} من {data.total} بند
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full" dir="rtl">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
              <th className="p-2 text-right whitespace-nowrap">التاريخ</th>
              <th className="p-2 text-right whitespace-nowrap">رقم الفاتورة</th>
              <th className="p-2 text-right">القسم</th>
              <th className="p-2 text-right">النوع</th>
              <th className="p-2 text-right">البيان</th>
              <th className="p-2 text-center">الكمية</th>
              <th className="p-2 text-center">السعر</th>
              <th className="p-2 text-center">الخصم</th>
              <th className="p-2 text-center">الصافي</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map(line => <LineRow key={line.id} line={line} />)}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 rtl-pagination">
          <Button variant="outline" size="sm" onClick={goNext}  disabled={page >= data.totalPages} data-testid="btn-next-lines">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {data.totalPages}</span>
          <Button variant="outline" size="sm" onClick={goPrev} disabled={page <= 1} data-testid="btn-prev-lines">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
});
