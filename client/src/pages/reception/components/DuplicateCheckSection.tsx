import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, Lock, Info, X } from "lucide-react";
import type { PatientSuggest, DuplicateCheckResult } from "./types";
import { CandidateList } from "./PatientInfoSection";

interface DuplicateCheckSectionProps {
  shouldCheckDup: boolean;
  dupChecking: boolean;
  dupResult: DuplicateCheckResult | undefined;
  dupDismissed: boolean;
  setDupDismissed: (v: boolean) => void;
  overrideReason: string;
  setOverrideReason: (v: string) => void;
  handleSelectExistingPatient: (p: PatientSuggest) => void;
}

export function DuplicateCheckSection({
  shouldCheckDup, dupChecking, dupResult, dupDismissed,
  setDupDismissed, overrideReason, setOverrideReason,
  handleSelectExistingPatient,
}: DuplicateCheckSectionProps) {
  if (!shouldCheckDup) return null;

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
              <span className="text-xs font-semibold">تنبيه: مرضى مشابهون</span>
            </div>
            <button type="button" onClick={() => setDupDismissed(true)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-amber-700">{dupResult.recommendedAction}</p>
          <CandidateList candidates={dupResult.candidates} onSelect={handleSelectExistingPatient} />
          <div className="space-y-1 pt-1">
            <Label className="text-xs text-amber-800">لإنشاء ملف جديد — اكتب السبب *</Label>
            <Input
              value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
              placeholder="مثال: نفس الاسم لكن شخص مختلف"
              className="h-7 text-xs border-amber-400"
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
