import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Patient } from "@shared/schema";
import type { AdmissionWithLatestInvoice } from "../tabs/admission-types";
import { useDebounce } from "../utils/debounce";

const todayStr = () => new Date().toISOString().split("T")[0];

const ADM_PAGE_SIZE = 50;

export function useAdmissions(mainTab: string, userDeptId?: string | null) {
  const [admSelectedAdmission, setAdmSelectedAdmission] = useState<AdmissionWithLatestInvoice | null>(null);
  const [admIsCreateOpen, setAdmIsCreateOpen] = useState(false);
  const [admSearchQuery, setAdmSearchQuery] = useState("");
  const [admStatusFilter, setAdmStatusFilter] = useState("all");
  const [admDeptFilter, setAdmDeptFilter] = useState(userDeptId ?? "all");
  const admDeptLocked = !!userDeptId;

  // مزامنة فلتر القسم عند تحميل بيانات المستخدم (auth قد يكون async)
  useEffect(() => {
    if (userDeptId) setAdmDeptFilter(userDeptId);
  }, [userDeptId]);
  const [admDateFrom, setAdmDateFrom] = useState(todayStr());
  const [admDateTo, setAdmDateTo] = useState(todayStr());
  const [admPage, setAdmPage] = useState(1);
  const debouncedAdmSearch = useDebounce(admSearchQuery, 300);

  const [admPatientSearch, setAdmPatientSearch] = useState("");
  const [admPatientResults, setAdmPatientResults] = useState<Patient[]>([]);
  const [admSearchingPatients, setAdmSearchingPatients] = useState(false);
  const [admShowPatientDropdown, setAdmShowPatientDropdown] = useState(false);
  const debouncedAdmPatientSearch = useDebounce(admPatientSearch, 200);
  const admPatientSearchRef = useRef<HTMLInputElement>(null);
  const admPatientDropdownRef = useRef<HTMLDivElement>(null);

  const [admFormData, setAdmFormData] = useState({
    patientName: "", patientPhone: "", patientId: "",
    admissionDate: new Date().toISOString().split("T")[0],
    doctorName: "", notes: "", admissionNumber: "",
  });
  const [admPrintDeptId, setAdmPrintDeptId] = useState("all");
  const admPrintRef = useRef<HTMLDivElement>(null);

  const admFilterKey = useMemo(
    () => [admStatusFilter, admDeptFilter, debouncedAdmSearch, admDateFrom, admDateTo].join("|"),
    [admStatusFilter, admDeptFilter, debouncedAdmSearch, admDateFrom, admDateTo],
  );

  useEffect(() => { setAdmPage(1); }, [admFilterKey]);

  const admQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (admStatusFilter !== "all") params.set("status", admStatusFilter);
    if (admDeptFilter   !== "all") params.set("deptId", admDeptFilter);
    if (debouncedAdmSearch.trim()) params.set("search", debouncedAdmSearch.trim());
    if (admDateFrom) params.set("dateFrom", admDateFrom);
    if (admDateTo)   params.set("dateTo",   admDateTo);
    params.set("page",     String(admPage));
    params.set("pageSize", String(ADM_PAGE_SIZE));
    return params.toString();
  }, [admStatusFilter, admDeptFilter, debouncedAdmSearch, admDateFrom, admDateTo, admPage]);

  type PaginatedAdmissions = { data: AdmissionWithLatestInvoice[]; total: number; page: number; pageSize: number };

  const { data: admResult, isLoading: admListLoading } = useQuery<PaginatedAdmissions>({
    queryKey: ["/api/admissions", admQueryParams],
    queryFn: async () => {
      const qs = admQueryParams ? `?${admQueryParams}` : "";
      const res = await fetch(`/api/admissions${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admissions");
      return res.json();
    },
    enabled: mainTab === "admission",
  });

  const admAllAdmissions = admResult?.data;
  const admTotal     = admResult?.total     ?? 0;
  const admTotalPages = Math.max(1, Math.ceil(admTotal / ADM_PAGE_SIZE));

  const { data: admDetail } = useQuery<AdmissionWithLatestInvoice>({
    queryKey: ["/api/admissions", admSelectedAdmission?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admissions/${admSelectedAdmission!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!admSelectedAdmission,
  });

  const { data: admInvoices, isLoading: admInvoicesLoading } = useQuery<any[]>({
    queryKey: ["/api/admissions", admSelectedAdmission?.id, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/admissions/${admSelectedAdmission!.id}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!admSelectedAdmission,
  });

  const { data: admReportData, isLoading: admReportLoading } = useQuery<any>({
    queryKey: ["/api/admissions", admSelectedAdmission?.id, "report"],
    queryFn: async () => {
      const res = await fetch(`/api/admissions/${admSelectedAdmission!.id}/report`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!admSelectedAdmission,
  });

  useEffect(() => {
    if (!debouncedAdmPatientSearch || debouncedAdmPatientSearch.length < 1) {
      setAdmPatientResults([]);
      return;
    }
    const controller = new AbortController();
    setAdmSearchingPatients(true);
    fetch(`/api/patients?search=${encodeURIComponent(debouncedAdmPatientSearch)}`, {
      signal: controller.signal, credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setAdmPatientResults(Array.isArray(data) ? data : []);
        setAdmSearchingPatients(false);
      })
      .catch(() => setAdmSearchingPatients(false));
    return () => controller.abort();
  }, [debouncedAdmPatientSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        admPatientDropdownRef.current && !admPatientDropdownRef.current.contains(e.target as Node) &&
        admPatientSearchRef.current && !admPatientSearchRef.current.contains(e.target as Node)
      ) setAdmShowPatientDropdown(false);
    }
    if (admShowPatientDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [admShowPatientDropdown]);

  const admHandleCloseCreate = () => {
    setAdmIsCreateOpen(false);
    setAdmFormData({
      patientName: "", patientPhone: "", patientId: "",
      admissionDate: new Date().toISOString().split("T")[0],
      doctorName: "", notes: "", admissionNumber: "",
    });
    setAdmPatientSearch("");
    setAdmPatientResults([]);
    setAdmShowPatientDropdown(false);
  };

  const admHandleSelectPatient = (patient: Patient) => {
    setAdmFormData({ ...admFormData, patientName: patient.fullName, patientPhone: patient.phone || "", patientId: patient.id });
    setAdmPatientSearch(patient.fullName);
    setAdmShowPatientDropdown(false);
    setAdmPatientResults([]);
  };

  const admInvoicesByDepartment = useMemo(() => {
    if (!admReportData?.invoices) return {};
    const grouped: Record<string, any[]> = {};
    for (const inv of admReportData.invoices) {
      const deptName = inv.departmentName || "بدون قسم";
      if (!grouped[deptName]) grouped[deptName] = [];
      grouped[deptName].push(inv);
    }
    return grouped;
  }, [admReportData]);

  const admFilteredPrintInvoices = useMemo(() => {
    if (admPrintDeptId === "all") return admInvoicesByDepartment;
    const filtered: Record<string, any[]> = {};
    for (const [dept, invs] of Object.entries(admInvoicesByDepartment)) {
      const matchingInvs = (invs as any[]).filter((inv: any) => {
        if (admPrintDeptId === "none") return !inv.departmentId;
        return inv.departmentId === admPrintDeptId;
      });
      if (matchingInvs.length > 0) filtered[dept] = matchingInvs;
    }
    return filtered;
  }, [admInvoicesByDepartment, admPrintDeptId]);

  const admTotalAllInvoices = useMemo(() => {
    if (!admReportData?.invoices) return 0;
    return admReportData.invoices.reduce(
      (sum: number, inv: any) => sum + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0
    );
  }, [admReportData]);

  const admStatusLabels: Record<string, string> = { active: "نشطة", discharged: "خرج", cancelled: "ملغاة" };
  const admGetStatusBadgeClass = (s: string) => {
    if (s === "active") return "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate";
    if (s === "discharged") return "bg-blue-600 text-white no-default-hover-elevate no-default-active-elevate";
    if (s === "cancelled") return "bg-red-600 text-white no-default-hover-elevate no-default-active-elevate";
    return "";
  };

  return {
    admSelectedAdmission, setAdmSelectedAdmission,
    admIsCreateOpen, setAdmIsCreateOpen,
    admSearchQuery, setAdmSearchQuery,
    admStatusFilter, setAdmStatusFilter,
    admDeptFilter, setAdmDeptFilter, admDeptLocked,
    admDateFrom, setAdmDateFrom,
    admDateTo, setAdmDateTo,
    admPage, setAdmPage,
    admTotal, admTotalPages,
    admPatientSearch, setAdmPatientSearch,
    admPatientResults,
    admSearchingPatients,
    admShowPatientDropdown, setAdmShowPatientDropdown,
    admPatientSearchRef, admPatientDropdownRef,
    admFormData, setAdmFormData,
    admPrintDeptId, setAdmPrintDeptId,
    admPrintRef,
    admAllAdmissions, admListLoading,
    admDetail,
    admInvoices, admInvoicesLoading,
    admReportData, admReportLoading,
    admInvoicesByDepartment,
    admFilteredPrintInvoices,
    admTotalAllInvoices,
    admStatusLabels,
    admGetStatusBadgeClass,
    admHandleCloseCreate,
    admHandleSelectPatient,
  };
}
