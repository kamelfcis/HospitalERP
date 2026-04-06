import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Save, CheckCircle, Plus, Loader2, Users, CreditCard,
  Search, XCircle, CheckCircle2,
} from "lucide-react";
import { patientInvoiceStatusLabels, patientTypeLabels } from "@shared/schema";
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

  // Patient fields — via PatientSearchCombobox
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

  // Contract / member card
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

  // ── member card lookup state ───────────────────────────────────────────────
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

  return (
    <div className="border rounded-md p-2 space-y-1.5 text-[12px]" dir="rtl">

      {/* ── Row 1: رقم + تاريخ + حالة + نوع المريض + الإقامة ───────────────── */}
      <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
        {invoiceId && (
          <Badge className={getStatusBadgeClass(status)} data-testid="badge-invoice-status">
            {patientInvoiceStatusLabels[status] || status}
          </Badge>
        )}
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">رقم:</Label>
          <Input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            disabled={!isDraft}
            className="h-7 text-xs w-24"
            data-testid="input-invoice-number"
          />
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">تاريخ:</Label>
          <Input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            disabled={!isDraft}
            className="h-7 text-xs w-36"
            data-testid="input-invoice-date"
          />
        </div>

        {/* نوع المريض: نقدي / تعاقد */}
        <div className="flex flex-row-reverse items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">النوع:</Label>
          <label className="flex flex-row-reverse items-center gap-1 cursor-pointer text-xs">
            <input
              type="radio"
              name="patientType"
              value="cash"
              checked={patientType === "cash"}
              onChange={() => setPatientType("cash")}
              disabled={!isDraft}
              data-testid="radio-patient-type-cash"
            />
            {patientTypeLabels.cash}
          </label>
          <label className="flex flex-row-reverse items-center gap-1 cursor-pointer text-xs">
            <input
              type="radio"
              name="patientType"
              value="contract"
              checked={patientType === "contract"}
              onChange={() => setPatientType("contract")}
              disabled={!isDraft}
              data-testid="radio-patient-type-contract"
            />
            {patientTypeLabels.contract}
          </label>
        </div>

        {/* الإقامة */}
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">الإقامة:</Label>
          <Select value={admissionId || "none"} onValueChange={(val) => {
            setAdmissionId(val === "none" ? "" : val);
            if (val && val !== "none") {
              const adm = (activeAdmissions || []).find(a => a.id === val);
              if (adm && !patientName) {
                onPatientChange("", adm.patientName);
              }
            }
          }} disabled={!isDraft}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-admission">
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
      </div>

      {/* ── Row 2: المريض + هاتف + القسم + المخزن + الطبيب ────────────────── */}
      <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">المريض:</Label>
          <PatientSearchCombobox
            value={patientId}
            selectedName={patientName}
            onChange={onPatientChange}
            onClear={onPatientClear}
            disabled={!isDraft}
            data-testid="patient-search"
          />
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">هاتف:</Label>
          <Input
            value={patientPhone}
            onChange={(e) => setPatientPhone(e.target.value)}
            disabled={!isDraft}
            className="h-7 text-xs w-28"
            data-testid="input-patient-phone"
          />
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">القسم:</Label>
          <Select value={departmentId} onValueChange={setDepartmentId} disabled={!isDraft}>
            <SelectTrigger className="h-7 text-xs w-32" data-testid="select-department">
              <SelectValue placeholder="اختر" />
            </SelectTrigger>
            <SelectContent>
              {(departments || []).map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>{dept.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">المخزن:</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId} disabled={!isDraft}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-warehouse">
              <SelectValue placeholder="اختر مخزن" />
            </SelectTrigger>
            <SelectContent>
              {(warehouses || []).filter((w: any) => w.isActive).map((w: any) => (
                <SelectItem key={w.id} value={String(w.id)}>{String(w.nameAr)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">الطبيب:</Label>
          <div className="w-44">
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

      {/* ── Row 3 (contract only): العقد / الجهة + بطاقة المنتسب ─────────── */}
      {patientType === "contract" && isDraft && (
        <div className="border rounded p-1.5 bg-blue-50/50 dark:bg-blue-950/20 space-y-1.5">
          {/* العقد */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-blue-700 dark:text-blue-300 text-xs">العقد / الجهة:</span>
            <ContractSelectCombobox
              value={contractId}
              onChange={(resolved) => {
                onContractChange(resolved);
              }}
              onClear={() => {
                onContractClear();
              }}
              disabled={!isDraft}
              data-testid="contract-select"
            />
          </div>

          {/* بطاقة المنتسب (اختياري) */}
          <div className="flex items-center gap-2 flex-wrap">
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-muted-foreground text-xs">
              بطاقة المنتسب:
              <span className="font-normal text-[10px] mr-1">(اختياري)</span>
            </span>

            {effectiveResolved || (contractMemberId && !resolvedInfo) ? (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="font-medium text-blue-700 text-[11px]" data-testid="text-resolved-member">
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
                  <XCircle className="h-3.5 w-3.5" />
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
                  placeholder="رقم بطاقة المنتسب..."
                  className="peachtree-input w-[180px] font-mono text-[11px]"
                  dir="ltr"
                  data-testid="input-member-card"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMemberLookup}
                  disabled={isLooking || cardNumber.trim().length < 2}
                  className="h-[26px] px-2"
                  data-testid="button-lookup-member"
                >
                  {isLooking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                </Button>
              </div>
            )}

            {lookupError && (
              <span className="text-red-600 text-[11px]" data-testid="text-member-lookup-error">
                {lookupError}
              </span>
            )}
          </div>
        </div>
      )}

      {/* عرض الجهة للفواتير المعتمدة فقط */}
      {patientType === "contract" && !isDraft && contractName && (
        <div className="flex items-center gap-1 text-xs">
          <Label className="text-muted-foreground whitespace-nowrap">الجهة:</Label>
          <span className="font-medium text-blue-700 dark:text-blue-300" data-testid="text-contract-company">
            {contractName}
          </span>
        </div>
      )}

      {/* ── Row 4: ملاحظات ───────────────────────────────────────────────────── */}
      <div className="flex flex-row-reverse items-center gap-1">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">ملاحظات:</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!isDraft}
          className="h-7 text-xs flex-1"
          placeholder="ملاحظات..."
          data-testid="input-notes"
        />
      </div>

      {/* ── Row 5: أزرار الإجراء ────────────────────────────────────────────── */}
      <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={resetForm}
          data-testid="button-new"
        >
          <Plus className="h-3 w-3 ml-1" />
          جديد
        </Button>
        {isDraft && (
          <>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !patientName || !invoiceNumber}
              data-testid="button-save"
            >
              {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
              حفظ
            </Button>
            {invoiceId && (
              <Button
                size="sm"
                variant="default"
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                className="bg-green-600 text-white border-green-700"
                data-testid="button-finalize"
              >
                {finalizeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <CheckCircle className="h-3 w-3 ml-1" />}
                اعتماد
              </Button>
            )}
            {lines.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={openDistributeDialog}
                data-testid="button-distribute"
                className="border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              >
                <Users className="h-3 w-3 ml-1" />
                توزيع على حالات
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
