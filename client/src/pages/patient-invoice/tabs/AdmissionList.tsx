import { Badge }      from "@/components/ui/badge";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Skeleton }   from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BedDouble, Search, CalendarDays } from "lucide-react";
import { formatCurrency, formatDateShort, formatDateTime } from "@/lib/formatters";
import type { Department } from "@shared/schema";
import {
  AdmissionWithLatestInvoice,
  ADMISSION_STATUS_CONFIG,
  InvoiceStatusBadge,
  AdmissionStatusBadge,
} from "./admission-types";

interface AdmissionListProps {
  rows: AdmissionWithLatestInvoice[] | undefined;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  deptFilter: string;
  onDeptChange: (v: string) => void;
  departments: Department[] | undefined;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  onSelect: (a: AdmissionWithLatestInvoice) => void;
}

function AdmissionList({
  rows, loading,
  searchQuery, onSearchChange,
  statusFilter, onStatusChange,
  deptFilter, onDeptChange, departments,
  dateFrom, onDateFromChange,
  dateTo, onDateToChange,
  onSelect,
}: AdmissionListProps) {
  // ── حساب الإجماليات للسطر السفلي ──
  const totals = (rows ?? []).reduce(
    (acc, a) => ({
      net:          acc.net          + parseFloat(String(a.totalNetAmount         ?? "0")),
      paid:         acc.paid         + parseFloat(String(a.totalPaidAmount        ?? "0")),
      transferred:  acc.transferred  + parseFloat(String(a.totalTransferredAmount ?? "0")),
    }),
    { net: 0, paid: 0, transferred: 0 }
  );

  return (
    <div className="space-y-2">
      {/* ── رأس الصفحة ── */}
      <h2 className="text-sm font-bold flex items-center gap-1" data-testid="text-adm-title">
        <BedDouble className="h-4 w-4" />
        إقامات المرضى
        <span className="text-muted-foreground font-normal text-xs mr-1">
          ({rows?.length ?? 0})
        </span>
      </h2>

      {/* ── شريط الفلاتر ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* من تاريخ */}
        <div className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">من</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={e => onDateFromChange(e.target.value)}
            className="h-7 text-xs w-[130px]"
            data-testid="input-adm-date-from"
          />
        </div>

        {/* إلى تاريخ */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground shrink-0">إلى</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => onDateToChange(e.target.value)}
            className="h-7 text-xs w-[130px]"
            data-testid="input-adm-date-to"
          />
        </div>

        {/* بحث بالاسم أو الطبيب */}
        <div className="flex items-center gap-1 flex-1 min-w-[150px]">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            type="text"
            placeholder="اسم المريض أو الطبيب..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="h-7 text-xs flex-1"
            data-testid="input-adm-search"
          />
        </div>

        {/* فلتر القسم */}
        <Select value={deptFilter} onValueChange={onDeptChange}>
          <SelectTrigger className="w-[130px] h-7 text-xs" data-testid="select-adm-dept-filter">
            <SelectValue placeholder="القسم" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {(departments ?? []).map(d => (
              <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* فلتر حالة الإقامة */}
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[100px] h-7 text-xs" data-testid="select-adm-status-filter">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">نشطة</SelectItem>
            <SelectItem value="discharged">خرج</SelectItem>
            <SelectItem value="cancelled">ملغاة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── جدول الإقامات ── */}
      <div className="border rounded-md overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-310px)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 h-8">
                  <TableHead className="py-1 text-xs">رقم الإقامة</TableHead>
                  <TableHead className="py-1 text-xs">اسم المريض</TableHead>
                  <TableHead className="py-1 text-xs">الطبيب</TableHead>
                  <TableHead className="py-1 text-xs">القسم</TableHead>
                  <TableHead className="py-1 text-xs">وقت الدخول</TableHead>
                  <TableHead className="py-1 text-xs">رقم الفاتورة</TableHead>
                  <TableHead className="py-1 text-xs text-center">حالة الفاتورة</TableHead>
                  <TableHead className="py-1 text-xs text-left">قيمة الفاتورة</TableHead>
                  <TableHead className="py-1 text-xs text-left">المدفوع</TableHead>
                  <TableHead className="py-1 text-xs text-left">محول للطبيب</TableHead>
                  <TableHead className="py-1 text-xs">تاريخ الخروج</TableHead>
                  <TableHead className="py-1 text-xs text-center">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!rows || rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-6 text-muted-foreground text-xs">
                      لا توجد إقامات في هذا النطاق الزمني
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((a: AdmissionWithLatestInvoice) => (
                    <AdmissionRow key={a.id} row={a} onSelect={onSelect} />
                  ))
                )}
              </TableBody>

              {/* ── سطر الإجماليات ── */}
              {rows && rows.length > 0 && (
                <tfoot>
                  <TableRow className="bg-muted/70 font-bold border-t-2">
                    <TableCell colSpan={7} className="py-1 text-xs text-right pr-2">
                      الإجمالي ({rows.length} إقامة)
                    </TableCell>
                    <TableCell className="py-1 text-xs text-left font-mono font-bold" data-testid="text-adm-total-net">
                      {formatCurrency(totals.net)}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-left font-mono text-green-700 dark:text-green-400 font-bold" data-testid="text-adm-total-paid">
                      {formatCurrency(totals.paid)}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-left font-mono text-blue-700 dark:text-blue-400 font-bold" data-testid="text-adm-total-transferred">
                      {formatCurrency(totals.transferred)}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </tfoot>
              )}
            </Table>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// ─── Sub-component: AdmissionRow (صف في الجدول) ──────────────────────────────

function AdmissionRow({ row: a, onSelect }: { row: AdmissionWithLatestInvoice; onSelect: (a: AdmissionWithLatestInvoice) => void }) {
  const netAmount  = parseFloat(String(a.totalNetAmount  ?? "0"));
  const paidAmount = parseFloat(String(a.totalPaidAmount ?? "0"));
  const transferred = parseFloat(String(a.totalTransferredAmount ?? "0"));

  return (
    <TableRow
      className="cursor-pointer hover-elevate h-8"
      onClick={() => onSelect(a)}
      data-testid={`row-adm-${a.id}`}
    >
      <TableCell className="py-0.5 text-xs font-medium">{a.admissionNumber}</TableCell>
      <TableCell className="py-0.5 text-xs">{a.patientName}</TableCell>
      <TableCell className="py-0.5 text-xs">{a.doctorName || "—"}</TableCell>
      <TableCell className="py-0.5 text-xs">
        {a.latestInvoiceDeptName
          ? <span className="text-muted-foreground">{a.latestInvoiceDeptName}</span>
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-0.5 text-xs font-mono whitespace-nowrap">
        {formatDateTime(a.createdAt)}
      </TableCell>
      <TableCell className="py-0.5 text-xs font-mono">
        {a.latestInvoiceNumber ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-0.5 text-center">
        <InvoiceStatusBadge status={a.latestInvoiceStatus} />
      </TableCell>
      <TableCell className="py-0.5 text-xs text-left font-mono">
        {netAmount > 0
          ? formatCurrency(netAmount)
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-0.5 text-xs text-left font-mono">
        {paidAmount > 0
          ? <span className="text-green-700 dark:text-green-400">{formatCurrency(paidAmount)}</span>
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-0.5 text-xs text-left font-mono">
        {transferred > 0
          ? <span className="text-blue-700 dark:text-blue-400">{formatCurrency(transferred)}</span>
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-0.5 text-xs whitespace-nowrap">
        {a.dischargeDate
          ? formatDateShort(a.dischargeDate)
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-0.5 text-center">
        <AdmissionStatusBadge status={a.status} />
      </TableCell>
    </TableRow>
  );
}

export { AdmissionList };
export type { AdmissionListProps };
