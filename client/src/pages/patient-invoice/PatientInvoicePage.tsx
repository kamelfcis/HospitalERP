import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, BedDouble, Building2, Stethoscope, UserCheck, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

import { getStatusBadgeClass, getServiceRowClass } from "./utils/statusHelpers";

import { InvoiceTab }       from "./tabs/InvoiceTab";
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
import { useInvoiceMutations }   from "./hooks/useInvoiceMutations";
import { useInvoiceValidation }  from "./hooks/useInvoiceValidation";
import { useSearchState }        from "./hooks/useSearchState";
import { useDoctorTransfer }     from "./hooks/useDoctorTransfer";
import { useStatsDialog }        from "./hooks/useStatsDialog";
import { useAutoSave }           from "./hooks/useAutoSave";
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

export default function PatientInvoice() {
  const { toast }        = useToast();
  const { hasPermission, user, allowedDepartmentIds, allowedWarehouseIds } = useAuth();
  const canDiscount      = hasPermission("patient_invoices.discount");

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState("invoice");
  const [subTab,  setSubTab]  = useState("lines");
  const [distOpen, setDistOpen]               = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);

  // ── OPD Appointment context ──────────────────────────────────────────────────
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

  // ── Scope-filtered lists (enforced by allowedDepartmentIds / allowedWarehouseIds) ──
  // [] = full access (admin/owner) → show all
  const visibleDepartments = useMemo(() => {
    if (!departments) return departments;
    if (allowedDepartmentIds.length === 0) return departments;
    return departments.filter((d) => allowedDepartmentIds.includes(d.id));
  }, [departments, allowedDepartmentIds]);

  const visibleWarehouses = useMemo(() => {
    if (!warehouses) return warehouses;
    if (allowedWarehouseIds.length === 0) return warehouses;
    return (warehouses as any[]).filter((w: any) => allowedWarehouseIds.includes(String(w.id)));
  }, [warehouses, allowedWarehouseIds]);

  // لو المستخدم مقيَّد بقسم/مخزن واحد فقط → اقفل الـ Select لمنع التشويش
  // admin/owner يملك [] → allowedDepartmentIds.length === 0 → لا يُقفل
  const deptLocked = allowedDepartmentIds.length > 0 && (visibleDepartments?.length ?? 0) <= 1;
  const whLocked   = allowedWarehouseIds.length  > 0 && ((visibleWarehouses as any[] | undefined)?.length ?? 0) <= 1;

  // ── Form state (with user defaults for new invoices) ────────────────────────
  const userDefaults = useMemo(() => ({
    warehouseId:  user?.defaultWarehouseId  ? String(user.defaultWarehouseId)  : undefined,
    departmentId: user?.departmentId        ? String(user.departmentId)        : undefined,
  }), [user?.defaultWarehouseId, user?.departmentId]);

  const form = useInvoiceForm(nextNumber, userDefaults);

  // ── Apply user defaults on first load (new invoice) ─────────────────────────
  useEffect(() => {
    if (!form.invoiceId && !form.warehouseId && userDefaults.warehouseId) {
      form.setWarehouseId(userDefaults.warehouseId);
    }
    if (!form.invoiceId && !form.departmentId && userDefaults.departmentId) {
      form.setDepartmentId(userDefaults.departmentId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDefaults.warehouseId, userDefaults.departmentId]);

  // ── Search state ────────────────────────────────────────────────────────────
  const search = useSearchState({ departmentId: form.departmentId });

  // ── Oversell feature flag (from public /api/settings cache) ─────────────
  const { data: publicSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });
  const oversellEnabled = publicSettings?.["enable_deferred_cost_issue"] === "true";

  // ── Line management (FEFO included) ─────────────────────────────────────────
  const lm = useLineManagement({
    warehouseId:      form.warehouseId,
    invoiceDate:      form.invoiceDate,
    departmentId:     form.departmentId,
    contractId:       form.contractId,
    setItemSearch:    search.setItemSearch,
    setItemResults:   (v) => search.setItemResults(v as unknown as Parameters<typeof search.setItemResults>[0]),
    addingItemRef:    search.addingItemRef,
    itemSearchRef:    search.itemSearchRef,
    oversellEnabled,
  });

  // ── Payments ─────────────────────────────────────────────────────────────────
  const payments = usePayments(user?.defaultTreasuryId ?? null);

  // ── Composite reset ──────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    form.resetForm({ warehouseId: userDefaults.warehouseId, departmentId: userDefaults.departmentId });
    lm.resetLines();
    payments.resetPayments();
    setSubTab("lines");
    setOpdContext(null);
  }, [form.resetForm, lm.resetLines, payments.resetPayments, userDefaults.warehouseId, userDefaults.departmentId]);

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

  // ── Auto-save ────────────────────────────────────────────────────────────────
  const { autoSaveStatus, resetAutoSave } = useAutoSave({
    formStatus:       form.status,
    invoiceId:        form.invoiceId,
    invoiceNumber:    form.invoiceNumber,
    invoiceDate:      form.invoiceDate,
    patientName:      form.patientName,
    patientPhone:     form.patientPhone,
    patientId:        form.patientId,
    patientType:      form.patientType,
    departmentId:     form.departmentId,
    warehouseId:      form.warehouseId,
    doctorName:       form.doctorName,
    contractName:     form.contractName,
    contractId:       form.contractId,
    companyId:        form.companyId,
    contractMemberId: form.contractMemberId,
    notes:            form.notes,
    admissionId:      form.admissionId,
    totals,
    lines:            lm.lines,
    payments:         payments.payments,
    onIdAssigned:     (id) => form.setInvoiceId(id),
  });

  // إعادة ضبط حالة الحفظ عند التبديل لفاتورة جديدة (invoiceId → null)
  useEffect(() => {
    if (!form.invoiceId) resetAutoSave();
  }, [form.invoiceId, resetAutoSave]);

  // ── Hooks ────────────────────────────────────────────────────────────────────
  const dt       = useDoctorTransfer({ invoiceId: form.invoiceId, invoiceStatus: form.status, netAmount: totals.netAmount });
  const stats    = useStatsDialog();
  const validate = useInvoiceValidation();

  const [zeroPriceReason, setZeroPriceReason] = useState("sample");

  const { saveMutation, finalizeMutation, zeroPriceOpen, setZeroPriceOpen, confirmZeroPrice } = useInvoiceMutations({
    invoiceId:        form.invoiceId,
    invoiceNumber:    form.invoiceNumber,
    invoiceDate:      form.invoiceDate,
    patientName:      form.patientName,
    patientPhone:     form.patientPhone,
    patientId:        form.patientId,
    patientType:      form.patientType,
    departmentId:     form.departmentId,
    warehouseId:      form.warehouseId,
    doctorName:       form.doctorName,
    contractName:     form.contractName,
    contractId:       form.contractId,
    companyId:        form.companyId,
    contractMemberId: form.contractMemberId,
    notes:            form.notes,
    admissionId:      form.admissionId,
    visitId:          form.visitId,
    totals,
    lines:            lm.lines,
    payments:         payments.payments,
    setInvoiceId:     form.setInvoiceId as (id: string) => void,
    setStatus:        form.setStatus,
    resetAll,
  });

  // ── Patient search callbacks (for PatientSearchCombobox) ─────────────────────
  const onPatientChange = useCallback((id: string, name: string, patientCode?: string | null) => {
    form.setPatientId(id);
    form.setPatientName(name);
    form.setPatientCode(patientCode || "");
  }, [form.setPatientId, form.setPatientName, form.setPatientCode]);

  const onPatientClear = useCallback(() => {
    form.setPatientId("");
    form.setPatientName("");
    form.setPatientCode("");
  }, [form.setPatientId, form.setPatientName, form.setPatientCode]);

  // ── Contract callbacks ───────────────────────────────────────────────────────
  const onContractChange = useCallback((resolved: ContractResolved) => {
    form.setContractId(resolved.contractId);
    form.setCompanyId(resolved.companyId);
    form.setContractName(resolved.contractName || resolved.companyName || "");
    form.setCompanyCoveragePct(resolved.companyCoveragePct || 100);
  }, [form.setContractId, form.setCompanyId, form.setContractName, form.setCompanyCoveragePct]);

  const onContractClear = useCallback(() => {
    form.setContractId("");
    form.setCompanyId("");
    form.setContractName("");
    form.setCompanyCoveragePct(100);
    form.setContractMemberId("");
  }, [form.setContractId, form.setCompanyId, form.setContractName, form.setCompanyCoveragePct, form.setContractMemberId]);

  // ── Member card callbacks ────────────────────────────────────────────────────
  const onMemberResolved = useCallback((resolved: MemberResolved) => {
    form.setContractMemberId(resolved.memberId);
    if (!form.contractId && resolved.contractId) {
      form.setContractId(resolved.contractId);
    }
    if (!form.companyId && resolved.companyId) {
      form.setCompanyId(resolved.companyId);
    }
    if (!form.contractName && resolved.companyName) {
      form.setContractName(resolved.companyName);
    }
    if (resolved.memberName && !form.patientName) {
      form.setPatientName(resolved.memberName);
    }
    form.setCompanyCoveragePct(resolved.companyCoveragePct);
  }, [form]);

  const onMemberCleared = useCallback(() => {
    form.setContractMemberId("");
  }, [form.setContractMemberId]);

  // ── Admissions hook ──────────────────────────────────────────────────────────
  const {
    admSelectedAdmission, setAdmSelectedAdmission,
    admIsCreateOpen, setAdmIsCreateOpen,
    admSearchQuery, setAdmSearchQuery,
    admStatusFilter, setAdmStatusFilter,
    admDeptFilter, setAdmDeptFilter, admDeptLocked,
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
  } = useAdmissions(mainTab, user?.departmentId ?? null);

  const { admCreateMutation, admDischargeMutation, admConsolidateMutation } = useAdmissionsMutations({
    onCreateSuccess: admHandleCloseCreate,
    admSelectedAdmission,
    setAdmSelectedAdmission,
  });

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

  // ── Pre-fill from reception visit (initVisitId + initPatientId + initDeptId) ─
  useEffect(() => {
    const sp          = new URLSearchParams(window.location.search);
    const initVisitId = sp.get("initVisitId");
    const initPatientId = sp.get("initPatientId");
    const initDeptId  = sp.get("initDeptId");
    if (!initVisitId && !initPatientId) return;

    if (initVisitId)  form.setVisitId(initVisitId);
    if (initDeptId)   form.setDepartmentId(initDeptId);

    if (initPatientId) {
      fetch(`/api/patients/${initPatientId}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then((pt: { id: string; fullName: string; phone?: string | null; patientCode?: string | null } | null) => {
          if (!pt) return;
          form.setPatientId(pt.id);
          form.setPatientName(pt.fullName);
          form.setPatientPhone(pt.phone || "");
          form.setPatientCode(pt.patientCode || "");
        })
        .catch(() => {});
    }

    window.history.replaceState({}, "", window.location.pathname);
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
      form.setPatientId(data.patientId || "");
      form.setPatientCode(data.patientCode || "");
      form.setDepartmentId(data.departmentId || "");
      form.setWarehouseId(data.warehouseId || "");
      form.setDoctorName(data.doctorName || "");
      form.setPatientType(data.patientType || "cash");
      form.setContractName(data.contractName || "");
      form.setContractId(data.contractId || "");
      form.setCompanyId(data.companyId || "");
      form.setContractMemberId(data.contractMemberId || "");
      form.setCompanyCoveragePct(parseFloat(data.companyCoveragePct) || 100);
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

          {/* ── OPD Context Banner ────────────────────────────────────────────── */}
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
            patientId={form.patientId}
            patientName={form.patientName}
            patientCode={form.patientCode}
            patientPhone={form.patientPhone}
            setPatientPhone={form.setPatientPhone}
            onPatientChange={onPatientChange}
            onPatientClear={onPatientClear}
            doctorName={form.doctorName}
            setDoctorName={form.setDoctorName}
            departmentId={form.departmentId}
            setDepartmentId={form.setDepartmentId}
            departments={visibleDepartments}
            deptLocked={deptLocked}
            warehouseId={form.warehouseId}
            setWarehouseId={form.setWarehouseId}
            warehouses={visibleWarehouses}
            whLocked={whLocked}
            admissionId={form.admissionId}
            setAdmissionId={form.setAdmissionId}
            activeAdmissions={activeAdmissions}
            patientType={form.patientType}
            setPatientType={form.setPatientType}
            contractId={form.contractId}
            contractName={form.contractName}
            onContractChange={onContractChange}
            onContractClear={onContractClear}
            contractMemberId={form.contractMemberId}
            onMemberResolved={onMemberResolved}
            onMemberCleared={onMemberCleared}
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
            autoSaveStatus={autoSaveStatus}
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
            admDeptLocked={admDeptLocked}
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

      {/* ── Doctor Transfer confirm sheet ──────────────────────────────────────── */}
      <DoctorTransferSheet
        open={dt.dtConfirmOpen}
        onOpenChange={dt.setDtConfirmOpen}
        doctorName={dt.dtDoctorName}
        amount={dt.dtAmount}
        notes={dt.dtNotes}
        isPending={dt.dtMutation.isPending}
        onConfirm={() => dt.dtMutation.mutate()}
      />

      {/* ── Distribute dialog ────────────────────────────────────────────────── */}
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

      {/* ── Header discount dialog ─────────────────────────────────────────── */}
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

      {/* ── Stock stats dialog ─────────────────────────────────────────────── */}
      <StockStatsDialog
        open={!!stats.statsItemId}
        itemName={stats.statsItemName}
        data={stats.statsData}
        isLoading={stats.statsLoading}
        onClose={stats.closeStatsDialog}
      />

      {/* ── Zero-price confirmation dialog ─────────────────────────────────── */}
      <Dialog open={zeroPriceOpen} onOpenChange={setZeroPriceOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-amber-600">بنود بسعر صفري</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            يوجد بنود بسعر صفري في الفاتورة. هل تريد المتابعة؟
          </p>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">سبب السعر الصفري:</label>
            <Select value={zeroPriceReason} onValueChange={setZeroPriceReason}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sample">عينة مجانية</SelectItem>
                <SelectItem value="donation">تبرع</SelectItem>
                <SelectItem value="internal">استخدام داخلي</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex flex-row-reverse gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => confirmZeroPrice(zeroPriceReason)}
              data-testid="button-confirm-zero-price"
            >
              متابعة
            </Button>
            <Button variant="outline" size="sm" onClick={() => setZeroPriceOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
