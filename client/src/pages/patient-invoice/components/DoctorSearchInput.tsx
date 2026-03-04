import { useState, useRef, useEffect, useCallback } from "react";
import { SearchDropdown } from "./SearchDropdown";

interface DoctorSearchInputProps {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  inputTestId?: string;
}

export function DoctorSearchInput({
  value,
  onChange,
  disabled,
  placeholder = "ابحث عن طبيب...",
  inputClassName = "h-7 text-xs w-40",
  inputTestId = "input-doctor-search",
}: DoctorSearchInputProps) {
  const [searchTerm, setSearchTerm]   = useState(value);
  const [results, setResults]         = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [show, setShow]               = useState(false);
  const inputRef   = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // مزامنة القيمة الخارجية مع حقل البحث
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  const fetchDoctors = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/doctors?search=${encodeURIComponent(q)}&limit=15`, {
        credentials: "include",
      });
      if (res.ok) setResults(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(v: string) {
    setSearchTerm(v);
    onChange(v);
    setShow(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDoctors(v), 250);
  }

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <SearchDropdown
      inputRef={inputRef}
      dropdownRef={dropdownRef}
      value={searchTerm}
      onChange={handleChange}
      onClear={() => { setSearchTerm(""); onChange(""); setShow(false); setResults([]); }}
      onFocus={() => { if (searchTerm.length >= 1) { fetchDoctors(searchTerm); setShow(true); } }}
      show={show}
      setShow={setShow}
      loading={loading}
      items={results.map((d) => ({
        id: d.id,
        primary: d.name,
        secondary: d.specialty || undefined,
        raw: d,
      }))}
      onSelect={(item) => {
        setSearchTerm(item.primary);
        onChange(item.primary);
        setShow(false);
        setResults([]);
      }}
      disabled={disabled}
      placeholder={placeholder}
      inputClassName={inputClassName}
      dropdownWidth="w-60"
      inputTestId={inputTestId}
      dropdownTestId="dropdown-dt-doctor"
      itemTestIdPrefix="option-dt-doctor"
    />
  );
}
