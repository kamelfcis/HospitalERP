import { memo, useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Loader2, History, FileText, Banknote,
  Scissors, Printer,
  Stethoscope as DoctorIcon,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate } from "../../shared/formatters";
import type { AggregatedInvoice } from "../../shared/types";
import { pvToVisitKey, findPrimaryInvoice } from "./constants";
import type { Props, PatientVisit, VisitInvoiceSummary } from "./types";
import { FinancialSidebar } from "./components/FinancialSidebar";
import { ServicesTab } from "./components/ServicesTab";
import { InvoicePaymentsTab } from "./components/InvoicePaymentsTab";
import { EncounterBreakdownView } from "./components/EncounterComponents";
import { HeaderDiscountPanel, DoctorTransferPanel } from "./components/SidebarPanels";
import { InvoicePrintTab } from "./components/InvoicePrintTab";

export const ConsolidatedInvoiceTab = memo(function ConsolidatedInvoiceTab({
  data, isLoading, patientId, patientName, patientCode, sidebarContainer,
  onVisitHeaderChange,
}: Props) {
  const [selectedVisitKey, setSelectedVisitKey] = useState<string>("");
  const { toast } = useToast();

  const { data: patientVisits = [] } = useQuery<PatientVisit[]>({
    queryKey: ["/api/patients", patientId, "visits"],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/visits`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!patientId,
  });

  const selectedVisit = useMemo(
    () => patientVisits.find(pv => pvToVisitKey(pv) === selectedVisitKey) ?? null,
    [patientVisits, selectedVisitKey],
  );

  const displayVisit = useMemo(
    () => selectedVisit ?? patientVisits[0] ?? null,
    [selectedVisit, patientVisits],
  );

  const selectedVisitId = useMemo(() => {
    if (!selectedVisit) return null;
    return selectedVisit.id;
  }, [selectedVisit]);

  const { data: visitSummary, isLoading: isSummaryLoading } = useQuery<VisitInvoiceSummary>({
    queryKey: ["/api/visits", selectedVisitId, "invoice-summary"],
    queryFn: async () => {
      const r = await fetch(`/api/visits/${selectedVisitId}/invoice-summary`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل تحميل ملخص الزيارة");
      return r.json();
    },
    enabled: !!selectedVisitId,
    staleTime: 0,
    refetchInterval: 20_000,
  });

  const visitTotals = useMemo(() => {
    if (!data) return null;
    if (!selectedVisitKey) return data.totals;
    return data.byVisit.find(v => v.visitKey === selectedVisitKey) ?? null;
  }, [data, selectedVisitKey]);

  const primaryInvoice = useMemo(() => {
    if (!data) return undefined;
    if (!selectedVisitKey) return findPrimaryInvoice(data.invoices);
    const admId = selectedVisit?.admission_id ?? null;
    const visId = selectedVisit?.id ?? null;
    const inv = data.invoices.find(i =>
      (admId && i.admissionId === admId && i.isConsolidated) ||
      (!admId && visId && i.visitGroupId === null && i.admissionId === null)
    );
    return inv ?? findPrimaryInvoice(data.invoices);
  }, [data, selectedVisitKey, selectedVisit]);

  const { data: fullInvoice, refetch: refetchFullInvoice } = useQuery<any>({
    queryKey: ["/api/patient-invoices", primaryInvoice?.id],
    queryFn: async () => {
      const r = await fetch(`/api/patient-invoices/${primaryInvoice!.id}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!primaryInvoice?.id,
  });

  const isFinalClosed = visitSummary?.invoice?.isFinalClosed ?? primaryInvoice?.isFinalClosed ?? false;
  const canFinalClose = !!primaryInvoice && !isFinalClosed && primaryInvoice.status === "finalized";

  const finalCloseMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/patient-invoices/${id}/final-close`),
    onSuccess: () => {
      toast({ title: "تم الإغلاق النهائي", description: "تم إغلاق الفاتورة نهائياً بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
      if (selectedVisitId) queryClient.invalidateQueries({ queryKey: ["/api/visits", selectedVisitId, "invoice-summary"] });
      if (primaryInvoice?.id) queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices", primaryInvoice.id] });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: async (invoiceId: string) => apiRequest("POST", `/api/patient-invoices/${invoiceId}/finalize`),
    onSuccess: () => {
      toast({ title: "تم الاعتماد", description: "تم اعتماد فاتورة الزيارة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
      if (selectedVisitId) queryClient.invalidateQueries({ queryKey: ["/api/visits", selectedVisitId, "invoice-summary"] });
      if (primaryInvoice?.id) queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices", primaryInvoice.id] });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const handleDiscountUpdated = useCallback(() => {
    refetchFullInvoice();
    queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
  }, [patientId, refetchFullInvoice]);

  const handlePaymentAdded = useCallback(() => {
    refetchFullInvoice();
    queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "invoices-aggregated"] });
  }, [patientId, refetchFullInvoice]);

  const invoiceStatus = primaryInvoice?.status;
  const invoiceNumber = visitSummary?.invoice?.invoiceNumber ?? primaryInvoice?.invoiceNumber;

  useEffect(() => {
    if (!onVisitHeaderChange) return;
    if (!displayVisit && !invoiceNumber) { onVisitHeaderChange(null); return; }
    onVisitHeaderChange({
      doctorName: displayVisit?.doctor_name ?? null,
      departmentName: displayVisit?.department_name ?? null,
      admissionDate: displayVisit?.admission_date ?? null,
      dischargeDate: displayVisit?.discharge_date ?? null,
      admissionCreatedAt: displayVisit?.admission_created_at ?? null,
      admissionUpdatedAt: displayVisit?.admission_updated_at ?? null,
      visitNumber: displayVisit?.visit_number ?? null,
      visitType: displayVisit?.visit_type ?? null,
      invoiceNumber: invoiceNumber ?? null,
      invoiceStatus: invoiceStatus ?? null,
      isFinalClosed,
    });
  }, [displayVisit, invoiceNumber, invoiceStatus, isFinalClosed, onVisitHeaderChange]);

  if (isLoading) return (
    <div className="flex justify-center items-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (!data || data.totals.invoiceCount === 0) return (
    <div className="text-center py-12 text-muted-foreground text-sm">لا توجد فواتير طبية لهذا المريض</div>
  );

  const admissionId = selectedVisit?.admission_id ?? undefined;
  const visitId = (!admissionId && selectedVisit?.id) ? selectedVisit.id : undefined;
  const totalsForSidebar = visitTotals ?? data.totals;
  const hasEncounterView = !!selectedVisitId && !!visitSummary && visitSummary.encounters.length > 0;

  const notes = fullInvoice?.notes ?? "";
  const headerDiscountPercent = parseFloat(String(fullInvoice?.headerDiscountPercent ?? (primaryInvoice as any)?.["headerDiscountPercent"] ?? "0"));
  const headerDiscountAmount = parseFloat(String(fullInvoice?.headerDiscountAmount ?? (primaryInvoice as any)?.["headerDiscountAmount"] ?? "0"));

  const printPayments = data.invoices.flatMap((inv: any) => inv.payments ?? []);
  const printByDept = (data.byDepartment ?? []).map(d => ({
    departmentName: d.departmentName,
    totalAmount: d.totalAmount,
    discountAmount: d.discountAmount,
    netAmount: d.netAmount,
  }));
  const printByClass = (data.byClassification ?? []).map(c => ({
    lineTypeLabel: c.lineTypeLabel,
    lineCount: c.lineCount,
    netAmount: c.netAmount,
  }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-3 min-h-full">
        {/* Visit selector */}
        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          <History className="h-4 w-4 text-muted-foreground shrink-0" />
          {patientVisits.length > 0 ? (
            <Select
              value={selectedVisitKey || "__all__"}
              onValueChange={val => setSelectedVisitKey(val === "__all__" ? "" : val)}
            >
              <SelectTrigger className="h-8 text-xs w-[280px]" data-testid="select-visit-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">كل الزيارات ({patientVisits.length})</SelectItem>
                {patientVisits.map(pv => (
                  <SelectItem key={pv.id} value={pvToVisitKey(pv)}>
                    <span className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1 py-0 ${pv.visit_type === "inpatient" ? "border-indigo-400 text-indigo-700" : "border-teal-400 text-teal-700"}`}
                      >
                        {pv.visit_type === "inpatient" ? "داخلي" : "خارجي"}
                      </Badge>
                      {pv.visit_number}
                      {pv.department_name && <span className="text-muted-foreground text-[10px]">— {pv.department_name}</span>}
                      {pv.admission_date && <span className="text-muted-foreground text-[10px]">({fmtDate(pv.admission_date)})</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">لا توجد زيارات مسجلة — عرض إجمالي المريض</span>
          )}

          {selectedVisitKey && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => setSelectedVisitKey("")}
            >مسح</button>
          )}

          {selectedVisitId && isSummaryLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}

          {notes && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
              <FileText className="h-3 w-3 text-amber-600 shrink-0" />
              <span className="text-[10px] text-amber-700 truncate max-w-[300px]" title={notes}>
                {notes}
              </span>
            </div>
          )}
        </div>

        {hasEncounterView ? (
          <div className="flex-1 overflow-y-auto">
            <EncounterBreakdownView
              summary={visitSummary!}
              visitId={selectedVisitId!}
              patientId={patientId}
              admissionId={admissionId}
              onFinalize={() => primaryInvoice && finalizeMutation.mutate(primaryInvoice.id)}
              isFinalizePending={finalizeMutation.isPending}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <Tabs defaultValue="services" className="flex flex-col h-full">
              <TabsList className="h-8 shrink-0">
                <TabsTrigger value="services" className="text-xs px-3" data-testid="tab-services">
                  الخدمات
                </TabsTrigger>
                <TabsTrigger value="print" className="text-xs px-3" data-testid="tab-print">
                  <Printer className="h-3 w-3 ml-1" />
                  طباعة
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services" className="flex-1 overflow-y-auto mt-2 min-h-0">
                <ServicesTab
                  patientId={patientId}
                  admissionId={admissionId}
                  visitId={visitId}
                  isFinalClosed={isFinalClosed}
                />
              </TabsContent>

              <TabsContent value="print" className="flex-1 overflow-y-auto mt-2 min-h-0">
                <InvoicePrintTab
                  patientName={patientName}
                  patientCode={patientCode}
                  invoiceNumber={invoiceNumber}
                  invoiceDate={primaryInvoice?.invoiceDate}
                  totals={totalsForSidebar}
                  payments={printPayments}
                  byDepartment={printByDept}
                  byClassification={printByClass}
                  isFinalClosed={isFinalClosed}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {!hasEncounterView && (() => {
        const sidebarContent = (
          <div className="flex flex-col gap-3 pb-2">
            <FinancialSidebar
              totals={totalsForSidebar}
              isFinalClosed={isFinalClosed}
              canFinalClose={canFinalClose}
              onFinalClose={() => primaryInvoice && finalCloseMutation.mutate(primaryInvoice.id)}
              isPending={finalCloseMutation.isPending}
              finalClosedAt={primaryInvoice?.finalClosedAt}
              invoiceNumber={invoiceNumber}
              contractName={primaryInvoice?.contractName}
              companyShareAmount={data?.totals.companyShareAmount}
              patientShareAmount={data?.totals.patientShareAmount}
              invoiceStatus={invoiceStatus}
              onFinalize={primaryInvoice ? () => finalizeMutation.mutate(primaryInvoice.id) : undefined}
              isFinalizePending={finalizeMutation.isPending}
            />

            <div className="bg-white border rounded-xl overflow-hidden">
              <Tabs defaultValue="payments" className="w-full">
                <TabsList className="w-full h-8 rounded-none border-b bg-slate-50/80 px-1">
                  <TabsTrigger value="payments" className="text-[11px] px-2 py-1 gap-1 data-[state=active]:bg-green-50 data-[state=active]:text-green-700" data-testid="sidebar-tab-payments">
                    <Banknote className="h-3 w-3" />
                    المدفوعات
                  </TabsTrigger>
                  <TabsTrigger value="transfer" className="text-[11px] px-2 py-1 gap-1 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700" data-testid="sidebar-tab-transfer">
                    <DoctorIcon className="h-3 w-3" />
                    تحويل مديونية
                  </TabsTrigger>
                  {!isFinalClosed && invoiceStatus === "draft" && (
                    <TabsTrigger value="discount" className="text-[11px] px-2 py-1 gap-1 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700" data-testid="sidebar-tab-discount">
                      <Scissors className="h-3 w-3" />
                      خصم عام
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="payments" className="mt-0 p-2">
                  <InvoicePaymentsTab
                    patientId={patientId}
                    admissionId={admissionId}
                    visitId={visitId}
                    isFinalClosed={isFinalClosed}
                    primaryInvoiceId={primaryInvoice?.id}
                    primaryInvoiceStatus={invoiceStatus}
                    onPaymentAdded={handlePaymentAdded}
                  />
                </TabsContent>

                <TabsContent value="transfer" className="mt-0 p-2">
                  {primaryInvoice ? (
                    <DoctorTransferPanel
                      invoiceId={primaryInvoice.id}
                      isFinalClosed={isFinalClosed}
                      invoiceStatus={invoiceStatus ?? "draft"}
                      netAmount={primaryInvoice.netAmount}
                      patientId={patientId}
                      onTransferred={handlePaymentAdded}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">لا توجد فاتورة محددة</p>
                  )}
                </TabsContent>

                {!isFinalClosed && invoiceStatus === "draft" && primaryInvoice && (
                  <TabsContent value="discount" className="mt-0 p-2">
                    <HeaderDiscountPanel
                      invoiceId={primaryInvoice.id}
                      isFinalClosed={isFinalClosed}
                      invoiceStatus={invoiceStatus ?? "draft"}
                      currentDiscountPercent={headerDiscountPercent}
                      currentDiscountAmount={headerDiscountAmount}
                      netAmount={totalsForSidebar.netAmount}
                      onUpdated={handleDiscountUpdated}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </div>
        );

        return (
          <>
            {sidebarContainer && createPortal(sidebarContent, sidebarContainer)}
            {!sidebarContainer && (
              <div className="xl:hidden mt-3">
                {sidebarContent}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
});
