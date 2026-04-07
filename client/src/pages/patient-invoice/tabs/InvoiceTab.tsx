import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeftRight, Stethoscope } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { Department, Service, Item, Admission, DoctorTransfer } from "@shared/schema";
import type { LineLocal, PaymentLocal } from "../types";
import { InvoiceHeaderBar } from "../components/InvoiceHeaderBar";
import { TotalsSummaryCard } from "../components/TotalsSummaryCard";
import { DoctorLookup } from "@/components/lookups";
import { PaymentsTab } from "./PaymentsTab";
import { ConsolidatedTab } from "./ConsolidatedTab";
import { UnifiedLinesTab } from "../components/UnifiedLinesTab";
import type { ContractResolved } from "@/components/shared/ContractSelectCombobox";

interface MemberResolved {
  memberId:           string;
  contractId:         string;
  companyId:          string;
  memberName:         string;
  companyName:        string;
  cardNumber:         string;
  companyCoveragePct: number;
}

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

  // Patient (via PatientSearchCombobox)
  patientId: string;
  patientName: string;
  patientCode: string;
  patientPhone: string;
  setPatientPhone: (v: string) => void;
  onPatientChange: (id: string, name: string, patientCode?: string | null) => void;
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

  subTab: string;
  setSubTab: (v: string) => void;

  lines: LineLocal[];

  itemSearch: string;
  setItemSearch: (v: string) => void;
  setItemResults: (v: Item[]) => void;
  itemResults: Item[];
  searchingItems: boolean;
  fefoLoading: boolean;
  itemSearchRef: React.RefObject<HTMLInputElement>;
  itemDropdownRef: React.RefObject<HTMLDivElement>;
  pendingQtyRef: React.MutableRefObject<Map<string, string>>;

  addServiceLine: (svc: Service) => void;
  addItemLine: (item: Item, type: "drug" | "consumable" | "equipment") => void;
  updateLine: (tempId: string, field: string, value: unknown) => void;
  removeLine: (tempId: string) => void;
  handleQtyConfirm: (tempId: string) => void;
  handleUnitLevelChange: (tempId: string, level: "major" | "medium" | "minor") => void;
  openStatsPopup: (itemId: string, name: string) => void;

  payments: PaymentLocal[];
  addPayment: () => void;
  updatePayment: (tempId: string, field: string, value: unknown) => void;
  removePayment: (tempId: string) => void;

  totals: Totals;

  resetForm: () => void;
  saveMutation: { mutate: () => void; isPending: boolean };
  finalizeMutation: { mutate: () => void; isPending: boolean };
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
  applyTemplate?: (templateId: string, opts?: { replaceExisting?: boolean }) => Promise<void>;

  // ItemFastSearch support
  warehouseIdForSearch?: string;
}

export function InvoiceTab({
  invoiceId, invoiceNumber, setInvoiceNumber,
  invoiceDate, setInvoiceDate,
  status, isDraft,
  patientId, patientName, patientCode, patientPhone, setPatientPhone,
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
  subTab, setSubTab,
  lines,
  itemSearch, setItemSearch, setItemResults, itemResults, searchingItems, fefoLoading,
  itemSearchRef, itemDropdownRef,
  pendingQtyRef,
  addServiceLine, addItemLine, updateLine, removeLine,
  handleQtyConfirm, handleUnitLevelChange, openStatsPopup,
  payments, addPayment, updatePayment, removePayment,
  totals,
  resetForm, saveMutation, finalizeMutation,
  dtTransfers, dtAlreadyTransferred, dtRemaining,
  dtOpen, setDtOpen, dtAmount, setDtAmount,
  dtDoctorName, setDtDoctorName, dtNotes, setDtNotes, openDtConfirm,
  getStatusBadgeClass, getServiceRowClass,
  canDiscount, onOpenDiscountDialog,
  applyTemplate,
}: InvoiceTabProps) {
  const [localDtDoctorId, setLocalDtDoctorId] = useState("");

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
        patientId={patientId}
        patientName={patientName}
        patientCode={patientCode}
        patientPhone={patientPhone}
        setPatientPhone={setPatientPhone}
        onPatientChange={onPatientChange}
        onPatientClear={onPatientClear}
        doctorName={doctorName}
        setDoctorName={setDoctorName}
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
        contractId={contractId}
        contractName={contractName}
        onContractChange={onContractChange}
        onContractClear={onContractClear}
        contractMemberId={contractMemberId}
        onMemberResolved={onMemberResolved}
        onMemberCleared={onMemberCleared}
        notes={notes}
        setNotes={setNotes}
        lines={lines}
        resetForm={resetForm}
        saveMutation={saveMutation}
        finalizeMutation={finalizeMutation}
        getStatusBadgeClass={getStatusBadgeClass}
      />

      <div className="border rounded-md p-2">
        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList className="w-full justify-start flex-wrap" data-testid="tabs-sub">
            <TabsTrigger value="lines" data-testid="tab-lines">بنود الفاتورة</TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">سداد دفعات</TabsTrigger>
            <TabsTrigger value="consolidated" data-testid="tab-consolidated">فاتورة مجمعة</TabsTrigger>
          </TabsList>

          <TabsContent value="lines" className="mt-2">
            <UnifiedLinesTab
              lines={lines}
              isDraft={isDraft}
              itemSearch={itemSearch}
              setItemSearch={setItemSearch}
              setItemResults={setItemResults}
              itemResults={itemResults}
              searchingItems={searchingItems}
              fefoLoading={fefoLoading}
              itemSearchRef={itemSearchRef}
              itemDropdownRef={itemDropdownRef}
              pendingQtyRef={pendingQtyRef}
              addServiceLine={addServiceLine}
              addItemLine={addItemLine}
              updateLine={updateLine}
              removeLine={removeLine}
              handleQtyConfirm={handleQtyConfirm}
              handleUnitLevelChange={handleUnitLevelChange}
              openStatsPopup={openStatsPopup}
              getServiceRowClass={getServiceRowClass}
              applyTemplate={applyTemplate}
              warehouseId={warehouseId}
              invoiceDate={invoiceDate}
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
                <div className="w-44">
                  <DoctorLookup
                    value={localDtDoctorId}
                    displayValue={dtDoctorName}
                    onChange={(item) => {
                      setLocalDtDoctorId(item?.id || "");
                      setDtDoctorName(item?.name || "");
                    }}
                    data-testid="lookup-dt-doctor"
                  />
                </div>
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
