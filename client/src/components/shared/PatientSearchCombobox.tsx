/**
 * PatientSearchCombobox — بحث وتحديد مريض (مكون موحد)
 *
 * يبحث في /api/patients/autocomplete?search=...
 * يعرض: اسم المريض + كود المريض + رقم الهاتف + رقم الهوية
 * يعرض أيضاً: المرضى غير المسجلين (walk-in) من سجلات الإقامة
 *
 * allowManualEntry — when true, the typed text doubles as a new patient
 *   name if no result is selected. The parent is notified via onTypedNameChange.
 *
 * Variants:
 *   "compact" — inline strip (header bars, filters)
 *   "full"    — full-width with keyboard nav, selected chip, manual fallback
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Search, X, User, Building2, UserX, Loader2, UserCheck, UserPlus } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { normalizeArabic } from "@/lib/arabicNormalize";

export interface PatientOption {
  id:          string;
  fullName:    string;
  patientCode?: string | null;
  phone?:      string | null;
  nationalId?: string | null;
  age?:        number | null;
  isActive?:   boolean;
  isWalkIn?:   boolean;
}

interface BaseProps {
  value?:        string;
  selectedName?: string;
  onChange:      (id: string, name: string, patientCode?: string | null) => void;
  onSelectPatient?: (patient: PatientOption) => void;
  onClear?:      () => void;
  onTypedNameChange?: (name: string) => void;
  allowManualEntry?: boolean;
  disabled?:     boolean;
  placeholder?:  string;
  autoFocus?:    boolean;
  "data-testid"?: string;
}

interface CompactProps extends BaseProps {
  variant?: "compact";
  inputClassName?: string;
}

interface FullProps extends BaseProps {
  variant: "full";
  noResultsHint?: string;
}

type Props = CompactProps | FullProps;

function clientNormalize(text: string): string {
  return normalizeArabic(text).toLowerCase();
}

export function PatientSearchCombobox(props: Props) {
  const {
    value, selectedName, onChange, onSelectPatient, onClear, disabled,
    onTypedNameChange,
    allowManualEntry = false,
    placeholder = "ابحث باسم المريض أو الكود أو الهاتف...",
    autoFocus = false,
    "data-testid": testId = "patient-search-combobox",
  } = props;

  const variant = props.variant ?? "compact";

  const [inputValue,  setInputValue]  = useState("");
  const [open,        setOpen]        = useState(false);
  const [resolving,   setResolving]   = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const debouncedSearch = useDebounce(inputValue, 300);

  const { data: rawResults = [], isLoading } = useQuery<PatientOption[]>({
    queryKey: ["/api/patients/autocomplete", debouncedSearch],
    queryFn:  () =>
      apiRequest("GET", `/api/patients/autocomplete?search=${encodeURIComponent(debouncedSearch)}`)
        .then(r => r.json()),
    enabled: debouncedSearch.length >= 1 && !(value && selectedName),
  });

  const results = useMemo(() => {
    if (!debouncedSearch.trim()) return rawResults;
    const rawTokens = debouncedSearch.trim().split(/\s+/).filter(Boolean);
    const normTokens = rawTokens.map(t => clientNormalize(t));
    if (normTokens.length === 0) return rawResults;
    return rawResults.filter(p => {
      const normName = clientNormalize(p.fullName);
      return normTokens.every((nt, i) =>
        normName.includes(nt) ||
        (p.phone && p.phone.includes(rawTokens[i])) ||
        (p.nationalId && p.nationalId.includes(rawTokens[i])) ||
        (p.patientCode && clientNormalize(p.patientCode).includes(nt))
      );
    });
  }, [rawResults, debouncedSearch]);

  useEffect(() => {
    setHighlightedIdx(0);
    itemsRef.current = [];
  }, [debouncedSearch]);

  useEffect(() => {
    itemsRef.current[highlightedIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current && !value) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    prevValueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (allowManualEntry && !(value && selectedName)) {
      onTypedNameChange?.(inputValue);
    }
  }, [inputValue, allowManualEntry, value, selectedName, onTypedNameChange]);

  const showResults = useMemo(
    () => open && !(value && selectedName) && debouncedSearch.length >= 1 && results.length > 0,
    [open, value, selectedName, debouncedSearch, results.length],
  );

  const showNoResults = useMemo(
    () => open && !(value && selectedName) && debouncedSearch.length >= 1 && !isLoading && results.length === 0,
    [open, value, selectedName, debouncedSearch, isLoading, results.length],
  );

  const handleSelect = useCallback(async (patient: PatientOption) => {
    setOpen(false);
    setInputValue("");
    setHighlightedIdx(-1);

    if (!patient.isWalkIn) {
      onChange(patient.id, patient.fullName, patient.patientCode ?? null);
      onSelectPatient?.(patient);
      return;
    }

    setResolving(true);
    try {
      const res = await apiRequest("POST", "/api/patients/find-or-create", {
        fullName: patient.fullName,
        phone:    patient.phone || null,
      });
      const created = await res.json();
      const resolved: PatientOption = { ...patient, id: created.id, patientCode: created.patientCode ?? null };
      onChange(created.id, created.fullName, created.patientCode ?? null);
      onSelectPatient?.(resolved);
    } catch {
      onChange("", patient.fullName, null);
      onSelectPatient?.(patient);
    } finally {
      setResolving(false);
    }
  }, [onChange, onSelectPatient]);

  const handleClear = useCallback(() => {
    setInputValue("");
    setOpen(false);
    setHighlightedIdx(-1);
    onClear?.();
    inputRef.current?.focus();
  }, [onClear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setInputValue("");
      setOpen(false);
      return;
    }
    if (!showResults) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < results.length) {
        handleSelect(results[highlightedIdx]);
      }
    }
  }, [showResults, results, highlightedIdx, handleSelect]);

  const busy = isLoading || resolving;

  const manualEntryActive = allowManualEntry && !(value && selectedName) && inputValue.trim().length > 0;

  if (variant === "compact" && value && selectedName) {
    return (
      <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-700 rounded px-2 py-1 min-w-[160px] max-w-[280px]">
        <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span className="font-medium text-emerald-800 dark:text-emerald-200 text-[12px] truncate" title={selectedName} data-testid={`${testId}-selected-name`}>
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

  if (variant === "full" && value && selectedName) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800" data-testid={`${testId}-selected`}>
        <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate" data-testid={`${testId}-selected-name`}>{selectedName}</p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            data-testid={`${testId}-clear`}
          >
            تغيير
          </button>
        )}
      </div>
    );
  }

  const noResultsHint = variant === "full" && "noResultsHint" in props
    ? props.noResultsHint
    : undefined;

  const isFullVariant = variant === "full";
  const compactInputClassName = !isFullVariant && "inputClassName" in props
    ? (props as CompactProps).inputClassName ?? "w-[220px]"
    : "w-[220px]";

  return (
    <div className="relative" data-testid={testId}>
      <div className={isFullVariant ? "relative" : "flex items-center gap-1"}>
        <div className="relative">
          <Search className={isFullVariant
            ? "absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            : "absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
          } />
          {busy && (
            <Loader2 className={isFullVariant
              ? "absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none"
              : "absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground pointer-events-none"
            } />
          )}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={
              isFullVariant
                ? `flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-9 pl-9 ${manualEntryActive ? "border-emerald-400 ring-1 ring-emerald-200" : "border-input"}`
                : `peachtree-input pr-7 pl-2 ${compactInputClassName}`
            }
            data-testid={`${testId}-input`}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={showResults}
            aria-controls={showResults ? `${testId}-results` : undefined}
            aria-activedescendant={
              showResults && highlightedIdx >= 0
                ? `${testId}-opt-${results[highlightedIdx]?.id || highlightedIdx}`
                : undefined
            }
          />
        </div>
        {!isFullVariant && busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {manualEntryActive && !showResults && !showNoResults && !isLoading && isFullVariant && (
        <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-700 text-xs text-emerald-700 dark:text-emerald-300" data-testid={`${testId}-manual-hint`}>
          <UserPlus className="h-3.5 w-3.5 shrink-0" />
          <span>سيُسجَّل كمريض جديد: <strong>{inputValue.trim()}</strong></span>
        </div>
      )}

      {showResults && (
        <div
          id={`${testId}-results`}
          role="listbox"
          aria-label="نتائج البحث"
          className={
            isFullVariant
              ? "border rounded-lg overflow-hidden shadow-md bg-background max-h-56 overflow-y-auto mt-1.5"
              : "absolute top-full right-0 z-50 mt-1 w-[320px] max-h-[240px] overflow-y-auto rounded-md border bg-popover shadow-lg"
          }
        >
          {results.map((patient, idx) => {
            const isInactive = patient.isActive === false && !patient.isWalkIn;
            const isWalkIn   = patient.isWalkIn === true;
            const rowKey     = patient.id ? patient.id : `walkin-${idx}`;
            const isHighlighted = highlightedIdx === idx;

            if (isFullVariant) {
              return (
                <button
                  key={rowKey}
                  id={`${testId}-opt-${rowKey}`}
                  ref={el => { itemsRef.current[idx] = el; }}
                  role="option"
                  aria-selected={isHighlighted}
                  data-testid={`${testId}-option-${rowKey}`}
                  type="button"
                  className={[
                    "w-full text-right px-3 py-2.5 text-sm transition-colors border-b last:border-b-0",
                    "flex items-start justify-between gap-3 focus:outline-none",
                    isHighlighted
                      ? "bg-primary/10 text-primary ring-inset ring-1 ring-primary/40"
                      : "hover:bg-muted",
                  ].join(" ")}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  onMouseDown={() => handleSelect(patient)}
                >
                  <div className="flex-1 min-w-0 text-start">
                    <p className="font-medium leading-tight truncate">
                      {patient.fullName}
                      {isWalkIn && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1 py-0.5 rounded mr-1.5">
                          زيارة سابقة
                        </span>
                      )}
                      {isInactive && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1 py-0.5 rounded mr-1.5">
                          غير نشط
                        </span>
                      )}
                    </p>
                    {(patient.phone || patient.nationalId) && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {patient.phone}
                        {patient.phone && patient.nationalId && <span className="mx-1 opacity-50">·</span>}
                        {patient.nationalId && <span>هوية: {patient.nationalId}</span>}
                      </p>
                    )}
                  </div>
                  {patient.patientCode && (
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0 mt-0.5">
                      {patient.patientCode}
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={rowKey}
                id={`${testId}-opt-${rowKey}`}
                ref={el => { itemsRef.current[idx] = el; }}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={() => handleSelect(patient)}
                onMouseEnter={() => setHighlightedIdx(idx)}
                className={[
                  "w-full flex items-start gap-2 px-3 py-2 text-right transition-colors",
                  isHighlighted ? "bg-accent" : "hover:bg-accent",
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
          {isFullVariant && allowManualEntry && inputValue.trim() && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 border-t select-none" data-testid={`${testId}-manual-option`}>
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span>أو سيُسجَّل كمريض جديد: <strong>{inputValue.trim()}</strong></span>
            </div>
          )}
          {isFullVariant && !allowManualEntry && (
            <p className="text-center text-[11px] text-muted-foreground py-1.5 bg-muted/40 select-none">
              ↑↓ تنقل · Enter اختيار · Esc مسح
            </p>
          )}
        </div>
      )}

      {showNoResults && (
        <div className={isFullVariant ? "mt-1.5" : "absolute top-full right-0 z-50 mt-1 w-[320px]"}>
          {allowManualEntry && isFullVariant ? (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-700 text-xs text-emerald-700 dark:text-emerald-300" data-testid={`${testId}-manual-hint`}>
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
              <span>لم يُعثر على مريض — سيُسجَّل كمريض جديد: <strong>{inputValue.trim()}</strong></span>
            </div>
          ) : (
            <p className={isFullVariant ? "text-xs text-muted-foreground px-1" : "py-3 text-center text-sm text-muted-foreground rounded-md border bg-popover shadow-lg"}>
              {noResultsHint || "لا توجد نتائج"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
