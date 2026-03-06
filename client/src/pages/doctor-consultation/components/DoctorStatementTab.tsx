import { useMemo } from "react";
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

interface DeptTotal {
  departmentId: string;
  departmentName: string;
  total: number;
}

function fmt(val: any): string {
  const n = parseFloat(String(val || 0));
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDeptServices(raw: any): DeptTotal[] {
  try {
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((d: any) => ({
        departmentId: d.departmentId || "__none__",
        departmentName: d.departmentName || "بدون قسم",
        total: parseFloat(String(d.total || 0)),
      }))
      .filter((d: DeptTotal) => d.total > 0);
  } catch {
    return [];
  }
}

function calcSecretaryFee(consultationFee: number, feeType?: string | null, feeValue?: string | number | null): number {
  if (!feeType || !feeValue) return 0;
  const val = parseFloat(String(feeValue)) || 0;
  if (feeType === "percentage") return (consultationFee * val) / 100;
  if (feeType === "fixed") return val;
  return 0;
}

export function DoctorStatementTab({ doctorId, clinicId }: Props) {
  const { rows, isLoading, dateFrom, dateTo, setDateFrom, setDateTo } = useDoctorStatement(doctorId, clinicId);

  const allDeptNames = useMemo(() => {
    const deptSet = new Map<string, string>();
    rows.forEach((r) => {
      const depts = parseDeptServices(r.servicesByDepartment);
      depts.forEach((d) => deptSet.set(d.departmentId, d.departmentName));
    });
    return Array.from(deptSet.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const hasSecretary = rows.some((r) => r.secretaryFeeType && r.secretaryFeeType !== "__none__");

  const totals = useMemo(() => {
    let consultationFee = 0;
    let drugsTotal = 0;
    let secretaryTotal = 0;
    const deptTotals: Record<string, number> = {};
    allDeptNames.forEach((d) => (deptTotals[d.id] = 0));

    rows.forEach((r) => {
      const cf = parseFloat(String(r.consultationFee || 0));
      consultationFee += cf;
      drugsTotal += parseFloat(String(r.drugsTotal || 0));
      secretaryTotal += calcSecretaryFee(cf, r.secretaryFeeType, r.secretaryFeeValue);
      const depts = parseDeptServices(r.servicesByDepartment);
      depts.forEach((d) => {
        deptTotals[d.departmentId] = (deptTotals[d.departmentId] || 0) + d.total;
      });
    });
    return { consultationFee, drugsTotal, secretaryTotal, deptTotals };
  }, [rows, allDeptNames]);

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
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right w-12">الدور</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المريض</TableHead>
                <TableHead className="text-right">الطبيب</TableHead>
                <TableHead className="text-right">قيمة الكشف</TableHead>
                {hasSecretary && (
                  <TableHead className="text-right">نسبة السكرتارية</TableHead>
                )}
                <TableHead className="text-right">إجمالي الأدوية</TableHead>
                {allDeptNames.map((dept) => (
                  <TableHead key={dept.id} className="text-right whitespace-nowrap">
                    {dept.name}
                  </TableHead>
                ))}
                <TableHead className="text-right w-20">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const cf = parseFloat(String(row.consultationFee || 0));
                const secFee = calcSecretaryFee(cf, row.secretaryFeeType, row.secretaryFeeValue);
                const depts = parseDeptServices(row.servicesByDepartment);
                const deptMap: Record<string, number> = {};
                depts.forEach((d) => (deptMap[d.departmentId] = d.total));

                return (
                  <TableRow key={i} data-testid={`statement-row-${i}`}>
                    <TableCell className="text-sm font-bold text-center">{row.turnNumber}</TableCell>
                    <TableCell className="text-sm" dir="ltr">{row.appointmentDate}</TableCell>
                    <TableCell className="text-sm font-medium">{row.patientName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.doctorName || "—"}</TableCell>
                    <TableCell className="text-sm font-semibold text-emerald-700">{fmt(cf)}</TableCell>
                    {hasSecretary && (
                      <TableCell className="text-sm text-orange-700">{fmt(secFee)}</TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">{fmt(row.drugsTotal)}</TableCell>
                    {allDeptNames.map((dept) => (
                      <TableCell key={dept.id} className="text-sm text-muted-foreground">
                        {fmt(deptMap[dept.id] || 0)}
                      </TableCell>
                    ))}
                    <TableCell>
                      {row.appointmentStatus === "done" ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">انتهى</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">جاري</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/60 font-bold">
                <TableCell colSpan={4} className="text-sm text-left">الإجمالي</TableCell>
                <TableCell className="text-sm font-bold text-emerald-800">{fmt(totals.consultationFee)}</TableCell>
                {hasSecretary && (
                  <TableCell className="text-sm font-bold text-orange-800">{fmt(totals.secretaryTotal)}</TableCell>
                )}
                <TableCell className="text-sm font-bold text-muted-foreground">{fmt(totals.drugsTotal)}</TableCell>
                {allDeptNames.map((dept) => (
                  <TableCell key={dept.id} className="text-sm font-bold text-muted-foreground">
                    {fmt(totals.deptTotals[dept.id] || 0)}
                  </TableCell>
                ))}
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
