import { useState, useEffect, useRef } from "react";
import { useDebounce } from "../utils/debounce";
import type { Patient, Doctor, Service, Item } from "@shared/schema";

interface SearchStateOptions {
  departmentId: string;
}

/**
 * يدير حالة البحث للمريض، الطبيب، الخدمة، والصنف.
 * يستقبل departmentId لتحديد نطاق بحث الخدمات.
 */
export function useSearchState({ departmentId }: SearchStateOptions) {
  // ── Patient ─────────────────────────────────────────────────────────────────
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientSearchRef = useRef<HTMLInputElement>(null);
  const patientDropdownRef = useRef<HTMLDivElement>(null);
  const debouncedPatientSearch = useDebounce(patientSearch, 200);

  // ── Doctor ──────────────────────────────────────────────────────────────────
  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorResults, setDoctorResults] = useState<Doctor[]>([]);
  const [searchingDoctors, setSearchingDoctors] = useState(false);
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);
  const doctorSearchRef = useRef<HTMLInputElement>(null);
  const doctorDropdownRef = useRef<HTMLDivElement>(null);
  const debouncedDoctorSearch = useDebounce(doctorSearch, 200);

  // ── Service ─────────────────────────────────────────────────────────────────
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceResults, setServiceResults] = useState<Service[]>([]);
  const [searchingServices, setSearchingServices] = useState(false);
  const serviceSearchRef = useRef<HTMLInputElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const debouncedServiceSearch = useDebounce(serviceSearch, 300);

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

  // ── Effects: Doctor fetch + click outside ────────────────────────────────────
  useEffect(() => {
    if (!debouncedDoctorSearch || debouncedDoctorSearch.length < 1) {
      setDoctorResults([]); return;
    }
    const ctrl = new AbortController();
    setSearchingDoctors(true);
    fetch(`/api/doctors?search=${encodeURIComponent(debouncedDoctorSearch)}`, {
      signal: ctrl.signal, credentials: "include",
    })
      .then(r => r.json())
      .then(data => { setDoctorResults(Array.isArray(data) ? data : []); setSearchingDoctors(false); })
      .catch(() => setSearchingDoctors(false));
    return () => ctrl.abort();
  }, [debouncedDoctorSearch]);

  useEffect(() => {
    if (!showDoctorDropdown) return;
    function onDown(e: MouseEvent) {
      if (
        doctorDropdownRef.current && !doctorDropdownRef.current.contains(e.target as Node) &&
        doctorSearchRef.current && !doctorSearchRef.current.contains(e.target as Node)
      ) setShowDoctorDropdown(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showDoctorDropdown]);

  // ── Effects: Service fetch + click outside ───────────────────────────────────
  useEffect(() => {
    if (!debouncedServiceSearch || debouncedServiceSearch.length < 2) {
      setServiceResults([]); return;
    }
    const ctrl = new AbortController();
    setSearchingServices(true);
    const qp = new URLSearchParams();
    qp.set("search", debouncedServiceSearch);
    qp.set("page", "1");
    qp.set("pageSize", "15");
    if (departmentId) qp.set("departmentId", departmentId);
    fetch(`/api/services?${qp}`, { signal: ctrl.signal, credentials: "include" })
      .then(r => r.json())
      .then(data => { setServiceResults(data.data || []); setSearchingServices(false); })
      .catch(() => setSearchingServices(false));
    return () => ctrl.abort();
  }, [debouncedServiceSearch, departmentId]);

  useEffect(() => {
    if (serviceResults.length === 0) return;
    function onDown(e: MouseEvent) {
      if (
        serviceDropdownRef.current && !serviceDropdownRef.current.contains(e.target as Node) &&
        serviceSearchRef.current && !serviceSearchRef.current.contains(e.target as Node)
      ) setServiceResults([]);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [serviceResults.length]);

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

    // Doctor
    doctorSearch, setDoctorSearch,
    doctorResults, setDoctorResults,
    searchingDoctors,
    showDoctorDropdown, setShowDoctorDropdown,
    doctorSearchRef, doctorDropdownRef,

    // Service
    serviceSearch, setServiceSearch,
    serviceResults, setServiceResults,
    searchingServices,
    serviceSearchRef, serviceDropdownRef,

    // Item
    itemSearch, setItemSearch,
    itemResults, setItemResults,
    searchingItems,
    itemSearchRef, itemDropdownRef,
    addingItemRef,
  };
}
