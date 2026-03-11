import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle, GitMerge, Eye, Loader2, RefreshCw,
  User, Phone, CreditCard, Calendar, ShieldAlert, CheckCircle2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientInfo {
  id: string;
  patientCode: string | null;
  fullName: string;
  phone: string | null;
  nationalId: string | null;
  age: number | null;
  gender: string | null;
}

interface DuplicatePair {
  patientA: PatientInfo;
  patientB: PatientInfo;
  matchReason: string;
  score: number;
}

interface MergeImpact {
  masterPatient: PatientInfo;
  duplicatePatient: PatientInfo;
  invoiceCount: number;
  admissionCount: number;
  appointmentCount: number;
}

// ─── Patient Card ─────────────────────────────────────────────────────────────

function PatientCard({
  patient,
  role,
  onSelectMaster,
  isMaster,
}: {
  patient: PatientInfo;
  role: "A" | "B";
  onSelectMaster?: (p: PatientInfo) => void;
  isMaster?: boolean;
}) {
  return (
    <div className={`p-3 rounded-md border space-y-1.5 text-sm transition-all ${
      isMaster === true ? "border-green-400 bg-green-50"
      : isMaster === false ? "border-red-200 bg-red-50/40 opacity-80"
      : "border-border bg-background"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{patient.fullName}</span>
        </div>
        {patient.patientCode && (
          <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
            {patient.patientCode}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {patient.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" />
            <span className="font-mono">{patient.phone}</span>
          </div>
        )}
        {patient.nationalId && (
          <div className="flex items-center gap-1.5">
            <CreditCard className="h-3 w-3" />
            <span className="font-mono">{patient.nationalId}</span>
          </div>
        )}
        {patient.age != null && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            <span>{patient.age} سنة</span>
          </div>
        )}
      </div>
      {onSelectMaster && (
        <Button
          size="sm"
          variant={isMaster ? "default" : "outline"}
          className="w-full h-7 text-xs mt-1"
          onClick={() => onSelectMaster(patient)}
          data-testid={`button-select-master-${role}`}
        >
          {isMaster ? <CheckCircle2 className="h-3.5 w-3.5 ml-1" /> : null}
          {isMaster ? "الملف الرئيسي" : "اختيار كملف رئيسي"}
        </Button>
      )}
    </div>
  );
}

// ─── Score Badge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90 ? "bg-red-100 text-red-700 border-red-300" :
    score >= 70 ? "bg-amber-100 text-amber-700 border-amber-300" :
    "bg-blue-100 text-blue-700 border-blue-300";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${color}`}>
      {score >= 90 ? <ShieldAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      درجة التشابه: {score}%
    </span>
  );
}

// ─── Merge Dialog ─────────────────────────────────────────────────────────────

function MergeDialog({
  pair,
  onClose,
}: {
  pair: DuplicatePair;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [masterPatient, setMasterPatient] = useState<PatientInfo | null>(null);
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"select" | "preview" | "confirm">("select");

  const duplicatePatient = masterPatient?.id === pair.patientA.id ? pair.patientB : pair.patientA;

  // Preview impact
  const { data: impact, isFetching: impactLoading, refetch: refetchImpact } = useQuery<MergeImpact>({
    queryKey: ["/api/patients/merge-preview", masterPatient?.id, duplicatePatient?.id],
    queryFn: () =>
      apiRequest("POST", `/api/patients/${masterPatient!.id}/merge-preview`, { duplicatePatientId: duplicatePatient.id })
        .then(r => r.json()),
    enabled: false,
  });

  async function handlePreview() {
    if (!masterPatient) {
      toast({ title: "اختر الملف الرئيسي أولاً", variant: "destructive" });
      return;
    }
    await refetchImpact();
    setStep("preview");
  }

  const mergeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/patients/${masterPatient!.id}/merge`, {
        duplicatePatientId: duplicatePatient.id,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast({ title: "تم الدمج بنجاح", description: `تم دمج ${duplicatePatient.fullName} في ${masterPatient!.fullName}` });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/duplicate-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ في الدمج", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <GitMerge className="h-4 w-4" />
            دمج ملفي مريض مكررين
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* تفاصيل التطابق */}
          <div className="p-2 rounded bg-muted/40 border text-xs flex items-center gap-2">
            <ScoreBadge score={pair.score} />
            <span className="text-muted-foreground">{pair.matchReason}</span>
          </div>

          {/* Step 1: اختيار الملف الرئيسي */}
          {(step === "select" || step === "preview") && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                اختر الملف الرئيسي (يبقى نشطاً) — سيُدمج الآخر فيه ويُغلق:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <PatientCard
                  patient={pair.patientA}
                  role="A"
                  onSelectMaster={setMasterPatient}
                  isMaster={masterPatient?.id === pair.patientA.id ? true : masterPatient ? false : undefined}
                />
                <PatientCard
                  patient={pair.patientB}
                  role="B"
                  onSelectMaster={setMasterPatient}
                  isMaster={masterPatient?.id === pair.patientB.id ? true : masterPatient ? false : undefined}
                />
              </div>
            </div>
          )}

          {/* Step 2: معاينة التأثير */}
          {step === "preview" && (
            <div className="space-y-2">
              {impactLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جاري حساب التأثير...</span>
                </div>
              ) : impact ? (
                <div className="p-3 rounded border bg-muted/30 space-y-2">
                  <p className="text-xs font-semibold text-foreground">تقرير التأثير قبل الدمج (لا تغييرات بعد):</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-2 rounded border bg-background">
                      <div className="text-lg font-bold text-blue-600">{impact.invoiceCount}</div>
                      <div className="text-muted-foreground">فاتورة</div>
                    </div>
                    <div className="text-center p-2 rounded border bg-background">
                      <div className="text-lg font-bold text-green-600">{impact.admissionCount}</div>
                      <div className="text-muted-foreground">إقامة</div>
                    </div>
                    <div className="text-center p-2 rounded border bg-background">
                      <div className="text-lg font-bold text-purple-600">{impact.appointmentCount}</div>
                      <div className="text-muted-foreground">موعد عيادة</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    سيُنقل كل ما سبق من الملف المدموج إلى الملف الرئيسي داخل معاملة واحدة.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 3: سبب الدمج */}
          {step === "preview" && !impactLoading && impact && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">سبب الدمج *</Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="مثال: نفس المريض تسجل مرتين — تطابق رقم الهوية"
                className="h-8 text-sm"
                data-testid="input-merge-reason"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-row-reverse">
          <Button variant="outline" onClick={onClose} size="sm">إلغاء</Button>

          {step === "select" && (
            <Button
              onClick={handlePreview}
              disabled={!masterPatient}
              size="sm"
              data-testid="button-merge-preview"
            >
              <Eye className="h-4 w-4 ml-1" />
              معاينة التأثير
            </Button>
          )}

          {step === "preview" && !impactLoading && impact && (
            <Button
              onClick={() => mergeMutation.mutate()}
              disabled={!reason.trim() || mergeMutation.isPending}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-merge-execute"
            >
              {mergeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <GitMerge className="h-4 w-4 ml-1" />}
              تنفيذ الدمج
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DuplicatePatientsPage() {
  const { toast } = useToast();
  const [selectedPair, setSelectedPair] = useState<DuplicatePair | null>(null);

  const { data: pairs = [], isLoading, refetch } = useQuery<DuplicatePair[]>({
    queryKey: ["/api/patients/duplicate-candidates"],
    queryFn: () =>
      apiRequest("GET", "/api/patients/duplicate-candidates").then(r => r.json()),
  });

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-amber-600" />
            مراجعة ملفات المرضى المكررة
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            مرضى لديهم نفس رقم الهاتف أو رقم الهوية — راجع وادمج أو تجاهل
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          data-testid="button-refresh-duplicates"
        >
          <RefreshCw className={`h-4 w-4 ml-1 ${isLoading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {/* Summary */}
      {!isLoading && pairs.length > 0 && (
        <div className="p-3 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            تم اكتشاف <strong>{pairs.length}</strong> زوج محتمل من المرضى المكررين.
            راجع كلاً منهم واتخذ الإجراء المناسب.
          </span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && pairs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="font-medium text-sm">لا توجد ملفات مكررة محتملة</p>
          <p className="text-xs">النظام لم يكتشف تكراراً بالبيانات الحالية</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin ml-2" />
          <span>جاري البحث عن التكرارات...</span>
        </div>
      )}

      {/* Duplicate pairs list */}
      <div className="space-y-2">
        {pairs.map((pair, idx) => (
          <div
            key={idx}
            className="p-3 rounded-md border bg-background hover:border-amber-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="grid grid-cols-2 gap-3 flex-1">
                <PatientCard patient={pair.patientA} role="A" />
                <PatientCard patient={pair.patientB} role="B" />
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <ScoreBadge score={pair.score} />
                <span className="text-xs text-muted-foreground">{pair.matchReason}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => setSelectedPair(pair)}
                  data-testid={`button-review-pair-${idx}`}
                >
                  <Eye className="h-3.5 w-3.5 ml-1" />
                  مراجعة ودمج
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Merge Dialog */}
      {selectedPair && (
        <MergeDialog pair={selectedPair} onClose={() => setSelectedPair(null)} />
      )}
    </div>
  );
}
