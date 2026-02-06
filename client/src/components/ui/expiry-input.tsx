import { useState, useRef, useEffect, useCallback } from "react";

interface ExpiryInputProps {
  expiryMonth: number | null;
  expiryYear: number | null;
  onChange: (month: number | null, year: number | null) => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function formatDisplay(m: number | null, y: number | null): string {
  if (m && y) return `${String(m).padStart(2, '0')}/${y}`;
  if (m) return `${String(m).padStart(2, '0')}/`;
  return "";
}

export function parseExpiryFinal(text: string): { month: number | null; year: number | null } {
  const cleaned = text.replace(/[^\d\/]/g, "");

  if (cleaned.includes("/")) {
    const parts = cleaned.split("/");
    const monthStr = parts[0];
    const yearStr = parts[1] || "";
    const month = parseInt(monthStr);

    if (!month || month < 1 || month > 12) return { month: null, year: null };

    if (yearStr.length === 4) {
      const year = parseInt(yearStr);
      if (year >= 2020 && year <= 2099) return { month, year };
    } else if (yearStr.length === 2) {
      const year = 2000 + parseInt(yearStr);
      if (year >= 2020 && year <= 2099) return { month, year };
    }
    return { month, year: null };
  }

  const digits = cleaned.replace(/\D/g, "");

  if (digits.length <= 2) {
    const month = parseInt(digits);
    if (digits.length === 2 && month >= 1 && month <= 12) return { month, year: null };
    return { month: null, year: null };
  }

  if (digits.length === 4) {
    const month = parseInt(digits.slice(0, 2));
    const yearShort = parseInt(digits.slice(2, 4));
    const year = 2000 + yearShort;
    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) return { month, year };
  }

  if (digits.length >= 5 && digits.length <= 6) {
    const month = parseInt(digits.slice(0, 2));
    const yearStr = digits.slice(2);
    const year = parseInt(yearStr);
    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) return { month, year };
  }

  return { month: null, year: null };
}

export function ExpiryInput({ expiryMonth, expiryYear, onChange, disabled, className, onKeyDown, ...props }: ExpiryInputProps) {
  const [rawText, setRawText] = useState(formatDisplay(expiryMonth, expiryYear));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setRawText(formatDisplay(expiryMonth, expiryYear));
    }
  }, [expiryMonth, expiryYear, isFocused]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    val = val.replace(/[^\d\/]/g, "");
    if (val.length > 7) return;

    const digits = val.replace(/\D/g, "");

    if (!val.includes("/") && digits.length === 2) {
      const month = parseInt(digits);
      if (month >= 1 && month <= 12) {
        setRawText(`${String(month).padStart(2, '0')}/`);
        return;
      }
    }

    if (!val.includes("/") && digits.length >= 4) {
      const month = parseInt(digits.slice(0, 2));
      if (month >= 1 && month <= 12) {
        const yearPart = digits.slice(2);
        setRawText(`${String(month).padStart(2, '0')}/${yearPart}`);
        return;
      }
    }

    setRawText(val);
  }, []);

  const commitValue = useCallback(() => {
    const parsed = parseExpiryFinal(rawText);
    if (parsed.month && parsed.year) {
      const display = `${String(parsed.month).padStart(2, '0')}/${parsed.year}`;
      setRawText(display);
      onChange(parsed.month, parsed.year);
    } else if (!rawText.trim()) {
      onChange(null, null);
    } else {
      setRawText(formatDisplay(expiryMonth, expiryYear));
    }
  }, [rawText, onChange, expiryMonth, expiryYear]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    commitValue();
  }, [commitValue]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitValue();
      onKeyDown?.(e);
    } else if (e.key === "Tab") {
      commitValue();
      onKeyDown?.(e);
    } else if (e.key === "Escape") {
      setRawText(formatDisplay(expiryMonth, expiryYear));
      onKeyDown?.(e);
    } else {
      onKeyDown?.(e);
    }
  }, [commitValue, onKeyDown, expiryMonth, expiryYear]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={rawText}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      placeholder="MM/YYYY"
      className={`h-6 text-[10px] w-[75px] border rounded bg-transparent text-center ${className || ""}`}
      dir="ltr"
      inputMode="numeric"
      data-testid={props["data-testid"]}
      data-expiry-input="true"
    />
  );
}
