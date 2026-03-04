import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeftRight, Stethoscope } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { Department, Service, Item, Admission, Doctor, DoctorTransfer } from "@shared/schema";
import type { LineLocal, PaymentLocal } from "../types";
import { LineGrid } from "../components/LineGrid";
import { InvoiceHeaderBar } from "../components/InvoiceHeaderBar";
import { TotalsSummaryCard } from "../components/TotalsSummaryCard";
import { DoctorSearchInput } from "../components/DoctorSearchInput";
import { PaymentsTab } from "./PaymentsTab";
import { ConsolidatedTab } from "./ConsolidatedTab";

interface Totals {
  totalAmount: number;
  discountAmount: number;
  headerDiscountPercent?: number;
  headerDiscountAmount?: number;
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

  canDiscount?: boolean;
  onOpenDiscountDialog?: () => void;
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
  resetForm, saveMutation, finalizeMutation, openDistributeDialog,
  dtTransfers, dtAlreadyTransferred, dtRemaining,
  dtOpen, setDtOpen, dtAmount, setDtAmount,
  dtDoctorName, setDtDoctorName, dtNotes, setDtNotes, openDtConfirm,
  getStatusBadgeClass, getServiceRowClass,
  canDiscount, onOpenDiscountDialog,
}: InvoiceTabProps) {
  const lineGridSharedProps = {
    isDraft,
    itemSearch, setItemSearch, setItemResults, itemResults, searchingItems, fefoLoading,
    serviceSearch, setServiceSearch, setServiceResults, serviceResults, searchingServices,
    itemSearchRef, itemDropdownRef, serviceSearchRef, serviceDropdownRef,
    pendingQtyRef,
    addServiceLine, addItemLine, updateLine, removeLine,
    handleQtyConfirm, handleUnitLevelChange, openStatsPopup,
    getServiceRowClass,
  };

  return (
    <div className="space-y-2">
      <InvoiceHeaderBar
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        setInvoiceNumber={setInvoiceNumber}
        invoiceDate={invoiceDate}
        setInvoiceDate={setInvoiceDate}
        status={status}
        isDraft={isDraft}
        patientName={patientName}
        setPatientName={setPatientName}
        patientPhone={patientPhone}
        setPatientPhone={setPatientPhone}
        patientSearch={patientSearch}
        setPatientSearch={setPatientSearch}
        patientResults={patientResults}
        searchingPatients={searchingPatients}
        showPatientDropdown={showPatientDropdown}
        setShowPatientDropdown={setShowPatientDropdown}
        patientSearchRef={patientSearchRef}
        patientDropdownRef={patientDropdownRef}
        doctorName={doctorName}
        setDoctorName={setDoctorName}
        doctorSearch={doctorSearch}
        setDoctorSearch={setDoctorSearch}
        doctorResults={doctorResults}
        searchingDoctors={searchingDoctors}
        showDoctorDropdown={showDoctorDropdown}
        setShowDoctorDropdown={setShowDoctorDropdown}
        doctorSearchRef={doctorSearchRef}
        doctorDropdownRef={doctorDropdownRef}
        departmentId={departmentId}
        setDepartmentId={setDepartmentId}
        departments={departments}
        warehouseId={warehouseId}
        setWarehouseId={setWarehouseId}
        warehouses={warehouses}
        admissionId={admissionId}
        setAdmissionId={setAdmissionId}
        activeAdmissions={activeAdmissions}
        patientType={patientType}
        setPatientType={setPatientType}
        contractName={contractName}
        setContractName={setContractName}
        notes={notes}
        setNotes={setNotes}
        lines={lines}
        resetForm={resetForm}
        saveMutation={saveMutation}
        finalizeMutation={finalizeMutation}
        openDistributeDialog={openDistributeDialog}
        getStatusBadgeClass={getStatusBadgeClass}
      />

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
            <LineGrid type="service" typeLines={filteredLines("service")} {...lineGridSharedProps} />
          </TabsContent>
          <TabsContent value="drugs" className="mt-2">
            <LineGrid type="drug" typeLines={filteredLines("drug")} {...lineGridSharedProps} />
          </TabsContent>
          <TabsContent value="consumables" className="mt-2">
            <LineGrid type="consumable" typeLines={filteredLines("consumable")} {...lineGridSharedProps} />
          </TabsContent>
          <TabsContent value="equipment" className="mt-2">
            <LineGrid type="equipment" typeLines={filteredLines("equipment")} {...lineGridSharedProps} />
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
        <div className="flex flex-row-reverse items-center gap-2">
          <TotalsSummaryCard totals={totals} />
          {isDraft && canDiscount && invoiceId && (
            <Button
              size="sm"
              variant="outline"
              className="border-orange-500 text-orange-600 dark:border-orange-400 dark:text-orange-400 shrink-0"
              onClick={onOpenDiscountDialog}
              data-testid="button-header-discount"
            >
              خصم الفاتورة
            </Button>
          )}
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
                <DoctorSearchInput
                  value={dtDoctorName}
                  onChange={setDtDoctorName}
                  placeholder="ابحث عن طبيب..."
                  inputClassName="h-7 text-xs w-44"
                  inputTestId="input-dt-doctor"
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
