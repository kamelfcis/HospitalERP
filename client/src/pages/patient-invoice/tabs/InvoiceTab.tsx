import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Save, CheckCircle, Trash2, Plus, Loader2, Users, Stethoscope, ArrowLeftRight } from "lucide-react";
import { formatNumber, formatCurrency, formatDateShort } from "@/lib/formatters";
import { patientInvoiceStatusLabels, patientTypeLabels } from "@shared/schema";
import type { Department, Service, Item, Admission, Doctor, DoctorTransfer } from "@shared/schema";
import type { LineLocal, PaymentLocal } from "../types";
import { LineGrid } from "./LineGrid";
import { PaymentsTab } from "./PaymentsTab";
import { ConsolidatedTab } from "./ConsolidatedTab";

interface Totals {
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
}

interface InvoiceTabProps {
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
  doctorResults: Doctor[];
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

  subTab: string;
  setSubTab: (v: string) => void;

  lines: LineLocal[];
  filteredLines: (type: string) => LineLocal[];

  itemSearch: string;
  setItemSearch: (v: string) => void;
  setItemResults: (v: Item[]) => void;
  itemResults: Item[];
  searchingItems: boolean;
  fefoLoading: boolean;
  serviceSearch: string;
  setServiceSearch: (v: string) => void;
  setServiceResults: (v: Service[]) => void;
  serviceResults: Service[];
  searchingServices: boolean;
  itemSearchRef: React.RefObject<HTMLInputElement>;
  itemDropdownRef: React.RefObject<HTMLDivElement>;
  serviceSearchRef: React.RefObject<HTMLInputElement>;
  serviceDropdownRef: React.RefObject<HTMLDivElement>;
  pendingQtyRef: React.MutableRefObject<Map<string, string>>;

  addServiceLine: (svc: any) => void;
  addItemLine: (item: any, type: "drug" | "consumable" | "equipment") => void;
  updateLine: (tempId: string, field: string, value: any) => void;
  removeLine: (tempId: string) => void;
  handleQtyConfirm: (tempId: string) => void;
  handleUnitLevelChange: (tempId: string, level: "major" | "medium" | "minor") => void;
  openStatsPopup: (itemId: string, name: string) => void;

  payments: PaymentLocal[];
  addPayment: () => void;
  updatePayment: (tempId: string, field: string, value: any) => void;
  removePayment: (tempId: string) => void;

  totals: Totals;

  resetForm: () => void;
  saveMutation: { mutate: () => void; isPending: boolean };
  finalizeMutation: { mutate: () => void; isPending: boolean };
  deleteMutation: { mutate: (id: string, opts?: any) => void; isPending: boolean };
  setConfirmDeleteId: (id: string | null) => void;
  openDistributeDialog: () => void;

  dtTransfers: DoctorTransfer[];
  dtAlreadyTransferred: number;
  dtRemaining: number;
  dtOpen: boolean;
  setDtOpen: (fn: (o: boolean) => boolean) => void;
  dtAmount: string;
  setDtAmount: (v: string) => void;
  dtDoctorName: string;
  setDtDoctorName: (v: string) => void;
  dtNotes: string;
  setDtNotes: (v: string) => void;
  openDtConfirm: () => void;

  getStatusBadgeClass: (status: string) => string;
  getServiceRowClass: (serviceType: string) => string;
}

export function InvoiceTab({
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
  subTab, setSubTab,
  lines, filteredLines,
  itemSearch, setItemSearch, setItemResults, itemResults, searchingItems, fefoLoading,
  serviceSearch, setServiceSearch, setServiceResults, serviceResults, searchingServices,
  itemSearchRef, itemDropdownRef, serviceSearchRef, serviceDropdownRef,
  pendingQtyRef,
  addServiceLine, addItemLine, updateLine, removeLine,
  handleQtyConfirm, handleUnitLevelChange, openStatsPopup,
  payments, addPayment, updatePayment, removePayment,
  totals,
  resetForm, saveMutation, finalizeMutation, deleteMutation,
  setConfirmDeleteId, openDistributeDialog,
  dtTransfers, dtAlreadyTransferred, dtRemaining,
  dtOpen, setDtOpen, dtAmount, setDtAmount,
  dtDoctorName, setDtDoctorName, dtNotes, setDtNotes, openDtConfirm,
  getStatusBadgeClass, getServiceRowClass,
}: InvoiceTabProps) {
  return (
    <div className="space-y-2">
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
          <div className="flex flex-row-reverse items-center gap-1 relative">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">المريض:</Label>
            <Input
              ref={patientSearchRef}
              value={patientName}
              onChange={(e) => {
                setPatientName(e.target.value);
                setPatientSearch(e.target.value);
                setShowPatientDropdown(true);
              }}
              onFocus={() => {
                if (patientName.length >= 1) {
                  setPatientSearch(patientName);
                  setShowPatientDropdown(true);
                }
              }}
              disabled={!isDraft}
              className="h-7 text-xs w-40"
              placeholder="ابحث عن مريض..."
              data-testid="input-patient-name"
            />
            {showPatientDropdown && (patientResults.length > 0 || searchingPatients) && (
              <div
                ref={patientDropdownRef}
                className="absolute top-full right-0 mt-1 w-72 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto"
                data-testid="dropdown-patient-search"
              >
                {searchingPatients && (
                  <div className="flex items-center justify-center gap-2 p-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>جاري البحث...</span>
                  </div>
                )}
                {patientResults.map((p) => (
                  <div
                    key={p.id}
                    className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex flex-row-reverse items-center justify-between gap-2 border-b last:border-b-0"
                    onClick={() => {
                      setPatientName(p.fullName);
                      setPatientPhone(p.phone || "");
                      setShowPatientDropdown(false);
                      setPatientSearch("");
                    }}
                    data-testid={`option-patient-${p.id}`}
                  >
                    <span className="font-medium truncate">{p.fullName}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {p.phone || ""}{p.age ? ` | ${p.age} سنة` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
          <div className="flex flex-row-reverse items-center gap-1 relative">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">الطبيب:</Label>
            <Input
              ref={doctorSearchRef}
              value={doctorName}
              onChange={(e) => {
                setDoctorName(e.target.value);
                setDoctorSearch(e.target.value);
                setShowDoctorDropdown(true);
              }}
              onFocus={() => {
                if (doctorName.length >= 1) {
                  setDoctorSearch(doctorName);
                  setShowDoctorDropdown(true);
                }
              }}
              disabled={!isDraft}
              className="h-7 text-xs w-32"
              placeholder="ابحث عن طبيب..."
              data-testid="input-doctor-name"
            />
            {showDoctorDropdown && (doctorResults.length > 0 || searchingDoctors) && (
              <div
                ref={doctorDropdownRef}
                className="absolute top-full right-0 mt-1 w-60 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto"
                data-testid="dropdown-doctor-search"
              >
                {searchingDoctors && (
                  <div className="flex items-center justify-center gap-2 p-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>جاري البحث...</span>
                  </div>
                )}
                {doctorResults.map((d) => (
                  <div
                    key={d.id}
                    className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex flex-row-reverse items-center justify-between gap-2 border-b last:border-b-0"
                    onClick={() => {
                      setDoctorName(d.name);
                      setShowDoctorDropdown(false);
                      setDoctorSearch("");
                    }}
                    data-testid={`option-doctor-${d.id}`}
                  >
                    <span className="font-medium truncate">{d.name}</span>
                    {d.specialty && <span className="text-muted-foreground whitespace-nowrap">{d.specialty}</span>}
                  </div>
                ))}
              </div>
            )}
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
      </div>

      <div className="border rounded-md p-2">
        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList className="w-full justify-start flex-wrap" data-testid="tabs-sub">
            <TabsTrigger value="services" data-testid="tab-services">خدمات</TabsTrigger>
            <TabsTrigger value="drugs" data-testid="tab-drugs">أدوية</TabsTrigger>
            <TabsTrigger value="consumables" data-testid="tab-consumables">مستهلكات</TabsTrigger>
            <TabsTrigger value="equipment" data-testid="tab-equipment">أجهزة</TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">سداد دفعات</TabsTrigger>
            <TabsTrigger value="consolidated" data-testid="tab-consolidated">فاتورة مجمعة</TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="mt-2">
            <LineGrid
              type="service"
              typeLines={filteredLines("service")}
              isDraft={isDraft}
              itemSearch={itemSearch}
              setItemSearch={setItemSearch}
              setItemResults={setItemResults}
              itemResults={itemResults}
              searchingItems={searchingItems}
              fefoLoading={fefoLoading}
              serviceSearch={serviceSearch}
              setServiceSearch={setServiceSearch}
              setServiceResults={setServiceResults}
              serviceResults={serviceResults}
              searchingServices={searchingServices}
              itemSearchRef={itemSearchRef}
              itemDropdownRef={itemDropdownRef}
              serviceSearchRef={serviceSearchRef}
              serviceDropdownRef={serviceDropdownRef}
              pendingQtyRef={pendingQtyRef}
              addServiceLine={addServiceLine}
              addItemLine={addItemLine}
              updateLine={updateLine}
              removeLine={removeLine}
              handleQtyConfirm={handleQtyConfirm}
              handleUnitLevelChange={handleUnitLevelChange}
              openStatsPopup={openStatsPopup}
              getServiceRowClass={getServiceRowClass}
            />
          </TabsContent>
          <TabsContent value="drugs" className="mt-2">
            <LineGrid
              type="drug"
              typeLines={filteredLines("drug")}
              isDraft={isDraft}
              itemSearch={itemSearch}
              setItemSearch={setItemSearch}
              setItemResults={setItemResults}
              itemResults={itemResults}
              searchingItems={searchingItems}
              fefoLoading={fefoLoading}
              serviceSearch={serviceSearch}
              setServiceSearch={setServiceSearch}
              setServiceResults={setServiceResults}
              serviceResults={serviceResults}
              searchingServices={searchingServices}
              itemSearchRef={itemSearchRef}
              itemDropdownRef={itemDropdownRef}
              serviceSearchRef={serviceSearchRef}
              serviceDropdownRef={serviceDropdownRef}
              pendingQtyRef={pendingQtyRef}
              addServiceLine={addServiceLine}
              addItemLine={addItemLine}
              updateLine={updateLine}
              removeLine={removeLine}
              handleQtyConfirm={handleQtyConfirm}
              handleUnitLevelChange={handleUnitLevelChange}
              openStatsPopup={openStatsPopup}
              getServiceRowClass={getServiceRowClass}
            />
          </TabsContent>
          <TabsContent value="consumables" className="mt-2">
            <LineGrid
              type="consumable"
              typeLines={filteredLines("consumable")}
              isDraft={isDraft}
              itemSearch={itemSearch}
              setItemSearch={setItemSearch}
              setItemResults={setItemResults}
              itemResults={itemResults}
              searchingItems={searchingItems}
              fefoLoading={fefoLoading}
              serviceSearch={serviceSearch}
              setServiceSearch={setServiceSearch}
              setServiceResults={setServiceResults}
              serviceResults={serviceResults}
              searchingServices={searchingServices}
              itemSearchRef={itemSearchRef}
              itemDropdownRef={itemDropdownRef}
              serviceSearchRef={serviceSearchRef}
              serviceDropdownRef={serviceDropdownRef}
              pendingQtyRef={pendingQtyRef}
              addServiceLine={addServiceLine}
              addItemLine={addItemLine}
              updateLine={updateLine}
              removeLine={removeLine}
              handleQtyConfirm={handleQtyConfirm}
              handleUnitLevelChange={handleUnitLevelChange}
              openStatsPopup={openStatsPopup}
              getServiceRowClass={getServiceRowClass}
            />
          </TabsContent>
          <TabsContent value="equipment" className="mt-2">
            <LineGrid
              type="equipment"
              typeLines={filteredLines("equipment")}
              isDraft={isDraft}
              itemSearch={itemSearch}
              setItemSearch={setItemSearch}
              setItemResults={setItemResults}
              itemResults={itemResults}
              searchingItems={searchingItems}
              fefoLoading={fefoLoading}
              serviceSearch={serviceSearch}
              setServiceSearch={setServiceSearch}
              setServiceResults={setServiceResults}
              serviceResults={serviceResults}
              searchingServices={searchingServices}
              itemSearchRef={itemSearchRef}
              itemDropdownRef={itemDropdownRef}
              serviceSearchRef={serviceSearchRef}
              serviceDropdownRef={serviceDropdownRef}
              pendingQtyRef={pendingQtyRef}
              addServiceLine={addServiceLine}
              addItemLine={addItemLine}
              updateLine={updateLine}
              removeLine={removeLine}
              handleQtyConfirm={handleQtyConfirm}
              handleUnitLevelChange={handleUnitLevelChange}
              openStatsPopup={openStatsPopup}
              getServiceRowClass={getServiceRowClass}
            />
          </TabsContent>
          <TabsContent value="payments" className="mt-2">
            <PaymentsTab
              isDraft={isDraft}
              payments={payments}
              addPayment={addPayment}
              updatePayment={updatePayment}
              removePayment={removePayment}
            />
          </TabsContent>
          <TabsContent value="consolidated" className="mt-2">
            <ConsolidatedTab
              lines={lines}
              payments={payments}
              totals={totals}
              getServiceRowClass={getServiceRowClass}
            />
          </TabsContent>
        </Tabs>
      </div>

      <div className="border rounded-md p-2">
        <div className="flex flex-row-reverse flex-wrap items-center justify-between gap-3">
          <div className="flex flex-row-reverse flex-wrap items-center gap-3 text-sm">
            <div className="flex flex-row-reverse items-center gap-1">
              <span className="text-muted-foreground text-xs">الإجمالي:</span>
              <span className="font-bold text-xs" data-testid="text-footer-total">{formatCurrency(totals.totalAmount)}</span>
            </div>
            <div className="flex flex-row-reverse items-center gap-1">
              <span className="text-muted-foreground text-xs">الخصم:</span>
              <span className="font-bold text-xs" data-testid="text-footer-discount">{formatCurrency(totals.discountAmount)}</span>
            </div>
            <div className="flex flex-row-reverse items-center gap-1">
              <span className="text-muted-foreground text-xs">الصافي:</span>
              <span className="font-bold text-xs" data-testid="text-footer-net">{formatCurrency(totals.netAmount)}</span>
            </div>
            <div className="flex flex-row-reverse items-center gap-1">
              <span className="text-muted-foreground text-xs">المدفوع:</span>
              <span className="font-bold text-xs" data-testid="text-footer-paid">{formatCurrency(totals.paidAmount)}</span>
            </div>
            <div className="flex flex-row-reverse items-center gap-1">
              <span className="text-muted-foreground text-xs">المتبقي:</span>
              <span className={`font-bold text-xs ${totals.remaining > 0 ? "text-destructive" : ""}`} data-testid="text-footer-remaining">
                {formatCurrency(totals.remaining)}
              </span>
            </div>
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
      </div>

      {status === "finalized" && invoiceId && (
        <div className="border rounded-md p-2 space-y-2" data-testid="section-doctor-transfer">
          <div className="flex flex-row-reverse items-center gap-2">
            <Stethoscope className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold">تحويل مستحقات الطبيب</h3>
            <div className="flex-1" />
            {dtTransfers.length > 0 && (
              <span className="text-xs text-muted-foreground">
                محوّل: {formatCurrency(dtAlreadyTransferred)} | متبقي: {formatCurrency(dtRemaining)}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              onClick={() => { setDtOpen(o => !o); if (!dtOpen) setDtAmount(dtRemaining.toFixed(2)); }}
              data-testid="button-dt-open"
            >
              <ArrowLeftRight className="h-3 w-3 ml-1" />
              {dtOpen ? "إلغاء" : "تحويل للطبيب"}
            </Button>
          </div>

          {dtTransfers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الطبيب</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">ملاحظات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dtTransfers.map(t => (
                  <TableRow key={t.id} data-testid={`row-dt-${t.id}`}>
                    <TableCell className="text-xs">{t.doctorName}</TableCell>
                    <TableCell className="text-xs font-medium">{formatCurrency(parseFloat(t.amount))}</TableCell>
                    <TableCell className="text-xs">{formatDateShort(t.transferredAt as any)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {dtOpen && (
            <div className="flex flex-row-reverse items-end gap-2 flex-wrap border-t pt-2">
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs whitespace-nowrap">الطبيب *</Label>
                <Input
                  value={dtDoctorName}
                  onChange={e => setDtDoctorName(e.target.value)}
                  placeholder="اسم الطبيب"
                  className="h-7 text-xs w-40"
                  data-testid="input-dt-doctor"
                />
              </div>
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs whitespace-nowrap">المبلغ *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={dtAmount}
                  onChange={e => setDtAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-7 text-xs w-28"
                  data-testid="input-dt-amount"
                />
              </div>
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs whitespace-nowrap">ملاحظات</Label>
                <Input
                  value={dtNotes}
                  onChange={e => setDtNotes(e.target.value)}
                  placeholder="اختياري"
                  className="h-7 text-xs w-40"
                  data-testid="input-dt-notes"
                />
              </div>
              <Button
                size="sm"
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={openDtConfirm}
                data-testid="button-dt-confirm-open"
              >
                <ArrowLeftRight className="h-3 w-3 ml-1" />
                تأكيد التحويل
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
