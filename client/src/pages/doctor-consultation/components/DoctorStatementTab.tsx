import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { useDoctorStatement } from "../hooks/useDoctorStatement";
import { filterRows, collectDeptNames, computeTotals, computeExecSummary } from "../hooks/statementHelpers";
import { StatementTable } from "./StatementTable";

interface Props {
  doctorId?: string;
  clinicId?: string;
}

export function DoctorStatementTab({ doctorId, clinicId }: Props) {
  const { rows, isLoading, dateFrom, dateTo, setDateFrom, setDateTo, execFilter, setExecFilter } = useDoctorStatement(doctorId, clinicId);

  const filteredRows = useMemo(() => filterRows(rows, execFilter), [rows, execFilter]);
  const allDeptNames = useMemo(() => collectDeptNames(filteredRows), [filteredRows]);
  const hasSecretary = filteredRows.some((r) => r.secretaryFeeType && r.secretaryFeeType !== "__none__");
  const totals = useMemo(() => computeTotals(filteredRows, allDeptNames), [filteredRows, allDeptNames]);
  const execSummary = useMemo(() => computeExecSummary(rows), [rows]);

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
        <StatementTable rows={filteredRows} allDeptNames={allDeptNames} hasSecretary={hasSecretary} totals={totals} />
      )}
    </div>
  );
}
