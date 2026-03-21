import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Save, Loader2, CheckCircle2, CheckCheck, History, Star, ClipboardList, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDoctorConsultation } from "./hooks/useDoctorConsultation";
import { useFavoriteDrugs } from "./hooks/useFavoriteDrugs";
import { ComplaintQuadrant } from "./components/ComplaintQuadrant";
import { DiagnosisQuadrant } from "./components/DiagnosisQuadrant";
import { PrescriptionQuadrant } from "./components/PrescriptionQuadrant";
import { ServicesQuadrant } from "./components/ServicesQuadrant";
import { DoctorStatementTab } from "./components/DoctorStatementTab";
import { PrintPrescription } from "./components/PrintPrescription";
import { PatientHistoryPanel } from "./components/PatientHistoryPanel";
import { PatientSnapshot } from "./components/PatientSnapshot";
import { FavoritesPanel } from "./components/FavoritesPanel";
import { ConsultationTemplatePicker } from "./components/ConsultationTemplatePicker";
import { StructuredConsultationPanel } from "./components/StructuredConsultationPanel";
import { FollowUpActions } from "./components/FollowUpActions";
import { OrdersTrackingPanel } from "./components/OrdersTrackingPanel";
import { useAuth } from "@/hooks/use-auth";
import type { ConsultationTemplate } from "./hooks/useConsultationTemplates";

export default function DoctorConsultation() {
  const params = useParams<{ id: string }>();
  const appointmentId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();

  const [favTarget, setFavTarget] = useState<"chiefComplaint" | "notes">("chiefComplaint");

  const {
    form,
    isLoading,
    isDirty,
    isSaving,
    updateForm,
    addDrug,
    updateDrug,
    removeDrug,
    addServiceOrder,
    removeServiceOrder,
    saveNow,
    finishConsultation,
  } = useDoctorConsultation(appointmentId);

  const {
    favorites,
    frequentDrugs,
    isFavorite,
    getFavoriteId,
    isFrequent,
    addMutation: addFav,
    removeMutation: removeFav,
  } = useFavoriteDrugs(form.clinicId);

  function handleInsertFavorite(text: string) {
    const current = favTarget === "chiefComplaint" ? (form.chiefComplaint || "") : (form.notes || "");
    const separator = current.trim() ? "\n" : "";
    updateForm(favTarget, current + separator + text);
    toast({ title: "تم إدراج النص", description: `أُضيف إلى: ${favTarget === "chiefComplaint" ? "الشكوى" : "الملاحظات"}` });
  }

  function handleApplyTemplate(tpl: ConsultationTemplate) {
    updateForm("subjectiveSummary", tpl.subjectiveSummary);
    updateForm("objectiveSummary", tpl.objectiveSummary);
    updateForm("planSummary", tpl.planSummary);
    toast({ title: `تم تطبيق القالب: ${tpl.label}`, description: "يمكنك تعديل النص بحرية" });
  }

  const canUseFavorites = hasPermission("clinic.favorites.manage");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handlePrint = () => window.print();

  const handleFinish = async () => {
    const ok = await finishConsultation();
    if (ok) {
      toast({ title: "تم إنهاء الكشف بنجاح" });
      navigate("/clinic-booking");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-3 gap-3" dir="rtl">
      {/* ── شريط العنوان ── */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-bold text-foreground truncate">
              {form.patientName ? `كشف: ${form.patientName}` : "كشف الطبيب"}
            </h1>
            {form.doctorName && (
              <span className="text-sm text-muted-foreground">— {form.doctorName}</span>
            )}
            {form.clinicName && (
              <Badge variant="outline" className="text-xs">{form.clinicName}</Badge>
            )}
            {form.appointmentDate && (
              <span className="text-xs text-muted-foreground" dir="ltr">{form.appointmentDate}</span>
            )}
            {form.patientId && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs gap-1 text-purple-600 hover:text-purple-700 px-2"
                onClick={() => navigate(`/patients/${form.patientId}/file`)}
                data-testid="button-patient-file"
              >
                <History className="h-3 w-3" />
                ملف المريض
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSaving ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />حفظ...
            </span>
          ) : !isDirty ? (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />محفوظ
            </span>
          ) : null}
          <Button size="sm" variant="outline" className="gap-1 h-8" onClick={saveNow} data-testid="button-save-consultation">
            <Save className="h-3 w-3" />حفظ الآن
          </Button>
          <Button size="sm" variant="outline" className="gap-1 h-8" onClick={handlePrint} data-testid="button-print-prescription">
            <Printer className="h-3 w-3" />طباعة الروشتة
          </Button>
          <Button size="sm" className="gap-1 h-8 bg-green-600 hover:bg-green-700 text-white" onClick={handleFinish} disabled={isSaving} data-testid="button-finish-consultation">
            <CheckCheck className="h-3 w-3" />إنهاء الكشف
          </Button>
        </div>
      </div>

      {/* ── Patient Snapshot (replaces IntakeSummaryBanner — shows demographics + vitals + payer) ── */}
      <div className="shrink-0">
        <PatientSnapshot appointmentId={appointmentId} form={form} />
      </div>

      {/* ── التخطيط 2×2 ── */}
      <div className="grid grid-cols-2 gap-3 h-40 shrink-0">
        <ComplaintQuadrant
          value={form.chiefComplaint || ""}
          onChange={(v) => updateForm("chiefComplaint", v)}
        />
        <DiagnosisQuadrant
          diagnosis={form.diagnosis || ""}
          notes={form.notes || ""}
          onDiagnosisChange={(v) => updateForm("diagnosis", v)}
          onNotesChange={(v) => updateForm("notes", v)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <PrescriptionQuadrant
          drugs={form.drugs}
          onAdd={addDrug}
          onUpdate={updateDrug}
          onRemove={removeDrug}
          favorites={favorites}
          frequentDrugs={frequentDrugs}
          isFavorite={isFavorite}
          getFavoriteId={getFavoriteId}
          isFrequent={isFrequent}
          onAddFavorite={(data) => addFav.mutate(data)}
          onRemoveFavorite={(id) => removeFav.mutate(id)}
          defaultPharmacyId={form.defaultPharmacyId}
        />
        <ServicesQuadrant
          serviceOrders={form.serviceOrders}
          onAdd={addServiceOrder}
          onRemove={removeServiceOrder}
          hasConsultationServiceConfig={!!form.consultationServiceId}
        />
      </div>

      {/* ── التابات ── */}
      <div className="shrink-0 border-t pt-2">
        <Tabs defaultValue="structured">
          <TabsList className="h-8">
            <TabsTrigger value="structured" className="text-xs h-7 gap-1" data-testid="tab-structured-consultation">
              <ClipboardList className="h-3 w-3" />
              الكشف الهيكلي
            </TabsTrigger>
            {(form.patientId || form.patientName) && (
              <TabsTrigger value="history" className="text-xs h-7 gap-1" data-testid="tab-patient-history">
                <History className="h-3 w-3" />
                تاريخ المريض
              </TabsTrigger>
            )}
            <TabsTrigger value="orders" className="text-xs h-7 gap-1" data-testid="tab-orders-tracking">
              <Activity className="h-3 w-3" />
              متابعة الطلبات
            </TabsTrigger>
            <TabsTrigger value="statement" className="text-xs h-7">كشف الحساب</TabsTrigger>
            {canUseFavorites && (
              <TabsTrigger value="favorites" className="text-xs h-7 gap-1" data-testid="tab-doctor-favorites">
                <Star className="h-3 w-3" />
                نصوص محفوظة
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── الكشف الهيكلي: SOAP + متابعة + قوالب ── */}
          <TabsContent value="structured" className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">حقول اختيارية — تُحفظ تلقائياً مع باقي الكشف</span>
              <ConsultationTemplatePicker onApply={handleApplyTemplate} />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-3">
              <StructuredConsultationPanel form={form} onChange={updateForm} />
              <div className="border-t pt-2">
                <FollowUpActions
                  appointmentDate={form.appointmentDate}
                  followUpAfterDays={form.followUpAfterDays}
                  followUpReason={form.followUpReason}
                  suggestedFollowUpDate={form.suggestedFollowUpDate}
                  onChange={(patch) => {
                    if ("followUpAfterDays" in patch) updateForm("followUpAfterDays", patch.followUpAfterDays ?? null);
                    if ("followUpReason" in patch) updateForm("followUpReason", patch.followUpReason ?? null);
                    if ("suggestedFollowUpDate" in patch) updateForm("suggestedFollowUpDate", patch.suggestedFollowUpDate ?? null);
                  }}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-2 max-h-56 overflow-y-auto">
            <PatientHistoryPanel
              patientId={form.patientId}
              currentAppointmentId={appointmentId}
              patientName={form.patientName}
            />
          </TabsContent>

          <TabsContent value="orders" className="mt-2 max-h-56 overflow-y-auto">
            <OrdersTrackingPanel appointmentId={appointmentId} />
          </TabsContent>

          <TabsContent value="statement" className="mt-2">
            <DoctorStatementTab doctorId={form.doctorId} />
          </TabsContent>

          {canUseFavorites && (
            <TabsContent value="favorites" className="mt-2">
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="text-muted-foreground shrink-0">الإدراج في:</span>
                <button
                  className={`px-2 py-0.5 rounded border text-xs transition-colors ${favTarget === "chiefComplaint" ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:bg-muted"}`}
                  onClick={() => setFavTarget("chiefComplaint")}
                  data-testid="button-fav-target-complaint"
                >
                  خانة الشكوى
                </button>
                <button
                  className={`px-2 py-0.5 rounded border text-xs transition-colors ${favTarget === "notes" ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 hover:bg-muted"}`}
                  onClick={() => setFavTarget("notes")}
                  data-testid="button-fav-target-notes"
                >
                  خانة الملاحظات
                </button>
              </div>
              <div className="max-h-48 overflow-hidden">
                <FavoritesPanel
                  clinicId={form.clinicId}
                  onInsert={handleInsertFavorite}
                  currentText={favTarget === "chiefComplaint" ? (form.chiefComplaint || "") : (form.notes || "")}
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* ── روشتة الطباعة ── */}
      <PrintPrescription consultation={form} />
    </div>
  );
}
