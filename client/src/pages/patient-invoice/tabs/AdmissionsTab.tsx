/**
 * AdmissionsTab — تبويب إقامات المرضى داخل شاشة فاتورة المريض.
 *
 * الوضع الأول (قائمة): جدول مدمج يعرض جميع الإقامات مع
 *   - فلتر تاريخ من / إلى (اليوم افتراضياً)
 *   - بحث بالاسم أو الطبيب
 *   - فلتر الحالة (نشطة / خرج / ملغاة)
 *   - أعمدة: رقم الإقامة، المريض، الطبيب، وقت الدخول، رقم الفاتورة،
 *             حالة الفاتورة، قيمة الفاتورة، المدفوع، محول للطبيب،
 *             تاريخ الخروج، حالة الإقامة
 *
 * الوضع الثاني (تفاصيل): عند اختيار إقامة يُعرض كارد التفاصيل +
 *   فواتير الإقامة + تقرير قابل للطباعة.
 */
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Badge }      from "@/components/ui/badge";
import { Skeleton }   from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BedDouble, LogOut, Layers, FileText, Printer, Search, ChevronRight, CalendarDays } from "lucide-react";
import { formatCurrency, formatDateShort, formatDateTime } from "@/lib/formatters";
import type { Admission, Department } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

/** حالات الإقامة: label + CSS classes للـ Badge */
const ADMISSION_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  active:     { label: "نشطة",  cls: "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" },
  discharged: { label: "خرج",   cls: "bg-blue-600  text-white no-default-hover-elevate no-default-active-elevate" },
  cancelled:  { label: "ملغاة", cls: "bg-red-600   text-white no-default-hover-elevate no-default-active-elevate" },
};

/** حالات الفاتورة: label + CSS classes للـ Badge */
const INVOICE_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:     { label: "مسودة", cls: "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate" },
  finalized: { label: "نهائي", cls: "bg-green-600  text-white no-default-hover-elevate no-default-active-elevate" },
  cancelled: { label: "ملغي",  cls: "bg-red-600   text-white no-default-hover-elevate no-default-active-elevate" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function AdmissionStatusBadge({ status }: { status: string }) {
  const cfg = ADMISSION_STATUS_CONFIG[status];
  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${cfg?.cls ?? ""}`}>
      {cfg?.label ?? status}
    </Badge>
  );
}

function InvoiceStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const cfg = INVOICE_STATUS_CONFIG[status];
  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${cfg?.cls ?? ""}`}>
      {cfg?.label ?? status}
    </Badge>
  );
}

// ─── Props Interface ───────────────────────────────────────────────────────────

interface AdmissionsTabProps {
  // ── الإقامة المختارة (وضع التفاصيل) ──────────────────
  admSelectedAdmission: Admission | null;
  setAdmSelectedAdmission: (a: Admission | null) => void;
  admDetail: Admission | undefined;

  // ── العمليات على الإقامة ──────────────────────────────
  admDischargeMutation:    { mutate: (id: string) => void; isPending: boolean };
  admConsolidateMutation:  { mutate: (id: string) => void; isPending: boolean };

  // ── فواتير الإقامة (وضع التفاصيل) ────────────────────
  admInvoicesLoading: boolean;
  admInvoices: any[] | undefined;

  // ── تقرير الطباعة ─────────────────────────────────────
  admPrintDeptId: string;
  setAdmPrintDeptId: (v: string) => void;
  departments: Department[] | undefined;
  admReportLoading: boolean;
  admReportData: any;
  admInvoicesByDepartment: Record<string, any[]>;
  admTotalAllInvoices: number;
  admFilteredPrintInvoices: Record<string, any[]>;
  admPrintRef: React.RefObject<HTMLDivElement>;

  // ── قائمة الإقامات (وضع القائمة) ─────────────────────
  admAllAdmissions: any[] | undefined;
  admListLoading: boolean;

  // ── فلاتر القائمة ──────────────────────────────────────
  admSearchQuery:   string;
  setAdmSearchQuery: (v: string) => void;
  admStatusFilter:   string;
  setAdmStatusFilter: (v: string) => void;
  admDeptFilter:     string;
  setAdmDeptFilter:  (v: string) => void;
  admDateFrom:       string;
  setAdmDateFrom:    (v: string) => void;
  admDateTo:         string;
  setAdmDateTo:      (v: string) => void;

  // ── props غير مستخدمة حالياً (محفوظة للتوافق) ─────────
  admIsCreateOpen: boolean;
  setAdmIsCreateOpen: (v: boolean) => void;
  admFormData: any;
  setAdmFormData: (v: any) => void;
  admPatientSearch: string;
  setAdmPatientSearch: (v: string) => void;
  admPatientResults: any[];
  admSearchingPatients: boolean;
  admShowPatientDropdown: boolean;
  setAdmShowPatientDropdown: (v: boolean) => void;
  admPatientSearchRef: React.RefObject<HTMLInputElement>;
  admPatientDropdownRef: React.RefObject<HTMLDivElement>;
  admHandleSelectPatient: (patient: any) => void;
  admHandleCloseCreate: () => void;
  admHandleCreateSubmit: () => void;
  admCreateMutation: { isPending: boolean };

  // ── دوال مساعدة قديمة (محفوظة للتوافق مع وضع التفاصيل) ─
  admGetStatusBadgeClass: (s: string) => string;
  admStatusLabels: Record<string, string>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdmissionsTab({
  admSelectedAdmission, setAdmSelectedAdmission,
  admDetail, admDischargeMutation, admConsolidateMutation,
  admInvoicesLoading, admInvoices,
  admPrintDeptId, setAdmPrintDeptId, departments,
  admReportLoading, admReportData,
  admInvoicesByDepartment, admTotalAllInvoices, admFilteredPrintInvoices,
  admPrintRef,
  admAllAdmissions, admListLoading,
  admSearchQuery, setAdmSearchQuery,
  admStatusFilter, setAdmStatusFilter,
  admDeptFilter, setAdmDeptFilter,
  admDateFrom, setAdmDateFrom,
  admDateTo, setAdmDateTo,
  admGetStatusBadgeClass, admStatusLabels,
}: AdmissionsTabProps) {

  return (
    <>
      {/* ── Print CSS (مخفي في الشاشة، يظهر عند الطباعة فقط) ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #adm-print-area, #adm-print-area * { visibility: visible !important; }
          #adm-print-area {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 210mm !important; padding: 10mm !important;
            font-size: 11pt !important; direction: rtl !important;
          }
          #adm-print-area table { width: 100% !important; border-collapse: collapse !important; }
          #adm-print-area th, #adm-print-area td {
            border: 1px solid #333 !important; padding: 4px 8px !important;
            text-align: right !important; font-size: 10pt !important;
          }
          #adm-print-area th {
            background: #eee !important; font-weight: bold !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {admSelectedAdmission
        ? <AdmissionDetail
            adm={admDetail || admSelectedAdmission}
            onBack={() => setAdmSelectedAdmission(null)}
            admDischargeMutation={admDischargeMutation}
            admConsolidateMutation={admConsolidateMutation}
            admInvoicesLoading={admInvoicesLoading}
            admInvoices={admInvoices}
            admPrintDeptId={admPrintDeptId}
            setAdmPrintDeptId={setAdmPrintDeptId}
            departments={departments}
            admReportLoading={admReportLoading}
            admReportData={admReportData}
            admInvoicesByDepartment={admInvoicesByDepartment}
            admTotalAllInvoices={admTotalAllInvoices}
            admFilteredPrintInvoices={admFilteredPrintInvoices}
            admPrintRef={admPrintRef}
            admGetStatusBadgeClass={admGetStatusBadgeClass}
            admStatusLabels={admStatusLabels}
          />
        : <AdmissionList
            rows={admAllAdmissions}
            loading={admListLoading}
            searchQuery={admSearchQuery}
            onSearchChange={setAdmSearchQuery}
            statusFilter={admStatusFilter}
            onStatusChange={setAdmStatusFilter}
            deptFilter={admDeptFilter}
            onDeptChange={setAdmDeptFilter}
            departments={departments}
            dateFrom={admDateFrom}
            onDateFromChange={setAdmDateFrom}
            dateTo={admDateTo}
            onDateToChange={setAdmDateTo}
            onSelect={setAdmSelectedAdmission}
          />
      }
    </>
  );
}

// ─── Sub-component: AdmissionList (وضع القائمة) ───────────────────────────────

interface AdmissionListProps {
  rows: any[] | undefined;
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
  onSelect: (a: any) => void;
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
      net:          acc.net          + parseFloat(a.totalNetAmount         ?? "0"),
      paid:         acc.paid         + parseFloat(a.totalPaidAmount        ?? "0"),
      transferred:  acc.transferred  + parseFloat(a.totalTransferredAmount ?? "0"),
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
                  rows.map((a: any) => (
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

function AdmissionRow({ row: a, onSelect }: { row: any; onSelect: (a: any) => void }) {
  const netAmount  = parseFloat(a.totalNetAmount  ?? "0");
  const paidAmount = parseFloat(a.totalPaidAmount ?? "0");
  const transferred = parseFloat(a.totalTransferredAmount ?? "0");

  return (
    <TableRow
      className="cursor-pointer hover-elevate h-8"
      onClick={() => onSelect(a)}
      data-testid={`row-adm-${a.id}`}
    >
      {/* رقم الإقامة */}
      <TableCell className="py-0.5 text-xs font-medium">{a.admissionNumber}</TableCell>

      {/* اسم المريض */}
      <TableCell className="py-0.5 text-xs">{a.patientName}</TableCell>

      {/* الطبيب */}
      <TableCell className="py-0.5 text-xs">{a.doctorName || "—"}</TableCell>

      {/* القسم (من آخر فاتورة) */}
      <TableCell className="py-0.5 text-xs">
        {a.latestInvoiceDeptName
          ? <span className="text-muted-foreground">{a.latestInvoiceDeptName}</span>
          : <span className="text-muted-foreground">—</span>}
      </TableCell>

      {/* وقت الدخول (timestamp) */}
      <TableCell className="py-0.5 text-xs font-mono whitespace-nowrap">
        {formatDateTime(a.createdAt)}
      </TableCell>

      {/* رقم الفاتورة */}
      <TableCell className="py-0.5 text-xs font-mono">
        {a.latestInvoiceNumber ?? <span className="text-muted-foreground">—</span>}
      </TableCell>

      {/* حالة الفاتورة */}
      <TableCell className="py-0.5 text-center">
        <InvoiceStatusBadge status={a.latestInvoiceStatus} />
      </TableCell>

      {/* قيمة الفاتورة */}
      <TableCell className="py-0.5 text-xs text-left font-mono">
        {netAmount > 0
          ? formatCurrency(netAmount)
          : <span className="text-muted-foreground">—</span>}
      </TableCell>

      {/* المدفوع */}
      <TableCell className="py-0.5 text-xs text-left font-mono">
        {paidAmount > 0
          ? <span className="text-green-700 dark:text-green-400">{formatCurrency(paidAmount)}</span>
          : <span className="text-muted-foreground">—</span>}
      </TableCell>

      {/* محول للطبيب */}
      <TableCell className="py-0.5 text-xs text-left font-mono">
        {transferred > 0
          ? <span className="text-blue-700 dark:text-blue-400">{formatCurrency(transferred)}</span>
          : <span className="text-muted-foreground">—</span>}
      </TableCell>

      {/* تاريخ الخروج */}
      <TableCell className="py-0.5 text-xs whitespace-nowrap">
        {a.dischargeDate
          ? formatDateShort(a.dischargeDate)
          : <span className="text-muted-foreground">—</span>}
      </TableCell>

      {/* حالة الإقامة */}
      <TableCell className="py-0.5 text-center">
        <AdmissionStatusBadge status={a.status} />
      </TableCell>
    </TableRow>
  );
}

// ─── Sub-component: AdmissionDetail (وضع التفاصيل) ───────────────────────────

interface AdmissionDetailProps {
  adm: any;
  onBack: () => void;
  admDischargeMutation:   { mutate: (id: string) => void; isPending: boolean };
  admConsolidateMutation: { mutate: (id: string) => void; isPending: boolean };
  admInvoicesLoading: boolean;
  admInvoices: any[] | undefined;
  admPrintDeptId: string;
  setAdmPrintDeptId: (v: string) => void;
  departments: Department[] | undefined;
  admReportLoading: boolean;
  admReportData: any;
  admInvoicesByDepartment: Record<string, any[]>;
  admTotalAllInvoices: number;
  admFilteredPrintInvoices: Record<string, any[]>;
  admPrintRef: React.RefObject<HTMLDivElement>;
  admGetStatusBadgeClass: (s: string) => string;
  admStatusLabels: Record<string, string>;
}

function AdmissionDetail({
  adm, onBack,
  admDischargeMutation, admConsolidateMutation,
  admInvoicesLoading, admInvoices,
  admPrintDeptId, setAdmPrintDeptId, departments,
  admReportLoading, admReportData,
  admInvoicesByDepartment, admTotalAllInvoices, admFilteredPrintInvoices,
  admPrintRef,
  admGetStatusBadgeClass, admStatusLabels,
}: AdmissionDetailProps) {
  return (
    <div className="space-y-3">
      {/* ── شريط العنوان + أزرار العمليات ── */}
      <div className="no-print flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-adm-back">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1">
              <BedDouble className="h-4 w-4" />
              تفاصيل الإقامة — {adm.admissionNumber}
            </h2>
            <p className="text-xs text-muted-foreground">{adm.patientName}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {adm.status === "active" && (
            <Button
              size="sm" variant="outline"
              data-testid="button-adm-discharge"
              disabled={admDischargeMutation.isPending}
              onClick={() => {
                if (confirm("هل أنت متأكد من خروج المريض؟"))
                  admDischargeMutation.mutate(adm.id);
              }}
            >
              <LogOut className="h-3 w-3 ml-1" />
              خروج المريض
            </Button>
          )}
          <Button
            size="sm" variant="outline"
            data-testid="button-adm-consolidate"
            disabled={admConsolidateMutation.isPending}
            onClick={() => admConsolidateMutation.mutate(adm.id)}
          >
            <Layers className="h-3 w-3 ml-1" />
            تجميع الفواتير
          </Button>
        </div>
      </div>

      {/* ── كارد بيانات الإقامة ── */}
      <Card className="no-print">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات الإقامة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">رقم الإقامة:</span>
              <p className="font-medium" data-testid="text-adm-number">{adm.admissionNumber}</p>
            </div>
            <div>
              <span className="text-muted-foreground">اسم المريض:</span>
              <p className="font-medium" data-testid="text-adm-patient">{adm.patientName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">التليفون:</span>
              <p className="font-medium">{adm.patientPhone || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">الحالة:</span>
              <Badge
                className={admGetStatusBadgeClass(adm.status)}
                data-testid="badge-adm-status"
              >
                {admStatusLabels[adm.status] || adm.status}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">تاريخ الإقامة:</span>
              <p className="font-medium">{formatDateShort(adm.admissionDate)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">تاريخ الخروج:</span>
              <p className="font-medium">
                {adm.dischargeDate ? formatDateShort(adm.dischargeDate) : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">الطبيب:</span>
              <p className="font-medium">{adm.doctorName || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">ملاحظات:</span>
              <p className="font-medium">{adm.notes || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── كارد فواتير الإقامة ── */}
      <Card className="no-print">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">فواتير الإقامة</CardTitle>
        </CardHeader>
        <CardContent>
          {admInvoicesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : !admInvoices || admInvoices.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد فواتير</p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-right">القسم</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admInvoices.map((inv: any) => (
                    <TableRow key={inv.id} data-testid={`row-adm-invoice-${inv.id}`}>
                      <TableCell className="text-xs">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-xs">{inv.departmentName || "—"}</TableCell>
                      <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                      <TableCell className="text-xs">{formatCurrency(inv.netAmount || inv.totalAmount)}</TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ── كارد تقرير الإقامة (للطباعة) ── */}
      <Card className="no-print">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-1">
            <FileText className="h-4 w-4" />
            تقرير الإقامة
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={admPrintDeptId} onValueChange={setAdmPrintDeptId}>
              <SelectTrigger className="w-[180px]" data-testid="select-adm-print-dept">
                <SelectValue placeholder="اختر القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأقسام</SelectItem>
                {departments?.map(dept => (
                  <SelectItem key={dept.id} value={dept.id}>{dept.nameAr}</SelectItem>
                ))}
                <SelectItem value="none">بدون قسم</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => window.print()} data-testid="button-adm-print">
              <Printer className="h-3 w-3 ml-1" />
              {admPrintDeptId === "all" ? "طباعة الكل" : "طباعة قسم"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {admReportLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : !admReportData?.invoices || admReportData.invoices.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد فواتير للتقرير</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(admInvoicesByDepartment).map(([deptName, invs]) => (
                <div key={deptName} className="space-y-1">
                  <h4 className="text-xs font-bold">{deptName}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">رقم الفاتورة</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(invs as any[]).map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-xs">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                          <TableCell className="text-xs">{formatCurrency(inv.netAmount || inv.totalAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs font-medium text-left">
                    إجمالي القسم:{" "}
                    {formatCurrency(
                      (invs as any[]).reduce(
                        (s, inv) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0
                      )
                    )}
                  </p>
                </div>
              ))}
              <div className="border-t pt-2">
                <p className="text-sm font-bold">الإجمالي الكلي: {formatCurrency(admTotalAllInvoices)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── منطقة الطباعة (مخفية في الشاشة) ── */}
      <div id="adm-print-area" ref={admPrintRef} style={{ display: "none" }} dir="rtl">
        <div style={{ visibility: "visible" }}>
          <h2 style={{ textAlign: "center", marginBottom: "10px" }}>تقرير إقامة مريض</h2>
          <table style={{ width: "100%", marginBottom: "15px" }}>
            <tbody>
              <tr>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>رقم الإقامة:</strong> {adm.admissionNumber}</td>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>اسم المريض:</strong> {adm.patientName}</td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>التليفون:</strong> {adm.patientPhone || "—"}</td>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>الطبيب:</strong> {adm.doctorName || "—"}</td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>تاريخ الإقامة:</strong> {adm.admissionDate}</td>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>تاريخ الخروج:</strong> {adm.dischargeDate || "—"}</td>
              </tr>
            </tbody>
          </table>

          {Object.entries(admFilteredPrintInvoices).map(([deptName, invs]) => (
            <div key={deptName} style={{ marginBottom: "15px" }}>
              <h3 style={{ borderBottom: "2px solid #333", paddingBottom: "3px" }}>{deptName}</h3>
              {(invs as any[]).map((inv: any) => (
                <div key={inv.id} style={{ marginBottom: "10px" }}>
                  <p style={{ fontSize: "10pt", marginBottom: "4px" }}>
                    <strong>فاتورة رقم:</strong> {inv.invoiceNumber} |{" "}
                    <strong>التاريخ:</strong> {inv.invoiceDate}
                  </p>
                  {inv.lines?.length > 0 && (
                    <table>
                      <thead>
                        <tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
                      </thead>
                      <tbody>
                        {inv.lines.map((line: any, idx: number) => (
                          <tr key={idx}>
                            <td>{line.description}</td>
                            <td>{line.quantity}</td>
                            <td>{line.unitPrice}</td>
                            <td>{line.totalPrice}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p style={{ textAlign: "left", fontSize: "10pt", fontWeight: "bold" }}>
                    إجمالي الفاتورة: {inv.netAmount || inv.totalAmount}
                  </p>
                </div>
              ))}
              <p style={{ textAlign: "left", fontSize: "11pt", fontWeight: "bold", borderTop: "1px solid #999", paddingTop: "3px" }}>
                إجمالي {deptName}:{" "}
                {(invs as any[]).reduce(
                  (s, inv) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0
                ).toFixed(2)}
              </p>
            </div>
          ))}

          <div style={{ borderTop: "3px double #333", paddingTop: "8px", marginTop: "10px" }}>
            <h3 style={{ textAlign: "left" }}>
              الإجمالي الكلي:{" "}
              {Object.values(admFilteredPrintInvoices)
                .flat()
                .reduce((s, inv: any) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0)
                .toFixed(2)}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
}
