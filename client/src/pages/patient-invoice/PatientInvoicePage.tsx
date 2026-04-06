import { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search, BedDouble, Building2, Stethoscope, UserCheck, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

import { getStatusBadgeClass, getServiceRowClass } from "./utils/statusHelpers";

import { InvoiceTab }       from "./tabs/InvoiceTab";
import { RegistryTab }      from "./tabs/RegistryTab";
import { AdmissionsTab }    from "./tabs/AdmissionsTab";
import { SurgeryTypeBar }   from "./components/SurgeryTypeBar";
import { DistributeDialog } from "./components/DistributeDialog";
import { HeaderDiscountDialog }  from "./components/HeaderDiscountDialog";
import { DoctorTransferSheet }   from "./components/DoctorTransferSheet";
import { StockStatsDialog }      from "./components/StockStatsDialog";

import { useInvoiceBootstrap }   from "./hooks/useInvoiceBootstrap";
import { useInvoiceForm }        from "./hooks/useInvoiceForm";
import { useLineManagement }     from "./hooks/useLineManagement";
import { usePayments }           from "./hooks/usePayments";
import { useAdmissions }         from "./hooks/useAdmissions";
import { useAdmissionsMutations } from "./hooks/useAdmissionsMutations";
import { useRegistry }           from "./hooks/useRegistry";
import { useInvoiceMutations }   from "./hooks/useInvoiceMutations";
import { useInvoiceValidation }  from "./hooks/useInvoiceValidation";
import { useSearchState }        from "./hooks/useSearchState";
import { useDoctorTransfer }     from "./hooks/useDoctorTransfer";
import { useStatsDialog }        from "./hooks/useStatsDialog";

export default function PatientInvoice() {
  const { toast }        = useToast();
  const { hasPermission } = useAuth();
  const canDiscount      = hasPermission("patient_invoices.discount");

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState("invoice");
  const [subTab,  setSubTab]  = useState("lines");
  const [distOpen, setDistOpen]               = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);

  // ── OPD Appointment context (populated when loading an OPD-linked invoice) ──
  const [opdContext, setOpdContext] = useState<{
    appointmentId: string;
    aptStatus: string;
    paymentType: string;
    clinicName: string | null;
    doctorName: string | null;
    departmentName: string | null;
  } | null>(null);

  // ── Shared data ─────────────────────────────────────────────────────────────
  const { nextNumber, departments, warehouses, activeAdmissions } = useInvoiceBootstrap();

  // ── Form state ──────────────────────────────────────────────────────────────
  const form = useInvoiceForm(nextNumber);

  // ── Search state ────────────────────────────────────────────────────────────
  const search = useSearchState({ departmentId: form.departmentId });

  // ── Line management (FEFO included) ─────────────────────────────────────────
  const lm = useLineManagement({
    warehouseId:      form.warehouseId,
    invoiceDate:      form.invoiceDate,
    departmentId:     form.departmentId,
    setItemSearch:    search.setItemSearch,
    setItemResults:   (v) => search.setItemResults(v as unknown as Parameters<typeof search.setItemResults>[0]),
    addingItemRef:    search.addingItemRef,
    itemSearchRef:    search.itemSearchRef,
  });

  // ── Payments ─────────────────────────────────────────────────────────────────
  const payments = usePayments();

  // ── Composite reset ──────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    form.resetForm();
    lm.resetLines();
    payments.resetPayments();
    setSubTab("lines");
  }, [form.resetForm, lm.resetLines, payments.resetPayments]);

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalAmount  = lm.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const totalDiscount = lm.lines.reduce((s, l) => s + l.discountAmount, 0);
    const netAmount    = totalAmount - totalDiscount - form.headerDiscountAmount;
    const paidAmount   = payments.payments.reduce((s, p) => s + p.amount, 0);
    const remaining    = netAmount - paidAmount;
    return {
      totalAmount:          +totalAmount.toFixed(2),
      discountAmount:       +totalDiscount.toFixed(2),
      headerDiscountPercent: form.headerDiscountPercent,
      headerDiscountAmount:  form.headerDiscountAmount,
      netAmount:            +netAmount.toFixed(2),
      paidAmount:           +paidAmount.toFixed(2),
      remaining:            +remaining.toFixed(2),
    };
  }, [lm.lines, payments.payments, form.headerDiscountAmount, form.headerDiscountPercent]);

  // ── Hooks ────────────────────────────────────────────────────────────────────
  const dt       = useDoctorTransfer({ invoiceId: form.invoiceId, invoiceStatus: form.status, netAmount: totals.netAmount });
  const stats    = useStatsDialog();
  const validate = useInvoiceValidation();

  const [zeroPriceReason, setZeroPriceReason] = useState("sample");

  const { saveMutation, finalizeMutation, zeroPriceOpen, setZeroPriceOpen, confirmZeroPrice } = useInvoiceMutations({
    invoiceId:    form.invoiceId,
    invoiceNumber: form.invoiceNumber,
    invoiceDate:  form.invoiceDate,
    patientName:  form.patientName,
    patientPhone: form.patientPhone,
    patientType:  form.patientType,
    departmentId: form.departmentId,
    warehouseId:  form.warehouseId,
    doctorName:   form.doctorName,
    contractName: form.contractName,
    notes:        form.notes,
    admissionId:  form.admissionId,
    totals,
    lines:        lm.lines,
    payments:     payments.payments,
    setInvoiceId: form.setInvoiceId as (id: string) => void,
    setStatus:    form.setStatus,
    resetAll,
  });

  const {
    admSelectedAdmission, setAdmSelectedAdmission,
    admIsCreateOpen, setAdmIsCreateOpen,
    admSearchQuery, setAdmSearchQuery,
    admStatusFilter, setAdmStatusFilter,
    admDeptFilter, setAdmDeptFilter,
    admDateFrom, setAdmDateFrom,
    admDateTo, setAdmDateTo,
    admPatientSearch, setAdmPatientSearch,
    admPatientResults, admSearchingPatients,
    admShowPatientDropdown, setAdmShowPatientDropdown,
    admPatientSearchRef, admPatientDropdownRef,
    admFormData, setAdmFormData,
    admPrintDeptId, setAdmPrintDeptId, admPrintRef,
    admAllAdmissions, admListLoading,
    admPage, setAdmPage, admTotal, admTotalPages,
    admDetail, admInvoices, admInvoicesLoading,
    admReportData, admReportLoading,
    admInvoicesByDepartment, admFilteredPrintInvoices, admTotalAllInvoices,
    admStatusLabels, admGetStatusBadgeClass,
    admHandleCloseCreate, admHandleSelectPatient,
  } = useAdmissions(mainTab);

  const { admCreateMutation, admDischargeMutation, admConsolidateMutation } = useAdmissionsMutations({
    onCreateSuccess: admHandleCloseCreate,
    admSelectedAdmission,
    setAdmSelectedAdmission,
  });

  const {
    regPage, setRegPage, regDateFrom, setRegDateFrom,
    regDateTo, setRegDateTo, regPatientName, setRegPatientName,
    regDoctorName, setRegDoctorName, regStatus, setRegStatus,
    regPageSize, regTotalPages, regLoading, registryData,
  } = useRegistry(mainTab);

  // ── Document title ───────────────────────────────────────────────────────────
  useEffect(() => {
    const original = document.title;
    return () => { document.title = original; };
  }, []);
  useEffect(() => {
    document.title = form.patientName.trim() ? `فاتورة: ${form.patientName.trim()}` : "فاتورة مريض جديدة";
  }, [form.patientName]);

  // ── Auto-fill next invoice number ────────────────────────────────────────────
  useEffect(() => {
    if (nextNumber && !form.invoiceId && !form.invoiceNumber) form.setInvoiceNumber(nextNumber);
  }, [nextNumber, form.invoiceId, form.invoiceNumber]);

  // ── Load invoice from URL param ──────────────────────────────────────────────
  useEffect(() => {
    const loadId = new URLSearchParams(window.location.search).get("loadId");
    if (loadId) {
      loadInvoice(loadId);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ── Load invoice ─────────────────────────────────────────────────────────────
  const loadInvoice = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/patient-invoices/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      form.setInvoiceId(data.id);
      form.setInvoiceNumber(data.invoiceNumber);
      form.setInvoiceDate(data.invoiceDate);
      form.setPatientName(data.patientName);
      form.setPatientPhone(data.patientPhone || "");
      form.setDepartmentId(data.departmentId || "");
      form.setWarehouseId(data.warehouseId || "");
      form.setDoctorName(data.doctorName || "");
      form.setPatientType(data.patientType || "cash");
      form.setContractName(data.contractName || "");
      form.setNotes(data.notes || "");
      form.setAdmissionId(data.admissionId || "");
      form.setStatus(data.status);
      form.setHeaderDiscountPercent(parseFloat(data.headerDiscountPercent) || 0);
      form.setHeaderDiscountAmount(parseFloat(data.headerDiscountAmount) || 0);

      lm.loadLines(data.lines || []);
      payments.loadPayments(data.payments || []);
      setOpdContext(data.opdContext ?? null);

      setMainTab("invoice");
      setSubTab("lines");
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      toast({ title: "خطأ", description: _em, variant: "destructive" });
    }
  }, [toast, form, lm, payments]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const openDistributeDialog = useCallback(() => {
    if (!validate.validateDistribute({
      departmentId: form.departmentId,
      warehouseId:  form.warehouseId,
      doctorName:   form.doctorName,
      lines:        lm.lines,
    })) return;
    setDistOpen(true);
  }, [validate, form.departmentId, form.warehouseId, form.doctorName, lm.lines]);

  const admHandleCreateSubmit = () => {
    if (!admFormData.patientName.trim()) { toast({ title: "خطأ", description: "اسم المريض مطلوب", variant: "destructive" }); return; }
    if (!admFormData.admissionNumber.trim()) { toast({ title: "خطأ", description: "رقم الإقامة مطلوب", variant: "destructive" }); return; }
    if (!admFormData.admissionDate) { toast({ title: "خطأ", description: "تاريخ الإقامة مطلوب", variant: "destructive" }); return; }
    const body: any = {
      patientName: admFormData.patientName.trim(),
      patientPhone: admFormData.patientPhone || null,
      admissionDate: admFormData.admissionDate,
      admissionNumber: admFormData.admissionNumber.trim(),
      doctorName: admFormData.doctorName.trim() || null,
      notes: admFormData.notes.trim() || null,
    };
    if (admFormData.patientId) body.patientId = admFormData.patientId;
    admCreateMutation.mutate(body);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="patient-invoice-page p-2 space-y-2" dir="rtl" lang="ar" data-testid="page-patient-invoice">
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="w-full justify-start" data-testid="tabs-main">
          <TabsTrigger value="invoice" data-testid="tab-invoice">
            <FileText className="h-4 w-4 ml-1" />
            فاتورة مريض
          </TabsTrigger>
          <TabsTrigger value="registry" data-testid="tab-registry">
            <Search className="h-4 w-4 ml-1" />
            سجل المرضى
          </TabsTrigger>
          <TabsTrigger value="admission" data-testid="tab-admission">
            <BedDouble className="h-4 w-4 ml-1" />
            إقامة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoice" className="mt-2">
          {form.invoiceId && form.admissionId && (
            <SurgeryTypeBar
              invoiceId={form.invoiceId}
              admissionId={form.admissionId}
              isDraft={form.isDraft}
              onInvoiceReload={() => loadInvoice(form.invoiceId!)}
            />
          )}

          {/* ── OPD Context Banner — يظهر فقط للفواتير المرتبطة بموعد عيادة ── */}
          {opdContext && (
            <div className="flex items-center gap-3 flex-wrap bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-2 text-xs text-blue-800" dir="rtl">
              <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="font-semibold">فاتورة عيادة خارجية</span>
              <span className="text-blue-400">·</span>
              {opdContext.departmentName && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {opdContext.departmentName}
                </span>
              )}
              {opdContext.clinicName && (
                <span className="flex items-center gap-1">
                  <Stethoscope className="h-3 w-3" />
                  {opdContext.clinicName}
                </span>
              )}
              {opdContext.doctorName && (
                <span className="flex items-center gap-1">
                  <UserCheck className="h-3 w-3" />
                  د. {opdContext.doctorName}
                </span>
              )}
              {opdContext.paymentType === "CONTRACT" && (
                <span className="mr-auto bg-amber-100 text-amber-700 border border-amber-300 rounded px-1.5 py-0.5">تعاقد</span>
              )}
              {opdContext.paymentType === "INSURANCE" && (
                <span className="mr-auto bg-purple-100 text-purple-700 border border-purple-300 rounded px-1.5 py-0.5">تأمين</span>
              )}
            </div>
          )}

          <InvoiceTab
            invoiceId={form.invoiceId}
            invoiceNumber={form.invoiceNumber}
            setInvoiceNumber={form.setInvoiceNumber}
            invoiceDate={form.invoiceDate}
            setInvoiceDate={form.setInvoiceDate}
            status={form.status}
            isDraft={form.isDraft}
            patientName={form.patientName}
            setPatientName={form.setPatientName}
            patientPhone={form.patientPhone}
            setPatientPhone={form.setPatientPhone}
            patientSearch={search.patientSearch}
            setPatientSearch={search.setPatientSearch}
            patientResults={search.patientResults}
            searchingPatients={search.searchingPatients}
            showPatientDropdown={search.showPatientDropdown}
            setShowPatientDropdown={search.setShowPatientDropdown}
            patientSearchRef={search.patientSearchRef}
            patientDropdownRef={search.patientDropdownRef}
            doctorName={form.doctorName}
            setDoctorName={form.setDoctorName}
            departmentId={form.departmentId}
            setDepartmentId={form.setDepartmentId}
            departments={departments}
            warehouseId={form.warehouseId}
            setWarehouseId={form.setWarehouseId}
            warehouses={warehouses}
            admissionId={form.admissionId}
            setAdmissionId={form.setAdmissionId}
            activeAdmissions={activeAdmissions}
            patientType={form.patientType}
            setPatientType={form.setPatientType}
            contractName={form.contractName}
            setContractName={form.setContractName}
            notes={form.notes}
            setNotes={form.setNotes}
            subTab={subTab}
            setSubTab={setSubTab}
            lines={lm.lines}
            itemSearch={search.itemSearch}
            setItemSearch={search.setItemSearch}
            setItemResults={search.setItemResults}
            itemResults={search.itemResults}
            searchingItems={search.searchingItems}
            fefoLoading={lm.fefoLoading}
            itemSearchRef={search.itemSearchRef}
            itemDropdownRef={search.itemDropdownRef}
            pendingQtyRef={lm.pendingQtyRef}
            addServiceLine={lm.addServiceLine}
            addItemLine={lm.addItemLine}
            updateLine={lm.updateLine}
            removeLine={lm.removeLine}
            handleQtyConfirm={lm.handleQtyConfirm}
            handleUnitLevelChange={lm.handleUnitLevelChange}
            openStatsPopup={stats.openStatsPopup}
            payments={payments.payments}
            addPayment={payments.addPayment}
            updatePayment={payments.updatePayment}
            removePayment={payments.removePayment}
            totals={totals}
            resetForm={resetAll}
            saveMutation={saveMutation}
            finalizeMutation={finalizeMutation}
            openDistributeDialog={openDistributeDialog}
            dtTransfers={dt.dtTransfers}
            dtAlreadyTransferred={dt.dtAlreadyTransferred}
            dtRemaining={dt.dtRemaining}
            dtOpen={dt.dtOpen}
            setDtOpen={dt.setDtOpen}
            dtAmount={dt.dtAmount}
            setDtAmount={dt.setDtAmount}
            dtDoctorName={dt.dtDoctorName}
            setDtDoctorName={dt.setDtDoctorName}
            dtNotes={dt.dtNotes}
            setDtNotes={dt.setDtNotes}
            openDtConfirm={dt.openDtConfirm}
            getStatusBadgeClass={getStatusBadgeClass}
            getServiceRowClass={getServiceRowClass}
            canDiscount={canDiscount}
            onOpenDiscountDialog={() => setShowDiscountDialog(true)}
            applyTemplate={lm.applyTemplate}
          />
        </TabsContent>

        <TabsContent value="registry" className="mt-2">
          <RegistryTab
            regDateFrom={regDateFrom}
            setRegDateFrom={setRegDateFrom}
            regDateTo={regDateTo}
            setRegDateTo={setRegDateTo}
            regPatientName={regPatientName}
            setRegPatientName={setRegPatientName}
            regDoctorName={regDoctorName}
            setRegDoctorName={setRegDoctorName}
            regStatus={regStatus}
            setRegStatus={setRegStatus}
            regPage={regPage}
            setRegPage={setRegPage}
            regTotalPages={regTotalPages}
            regLoading={regLoading}
            registryData={registryData}
            regPageSize={regPageSize}
            loadInvoice={loadInvoice}
            getStatusBadgeClass={getStatusBadgeClass}
          />
        </TabsContent>

        <TabsContent value="admission" className="mt-2">
          <AdmissionsTab
            admSelectedAdmission={admSelectedAdmission}
            setAdmSelectedAdmission={(a) => setAdmSelectedAdmission(a)}
            admDetail={admDetail}
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
            admAllAdmissions={admAllAdmissions}
            admListLoading={admListLoading}
            admPage={admPage}
            setAdmPage={setAdmPage}
            admTotal={admTotal}
            admTotalPages={admTotalPages}
            admSearchQuery={admSearchQuery}
            setAdmSearchQuery={setAdmSearchQuery}
            admStatusFilter={admStatusFilter}
            setAdmStatusFilter={setAdmStatusFilter}
            admDeptFilter={admDeptFilter}
            setAdmDeptFilter={setAdmDeptFilter}
            admDateFrom={admDateFrom}
            setAdmDateFrom={setAdmDateFrom}
            admDateTo={admDateTo}
            setAdmDateTo={setAdmDateTo}
            admIsCreateOpen={admIsCreateOpen}
            setAdmIsCreateOpen={setAdmIsCreateOpen}
            admFormData={admFormData}
            setAdmFormData={setAdmFormData}
            admPatientSearch={admPatientSearch}
            setAdmPatientSearch={setAdmPatientSearch}
            admPatientResults={admPatientResults}
            admSearchingPatients={admSearchingPatients}
            admShowPatientDropdown={admShowPatientDropdown}
            setAdmShowPatientDropdown={setAdmShowPatientDropdown}
            admPatientSearchRef={admPatientSearchRef}
            admPatientDropdownRef={admPatientDropdownRef}
            admHandleSelectPatient={admHandleSelectPatient}
            admHandleCloseCreate={admHandleCloseCreate}
            admHandleCreateSubmit={admHandleCreateSubmit}
            admCreateMutation={admCreateMutation}
            admGetStatusBadgeClass={admGetStatusBadgeClass}
            admStatusLabels={admStatusLabels}
          />
        </TabsContent>
      </Tabs>

      {/* ── Doctor Transfer confirm sheet ─────────────────────────────────────── */}
      <DoctorTransferSheet
        open={dt.dtConfirmOpen}
        onOpenChange={dt.setDtConfirmOpen}
        doctorName={dt.dtDoctorName}
        amount={dt.dtAmount}
        notes={dt.dtNotes}
        isPending={dt.dtMutation.isPending}
        onConfirm={() => dt.dtMutation.mutate()}
      />

      {/* ── Distribute dialog ──────────────────────────────────────────────────── */}
      <DistributeDialog
        open={distOpen}
        onClose={() => setDistOpen(false)}
        lines={lm.lines}
        invoiceContext={{
          invoiceDate: form.invoiceDate,
          departmentId: form.departmentId,
          warehouseId: form.warehouseId,
          doctorName: form.doctorName,
          patientType: form.patientType,
          contractName: form.contractName,
          notes: form.notes,
          admissionId: form.admissionId,
          invoiceId: form.invoiceId,
        }}
        onSuccess={resetAll}
      />

      {/* ── Header discount dialog ────────────────────────────────────────────── */}
      {canDiscount && (
        <HeaderDiscountDialog
          open={showDiscountDialog}
          onOpenChange={setShowDiscountDialog}
          invoiceId={form.invoiceId}
          currentPercent={form.headerDiscountPercent}
          currentAmount={form.headerDiscountAmount}
          onApplied={(pct, amt) => {
            form.setHeaderDiscountPercent(pct);
            form.setHeaderDiscountAmount(amt);
          }}
        />
      )}

      {/* ── Stock stats dialog ────────────────────────────────────────────────── */}
      <StockStatsDialog
        open={!!stats.statsItemId}
        itemName={stats.statsItemName}
        data={stats.statsData}
        isLoading={stats.statsLoading}
        onClose={stats.closeStatsDialog}
      />

      {/* ── Zero-price confirmation dialog ───────────────────────────────────── */}
      <Dialog open={zeroPriceOpen} onOpenChange={setZeroPriceOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-amber-600">بنود بسعر صفري</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            بعض بنود الفاتورة تحتوي على سعر صفري. يرجى اختيار سبب الموافقة قبل الحفظ.
          </p>
          <Select value={zeroPriceReason} onValueChange={setZeroPriceReason} dir="rtl">
            <SelectTrigger data-testid="select-zero-price-reason">
              <SelectValue placeholder="اختر السبب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sample">عينة مجانية</SelectItem>
              <SelectItem value="promotional">عرض ترويجي</SelectItem>
              <SelectItem value="charity">خيري / إعانة</SelectItem>
              <SelectItem value="correction">تصحيح خطأ</SelectItem>
              <SelectItem value="other">أخرى</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => setZeroPriceOpen(false)} data-testid="button-cancel-zero-price">
              إلغاء
            </Button>
            <Button
              onClick={() => confirmZeroPrice(zeroPriceReason)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-zero-price"
            >
              تأكيد الحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
