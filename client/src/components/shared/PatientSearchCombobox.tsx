/**
 * PatientSearchCombobox — بحث وتحديد مريض من جدول المرضى
 *
 * يبحث في /api/patients?search=...
 * يعرض: اسم المريض + كود المريض + رقم الهاتف
 * يُرسل: patientId داخلياً فقط
 */
import { useState, useRef, useCallback } from "react";
import { Search, X, User, Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface PatientOption {
  id:          string;
  fullName:    string;
  patientCode?: string | null;
  phone?:      string | null;
  nationalId?: string | null;
}

interface Props {
  value?:        string;        // patientId المحدد
  selectedName?: string;        // اسم المريض للعرض
  onChange:      (id: string, name: string) => void;
  onClear?:      () => void;
  disabled?:     boolean;
  placeholder?:  string;
  "data-testid"?: string;
}

export function PatientSearchCombobox({
  value, selectedName, onChange, onClear, disabled, placeholder = "ابحث باسم المريض أو الكود أو الهاتف...",
  "data-testid": testId = "patient-search-combobox",
}: Props) {
  const [inputValue,  setInputValue]  = useState("");
  const [open,        setOpen]        = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(inputValue, 300);

  const { data: results = [], isLoading } = useQuery<PatientOption[]>({
    queryKey: ["/api/patients", debouncedSearch],
    queryFn:  () =>
      apiRequest("GET", `/api/patients?search=${encodeURIComponent(debouncedSearch)}&limit=10`)
        .then(r => r.json()),
    enabled: debouncedSearch.length >= 1,
  });

  const handleSelect = useCallback((patient: PatientOption) => {
    onChange(patient.id, patient.fullName);
    setInputValue("");
    setOpen(false);
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
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {open && debouncedSearch.length >= 1 && (
        <div className="absolute top-full right-0 z-50 mt-1 w-[320px] max-h-[240px] overflow-y-auto rounded-md border bg-popover shadow-lg">
          {results.length === 0 && !isLoading && (
            <div className="py-3 text-center text-sm text-muted-foreground">
              لا توجد نتائج
            </div>
          )}
          {results.map(patient => (
            <button
              key={patient.id}
              type="button"
              onMouseDown={() => handleSelect(patient)}
              className="w-full flex items-start gap-2 px-3 py-2 hover:bg-accent text-right transition-colors"
              data-testid={`${testId}-option-${patient.id}`}
            >
              <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-sm">{patient.fullName}</div>
                <div className="text-[11px] text-muted-foreground flex gap-2">
                  {patient.patientCode && <span>كود: {patient.patientCode}</span>}
                  {patient.phone && <span>{patient.phone}</span>}
                  {patient.nationalId && <span>رقم قومي: {patient.nationalId}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
