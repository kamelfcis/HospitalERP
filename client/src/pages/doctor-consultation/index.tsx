import { useParams, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Save, ArrowRight, Loader2, CheckCircle2, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDoctorConsultation } from "./hooks/useDoctorConsultation";
import { useFavoriteDrugs } from "./hooks/useFavoriteDrugs";
import { ComplaintQuadrant } from "./components/ComplaintQuadrant";
import { DiagnosisQuadrant } from "./components/DiagnosisQuadrant";
import { PrescriptionQuadrant } from "./components/PrescriptionQuadrant";
import { ServicesQuadrant } from "./components/ServicesQuadrant";
import { DoctorStatementTab } from "./components/DoctorStatementTab";
import { PrintPrescription } from "./components/PrintPrescription";

export default function DoctorConsultation() {
  const params = useParams<{ id: string }>();
  const appointmentId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();

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
    isFrequent,
    addMutation: addFav,
    removeMutation: removeFav,
  } = useFavoriteDrugs();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleFinish = async () => {
    const ok = await finishConsultation();
    if (ok) {
      toast({ title: "تم إنهاء الكشف بنجاح" });
      navigate("/clinic-booking");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-3 gap-3" dir="rtl">
      {/* شريط العنوان */}
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
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSaving ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              حفظ...
            </span>
          ) : !isDirty ? (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              محفوظ
            </span>
          ) : null}
          <Button size="sm" variant="outline" className="gap-1 h-8" onClick={saveNow} data-testid="button-save-consultation">
            <Save className="h-3 w-3" />
            حفظ الآن
          </Button>
          <Button size="sm" variant="outline" className="gap-1 h-8" onClick={handlePrint} data-testid="button-print-prescription">
            <Printer className="h-3 w-3" />
            طباعة الروشتة
          </Button>
          <Button size="sm" className="gap-1 h-8 bg-green-600 hover:bg-green-700 text-white" onClick={handleFinish} disabled={isSaving} data-testid="button-finish-consultation">
            <CheckCheck className="h-3 w-3" />
            إنهاء الكشف
          </Button>
        </div>
      </div>

      {/* التخطيط 2×2 */}
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

      {/* التابات */}
      <div className="shrink-0 border-t pt-2">
        <Tabs defaultValue="consultation">
          <TabsList className="h-8">
            <TabsTrigger value="consultation" className="text-xs h-7">كشف الطبيب</TabsTrigger>
            <TabsTrigger value="statement" className="text-xs h-7">كشف الحساب</TabsTrigger>
          </TabsList>
          <TabsContent value="consultation" className="mt-2">
            <p className="text-xs text-muted-foreground">البيانات تُحفظ تلقائياً أثناء الكتابة</p>
          </TabsContent>
          <TabsContent value="statement" className="mt-2">
            <DoctorStatementTab doctorId={form.doctorId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* روشتة الطباعة — مخفية على الشاشة، تظهر عند الطباعة */}
      <PrintPrescription consultation={form} />
    </div>
  );
}
