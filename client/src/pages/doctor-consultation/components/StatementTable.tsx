import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmt, parseDeptServices, calcSecretaryFee, type DeptInfo, type StatementTotals } from "../hooks/statementHelpers";
import { ExecBadge } from "./ExecBadge";

interface Props {
  rows: any[];
  allDeptNames: DeptInfo[];
  hasSecretary: boolean;
  totals: StatementTotals;
}

export function StatementTable({ rows, allDeptNames, hasSecretary, totals }: Props) {
  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-right w-12">الدور</TableHead>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">المريض</TableHead>
            <TableHead className="text-right">الطبيب</TableHead>
            <TableHead className="text-right">قيمة الكشف</TableHead>
            {hasSecretary && <TableHead className="text-right">نسبة السكرتارية</TableHead>}
            <TableHead className="text-right">إجمالي الأدوية</TableHead>
            {allDeptNames.map((dept) => (
              <TableHead key={dept.id} className="text-right whitespace-nowrap">{dept.name}</TableHead>
            ))}
            <TableHead className="text-right">حالة التنفيذ</TableHead>
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
                {hasSecretary && <TableCell className="text-sm text-orange-700">{fmt(secFee)}</TableCell>}
                <TableCell className="text-sm text-muted-foreground">{fmt(row.drugsTotal)}</TableCell>
                {allDeptNames.map((dept) => (
                  <TableCell key={dept.id} className="text-sm text-muted-foreground">{fmt(deptMap[dept.id] || 0)}</TableCell>
                ))}
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    <ExecBadge executed={execSvc} total={totalSvc} label="خدمات" icon="service" />
                    <ExecBadge executed={execPharm} total={totalPharm} label="صيدلية" icon="pharmacy" />
                    {totalAll === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
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
            {hasSecretary && <TableCell className="text-sm font-bold text-orange-800">{fmt(totals.secretaryTotal)}</TableCell>}
            <TableCell className="text-sm font-bold text-muted-foreground">{fmt(totals.drugsTotal)}</TableCell>
            {allDeptNames.map((dept) => (
              <TableCell key={dept.id} className="text-sm font-bold text-muted-foreground">{fmt(totals.deptTotals[dept.id] || 0)}</TableCell>
            ))}
            <TableCell />
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
