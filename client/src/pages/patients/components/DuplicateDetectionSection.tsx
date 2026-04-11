import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, AlertTriangle, X, Info } from "lucide-react";
import type { DuplicateCheckResult, DuplicateCandidate, PatientSuggest } from "./PatientFormTypes";

function CandidateList({ candidates, onSelect }: { candidates: DuplicateCandidate[]; onSelect: (p: PatientSuggest) => void }) {
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {candidates.map(c => (
        <div key={c.patientId} className="flex items-center gap-2 p-2 rounded border bg-white text-xs">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{c.fullName}</div>
            <div className="text-muted-foreground font-mono">{c.phone || "—"}</div>
            <div className="flex gap-1 mt-0.5 flex-wrap">
              {c.reasons.map((r, i) => (
                <span key={i} className="px-1 py-0.5 rounded bg-muted text-muted-foreground">{r}</span>
              ))}
            </div>
          </div>
          {c.patientCode && (
            <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
              {c.patientCode}
            </span>
          )}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => onSelect({ id: c.patientId, fullName: c.fullName, patientCode: c.patientCode, phone: c.phone, age: c.age, nationalId: c.nationalId })}
            className="shrink-0 px-2 py-1 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium"
          >
            استخدام
          </button>
        </div>
      ))}
    </div>
  );
}

export interface DuplicateDetectionSectionProps {
  isEdit: boolean;
  existingPatient: PatientSuggest | null;
  shouldCheckDup: boolean;
  dupChecking: boolean;
  dupResult: DuplicateCheckResult | undefined;
  dupDismissed: boolean;
  setDupDismissed: (v: boolean) => void;
  overrideReason: string;
  setOverrideReason: (v: string) => void;
  handleSelectExistingPatient: (p: PatientSuggest) => void;
}

export function DuplicateDetectionSection({
  isEdit,
  existingPatient,
  shouldCheckDup,
  dupChecking,
  dupResult,
  dupDismissed,
  setDupDismissed,
  overrideReason,
  setOverrideReason,
  handleSelectExistingPatient,
}: DuplicateDetectionSectionProps) {
  if (isEdit || existingPatient || !shouldCheckDup) return null;

  return (
    <section className="space-y-1">
      {dupChecking && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>جاري البحث عن مرضى مشابهين...</span>
        </div>
      )}

      {!dupChecking && dupResult?.duplicateStatus === "block" && !dupDismissed && (
        <div className="p-3 rounded-md border border-red-300 bg-red-50 space-y-2">
          <div className="flex items-center gap-2 text-red-700">
            <Lock className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">مريض مكرر — الإضافة محظورة</span>
          </div>
          <p className="text-xs text-red-600">{dupResult.recommendedAction}</p>
          <CandidateList candidates={dupResult.candidates} onSelect={handleSelectExistingPatient} />
        </div>
      )}

      {!dupChecking && dupResult?.duplicateStatus === "warning" && !dupDismissed && (
        <div className="p-3 rounded-md border border-amber-300 bg-amber-50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">تنبيه: مرضى مشابهون موجودون</span>
            </div>
            <button type="button" onClick={() => setDupDismissed(true)} className="text-muted-foreground hover:text-foreground" title="تجاهل التحذير">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-amber-700">{dupResult.recommendedAction}</p>
          <CandidateList candidates={dupResult.candidates} onSelect={handleSelectExistingPatient} />
          <div className="space-y-1 pt-1">
            <Label className="text-xs text-amber-800">لإنشاء ملف جديد — اكتب سبب عدم التطابق *</Label>
            <Input
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="مثال: نفس الاسم لكن شخص مختلف — الرقم القومي مختلف"
              className="h-7 text-xs border-amber-400 focus:border-amber-500"
              data-testid="input-dup-override-reason"
            />
          </div>
        </div>
      )}

      {!dupChecking && dupResult?.duplicateStatus === "none" && dupResult.candidates.length > 0 && !dupDismissed && (
        <div className="p-2 rounded-md border border-blue-200 bg-blue-50 space-y-1">
          <div className="flex items-center gap-1.5 text-blue-700 text-xs">
            <Info className="h-3 w-3" />
            <span className="font-medium">مرضى قريبون — هل تقصد أحدهم؟</span>
          </div>
          <CandidateList candidates={dupResult.candidates.slice(0, 3)} onSelect={handleSelectExistingPatient} />
        </div>
      )}
    </section>
  );
}
