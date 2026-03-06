import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useDoctorStatement } from "../hooks/useDoctorStatement";

interface Props {
  doctorId?: string;
  clinicId?: string;
}

function fmt(val: any): string {
  const n = parseFloat(String(val || 0));
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DoctorStatementTab({ doctorId, clinicId }: Props) {
  const { rows, isLoading, dateFrom, dateTo, setDateFrom, setDateTo } = useDoctorStatement(doctorId, clinicId);

  const totalConsultationFee = rows.reduce((sum, r) => sum + parseFloat(String(r.consultationFee || 0)), 0);

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
          <Badge variant="outline" className="mr-auto text-blue-700 bg-blue-50 border-blue-200">
            عدد الكشوفات: {rows.length}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">لا توجد كشوفات في هذه الفترة</div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right w-12">الدور</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المريض</TableHead>
                <TableHead className="text-right">الطبيب</TableHead>
                <TableHead className="text-right">قيمة الكشف</TableHead>
                <TableHead className="text-right">إجمالي الأدوية</TableHead>
                <TableHead className="text-right">إجمالي الخدمات</TableHead>
                <TableHead className="text-right w-24">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} data-testid={`statement-row-${i}`}>
                  <TableCell className="text-sm font-bold text-center">{row.turnNumber}</TableCell>
                  <TableCell className="text-sm" dir="ltr">{row.appointmentDate}</TableCell>
                  <TableCell className="text-sm font-medium">{row.patientName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.doctorName || "—"}</TableCell>
                  <TableCell className="text-sm font-semibold text-emerald-700">{fmt(row.consultationFee)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmt(row.drugsTotal)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmt(row.servicesTotal)}</TableCell>
                  <TableCell>
                    {row.appointmentStatus === "done" ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">انتهى</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">جاري</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/60 font-bold">
                <TableCell colSpan={4} className="text-sm text-left">الإجمالي</TableCell>
                <TableCell className="text-sm font-bold text-emerald-800">{fmt(totalConsultationFee)}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
