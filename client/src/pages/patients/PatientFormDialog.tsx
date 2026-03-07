import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { InsertPatient } from "@shared/schema";
import type { PatientFormDialogProps, DoctorOption, AdmissionValues, AdmissionSetters } from "./types";
import AdmissionSection from "./AdmissionSection";

export default function PatientFormDialog({ open, onClose, editingPatient }: PatientFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!editingPatient;

  const [fullName,   setFullName]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [nationalId, setNationalId] = useState("");
  const [age,        setAge]        = useState<string>("");

  const [doctorSearch,      setDoctorSearch]      = useState("");
  const [selectedDoctor,    setSelectedDoctor]    = useState<DoctorOption | null>(null);
  const [showDoctorResults, setShowDoctorResults] = useState(false);
  const [selectedFloor,     setSelectedFloor]     = useState("");
  const [selectedRoom,      setSelectedRoom]      = useState("");
  const [selectedBed,       setSelectedBed]       = useState("");
  const [surgerySearch,     setSurgerySearch]     = useState("");
  const [selectedSurgery,   setSelectedSurgery]   = useState<{ id: string; nameAr: string } | null>(null);
  const [paymentType,       setPaymentType]       = useState("CASH");
  const [insuranceCo,       setInsuranceCo]       = useState("");

  const admissionValues: AdmissionValues = {
    doctorSearch, selectedDoctor, showDoctorResults,
    selectedFloor, selectedRoom, selectedBed,
    surgerySearch, selectedSurgery, paymentType, insuranceCo,
  };

  const admissionSetters: AdmissionSetters = {
    setDoctorSearch, setSelectedDoctor, setShowDoctorResults,
    setSelectedFloor, setSelectedRoom, setSelectedBed,
    setSurgerySearch, setSelectedSurgery, setPaymentType, setInsuranceCo,
  };

  useEffect(() => {
    if (editingPatient) {
      setFullName(editingPatient.fullName);
      setPhone(editingPatient.phone || "");
      setNationalId(editingPatient.nationalId || "");
      setAge(editingPatient.age != null ? String(editingPatient.age) : "");
    } else {
      setFullName(""); setPhone(""); setNationalId(""); setAge("");
      setDoctorSearch(""); setSelectedDoctor(null); setShowDoctorResults(false);
      setSelectedFloor(""); setSelectedRoom(""); setSelectedBed("");
      setSurgerySearch(""); setSelectedSurgery(null);
      setPaymentType("CASH"); setInsuranceCo("");
    }
  }, [editingPatient, open]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertPatient>) => apiRequest("POST", "/api/patients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      toast({ title: "تم إضافة المريض بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const admitMutation = useMutation({
    mutationFn: ({ bedId, body }: { bedId: string; body: Record<string, any> }) =>
      apiRequest("POST", `/api/beds/${bedId}/admit`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      toast({ title: "تم تسكين المريض بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertPatient> }) =>
      apiRequest("PATCH", `/api/patients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      toast({ title: "تم تحديث بيانات المريض — تم تحديث الفواتير المرتبطة تلقائياً" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const isPending = createMutation.isPending || admitMutation.isPending || updateMutation.isPending;

  function validate(): boolean {
    if (!fullName.trim()) {
      toast({ title: "خطأ", description: "اسم المريض مطلوب", variant: "destructive" });
      return false;
    }
    if (phone && !/^\d{11}$/.test(phone)) {
      toast({ title: "خطأ", description: "التليفون يجب أن يكون 11 رقم", variant: "destructive" });
      return false;
    }
    if (nationalId && !/^\d{14}$/.test(nationalId)) {
      toast({ title: "خطأ", description: "الرقم القومي يجب أن يكون 14 رقم", variant: "destructive" });
      return false;
    }
    if (selectedRoom && !selectedBed) {
      toast({ title: "خطأ", description: "اختار غرفة — الرجاء اختيار سرير فارغ من القائمة", variant: "destructive" });
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;

    const baseData: Partial<InsertPatient> = {
      fullName:   fullName.trim(),
      phone:      phone || null,
      nationalId: nationalId || null,
      age:        age !== "" ? parseInt(age, 10) : null,
      isActive:   true,
    };

    if (isEdit) {
      updateMutation.mutate({ id: editingPatient!.id, data: baseData });
      return;
    }

    if (selectedBed) {
      admitMutation.mutate({
        bedId: selectedBed,
        body: {
          patientName:      fullName.trim(),
          patientPhone:     phone || undefined,
          doctorName:       selectedDoctor?.name || undefined,
          surgeryTypeId:    selectedSurgery?.id || undefined,
          paymentType:      paymentType || undefined,
          insuranceCompany: paymentType === "INSURANCE" ? insuranceCo : undefined,
        },
      });
    } else {
      createMutation.mutate(baseData);
    }
  }

  const saveLabel = isPending
    ? "جاري الحفظ..."
    : isEdit
      ? "تحديث"
      : selectedBed
        ? "إضافة وتسكين"
        : "إضافة مريض";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0" dir="rtl">

        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-bold">
            {isEdit ? "تعديل بيانات مريض" : "إضافة مريض جديد"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <div className="px-4 py-3 space-y-3">

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                بيانات المريض
              </p>

              <div className="space-y-1">
                <Label className="text-xs">اسم المريض *</Label>
                <Input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className="h-7 text-xs"
                  data-testid="input-patient-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">التليفون (11 رقم)</Label>
                  <Input
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="01xxxxxxxxx"
                    className="h-7 text-xs font-mono"
                    maxLength={11}
                    data-testid="input-patient-phone"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">السن</Label>
                  <Input
                    type="number" min={0} max={200}
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    placeholder="—"
                    className="h-7 text-xs"
                    data-testid="input-patient-age"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">الرقم القومي (14 رقم)</Label>
                <Input
                  value={nationalId}
                  onChange={e => setNationalId(e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="الرقم القومي"
                  className="h-7 text-xs font-mono"
                  maxLength={14}
                  data-testid="input-patient-nationalid"
                />
              </div>
            </div>

            {!isEdit && (
              <AdmissionSection
                open={open}
                values={admissionValues}
                setters={admissionSetters}
              />
            )}

          </div>
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t gap-1">
          <Button
            variant="outline" size="sm"
            onClick={onClose}
            className="h-7 text-xs"
            data-testid="button-cancel"
          >
            إلغاء
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending}
            className="h-7 text-xs"
            data-testid="button-save-patient"
          >
            {saveLabel}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
