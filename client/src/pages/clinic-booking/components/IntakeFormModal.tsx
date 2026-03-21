import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIntake, useUpsertIntake, useCompleteIntake, type IntakeData } from "@/pages/doctor-consultation/hooks/useIntake";

// ─── Visit type constants (frontend templates) ───────────────────────────────
// These are UI helpers that pre-fill the reason field. The selected template
// key/label are persisted to DB so they can be reviewed later.

type VisitTypeKey = "new" | "follow_up" | "review_results" | "procedure" | "urgent";

const VISIT_TYPES: { key: VisitTypeKey; label: string; defaultReason: string }[] = [
  { key: "new",            label: "مراجعة جديدة",     defaultReason: "مراجعة جديدة" },
  { key: "follow_up",      label: "متابعة",            defaultReason: "متابعة دورية" },
  { key: "review_results", label: "مراجعة نتائج",      defaultReason: "مراجعة نتائج تحاليل/أشعة" },
  { key: "procedure",      label: "إجراء طبي",         defaultReason: "إجراء طبي" },
  { key: "urgent",         label: "حالة طارئة",        defaultReason: "مراجعة عاجلة" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  patientName: string;
}

export function IntakeFormModal({ open, onClose, appointmentId, patientName }: Props) {
  const { toast } = useToast();
  const { data: existing, isLoading } = useIntake(open ? appointmentId : undefined);
  const upsert = useUpsertIntake(appointmentId);
  const complete = useCompleteIntake(appointmentId);

  // ── form state ────────────────────────────────────────────────────────────
  const [visitType,        setVisitType]        = useState<VisitTypeKey | "">("");
  const [reasonForVisit,   setReasonForVisit]   = useState("");
  const [bloodPressure,    setBloodPressure]    = useState("");
  const [pulse,            setPulse]            = useState("");
  const [temperature,      setTemperature]      = useState("");
  const [weight,           setWeight]           = useState("");
  const [height,           setHeight]           = useState("");
  const [spo2,             setSpo2]             = useState("");
  const [randomBloodSugar, setRandomBloodSugar] = useState("");
  const [intakeNotes,      setIntakeNotes]      = useState("");

  // Populate from existing intake when modal opens
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setVisitType((existing.visitType as VisitTypeKey) || "");
      setReasonForVisit(existing.reasonForVisit || "");
      setBloodPressure(existing.bloodPressure || "");
      setPulse(existing.pulse || "");
      setTemperature(existing.temperature || "");
      setWeight(existing.weight || "");
      setHeight(existing.height || "");
      setSpo2(existing.spo2 || "");
      setRandomBloodSugar(existing.randomBloodSugar || "");
      setIntakeNotes(existing.intakeNotes || "");
    } else {
      // Reset form for new intake
      setVisitType(""); setReasonForVisit(""); setBloodPressure("");
      setPulse(""); setTemperature(""); setWeight(""); setHeight("");
      setSpo2(""); setRandomBloodSugar(""); setIntakeNotes("");
    }
  }, [open, existing]);

  // When visitType changes, pre-fill reasonForVisit if it is empty
  function handleVisitTypeChange(value: VisitTypeKey) {
    setVisitType(value);
    if (!reasonForVisit.trim()) {
      const tmpl = VISIT_TYPES.find((t) => t.key === value);
      if (tmpl) setReasonForVisit(tmpl.defaultReason);
    }
  }

  const isLocked = !!existing?.isLocked;

  async function handleSave() {
    const tmpl = VISIT_TYPES.find((t) => t.key === visitType);
    const payload: Partial<IntakeData> = {
      visitType:            visitType || null,
      reasonForVisit:       reasonForVisit || null,
      bloodPressure:        bloodPressure || null,
      pulse:                pulse || null,
      temperature:          temperature || null,
      weight:               weight || null,
      height:               height || null,
      spo2:                 spo2 || null,
      randomBloodSugar:     randomBloodSugar || null,
      intakeNotes:          intakeNotes || null,
      // Persist the selected template key/label for later review
      templateKey:          visitType || null,
      templateLabel:        tmpl?.label || null,
      selectedPromptValues: visitType ? { visitType } : null,
    };

    try {
      await upsert.mutateAsync(payload as any);
      toast({ title: "تم حفظ بيانات الاستقبال" });
      onClose();
    } catch (e: any) {
      if (e?.status === 423) {
        toast({ title: "الاستقبال مقفل", description: "بدأ الكشف بالفعل — لا يمكن التعديل.", variant: "destructive" });
      } else {
        toast({ title: "خطأ في الحفظ", description: e?.message, variant: "destructive" });
      }
    }
  }

  async function handleComplete() {
    try {
      await handleSave();
      await complete.mutateAsync();
      toast({ title: "تم إكمال الاستقبال" });
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message, variant: "destructive" });
    }
  }

  const isBusy = upsert.isPending || complete.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            استقبال — {patientName}
            {isLocked && (
              <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                <Lock className="h-3 w-3" /> مقفل — الكشف بدأ
              </Badge>
            )}
            {existing?.completedAt && !isLocked && (
              <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300">
                <CheckCircle2 className="h-3 w-3" /> مكتمل
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4 py-1">
            {/* نوع الزيارة */}
            <div className="space-y-1">
              <Label className="text-sm">نوع الزيارة</Label>
              <Select value={visitType} onValueChange={(v) => handleVisitTypeChange(v as VisitTypeKey)} disabled={isLocked}>
                <SelectTrigger data-testid="select-visit-type">
                  <SelectValue placeholder="اختر نوع الزيارة..." />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_TYPES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* سبب المراجعة */}
            <div className="space-y-1">
              <Label className="text-sm">سبب المراجعة</Label>
              <Textarea
                value={reasonForVisit}
                onChange={(e) => setReasonForVisit(e.target.value)}
                placeholder="اكتب سبب المراجعة..."
                className="min-h-[60px] resize-none"
                disabled={isLocked}
                data-testid="input-reason-for-visit"
              />
            </div>

            {/* القياسات الحيوية */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">القياسات الحيوية</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">ضغط الدم (مثال: 120/80)</Label>
                  <Input
                    value={bloodPressure}
                    onChange={(e) => setBloodPressure(e.target.value)}
                    placeholder="120/80"
                    disabled={isLocked}
                    data-testid="input-blood-pressure"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">النبض (دقيقة)</Label>
                  <Input
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    placeholder="72"
                    disabled={isLocked}
                    data-testid="input-pulse"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الحرارة (°م)</Label>
                  <Input
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="37.0"
                    disabled={isLocked}
                    data-testid="input-temperature"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الوزن (كجم)</Label>
                  <Input
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="70"
                    disabled={isLocked}
                    data-testid="input-weight"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الطول (سم)</Label>
                  <Input
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="170"
                    disabled={isLocked}
                    data-testid="input-height"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">تشبع الأكسجين % (اختياري)</Label>
                  <Input
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    placeholder="98"
                    disabled={isLocked}
                    data-testid="input-spo2"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">سكر عشوائي (اختياري)</Label>
                  <Input
                    value={randomBloodSugar}
                    onChange={(e) => setRandomBloodSugar(e.target.value)}
                    placeholder="110"
                    disabled={isLocked}
                    data-testid="input-rbs"
                  />
                </div>
              </div>
            </div>

            {/* ملاحظات */}
            <div className="space-y-1">
              <Label className="text-sm">ملاحظات (اختياري)</Label>
              <Textarea
                value={intakeNotes}
                onChange={(e) => setIntakeNotes(e.target.value)}
                placeholder="أي ملاحظات إضافية..."
                className="min-h-[50px] resize-none"
                disabled={isLocked}
                data-testid="input-intake-notes"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row-reverse gap-2">
          <Button variant="outline" onClick={onClose} disabled={isBusy}>إغلاق</Button>
          {!isLocked && !isLoading && (
            <>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={isBusy}
                data-testid="button-save-intake"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
                حفظ
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleComplete}
                disabled={isBusy}
                data-testid="button-complete-intake"
              >
                <CheckCircle2 className="h-4 w-4 ml-1" />
                إكمال الاستقبال
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
