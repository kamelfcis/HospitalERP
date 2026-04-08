import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ScanSearch,
  Search,
  X,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  Stethoscope,
  Pill,
  Package,
  Phone,
  User,
  Building2,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import { useDebounce } from "@/pages/patients/useDebounce";

const OPD_DEPT_ID = "b3347de7-e3d1-4b63-b9d6-ba93175d1bce";

type PatientScope = {
  isFullAccess: boolean;
  allowedDepartmentIds: string[];
  allowedPharmacyIds: string[];
  allowedClinicIds: string[];
};

const fmt = (n: unknown) =>
  Number(n ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type InquiryRow = {
  uid: string;
  patient_id: string | null;
  patient_code: string | null;
  patient_name: string;
  patient_phone: string | null;
  department_id: string | null;
  dept_name: string | null;
  invoice_count: number;
  services_total: string;
  drugs_total: string;
  consumables_total: string;
  total_net: string;
  total_paid: string;
  total_outstanding: string;
  last_invoice_date: string | null;
};

type InquiryLine = {
  line_id: string;
  line_type: "service" | "drug" | "consumable";
  description: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  invoice_number: string;
  invoice_date: string;
  invoice_status: string;
  department_id: string | null;
  dept_name: string | null;
};

type InquiryResult = {
  rows: InquiryRow[];
  count: number;
  limit: number;
  hasMore: boolean;
};

type Department = { id: string; nameAr: string };
type Clinic = { id: string; nameAr: string; departmentId: string | null };

export default function PatientInquiryPage() {
  const [, navigate] = useLocation();
  const [adminDeptFilter, setAdminDeptFilter] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 400);

  const [selectedRow, setSelectedRow] = useState<InquiryRow | null>(null);
  const [activeTab, setActiveTab] = useState<"service" | "drug" | "consumable">("service");

  const { data: scope } = useQuery<PatientScope>({
    queryKey: ["/api/patient-scope"],
    staleTime: 60_000,
  });
  const isFullAccess = scope?.isFullAccess ?? true;
  const allowedDeptIds = scope?.allowedDepartmentIds ?? [];
  const allowedClinicIds = scope?.allowedClinicIds ?? [];
  const scopeReady = scope !== undefined;

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    enabled: isFullAccess,
  });

  // Clinic scope: user assigned to specific clinic(s)
  const hasClinicScope = !isFullAccess && allowedClinicIds.length > 0;
  const singleClinic   = hasClinicScope && allowedClinicIds.length === 1;

  // Clinic sub-filter: show when OPD dept is active (admin) OR user is scoped to OPD dept
  const activeDeptId = isFullAccess ? adminDeptFilter : (allowedDeptIds.length === 1 ? allowedDeptIds[0] : "");
  const showClinicFilter = (activeDeptId === OPD_DEPT_ID) && !singleClinic;

  const { data: clinics = [] } = useQuery<Clinic[]>({
    queryKey: ["/api/clinic-clinics"],
    enabled: showClinicFilter || hasClinicScope,
  });

  // Effective clinic filter sent to the API
  const effectiveClinicId = singleClinic
    ? allowedClinicIds[0]
    : (clinicId || null);

  const queryParams = new URLSearchParams();
  if (isFullAccess && adminDeptFilter) queryParams.set("deptId", adminDeptFilter);
  if (effectiveClinicId && (showClinicFilter || singleClinic)) queryParams.set("clinicId", effectiveClinicId);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  if (search) queryParams.set("search", search);
  const qs = queryParams.toString();

  const {
    data: result,
    isLoading,
    isError,
  } = useQuery<InquiryResult>({
    queryKey: ["/api/patient-inquiry", qs],
    queryFn: async () => {
      const res = await fetch(`/api/patient-inquiry${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطأ في جلب البيانات");
      }
      return res.json();
    },
    enabled: scopeReady && (isFullAccess || allowedDeptIds.length > 0),
    staleTime: 30_000,
  });

  const linesParams = new URLSearchParams();
  if (selectedRow?.patient_id) linesParams.set("patientId", selectedRow.patient_id);
  else if (selectedRow?.patient_name) linesParams.set("patientName", selectedRow.patient_name);
  if (activeTab) linesParams.set("lineType", activeTab);

  const { data: lines = [], isLoading: linesLoading } = useQuery<InquiryLine[]>({
    queryKey: ["/api/patient-inquiry/lines", selectedRow?.uid, activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/patient-inquiry/lines?${linesParams.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedRow,
    staleTime: 60_000,
  });

  const clearFilters = useCallback(() => {
    if (isFullAccess) setAdminDeptFilter("");
    setClinicId("");
    setDateFrom("");
    setDateTo("");
    setSearchRaw("");
  }, [isFullAccess]);

  const hasFilters = !!(adminDeptFilter || clinicId || dateFrom || dateTo || searchRaw);

  if (scopeReady && !isFullAccess && allowedDeptIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
        <AlertCircle className="h-10 w-10 text-amber-500" />
        <p className="text-sm font-medium">ليس لديك صلاحية عرض أي قسم</p>
        <p className="text-xs text-center">تواصل مع مدير النظام لتعيين الأقسام الخاصة بك</p>
      </div>
    );
  }

  const rows = result?.rows ?? [];

  const tabConfig = [
    { key: "service" as const,    label: "الخدمات",     icon: Stethoscope, color: "text-blue-600" },
    { key: "drug" as const,       label: "الأدوية",     icon: Pill,        color: "text-green-600" },
    { key: "consumable" as const, label: "المستهلكات",  icon: Package,     color: "text-orange-600" },
  ] as const;

  return (
    <div className="p-3 h-full flex flex-col space-y-2">

      {/* ─── Header ────────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-primary" />
          <div>
            <h1 className="text-sm font-bold text-foreground">استعلام المرضى</h1>
            <p className="text-xs text-muted-foreground">
              {isFullAccess ? "عرض شامل لجميع الأقسام" : `${allowedDeptIds.length} قسم محدد`}
            </p>
          </div>
        </div>
        {!isFullAccess && (
          <div className="flex items-center gap-1 flex-wrap">
            {allowedDeptIds.map(id => {
              const deptName = departments.find(d => d.id === id)?.nameAr
                ?? rows.find(r => r.department_id === id)?.dept_name
                ?? "...";
              return (
                <Badge key={id} variant="outline" className="text-xs gap-1 border-blue-300 text-blue-700 bg-blue-50">
                  <Building2 className="h-3 w-3" />
                  {deptName}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Filters ───────────────────────────────────────── */}
      <div className="peachtree-toolbar rounded flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالاسم أو التليفون..."
            value={searchRaw}
            onChange={e => setSearchRaw(e.target.value)}
            className="peachtree-input text-xs w-44"
            data-testid="input-search-inquiry"
          />
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">من:</Label>
          <input
            type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="peachtree-input text-xs w-32"
            data-testid="input-date-from-inquiry"
          />
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">إلى:</Label>
          <input
            type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="peachtree-input text-xs w-32"
            data-testid="input-date-to-inquiry"
          />
        </div>

        {isFullAccess && (
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">القسم:</Label>
            <Select value={adminDeptFilter || "all"} onValueChange={v => { setAdminDeptFilter(v === "all" ? "" : v); setClinicId(""); }}>
              <SelectTrigger className="h-7 text-xs w-36" data-testid="select-dept-inquiry">
                <SelectValue placeholder="كل الأقسام" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقسام</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* عيادة محددة مسبقاً للمستخدم — badge ثابت */}
        {singleClinic && (
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">العيادة:</Label>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
              <Stethoscope className="h-3 w-3" />
              {clinics.find(c => c.id === allowedClinicIds[0])?.nameAr ?? "..."}
            </span>
          </div>
        )}

        {/* عيادات متعددة مسموحة — dropdown مقيّد */}
        {hasClinicScope && !singleClinic && (
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">العيادة:</Label>
            <Select value={clinicId || "all"} onValueChange={v => setClinicId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-7 text-xs w-36" data-testid="select-clinic-inquiry">
                <SelectValue placeholder="كل عياداتك" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل عياداتك</SelectItem>
                {clinics.filter(c => allowedClinicIds.includes(c.id)).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* فلتر العيادة للأدمن عند اختيار قسم العيادات الخارجية */}
        {showClinicFilter && (
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">العيادة:</Label>
            <Select value={clinicId || "all"} onValueChange={v => setClinicId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-7 text-xs w-36" data-testid="select-clinic-inquiry">
                <SelectValue placeholder="كل العيادات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العيادات</SelectItem>
                {clinics.filter(c => !c.departmentId || c.departmentId === activeDeptId).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1" onClick={clearFilters} data-testid="button-clear-inquiry">
            <X className="h-3 w-3" />
            مسح
          </Button>
        )}
      </div>

      {/* ─── Limit warning ────────────────────────────────── */}
      {result?.hasMore && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          النتائج محدودة بـ 200 سجل — استخدم الفلاتر لتضييق البحث
        </div>
      )}

      {/* ─── Table ─────────────────────────────────────────── */}
      <div className="peachtree-grid rounded flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-40 gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            خطأ في جلب البيانات
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <ScanSearch className="h-8 w-8 opacity-30" />
            <p className="text-sm">لا توجد نتائج</p>
          </div>
        ) : (
          <div className="overflow-auto h-full">
            <table className="w-full text-xs border-collapse" dir="rtl">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  <th className="peachtree-th px-2 py-1.5 text-right w-8">#</th>
                  <th className="peachtree-th px-2 py-1.5 text-right">كود</th>
                  <th className="peachtree-th px-2 py-1.5 text-right">اسم المريض</th>
                  <th className="peachtree-th px-2 py-1.5 text-right">التليفون</th>
                  {isFullAccess && <th className="peachtree-th px-2 py-1.5 text-right">القسم</th>}
                  <th className="peachtree-th px-2 py-1.5 text-left">الخدمات</th>
                  <th className="peachtree-th px-2 py-1.5 text-left">الأدوية</th>
                  <th className="peachtree-th px-2 py-1.5 text-left">المستهلكات</th>
                  <th className="peachtree-th px-2 py-1.5 text-left">الإجمالي</th>
                  <th className="peachtree-th px-2 py-1.5 text-left">المسدد</th>
                  <th className="peachtree-th px-2 py-1.5 text-left">الباقي</th>
                  <th className="peachtree-th px-2 py-1.5 text-right">آخر فاتورة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const outstanding = Number(row.total_outstanding ?? 0);
                  return (
                    <tr
                      key={row.uid}
                      className="peachtree-row cursor-pointer hover:bg-accent/60"
                      onClick={() => { setSelectedRow(row); setActiveTab("service"); }}
                      data-testid={`row-inquiry-${idx}`}
                    >
                      <td className="peachtree-td px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                      <td className="peachtree-td px-2 py-1.5">
                        {row.patient_code
                          ? <Badge variant="outline" className="text-xs px-1 py-0 font-mono">{row.patient_code}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="peachtree-td px-2 py-1.5 font-medium">{row.patient_name}</td>
                      <td className="peachtree-td px-2 py-1.5 text-muted-foreground">{row.patient_phone ?? "—"}</td>
                      {isFullAccess && (
                        <td className="peachtree-td px-2 py-1.5">
                          <Badge variant="secondary" className="text-xs px-1 py-0">{row.dept_name ?? "—"}</Badge>
                        </td>
                      )}
                      <td className="peachtree-td px-2 py-1.5 text-left text-blue-700 font-mono">{fmt(row.services_total)}</td>
                      <td className="peachtree-td px-2 py-1.5 text-left text-green-700 font-mono">{fmt(row.drugs_total)}</td>
                      <td className="peachtree-td px-2 py-1.5 text-left text-orange-700 font-mono">{fmt(row.consumables_total)}</td>
                      <td className="peachtree-td px-2 py-1.5 text-left font-semibold font-mono">{fmt(row.total_net)}</td>
                      <td className="peachtree-td px-2 py-1.5 text-left text-emerald-700 font-mono">{fmt(row.total_paid)}</td>
                      <td className={`peachtree-td px-2 py-1.5 text-left font-semibold font-mono ${outstanding > 0 ? "text-red-600" : "text-green-600"}`}>
                        {fmt(outstanding)}
                      </td>
                      <td className="peachtree-td px-2 py-1.5 text-muted-foreground">
                        {row.last_invoice_date
                          ? new Date(row.last_invoice_date).toLocaleDateString("ar-EG")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Detail Sheet ──────────────────────────────────── */}
      <Sheet open={!!selectedRow} onOpenChange={open => !open && setSelectedRow(null)}>
        <SheetContent side="right" className="w-full sm:w-[560px] p-0 flex flex-col" dir="rtl">
          {selectedRow && (
            <>
              <SheetHeader className="px-4 py-3 border-b bg-muted/40">
                <SheetTitle className="text-sm flex items-start gap-2">
                  <User className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold">{selectedRow.patient_name}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedRow.patient_code && (
                        <Badge variant="outline" className="text-xs px-1 py-0 font-mono">{selectedRow.patient_code}</Badge>
                      )}
                      {selectedRow.patient_phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                          <Phone className="h-3 w-3" />{selectedRow.patient_phone}
                        </span>
                      )}
                      {selectedRow.dept_name && (
                        <Badge variant="secondary" className="text-xs px-1 py-0">{selectedRow.dept_name}</Badge>
                      )}
                    </div>
                  </div>
                </SheetTitle>

                {selectedRow.patient_id && (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-2 text-xs h-7"
                      onClick={() => navigate(`/patients/${selectedRow.patient_id}/file`)}
                      data-testid="button-open-patient-file"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      الملف الكامل للمريض
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="bg-background rounded border p-2 text-center">
                    <div className="text-xs text-muted-foreground">الإجمالي</div>
                    <div className="text-sm font-bold font-mono">{fmt(selectedRow.total_net)}</div>
                  </div>
                  <div className="bg-background rounded border p-2 text-center">
                    <div className="text-xs text-muted-foreground">المسدد</div>
                    <div className="text-sm font-bold text-emerald-600 font-mono">{fmt(selectedRow.total_paid)}</div>
                  </div>
                  <div className="bg-background rounded border p-2 text-center">
                    <div className="text-xs text-muted-foreground">الباقي</div>
                    <div className={`text-sm font-bold font-mono ${Number(selectedRow.total_outstanding) > 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmt(selectedRow.total_outstanding)}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex border-b bg-muted/20">
                {tabConfig.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2 ${
                      activeTab === tab.key
                        ? `border-primary text-primary bg-background`
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`tab-inquiry-${tab.key}`}
                  >
                    <tab.icon className={`h-3.5 w-3.5 ${activeTab === tab.key ? tab.color : ""}`} />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto p-3">
                {linesLoading ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : lines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
                    <ChevronLeft className="h-6 w-6 opacity-30" />
                    <p className="text-xs">لا توجد بنود</p>
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right pb-1.5 font-medium text-muted-foreground">الوصف</th>
                        <th className="text-center pb-1.5 font-medium text-muted-foreground w-12">كمية</th>
                        <th className="text-left pb-1.5 font-medium text-muted-foreground w-24">سعر الوحدة</th>
                        <th className="text-left pb-1.5 font-medium text-muted-foreground w-24">الإجمالي</th>
                        <th className="text-right pb-1.5 font-medium text-muted-foreground w-24">الفاتورة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(line => (
                        <tr key={line.line_id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-1.5 pr-0 font-medium">{line.description}</td>
                          <td className="py-1.5 text-center text-muted-foreground">{Number(line.quantity).toLocaleString("ar-EG")}</td>
                          <td className="py-1.5 text-left font-mono text-muted-foreground">{fmt(line.unit_price)}</td>
                          <td className="py-1.5 text-left font-mono font-semibold">{fmt(line.total_price)}</td>
                          <td className="py-1.5 text-right">
                            <div className="text-muted-foreground">{line.invoice_number}</div>
                            <div className="text-muted-foreground/70">{line.invoice_date ? new Date(line.invoice_date).toLocaleDateString("ar-EG") : ""}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2">
                        <td colSpan={3} className="pt-1.5 text-muted-foreground font-medium">الإجمالي</td>
                        <td className="pt-1.5 text-left font-mono font-bold">
                          {fmt(lines.reduce((s, l) => s + Number(l.total_price ?? 0), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
