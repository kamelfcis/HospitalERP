import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { Badge }  from "@/components/ui/badge";
import { Search, UserCheck, X } from "lucide-react";
import { NationalIdField, isFullName } from "@/components/shared/NationalIdField";
import { SectionLabel } from "./SectionLabel";
import type { PatientSuggest } from "./PatientFormTypes";

export interface PatientIdentitySectionProps {
  isEdit: boolean;
  pfdQuadNameRequired: boolean;
  pfdRequiresFullId: boolean;
  pfdNidRequired: boolean;
  existingPatient: PatientSuggest | null;
  fullName: string;
  setFullName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  nationalId: string;
  setNationalId: (v: string) => void;
  dateOfBirth: string;
  setDateOfBirth: (v: string) => void;
  age: string;
  setAge: (v: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  showSuggestList: boolean;
  patientSuggestions: PatientSuggest[];
  highlightedIdx: number;
  setHighlightedIdx: (v: number) => void;
  handleNameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleSelectExistingPatient: (p: PatientSuggest) => void;
  handleClearExistingPatient: () => void;
  nameInputRef: React.RefObject<HTMLInputElement>;
  phoneInputRef: React.RefObject<HTMLInputElement>;
  suggestItemsRef: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}

export function PatientIdentitySection({
  isEdit,
  pfdQuadNameRequired,
  pfdRequiresFullId,
  pfdNidRequired,
  existingPatient,
  fullName,
  setFullName,
  phone,
  setPhone,
  nationalId,
  setNationalId,
  dateOfBirth,
  setDateOfBirth,
  age,
  setAge,
  showSuggestions,
  setShowSuggestions,
  showSuggestList,
  patientSuggestions,
  highlightedIdx,
  setHighlightedIdx,
  handleNameKeyDown,
  handleSelectExistingPatient,
  handleClearExistingPatient,
  nameInputRef,
  phoneInputRef,
  suggestItemsRef,
}: PatientIdentitySectionProps) {
  return (
    <section aria-label="بيانات المريض" className="space-y-2">
      <SectionLabel>بيانات المريض</SectionLabel>

      <div className="space-y-1">
        <Label className="text-xs">
          {pfdQuadNameRequired ? "الاسم الرباعي" : "الاسم الكامل"} <span className="text-destructive">*</span>
          {existingPatient && (
            <Badge variant="outline" className="mr-2 text-xs text-green-700 border-green-300 bg-green-50">
              <UserCheck className="h-3 w-3 ml-1" />
              مريض مسجل — {existingPatient.patientCode}
            </Badge>
          )}
        </Label>

        {existingPatient ? (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 border border-green-300 rounded-md text-sm">
            <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
            <span className="flex-1 font-medium truncate">{existingPatient.fullName}</span>
            {existingPatient.patientCode && (
              <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shrink-0">
                {existingPatient.patientCode}
              </span>
            )}
            <button
              type="button"
              onClick={handleClearExistingPatient}
              className="text-muted-foreground hover:text-destructive focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
              title="مسح وإدخال مريض آخر"
              data-testid="button-clear-patient"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={nameInputRef}
              value={fullName}
              onChange={e => { setFullName(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={handleNameKeyDown}
              placeholder={pfdQuadNameRequired ? "الاسم الرباعي: الاسم / الأب / الجد / العائلة" : "اكتب اسم المريض أو ابحث عن موجود..."}
              className="h-7 text-xs pr-7"
              autoComplete="off"
              autoFocus={!isEdit}
              data-testid="input-patient-name"
              aria-autocomplete="list"
              aria-expanded={showSuggestList}
              aria-controls={showSuggestList ? "patient-suggest-list" : undefined}
              aria-activedescendant={
                showSuggestList && highlightedIdx >= 0
                  ? `patient-suggest-${patientSuggestions[highlightedIdx]?.id}`
                  : undefined
              }
            />

            {showSuggestList && (
              <div
                id="patient-suggest-list"
                role="listbox"
                aria-label="مرضى مسجلون"
                className="absolute z-50 w-full mt-0.5 border rounded-md bg-background shadow-lg max-h-44 overflow-y-auto"
              >
                <div className="px-2 py-1 text-xs text-muted-foreground bg-muted/40 border-b select-none">
                  مرضى مسجلون — اختر لربط الزيارة برقمه
                </div>
                {patientSuggestions.map((p, idx) => {
                  const isActive = highlightedIdx === idx;
                  return (
                    <button
                      key={p.id}
                      id={`patient-suggest-${p.id}`}
                      ref={el => { suggestItemsRef.current[idx] = el; }}
                      role="option"
                      aria-selected={isActive}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      onClick={() => handleSelectExistingPatient(p)}
                      className={[
                        "w-full text-right px-3 py-2 text-xs border-b last:border-0 flex items-center gap-2 transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary ring-inset ring-1 ring-primary/30"
                          : "hover:bg-blue-50",
                      ].join(" ")}
                      data-testid={`patient-suggest-${p.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.fullName}</div>
                        {p.phone && <div className="text-muted-foreground font-mono">{p.phone}</div>}
                      </div>
                      {p.patientCode && (
                        <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                          {p.patientCode}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setShowSuggestions(false)}
                  className="w-full text-right px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 italic border-t"
                >
                  إضافة "{fullName}" كمريض جديد ↑↓ تنقل · Enter اختيار · Esc إغلاق
                </button>
              </div>
            )}
          </div>
        )}
        {pfdQuadNameRequired && fullName.trim() && !isFullName(fullName) && (
          <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
            <span>⚠</span> {pfdRequiresFullId ? "الاسم الرباعي مطلوب لمرضى التعاقد والتأمين" : "الاسم الرباعي مطلوب للتسكين"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1 col-span-1">
          <Label className="text-xs">التليفون</Label>
          <Input
            ref={phoneInputRef}
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="01xxxxxxxxx"
            maxLength={11}
            autoComplete="tel"
            className="h-7 text-xs font-mono"
            data-testid="input-patient-phone"
            dir="ltr"
          />
        </div>
      </div>
      <NationalIdField
        nationalId={nationalId}
        onNationalIdChange={setNationalId}
        dateOfBirth={dateOfBirth}
        onDateOfBirthChange={setDateOfBirth}
        age={age}
        onAgeChange={setAge}
        disabled={false}
        compact
        required={pfdNidRequired}
        requiredHint={pfdNidRequired && !nationalId ? (pfdRequiresFullId ? "الرقم القومي إجباري لمرضى التعاقد والتأمين" : "الرقم القومي إجباري للتسكين") : undefined}
      />
    </section>
  );
}
