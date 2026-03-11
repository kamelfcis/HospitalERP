import { useState, useEffect, useRef } from "react";
import { useDebounce } from "../utils/debounce";
import type { Patient, Item } from "@shared/schema";

interface SearchStateOptions {
  departmentId: string;
}

/**
 * يدير حالة البحث للمريض والصنف فقط.
 * الطبيب والخدمة انتقلا إلى مكونات DoctorLookup / ServiceLookup المركزية.
 */
export function useSearchState({ departmentId: _departmentId }: SearchStateOptions) {
  // ── Patient ─────────────────────────────────────────────────────────────────
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientSearchRef = useRef<HTMLInputElement>(null);
  const patientDropdownRef = useRef<HTMLDivElement>(null);
  const debouncedPatientSearch = useDebounce(patientSearch, 200);

  // ── Item ────────────────────────────────────────────────────────────────────
  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const itemSearchRef = useRef<HTMLInputElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);
  const addingItemRef = useRef<Set<string>>(new Set());
  const debouncedItemSearch = useDebounce(itemSearch, 300);

  // ── Effects: Patient fetch + click outside ───────────────────────────────────
  useEffect(() => {
    if (!debouncedPatientSearch || debouncedPatientSearch.length < 1) {
      setPatientResults([]); return;
    }
    const ctrl = new AbortController();
    setSearchingPatients(true);
    fetch(`/api/patients?search=${encodeURIComponent(debouncedPatientSearch)}`, {
      signal: ctrl.signal, credentials: "include",
    })
      .then(r => r.json())
      .then(data => { setPatientResults(Array.isArray(data) ? data : []); setSearchingPatients(false); })
      .catch(() => setSearchingPatients(false));
    return () => ctrl.abort();
  }, [debouncedPatientSearch]);

  useEffect(() => {
    if (!showPatientDropdown) return;
    function onDown(e: MouseEvent) {
      if (
        patientDropdownRef.current && !patientDropdownRef.current.contains(e.target as Node) &&
        patientSearchRef.current && !patientSearchRef.current.contains(e.target as Node)
      ) setShowPatientDropdown(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showPatientDropdown]);

  // ── Effects: Item fetch + click outside ──────────────────────────────────────
  useEffect(() => {
    if (!debouncedItemSearch || debouncedItemSearch.length < 1) {
      setItemResults([]); return;
    }
    const ctrl = new AbortController();
    setSearchingItems(true);
    const useAdvanced = debouncedItemSearch.includes("%");
    const url = useAdvanced
      ? `/api/items/search?q=${encodeURIComponent(debouncedItemSearch)}&limit=15`
      : `/api/items?search=${encodeURIComponent(debouncedItemSearch)}&limit=15&page=1`;
    fetch(url, { signal: ctrl.signal, credentials: "include" })
      .then(r => r.json())
      .then(data => { setItemResults(useAdvanced ? (data || []) : (data.items || [])); setSearchingItems(false); })
      .catch(() => setSearchingItems(false));
    return () => ctrl.abort();
  }, [debouncedItemSearch]);

  useEffect(() => {
    if (itemResults.length === 0) return;
    function onDown(e: MouseEvent) {
      if (
        itemDropdownRef.current && !itemDropdownRef.current.contains(e.target as Node) &&
        itemSearchRef.current && !itemSearchRef.current.contains(e.target as Node)
      ) setItemResults([]);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [itemResults.length]);

  // ── Public API ───────────────────────────────────────────────────────────────
  return {
    // Patient
    patientSearch, setPatientSearch,
    patientResults, setPatientResults,
    searchingPatients,
    showPatientDropdown, setShowPatientDropdown,
    patientSearchRef, patientDropdownRef,

    // Item
    itemSearch, setItemSearch,
    itemResults, setItemResults,
    searchingItems,
    itemSearchRef, itemDropdownRef,
    addingItemRef,
  };
}
