import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Save, CheckCircle, Plus, Loader2, CreditCard,
  Search, XCircle, CheckCircle2, ChevronDown, ChevronUp,
} from "lucide-react";
import { patientInvoiceStatusLabels } from "@shared/schema";
import type { Department, Admission } from "@shared/schema";
import type { LineLocal } from "../types";
import { DoctorLookup } from "@/components/lookups";
import { PatientSearchCombobox } from "@/components/shared/PatientSearchCombobox";
import {
  ContractSelectCombobox,
  type ContractResolved,
} from "@/components/shared/ContractSelectCombobox";

interface MemberResolved {
  memberId:           string;
  contractId:         string;
  companyId:          string;
  memberName:         string;
  companyName:        string;
  cardNumber:         string;
  companyCoveragePct: number;
}

interface InvoiceHeaderBarProps {
  invoiceId: string | null;
  invoiceNumber: string;
  setInvoiceNumber: (v: string) => void;
  invoiceDate: string;
  setInvoiceDate: (v: string) => void;
  status: string;
  isDraft: boolean;

  patientId: string;
  patientName: string;
  patientPhone: string;
  setPatientPhone: (v: string) => void;
  onPatientChange: (id: string, name: string) => void;
  onPatientClear: () => void;

  doctorName: string;
  setDoctorName: (v: string) => void;

  departmentId: string;
  setDepartmentId: (v: string) => void;
  departments: Department[] | undefined;

  warehouseId: string;
  setWarehouseId: (v: string) => void;
  warehouses: Record<string, unknown>[] | undefined;

  admissionId: string;
  setAdmissionId: (v: string) => void;
  activeAdmissions: Admission[] | undefined;

  patientType: "cash" | "contract";
  setPatientType: (v: "cash" | "contract") => void;
  contractId: string;
  contractName: string;
  onContractChange: (resolved: ContractResolved) => void;
  onContractClear: () => void;
  contractMemberId: string;
  onMemberResolved: (resolved: MemberResolved) => void;
  onMemberCleared: () => void;

  notes: string;
  setNotes: (v: string) => void;

  lines: LineLocal[];
  resetForm: () => void;
  saveMutation: { mutate: () => void; isPending: boolean };
  finalizeMutation: { mutate: () => void; isPending: boolean };
  openDistributeDialog: () => void;

  getStatusBadgeClass: (status: string) => string;
}

export function InvoiceHeaderBar({
  invoiceId, invoiceNumber, setInvoiceNumber,
  invoiceDate, setInvoiceDate,
  status, isDraft,
  patientId, patientName, patientPhone, setPatientPhone,
  onPatientChange, onPatientClear,
  doctorName, setDoctorName,
  departmentId, setDepartmentId, departments,
  warehouseId, setWarehouseId, warehouses,
  admissionId, setAdmissionId, activeAdmissions,
  patientType, setPatientType,
  contractId, contractName,
  onContractChange, onContractClear,
  contractMemberId, onMemberResolved, onMemberCleared,
  notes, setNotes,
  lines,
  resetForm, saveMutation, finalizeMutation, openDistributeDialog,
  getStatusBadgeClass,
}: InvoiceHeaderBarProps) {
  const [localDoctorId, setLocalDoctorId] = useState("");

  // ── collapse state: new invoice → expanded, loaded invoice → collapsed ──
  const [expanded, setExpanded] = useState(!invoiceId);

  // When a saved invoice is loaded (invoiceId changes from null → id), auto-collapse
  useEffect(() => {
    if (invoiceId) {
      setExpanded(false);
    } else {
      setExpanded(true);
    }
  }, [invoiceId]);

  const [cardNumber,   setCardNumber]   = useState("");
  const [isLooking,    setIsLooking]    = useState(false);
  const [lookupError,  setLookupError]  = useState<string | null>(null);
  const [resolvedInfo, setResolvedInfo] = useState<MemberResolved | null>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const handleMemberLookup = useCallback(async () => {
    const card = cardNumber.trim();
    if (!card) return;
    setIsLooking(true);
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/contract-members/lookup?cardNumber=${encodeURIComponent(card)}&date=${invoiceDate}`
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).message || "لم يُعثر على المنتسب");
      }
      const data = await res.json();
      const resolved: MemberResolved = {
        memberId:           data.member?.id           || "",
        contractId:         data.contract?.id         || "",
        companyId:          data.company?.id          || "",
        memberName:         data.member?.memberName   || data.member?.name || "",
        companyName:        data.company?.nameAr      || data.company?.name || "",
        cardNumber:         card,
        companyCoveragePct: parseFloat(data.contract?.companyCoveragePct || "100") || 100,
      };
      setResolvedInfo(resolved);
      setCardNumber("");
      onMemberResolved(resolved);
    } catch (err: any) {
      setLookupError(err.message || "خطأ في البحث");
    } finally {
      setIsLooking(false);
    }
  }, [cardNumber, invoiceDate, onMemberResolved]);

  const handleClearMember = useCallback(() => {
    setResolvedInfo(null);
    setCardNumber("");
    setLookupError(null);
    onMemberCleared();
  }, [onMemberCleared]);

  const effectiveResolved = contractMemberId ? resolvedInfo : null;

  const dept = (departments || []).find(d => d.id === departmentId);

  // ── Action buttons (shared between collapsed and expanded) ──────────────
  const ActionButtons = (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-xs px-2 gap-0.5"
        onClick={resetForm}
        data-testid="button-new"
      >
        <Plus className="h-3 w-3" />
        جديد
      </Button>
      {isDraft && (
        <>
          <Button
            size="sm"
            className="h-6 text-xs px-2 gap-0.5"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !patientName || !invoiceNumber}
            data-testid="button-save"
          >
            {saveMutation.isPending
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Save className="h-3 w-3" />}
            حفظ
          </Button>
          {invoiceId && (
            <Button
              size="sm"
              className="h-6 text-xs px-2 gap-0.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending}
              data-testid="button-finalize"
            >
              {finalizeMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <CheckCircle className="h-3 w-3" />}
              اعتماد
            </Button>
          )}
          {lines.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2 border-blue-400 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              onClick={openDistributeDialog}
              data-testid="button-distribute"
            >
              توزيع
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="border rounded-md bg-card text-[12px] overflow-hidden" dir="rtl">

      {/* ══ شريط الملخص — يظهر دائماً ══════════════════════════════════════════ */}
      <div className="flex items-center gap-2 px-2 py-1 bg-muted/30 border-b border-border/40">

        {/* زر التوسعة */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title={expanded ? "تصغير" : "توسيع"}
          data-testid="button-toggle-header"
        >
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {/* الحالة */}
        {invoiceId && (
          <Badge className={`${getStatusBadgeClass(status)} shrink-0 text-[10px] px-1.5 py-0`} data-testid="badge-invoice-status">
            {patientInvoiceStatusLabels[status] || status}
          </Badge>
        )}

        {/* رقم */}
        <span className="font-mono text-xs font-semibold shrink-0 text-muted-foreground">
          #{invoiceNumber || "—"}
        </span>

        {/* تاريخ */}
        <span className="text-xs text-muted-foreground shrink-0">{invoiceDate}</span>

        {/* المريض */}
        {patientName && (
          <span className="font-semibold text-sm text-foreground truncate max-w-[200px]" data-testid="summary-patient-name">
            {patientName}
          </span>
        )}

        {/* القسم */}
        {dept && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {dept.nameAr}
          </Badge>
        )}

        {/* الطبيب */}
        {doctorName && (
          <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
            {doctorName}
          </span>
        )}

        {/* الجهة (تعاقد) */}
        {patientType === "contract" && contractName && (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] px-1.5 py-0 border-blue-300 shrink-0">
            {contractName}
          </Badge>
        )}

        {/* spacer */}
        <div className="flex-1" />

        {/* أزرار الإجراء — دائماً ظاهرة */}
        {ActionButtons}
      </div>

      {/* ══ تفاصيل الرأسية — قابلة للطي ═══════════════════════════════════════ */}
      {expanded && (
        <>
          {/* ── Row: كل الحقول في سطر واحد ──── */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 flex-wrap border-b border-border/40">

            {/* رقم */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">رقم</span>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                disabled={!isDraft}
                className="h-6 text-xs w-16 px-1"
                data-testid="input-invoice-number"
              />
            </div>

            {/* تاريخ */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">تاريخ</span>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                disabled={!isDraft}
                className="h-6 text-xs w-32 px-1"
                data-testid="input-invoice-date"
              />
            </div>

            {/* نوع المريض */}
            <div className="flex items-center gap-1.5 shrink-0 border-r border-border/40 pr-2">
              <span className="text-[10px] text-muted-foreground">نوع:</span>
              <label className="flex items-center gap-0.5 cursor-pointer text-xs">
                <input
                  type="radio" name="patientType" value="cash"
                  checked={patientType === "cash"}
                  onChange={() => setPatientType("cash")}
                  disabled={!isDraft}
                  className="accent-primary"
                  data-testid="radio-patient-type-cash"
                />
                <span className="text-[11px]">نقدي</span>
              </label>
              <label className="flex items-center gap-0.5 cursor-pointer text-xs">
                <input
                  type="radio" name="patientType" value="contract"
                  checked={patientType === "contract"}
                  onChange={() => setPatientType("contract")}
                  disabled={!isDraft}
                  className="accent-primary"
                  data-testid="radio-patient-type-contract"
                />
                <span className="text-[11px]">تعاقد</span>
              </label>
            </div>

            {/* الإقامة */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">إقامة</span>
              <Select value={admissionId || "none"} onValueChange={(val) => {
                setAdmissionId(val === "none" ? "" : val);
                if (val && val !== "none") {
                  const adm = (activeAdmissions || []).find(a => a.id === val);
                  if (adm && !patientName) onPatientChange("", adm.patientName);
                }
              }} disabled={!isDraft}>
                <SelectTrigger className="h-6 text-[11px] w-28 px-1" data-testid="select-admission">
                  <SelectValue placeholder="بدون إقامة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون إقامة</SelectItem>
                  {(activeAdmissions || []).map((adm) => (
                    <SelectItem key={adm.id} value={adm.id}>
                      {adm.admissionNumber} - {adm.patientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-px h-4 bg-border/50 shrink-0" />

            {/* المريض */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">مريض</span>
              <PatientSearchCombobox
                value={patientId}
                selectedName={patientName}
                onChange={onPatientChange}
                onClear={onPatientClear}
                disabled={!isDraft}
                data-testid="patient-search"
              />
            </div>

            {/* هاتف */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">هاتف</span>
              <Input
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                disabled={!isDraft}
                className="h-6 text-xs w-24 px-1"
                data-testid="input-patient-phone"
              />
            </div>

            <div className="w-px h-4 bg-border/50 shrink-0" />

            {/* القسم */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">قسم</span>
              <Select value={departmentId} onValueChange={setDepartmentId} disabled={!isDraft}>
                <SelectTrigger className="h-6 text-[11px] w-28 px-1" data-testid="select-department">
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {(departments || []).map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* المخزن */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">مخزن</span>
              <Select value={warehouseId} onValueChange={setWarehouseId} disabled={!isDraft}>
                <SelectTrigger className="h-6 text-[11px] w-28 px-1" data-testid="select-warehouse">
                  <SelectValue placeholder="اختر مخزن" />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses || []).filter((w: any) => w.isActive).map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>{String(w.nameAr)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* الطبيب */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">طبيب</span>
              <div className="w-36">
                <DoctorLookup
                  value={localDoctorId}
                  displayValue={doctorName}
                  onChange={(item) => {
                    setLocalDoctorId(item?.id || "");
                    setDoctorName(item?.name || "");
                  }}
                  disabled={!isDraft}
                  data-testid="lookup-invoice-doctor"
                />
              </div>
            </div>
          </div>

          {/* ── Row: ملاحظات ─────────────────────── */}
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border/40">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">ملاحظات</span>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isDraft}
              className="h-6 text-xs flex-1 px-1"
              placeholder="ملاحظات..."
              data-testid="input-notes"
            />
          </div>

          {/* ── شريط التعاقد ─────────────────────── */}
          {patientType === "contract" && isDraft && (
            <div className="flex items-center gap-2 px-2 py-1 bg-blue-50/60 dark:bg-blue-950/20 border-b border-blue-200/50 dark:border-blue-800/30 flex-wrap">
              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">العقد / الجهة:</span>
              <div className="shrink-0">
                <ContractSelectCombobox
                  value={contractId}
                  onChange={onContractChange}
                  onClear={onContractClear}
                  disabled={!isDraft}
                  data-testid="contract-select"
                />
              </div>
              <div className="w-px h-4 bg-blue-200/60 shrink-0" />
              <CreditCard className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground shrink-0">بطاقة:</span>
              {effectiveResolved || (contractMemberId && !resolvedInfo) ? (
                <div className="flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded px-2 py-0.5">
                  <CheckCircle2 className="h-3 w-3 text-blue-600 shrink-0" />
                  <span className="font-medium text-blue-700 dark:text-blue-300 text-[11px]" data-testid="text-resolved-member">
                    {effectiveResolved?.memberName || patientName || "منتسب محدد"}
                  </span>
                  {effectiveResolved?.companyName && (
                    <span className="text-muted-foreground text-[10px]">— {effectiveResolved.companyName}</span>
                  )}
                  <button
                    onClick={handleClearMember}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                    data-testid="button-clear-member"
                  >
                    <XCircle className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    ref={cardInputRef}
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleMemberLookup(); } }}
                    placeholder="رقم البطاقة..."
                    className="peachtree-input w-36 font-mono text-[11px] h-6"
                    dir="ltr"
                    data-testid="input-member-card"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMemberLookup}
                    disabled={isLooking || cardNumber.trim().length < 2}
                    className="h-6 px-2"
                    data-testid="button-lookup-member"
                  >
                    {isLooking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                  {lookupError && (
                    <span className="text-red-600 text-[10px]" data-testid="text-member-lookup-error">
                      {lookupError}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* عرض الجهة للفواتير المعتمدة */}
          {patientType === "contract" && !isDraft && contractName && (
            <div className="flex items-center gap-1 px-2 py-0.5 border-b border-border/40">
              <span className="text-[10px] text-muted-foreground">الجهة:</span>
              <span className="font-medium text-blue-700 dark:text-blue-300 text-xs" data-testid="text-contract-company">
                {contractName}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
