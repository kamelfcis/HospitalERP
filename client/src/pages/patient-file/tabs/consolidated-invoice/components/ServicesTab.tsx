import { memo, useState, useMemo } from "react";
import {
  Loader2, ChevronRight, ChevronLeft, RefreshCw, Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtDate, fmtMoney, fmtQty, LINE_TYPE_LABELS } from "../../../shared/formatters";
import { useInvoiceLines } from "../../../hooks/useInvoiceLines";
import type { InvoiceLine } from "../../../shared/types";
import { LINE_CLASS } from "../constants";

export const ServicesTab = memo(function ServicesTab({
  patientId, admissionId, visitId, isFinalClosed,
}: {
  patientId: string;
  admissionId?: string;
  visitId?: string;
  isFinalClosed: boolean;
}) {
  const [page, setPage] = useState(1);
  const [deptFilter, setDeptFilter] = useState<string>("__all__");
  const { data, isLoading, isError, dataUpdatedAt } = useInvoiceLines({
    patientId,
    page,
    limit: 100,
    admissionId,
    visitId,
    refetchInterval: isFinalClosed ? false : 45_000,
  });

  const departments = useMemo(() => {
    if (!data?.data) return [];
    const seen = new Set<string>();
    const result: Array<{ id: string | null; name: string }> = [];
    for (const line of data.data) {
      const key = line.department_name || "__none__";
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ id: line.department_id, name: line.department_name || "غير محدد" });
      }
    }
    return result;
  }, [data?.data]);

  const filteredLines = useMemo(() => {
    if (!data?.data) return [];
    if (deptFilter === "__all__") return data.data;
    return data.data.filter(l => (l.department_name || "غير محدد") === deptFilter);
  }, [data?.data, deptFilter]);

  if (isLoading) return (
    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  );
  if (isError || !data) return (
    <div className="text-center py-8 text-red-500 text-sm">حدث خطأ أثناء تحميل الخدمات</div>
  );
  if (data.data.length === 0) return (
    <div className="text-center py-10 text-muted-foreground text-sm">لا توجد خدمات مسجلة لهذه الزيارة</div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {departments.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="h-7 text-xs w-[180px]" data-testid="select-dept-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">كل الأقسام ({data.data.length})</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d.name} value={d.name}>
                      {d.name} ({data.data.filter(l => (l.department_name || "غير محدد") === d.name).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <span>{filteredLines.length} خدمة</span>
        </div>
        {!isFinalClosed && (
          <span className="flex items-center gap-1 text-green-700">
            <RefreshCw className="h-3 w-3" />
            تحديث فوري
            {dataUpdatedAt ? ` — آخر تحديث: ${new Date(dataUpdatedAt).toLocaleTimeString("ar-EG")}` : ""}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-muted/60 text-xs text-muted-foreground border-b">
              <th className="p-2 text-right w-6">#</th>
              <th className="p-2 text-right whitespace-nowrap">التاريخ</th>
              <th className="p-2 text-right">القسم</th>
              <th className="p-2 text-right">النوع</th>
              <th className="p-2 text-right">الخدمة / البيان</th>
              <th className="p-2 text-center whitespace-nowrap">الكمية</th>
              <th className="p-2 text-center whitespace-nowrap">السعر</th>
              <th className="p-2 text-center whitespace-nowrap">الخصم</th>
              <th className="p-2 text-center whitespace-nowrap font-semibold">الصافي</th>
            </tr>
          </thead>
          <tbody>
            {filteredLines.map((line: InvoiceLine, idx: number) => (
              <tr key={line.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-line-${line.id}`}>
                <td className="p-2 text-xs text-muted-foreground text-center">{(page - 1) * 100 + idx + 1}</td>
                <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(line.invoice_date)}</td>
                <td className="p-2 text-xs">{line.department_name}</td>
                <td className="p-2">
                  <Badge variant="outline" className={`text-[10px] px-1 py-0 ${LINE_CLASS[line.line_type] ?? ""}`}>
                    {LINE_TYPE_LABELS[line.line_type] ?? line.line_type}
                  </Badge>
                </td>
                <td className="p-2 text-sm max-w-[200px] truncate" title={line.description}>{line.description}</td>
                <td className="p-2 text-center font-mono text-sm">{fmtQty(line.quantity)}</td>
                <td className="p-2 text-center font-mono text-sm">{fmtMoney(line.unit_price)}</td>
                <td className="p-2 text-center font-mono text-sm text-purple-600">
                  {parseFloat(line.discount_amount) > 0 ? `(${fmtMoney(line.discount_amount)})` : "—"}
                </td>
                <td className="p-2 text-center font-mono text-sm font-semibold">{fmtMoney(line.total_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/40 border-t-2 text-sm font-semibold">
              <td className="p-2" colSpan={5}>الإجمالي</td>
              <td className="p-2" colSpan={2}></td>
              <td className="p-2 text-center font-mono text-purple-600">
                ({fmtMoney(filteredLines.reduce((s: number, l: InvoiceLine) => s + parseFloat(l.discount_amount || "0"), 0))})
              </td>
              <td className="p-2 text-center font-mono">
                {fmtMoney(filteredLines.reduce((s: number, l: InvoiceLine) => s + parseFloat(l.total_price || "0"), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= data.totalPages} data-testid="btn-next-lines">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {data.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} data-testid="btn-prev-lines">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
});
