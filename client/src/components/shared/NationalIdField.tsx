import { useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";

export function parseEgyptianNationalId(nid: string): { dateOfBirth: string; age: number; gender: string } | null {
  if (!nid || !/^\d{14}$/.test(nid)) return null;

  const centuryDigit = parseInt(nid[0], 10);
  let century: number;
  if (centuryDigit === 2) century = 1900;
  else if (centuryDigit === 3) century = 2000;
  else return null;

  const year  = century + parseInt(nid.substring(1, 3), 10);
  const month = parseInt(nid.substring(3, 5), 10);
  const day   = parseInt(nid.substring(5, 7), 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const dob = new Date(year, month - 1, day);
  if (isNaN(dob.getTime())) return null;

  const dateOfBirth = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age--;
  }
  if (age < 0) age = 0;

  const genderDigit = parseInt(nid[12], 10);
  const gender = genderDigit % 2 === 1 ? "male" : "female";

  return { dateOfBirth, age, gender };
}

export function calculateAge(dateOfBirth: string): number | null {
  if (!dateOfBirth) return null;
  const parts = dateOfBirth.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age--;
  }
  return age < 0 ? 0 : age;
}

interface NationalIdFieldProps {
  nationalId: string;
  onNationalIdChange: (nid: string) => void;
  dateOfBirth: string;
  onDateOfBirthChange: (dob: string) => void;
  age: string;
  onAgeChange: (age: string) => void;
  onGenderDetected?: (gender: string) => void;
  disabled?: boolean;
  compact?: boolean;
  required?: boolean;
  requiredHint?: string;
}

export function isFullName(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 4 && parts.every(p => p.length >= 2);
}

export function NationalIdField({
  nationalId,
  onNationalIdChange,
  dateOfBirth,
  onDateOfBirthChange,
  age,
  onAgeChange,
  onGenderDetected,
  disabled = false,
  compact = false,
  required = false,
  requiredHint,
}: NationalIdFieldProps) {
  const handleNationalIdChange = useCallback((value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 14);
    onNationalIdChange(cleaned);

    if (cleaned.length === 14) {
      const parsed = parseEgyptianNationalId(cleaned);
      if (parsed) {
        onDateOfBirthChange(parsed.dateOfBirth);
        onAgeChange(String(parsed.age));
        if (onGenderDetected) onGenderDetected(parsed.gender);
      }
    }
  }, [onNationalIdChange, onDateOfBirthChange, onAgeChange, onGenderDetected]);

  const handleDateOfBirthChange = useCallback((value: string) => {
    onDateOfBirthChange(value);
    const computed = calculateAge(value);
    if (computed !== null) {
      onAgeChange(String(computed));
    }
  }, [onDateOfBirthChange, onAgeChange]);

  const nidError = useMemo(() => {
    if (!nationalId) return null;
    if (nationalId.length < 14) return null;
    if (!/^\d{14}$/.test(nationalId)) return "يجب أن يكون 14 رقم";
    const parsed = parseEgyptianNationalId(nationalId);
    if (!parsed) return "رقم قومي غير صحيح";
    return null;
  }, [nationalId]);

  const h = compact ? "h-6 text-xs" : "h-8 text-sm";

  const missingRequired = required && !nationalId;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex items-center gap-0.5 shrink-0">
          <span className={compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground"}>
            الرقم القومي
            {required && <span className="text-destructive mr-0.5">*</span>}
          </span>
          <div className="relative">
            <Input
              value={nationalId}
              onChange={(e) => handleNationalIdChange(e.target.value)}
              disabled={disabled}
              className={`${h} ${compact ? "w-32" : "w-40"} px-1 font-mono ${missingRequired ? "border-destructive/50" : ""}`}
              placeholder="14 رقم"
              maxLength={14}
              inputMode="numeric"
              dir="ltr"
              data-testid="input-national-id"
            />
            {nidError && (
              <span className="absolute -bottom-4 right-0 text-[9px] text-destructive whitespace-nowrap">{nidError}</span>
            )}
          </div>
        </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <span className={compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground"}>تاريخ الميلاد</span>
        <Input
          type="date"
          value={dateOfBirth}
          onChange={(e) => handleDateOfBirthChange(e.target.value)}
          disabled={disabled}
          className={`${h} ${compact ? "w-32" : "w-36"} px-1`}
          data-testid="input-date-of-birth"
        />
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <span className={compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground"}>العمر</span>
        <Input
          type="number"
          value={age}
          onChange={(e) => onAgeChange(e.target.value)}
          disabled={disabled}
          className={`${h} w-14 px-1 text-center`}
          min={0}
          max={150}
          data-testid="input-age"
        />
      </div>
      {requiredHint && (
        <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
          <span>⚠</span> {requiredHint}
        </p>
      )}
    </div>
  );
}
