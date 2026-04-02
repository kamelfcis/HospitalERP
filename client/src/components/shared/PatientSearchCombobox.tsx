/**
 * PatientSearchCombobox — بحث وتحديد مريض
 *
 * يبحث في /api/patients?search=...
 * يعرض: اسم المريض + كود المريض + رقم الهاتف
 * يعرض أيضاً: المرضى غير المسجلين (walk-in) من سجلات الإقامة
 * يُرسل: patientId داخلياً — لو كان walk-in يُنشئ ملف أولاً
 */
import { useState, useRef, useCallback } from "react";
import { Search, X, User, Building2, UserX, Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface PatientOption {
  id:          string;
  fullName:    string;
  patientCode?: string | null;
  phone?:      string | null;
  nationalId?: string | null;
  isActive?:   boolean;
  isWalkIn?:   boolean;
}

interface Props {
  value?:        string;
  selectedName?: string;
  onChange:      (id: string, name: string) => void;
  onClear?:      () => void;
  disabled?:     boolean;
  placeholder?:  string;
  "data-testid"?: string;
}

export function PatientSearchCombobox({
  value, selectedName, onChange, onClear, disabled,
  placeholder = "ابحث باسم المريض أو الكود أو الهاتف...",
  "data-testid": testId = "patient-search-combobox",
}: Props) {
  const [inputValue,  setInputValue]  = useState("");
  const [open,        setOpen]        = useState(false);
  const [resolving,   setResolving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(inputValue, 300);

  const { data: results = [], isLoading } = useQuery<PatientOption[]>({
    queryKey: ["/api/patients", debouncedSearch],
    queryFn:  () =>
      apiRequest("GET", `/api/patients?search=${encodeURIComponent(debouncedSearch)}&limit=10`)
        .then(r => r.json()),
    enabled: debouncedSearch.length >= 1,
  });

  const handleSelect = useCallback(async (patient: PatientOption) => {
    setOpen(false);
    setInputValue("");

    // مريض مسجّل — استخدم id مباشرةً
    if (!patient.isWalkIn) {
      onChange(patient.id, patient.fullName);
      return;
    }

    // walk-in: أنشئ/جد الملف ثم استخدم id الحقيقي
    setResolving(true);
    try {
      const res = await apiRequest("POST", "/api/patients/find-or-create", {
        fullName: patient.fullName,
        phone:    patient.phone || null,
      });
      const created = await res.json();
      onChange(created.id, created.fullName);
    } catch {
      // في حالة الخطأ، مرّر الاسم بدون id
      onChange("", patient.fullName);
    } finally {
      setResolving(false);
    }
  }, [onChange]);

  const handleClear = useCallback(() => {
    setInputValue("");
    setOpen(false);
    onClear?.();
    inputRef.current?.focus();
  }, [onClear]);

  // ── حالة: تم اختيار مريض ────────────────────────────────────────────────
  if (value && selectedName) {
    return (
      <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-700 rounded px-2 py-1 min-w-[160px]">
        <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span className="font-medium text-emerald-800 dark:text-emerald-200 text-[12px] truncate max-w-[160px]" data-testid={`${testId}-selected-name`}>
          {selectedName}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-muted-foreground hover:text-red-500 transition-colors mr-auto"
            data-testid={`${testId}-clear`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  const busy = isLoading || resolving;

  // ── حالة البحث ───────────────────────────────────────────────────────────
  return (
    <div className="relative" data-testid={testId}>
      <div className="flex items-center gap-1">
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder}
            disabled={disabled}
            className="peachtree-input pr-7 pl-2 w-[220px]"
            data-testid={`${testId}-input`}
            autoComplete="off"
          />
        </div>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {open && debouncedSearch.length >= 1 && (
        <div className="absolute top-full right-0 z-50 mt-1 w-[320px] max-h-[240px] overflow-y-auto rounded-md border bg-popover shadow-lg">
          {results.length === 0 && !busy && (
            <div className="py-3 text-center text-sm text-muted-foreground">
              لا توجد نتائج
            </div>
          )}
          {results.map((patient, idx) => {
            const isInactive = patient.isActive === false && !patient.isWalkIn;
            const isWalkIn   = patient.isWalkIn === true;
            const rowKey     = patient.id ? patient.id : `walkin-${idx}`;
            return (
              <button
                key={rowKey}
                type="button"
                onMouseDown={() => handleSelect(patient)}
                className={[
                  "w-full flex items-start gap-2 px-3 py-2 hover:bg-accent text-right transition-colors",
                  isInactive ? "opacity-70" : "",
                ].join(" ")}
                data-testid={`${testId}-option-${rowKey}`}
              >
                {isWalkIn
                  ? <Building2 className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  : isInactive
                  ? <UserX className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  : <User    className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                }
                <div>
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    {patient.fullName}
                    {isInactive && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1 py-0.5 rounded">
                        غير نشط
                      </span>
                    )}
                    {isWalkIn && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1 py-0.5 rounded">
                        زيارة سابقة
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex gap-2">
                    {patient.patientCode && <span>كود: {patient.patientCode}</span>}
                    {patient.phone && <span>{patient.phone}</span>}
                    {patient.nationalId && <span>رقم قومي: {patient.nationalId}</span>}
                    {isWalkIn && <span className="text-blue-600 dark:text-blue-400">سيُنشأ ملف تلقائياً</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
