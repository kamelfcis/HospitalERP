import { useMemo } from "react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Clock, Pill, Stethoscope } from "lucide-react";
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

function ExecBadge({ executed, total, label, icon }: { executed: number; total: number; label: string; icon: "service" | "pharmacy" }) {
  if (total === 0) return null;
  const allDone = executed >= total;
  const Icon = icon === "pharmacy" ? Pill : Stethoscope;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        allDone ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
      }`}
      title={`${label}: ${executed}/${total}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {executed}/{total}
      {allDone && <CheckCircle2 className="h-2.5 w-2.5" />}
    </span>
  );
}

export function DoctorStatementTab({ doctorId, clinicId }: Props) {
  const { rows, isLoading, dateFrom, dateTo, setDateFrom, setDateTo, execFilter, setExecFilter } = useDoctorStatement(doctorId, clinicId);

  const filteredRows = useMemo(() => {
    if (execFilter === "all") return rows;
    return rows.filter((r) => {
      const total = parseInt(String(r.totalOrders || 0));
      const executed = parseInt(String(r.executedOrders || 0));
      if (execFilter === "executed") return total > 0 && executed >= total;
      if (execFilter === "pending") return total === 0 || executed < total;
      return true;
    });
  }, [rows, execFilter]);

  const allDeptNames = useMemo(() => {
    const deptSet = new Map<string, string>();
    filteredRows.forEach((r) => {
      const depts = parseDeptServices(r.servicesByDepartment);
      depts.forEach((d) => deptSet.set(d.departmentId, d.departmentName));
    });
    return Array.from(deptSet.entries()).map(([id, name]) => ({ id, name }));
  }, [filteredRows]);

  const hasSecretary = filteredRows.some((r) => r.secretaryFeeType && r.secretaryFeeType !== "__none__");

  const totals = useMemo(() => {
    let consultationFee = 0;
    let drugsTotal = 0;
    let secretaryTotal = 0;
    const deptTotals: Record<string, number> = {};
    allDeptNames.forEach((d) => (deptTotals[d.id] = 0));

    filteredRows.forEach((r) => {
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
  }, [filteredRows, allDeptNames]);

  const execSummary = useMemo(() => {
    let totalOrders = 0;
    let executedOrders = 0;
    rows.forEach((r) => {
      totalOrders += parseInt(String(r.totalOrders || 0));
      executedOrders += parseInt(String(r.executedOrders || 0));
    });
    return { totalOrders, executedOrders };
  }, [rows]);

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
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">التنفيذ</Label>
          <Select value={execFilter} onValueChange={(v) => setExecFilter(v as any)}>
            <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-exec-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="executed">منفذ بالكامل</SelectItem>
              <SelectItem value="pending">غير مكتمل</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {rows.length > 0 && (
          <div className="mr-auto flex items-center gap-2">
            <Badge variant="outline" className="text-blue-700 bg-blue-50 border-blue-200">
              عدد الكشوفات: {filteredRows.length}{filteredRows.length !== rows.length ? ` / ${rows.length}` : ""}
            </Badge>
            {execSummary.totalOrders > 0 && (
              <Badge variant="outline" className={`${execSummary.executedOrders >= execSummary.totalOrders ? "text-green-700 bg-green-50 border-green-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
                {execSummary.executedOrders >= execSummary.totalOrders ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <Clock className="h-3 w-3 ml-1" />}
                التنفيذ: {execSummary.executedOrders}/{execSummary.totalOrders}
              </Badge>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          {rows.length === 0 ? "لا توجد كشوفات في هذه الفترة" : "لا توجد نتائج تطابق الفلتر"}
        </div>
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
                <TableHead className="text-right">حالة التنفيذ</TableHead>
                <TableHead className="text-right w-20">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row, i) => {
                const cf = parseFloat(String(row.consultationFee || 0));
                const secFee = calcSecretaryFee(cf, row.secretaryFeeType, row.secretaryFeeValue);
                const depts = parseDeptServices(row.servicesByDepartment);
                const deptMap: Record<string, number> = {};
                depts.forEach((d) => (deptMap[d.departmentId] = d.total));

                const totalSvc = parseInt(String(row.totalServiceOrders || 0));
                const execSvc = parseInt(String(row.executedServiceOrders || 0));
                const totalPharm = parseInt(String(row.totalPharmacyOrders || 0));
                const execPharm = parseInt(String(row.executedPharmacyOrders || 0));
                const totalAll = parseInt(String(row.totalOrders || 0));
                const execAll = parseInt(String(row.executedOrders || 0));
                const allDone = totalAll > 0 && execAll >= totalAll;

                return (
                  <TableRow key={i} className={allDone ? "bg-green-50/30" : ""} data-testid={`statement-row-${i}`}>
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
                      <div className="flex items-center gap-1 flex-wrap">
                        <ExecBadge executed={execSvc} total={totalSvc} label="خدمات" icon="service" />
                        <ExecBadge executed={execPharm} total={totalPharm} label="صيدلية" icon="pharmacy" />
                        {totalAll === 0 && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
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
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
