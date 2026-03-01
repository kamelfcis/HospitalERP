import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Save, CheckCircle, Trash2, Plus, Loader2, Users } from "lucide-react";
import { patientInvoiceStatusLabels, patientTypeLabels } from "@shared/schema";
import type { Department, Admission } from "@shared/schema";
import { SearchDropdown } from "./SearchDropdown";
import type { LineLocal } from "../types";

interface InvoiceHeaderBarProps {
  invoiceId: string | null;
  invoiceNumber: string;
  setInvoiceNumber: (v: string) => void;
  invoiceDate: string;
  setInvoiceDate: (v: string) => void;
  status: string;
  isDraft: boolean;

  patientName: string;
  setPatientName: (v: string) => void;
  patientPhone: string;
  setPatientPhone: (v: string) => void;
  patientSearch: string;
  setPatientSearch: (v: string) => void;
  patientResults: any[];
  searchingPatients: boolean;
  showPatientDropdown: boolean;
  setShowPatientDropdown: (v: boolean) => void;
  patientSearchRef: React.RefObject<HTMLInputElement>;
  patientDropdownRef: React.RefObject<HTMLDivElement>;

  doctorName: string;
  setDoctorName: (v: string) => void;
  doctorSearch: string;
  setDoctorSearch: (v: string) => void;
  doctorResults: any[];
  searchingDoctors: boolean;
  showDoctorDropdown: boolean;
  setShowDoctorDropdown: (v: boolean) => void;
  doctorSearchRef: React.RefObject<HTMLInputElement>;
  doctorDropdownRef: React.RefObject<HTMLDivElement>;

  departmentId: string;
  setDepartmentId: (v: string) => void;
  departments: Department[] | undefined;

  warehouseId: string;
  setWarehouseId: (v: string) => void;
  warehouses: any[] | undefined;

  admissionId: string;
  setAdmissionId: (v: string) => void;
  activeAdmissions: Admission[] | undefined;

  patientType: "cash" | "contract";
  setPatientType: (v: "cash" | "contract") => void;
  contractName: string;
  setContractName: (v: string) => void;

  notes: string;
  setNotes: (v: string) => void;

  lines: LineLocal[];
  resetForm: () => void;
  saveMutation: { mutate: () => void; isPending: boolean };
  finalizeMutation: { mutate: () => void; isPending: boolean };
  deleteMutation: { mutate: (id: string, opts?: any) => void; isPending: boolean };
  setConfirmDeleteId: (id: string | null) => void;
  openDistributeDialog: () => void;

  getStatusBadgeClass: (status: string) => string;
}

export function InvoiceHeaderBar({
  invoiceId, invoiceNumber, setInvoiceNumber,
  invoiceDate, setInvoiceDate,
  status, isDraft,
  patientName, setPatientName,
  patientPhone, setPatientPhone,
  patientSearch, setPatientSearch,
  patientResults, searchingPatients,
  showPatientDropdown, setShowPatientDropdown,
  patientSearchRef, patientDropdownRef,
  doctorName, setDoctorName,
  doctorSearch, setDoctorSearch,
  doctorResults, searchingDoctors,
  showDoctorDropdown, setShowDoctorDropdown,
  doctorSearchRef, doctorDropdownRef,
  departmentId, setDepartmentId, departments,
  warehouseId, setWarehouseId, warehouses,
  admissionId, setAdmissionId, activeAdmissions,
  patientType, setPatientType,
  contractName, setContractName,
  notes, setNotes,
  lines,
  resetForm, saveMutation, finalizeMutation, deleteMutation,
  setConfirmDeleteId, openDistributeDialog,
  getStatusBadgeClass,
}: InvoiceHeaderBarProps) {
  return (
    <div className="border rounded-md p-2 space-y-2">
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
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">المريض:</Label>
          <SearchDropdown
            inputRef={patientSearchRef}
            dropdownRef={patientDropdownRef}
            value={patientName}
            onChange={(v) => {
              setPatientName(v);
              setPatientSearch(v);
              setShowPatientDropdown(true);
            }}
            onClear={() => {
              setPatientSearch("");
              setShowPatientDropdown(false);
            }}
            onFocus={() => {
              if (patientName.length >= 1) {
                setPatientSearch(patientName);
                setShowPatientDropdown(true);
              }
            }}
            show={showPatientDropdown}
            setShow={setShowPatientDropdown}
            loading={searchingPatients}
            items={patientResults.map((p) => ({
              id: p.id,
              primary: p.fullName,
              secondary: `${p.phone || ""}${p.age ? ` | ${p.age} سنة` : ""}`,
              raw: p,
            }))}
            onSelect={(item) => {
              setPatientName(item.primary);
              setPatientPhone(item.raw?.phone || "");
              setPatientSearch("");
            }}
            disabled={!isDraft}
            placeholder="ابحث عن مريض..."
            inputClassName="h-7 text-xs w-40"
            dropdownWidth="w-72"
            inputTestId="input-patient-name"
            dropdownTestId="dropdown-patient-search"
            itemTestIdPrefix="option-patient"
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
          <Label className="text-xs text-muted-foreground whitespace-nowrap">الإقامة:</Label>
          <Select value={admissionId || "none"} onValueChange={(val) => {
            setAdmissionId(val === "none" ? "" : val);
            if (val && val !== "none") {
              const adm = (activeAdmissions || []).find(a => a.id === val);
              if (adm) {
                if (!patientName) setPatientName(adm.patientName);
                if (!patientPhone && adm.patientPhone) setPatientPhone(adm.patientPhone);
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
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">المخزن:</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId} disabled={!isDraft}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-warehouse">
              <SelectValue placeholder="اختر مخزن" />
            </SelectTrigger>
            <SelectContent>
              {(warehouses || []).filter((w: any) => w.isActive).map((w: any) => (
                <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">الطبيب:</Label>
          <SearchDropdown
            inputRef={doctorSearchRef}
            dropdownRef={doctorDropdownRef}
            value={doctorName}
            onChange={(v) => {
              setDoctorName(v);
              setDoctorSearch(v);
              setShowDoctorDropdown(true);
            }}
            onClear={() => {
              setDoctorSearch("");
              setShowDoctorDropdown(false);
            }}
            onFocus={() => {
              if (doctorName.length >= 1) {
                setDoctorSearch(doctorName);
                setShowDoctorDropdown(true);
              }
            }}
            show={showDoctorDropdown}
            setShow={setShowDoctorDropdown}
            loading={searchingDoctors}
            items={doctorResults.map((d) => ({
              id: d.id,
              primary: d.name,
              secondary: d.specialty || undefined,
              raw: d,
            }))}
            onSelect={(item) => {
              setDoctorName(item.primary);
              setDoctorSearch("");
            }}
            disabled={!isDraft}
            placeholder="ابحث عن طبيب..."
            inputClassName="h-7 text-xs w-32"
            dropdownWidth="w-60"
            inputTestId="input-doctor-name"
            dropdownTestId="dropdown-doctor-search"
            itemTestIdPrefix="option-doctor"
          />
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
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
        {patientType === "contract" && (
          <div className="flex flex-row-reverse items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">جهة:</Label>
            <Input
              value={contractName}
              onChange={(e) => setContractName(e.target.value)}
              disabled={!isDraft}
              className="h-7 text-xs w-32"
              data-testid="input-contract-name"
            />
          </div>
        )}
      </div>
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
            {invoiceId && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDeleteId(invoiceId)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete"
              >
                <Trash2 className="h-3 w-3 ml-1" />
                حذف
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
