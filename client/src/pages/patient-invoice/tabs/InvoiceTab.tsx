import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Department, Service, Item, Admission, DoctorTransfer } from "@shared/schema";
import type { LineLocal, PaymentLocal } from "../types";
import { InvoiceHeaderBar } from "../components/InvoiceHeaderBar";
import { InvoiceSidebar } from "../components/InvoiceSidebar";
import { UnifiedLinesTab } from "../components/UnifiedLinesTab";
import { ConsolidatedTab } from "./ConsolidatedTab";
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
  companyShareTotal?: number;
  patientShareTotal?: number;
  doctorCostTotal?: number;
}

interface InvoiceTabProps {
  invoiceId: string | null;
  invoiceNumber: string;
  setInvoiceNumber: (v: string) => void;
  invoiceDate: string;
  setInvoiceDate: (v: string) => void;
  status: string;
  isDraft: boolean;

  patientId: string;
  patientName: string;
  patientCode: string;
  patientPhone: string;
  setPatientPhone: (v: string) => void;
  onPatientChange: (id: string, name: string, patientCode?: string | null) => void;
  onPatientClear: () => void;

  doctorId: string;
  setDoctorId: (v: string) => void;
  doctorName: string;
  setDoctorName: (v: string) => void;
  billingMode: "hospital_collect" | "doctor_collect";
  setBillingMode: (v: "hospital_collect" | "doctor_collect") => void;

  departmentId: string;
  setDepartmentId: (v: string) => void;
  departments: Department[] | undefined;
  deptLocked?: boolean;

  warehouseId: string;
  setWarehouseId: (v: string) => void;
  warehouses: Record<string, unknown>[] | undefined;
  whLocked?: boolean;

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
  autoSaveStatus: import("../hooks/useAutoSave").AutoSaveStatus;
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

  warehouseIdForSearch?: string;
}

export function InvoiceTab({
  invoiceId, invoiceNumber, setInvoiceNumber,
  invoiceDate, setInvoiceDate,
  status, isDraft,
  patientId, patientName, patientCode, patientPhone, setPatientPhone,
  onPatientChange, onPatientClear,
  doctorId, setDoctorId, doctorName, setDoctorName,
  billingMode, setBillingMode,
  departmentId, setDepartmentId, departments, deptLocked,
  warehouseId, setWarehouseId, warehouses, whLocked,
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
  resetForm, saveMutation, finalizeMutation, autoSaveStatus,
  dtTransfers, dtAlreadyTransferred, dtRemaining,
  dtOpen, setDtOpen, dtAmount, setDtAmount,
  dtDoctorName, setDtDoctorName, dtNotes, setDtNotes, openDtConfirm,
  getStatusBadgeClass, getServiceRowClass,
  canDiscount, onOpenDiscountDialog,
  applyTemplate,
}: InvoiceTabProps) {
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
        doctorId={doctorId}
        setDoctorId={setDoctorId}
        doctorName={doctorName}
        setDoctorName={setDoctorName}
        billingMode={billingMode}
        setBillingMode={setBillingMode}
        departmentId={departmentId}
        setDepartmentId={setDepartmentId}
        departments={departments}
        deptLocked={deptLocked}
        warehouseId={warehouseId}
        setWarehouseId={setWarehouseId}
        whLocked={whLocked}
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
        autoSaveStatus={autoSaveStatus}
        getStatusBadgeClass={getStatusBadgeClass}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="lg:col-span-2 min-w-0">
          <div className="border rounded-md p-2">
            <Tabs value={subTab} onValueChange={setSubTab}>
              <TabsList className="w-full justify-start flex-wrap" data-testid="tabs-sub">
                <TabsTrigger value="lines" data-testid="tab-lines">بنود الفاتورة</TabsTrigger>
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
                  departmentId={departmentId}
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
        </div>

        <div className="lg:col-span-1">
          <div className="border rounded-md p-3 lg:sticky lg:top-2 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <InvoiceSidebar
              invoiceId={invoiceId}
              invoiceNumber={invoiceNumber}
              patientName={patientName}
              patientCode={patientCode}
              status={status}
              isDraft={isDraft}
              patientType={patientType}
              totals={totals}
              canDiscount={canDiscount}
              onOpenDiscountDialog={onOpenDiscountDialog}
              payments={payments}
              addPayment={addPayment}
              updatePayment={updatePayment}
              removePayment={removePayment}
              dtTransfers={dtTransfers}
              dtAlreadyTransferred={dtAlreadyTransferred}
              dtRemaining={dtRemaining}
              dtOpen={dtOpen}
              setDtOpen={setDtOpen}
              dtAmount={dtAmount}
              setDtAmount={setDtAmount}
              dtDoctorName={dtDoctorName}
              setDtDoctorName={setDtDoctorName}
              dtNotes={dtNotes}
              setDtNotes={setDtNotes}
              openDtConfirm={openDtConfirm}
              finalizeMutation={finalizeMutation}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
