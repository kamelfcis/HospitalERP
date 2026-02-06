import { useState, useRef, useEffect } from "react";

interface ExpiryInputProps {
  expiryMonth: number | null;
  expiryYear: number | null;
  onChange: (month: number | null, year: number | null) => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function ExpiryInput({ expiryMonth, expiryYear, onChange, disabled, className, ...props }: ExpiryInputProps) {
  const formatDisplay = (m: number | null, y: number | null): string => {
    if (m && y) return `${String(m).padStart(2, '0')}/${y}`;
    if (m) return `${String(m).padStart(2, '0')}/`;
    return "";
  };

  const [rawText, setRawText] = useState(formatDisplay(expiryMonth, expiryYear));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setRawText(formatDisplay(expiryMonth, expiryYear));
    }
  }, [expiryMonth, expiryYear, isFocused]);

  const parseAndNormalize = (text: string): { month: number | null; year: number | null; display: string } => {
    const cleaned = text.replace(/[^\d\/]/g, "");

    if (cleaned.includes("/")) {
      const parts = cleaned.split("/");
      const monthStr = parts[0];
      const yearStr = parts[1] || "";
      const month = parseInt(monthStr);

      if (!month || month < 1 || month > 12) return { month: null, year: null, display: cleaned };

      if (yearStr.length === 4) {
        const year = parseInt(yearStr);
        if (year >= 2020 && year <= 2099) {
          return { month, year, display: `${String(month).padStart(2, '0')}/${year}` };
        }
      } else if (yearStr.length === 2) {
        const year = 2000 + parseInt(yearStr);
        if (year >= 2020 && year <= 2099) {
          return { month, year, display: `${String(month).padStart(2, '0')}/${year}` };
        }
      }

      return { month, year: null, display: `${String(month).padStart(2, '0')}/${yearStr}` };
    }

    const digits = cleaned.replace(/\D/g, "");

    if (digits.length <= 2) {
      const month = parseInt(digits);
      if (digits.length === 2 && month >= 1 && month <= 12) {
        return { month, year: null, display: `${String(month).padStart(2, '0')}/` };
      }
      return { month: null, year: null, display: digits };
    }

    if (digits.length === 4) {
      const month = parseInt(digits.slice(0, 2));
      const yearShort = parseInt(digits.slice(2, 4));
      const year = 2000 + yearShort;
      if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
        return { month, year, display: `${String(month).padStart(2, '0')}/${year}` };
      }
    }

    if (digits.length >= 5 && digits.length <= 6) {
      const month = parseInt(digits.slice(0, 2));
      const yearStr = digits.slice(2);
      const year = parseInt(yearStr);
      if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
        return { month, year, display: `${String(month).padStart(2, '0')}/${year}` };
      }
    }

    return { month: null, year: null, display: cleaned };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length > 7) return;

    const parsed = parseAndNormalize(val);
    setRawText(parsed.display);

    if (parsed.month && parsed.year) {
      onChange(parsed.month, parsed.year);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseAndNormalize(rawText);
    if (parsed.month && parsed.year) {
      setRawText(`${String(parsed.month).padStart(2, '0')}/${parsed.year}`);
      onChange(parsed.month, parsed.year);
    } else if (!rawText.trim()) {
      onChange(null, null);
    } else {
      setRawText(formatDisplay(expiryMonth, expiryYear));
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={rawText}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder="MM/YYYY"
      className={`h-6 text-[10px] w-[75px] border rounded bg-transparent text-center ${className || ""}`}
      dir="ltr"
      inputMode="numeric"
      data-testid={props["data-testid"]}
    />
  );
}
