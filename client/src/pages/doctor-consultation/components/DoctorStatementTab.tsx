import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useDoctorStatement } from "../hooks/useDoctorStatement";
import { formatNumber } from "@/lib/formatters";

export function DoctorStatementTab() {
  const { rows, isLoading, dateFrom, dateTo, setDateFrom, setDateTo } = useDoctorStatement();

  const totalRevenue = rows.reduce((sum, r) => {
    if (r.order_status === "executed") return sum + parseFloat(r.service_price || "0");
    return sum;
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">من</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-8 text-sm" data-testid="input-statement-from" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">إلى</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-8 text-sm" data-testid="input-statement-to" />
        </div>
        {rows.length > 0 && (
          <Badge variant="outline" className="mr-auto text-green-700 bg-green-50 border-green-200">
            إجمالي: {formatNumber(totalRevenue)} ج.م
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">لا توجد بيانات في هذه الفترة</div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المريض</TableHead>
                <TableHead className="text-right">الخدمة</TableHead>
                <TableHead className="text-right">السعر</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} data-testid={`statement-row-${i}`}>
                  <TableCell className="text-sm" dir="ltr">{row.appointment_date}</TableCell>
                  <TableCell className="text-sm">{row.patient_name}</TableCell>
                  <TableCell className="text-sm">{row.service_name || "—"}</TableCell>
                  <TableCell className="text-sm" dir="ltr">
                    {row.service_price ? formatNumber(parseFloat(row.service_price)) : "—"}
                  </TableCell>
                  <TableCell>
                    {row.order_status === "executed" ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">منفذ</Badge>
                    ) : row.order_status === "pending" ? (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">معلق</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
