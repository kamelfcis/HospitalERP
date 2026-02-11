import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Save, CheckCircle, Trash2, Plus, Search, ChevronLeft, ChevronRight, Loader2, Eye, X, FileText, BarChart3, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber, formatCurrency, formatDateShort } from "@/lib/formatters";
import type { PatientInvoiceHeader, PatientInvoiceLine, PatientInvoicePayment, Department, Service, Item, Warehouse, Patient, Doctor } from "@shared/schema";
import { patientInvoiceStatusLabels, patientTypeLabels, lineTypeLabels, paymentMethodLabels } from "@shared/schema";

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function genId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
}

interface LineLocal {
  tempId: string;
  lineType: "service" | "drug" | "consumable" | "equipment";
  serviceId: string | null;
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  totalPrice: number;
  doctorName: string;
  nurseName: string;
  requiresDoctor: boolean;
  requiresNurse: boolean;
  notes: string;
  sortOrder: number;
  serviceType: string;
  unitLevel: "major" | "medium" | "minor";
  item?: any;
  lotId: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  priceSource: string;
}

function getEffectiveMajorToMinor(item: any): number {
  if (!item) return 1;
  const m2min = parseFloat(String(item.majorToMinor));
  if (m2min > 0) return m2min;
  const m2med = parseFloat(String(item.majorToMedium));
  const med2min = parseFloat(String(item.mediumToMinor));
  if (m2med > 0 && med2min > 0) return m2med * med2min;
  if (m2med > 0) return m2med;
  return 1;
}

function getEffectiveMediumToMinor(item: any): number {
  if (!item) return 1;
  const m2m = parseFloat(String(item.mediumToMinor));
  if (m2m > 0) return m2m;
  const maj2med = parseFloat(String(item.majorToMedium));
  const maj2min = parseFloat(String(item.majorToMinor));
  if (maj2med > 0 && maj2min > 0) return maj2min / maj2med;
  return 1;
}

function getSmallestUnitLevel(item: any): "major" | "medium" | "minor" {
  if (!item) return "minor";
  if (item.minorUnitName) return "minor";
  if (item.mediumUnitName) return "medium";
  return "major";
}

function calculateQtyInSmallest(qty: number, unitLevel: string, item: any): number {
  if (!item) return qty;
  const smallest = getSmallestUnitLevel(item);
  if (unitLevel === smallest) return qty;
  if (unitLevel === "major") {
    if (smallest === "minor") return qty * getEffectiveMajorToMinor(item);
    if (smallest === "medium") return qty * (parseFloat(String(item.majorToMedium)) || 1);
  }
  if (unitLevel === "medium" && smallest === "minor") {
    return qty * getEffectiveMediumToMinor(item);
  }
  return qty;
}

function calculateQtyInMinor(qty: number, unitLevel: string, item: any): number {
  return calculateQtyInSmallest(qty, unitLevel, item);
}

function computeUnitPriceFromBase(baseSalePrice: number, unitLevel: string, item: any): number {
  if (!item || !baseSalePrice) return baseSalePrice || 0;
  if (unitLevel === "major" || !unitLevel) return baseSalePrice;
  const majorToMedium = parseFloat(String(item.majorToMedium)) || 1;
  const majorToMinor = getEffectiveMajorToMinor(item);
  if (unitLevel === "medium") return +(baseSalePrice / majorToMedium).toFixed(2);
  if (unitLevel === "minor") return +(baseSalePrice / majorToMinor).toFixed(2);
  return baseSalePrice;
}

function convertSmallestToDisplayQty(allocSmallest: number, unitLevel: string, item: any): number {
  const smallest = getSmallestUnitLevel(item);
  let displayQty = allocSmallest;
  if (unitLevel === "major" && smallest !== "major") {
    if (smallest === "minor") displayQty = allocSmallest / getEffectiveMajorToMinor(item);
    else if (smallest === "medium") displayQty = allocSmallest / (parseFloat(String(item?.majorToMedium)) || 1);
  } else if (unitLevel === "medium" && smallest === "minor") {
    displayQty = allocSmallest / getEffectiveMediumToMinor(item);
  }
  const rounded = Math.round(displayQty * 10000) / 10000;
  const nearest = Math.round(rounded);
  if (Math.abs(rounded - nearest) < 0.005) return nearest;
  return rounded;
}

function convertMinorToDisplayQty(allocMinor: number, unitLevel: string, item: any): number {
  return convertSmallestToDisplayQty(allocMinor, unitLevel, item);
}

function itemHasMajorUnit(item: any): boolean {
  if (!item) return false;
  const m2min = parseFloat(String(item.majorToMinor));
  const m2med = parseFloat(String(item.majorToMedium));
  return (m2min > 1) || (m2med > 1) || !!item.majorUnitName;
}

function itemHasMediumUnit(item: any): boolean {
  if (!item) return false;
  const m2med = parseFloat(String(item.majorToMedium));
  const med2min = parseFloat(String(item.mediumToMinor));
  return (m2med > 1) || (med2min > 1) || !!item.mediumUnitName;
}

function getUnitName(item: any, unitLevel: string): string {
  if (!item) return "";
  if (unitLevel === "major") return item.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return item.mediumUnitName || "وحدة متوسطة";
  return item.minorUnitName || "وحدة صغرى";
}

interface PaymentLocal {
  tempId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: "cash" | "card" | "bank_transfer" | "insurance";
  referenceNumber: string;
  notes: string;
}

function recalcLine(line: LineLocal): LineLocal {
  const gross = line.quantity * line.unitPrice;
  const discountAmount = line.discountAmount;
  const totalPrice = Math.max(0, +(gross - discountAmount).toFixed(2));
  return { ...line, totalPrice };
}

function recalcLineFromPercent(line: LineLocal): LineLocal {
  const gross = line.quantity * line.unitPrice;
  const discountAmount = +(gross * line.discountPercent / 100).toFixed(2);
  const totalPrice = Math.max(0, +(gross - discountAmount).toFixed(2));
  return { ...line, discountAmount, totalPrice };
}

function recalcLineFromAmount(line: LineLocal): LineLocal {
  const gross = line.quantity * line.unitPrice;
  const discountPercent = gross > 0 ? +(line.discountAmount / gross * 100).toFixed(2) : 0;
  const totalPrice = Math.max(0, +(gross - line.discountAmount).toFixed(2));
  return { ...line, discountPercent, totalPrice };
}

function getStatusBadgeClass(status: string) {
  if (status === "draft") return "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "finalized") return "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "cancelled") return "bg-red-600 text-white no-default-hover-elevate no-default-active-elevate";
  return "";
}

function getServiceRowClass(serviceType: string): string {
  if (serviceType === "ACCOMMODATION") {
    return "bg-amber-50 dark:bg-amber-950/30";
  }
  if (serviceType === "OPERATING_ROOM") {
    return "bg-indigo-50 dark:bg-indigo-950/30";
  }
  return "";
}

export default function PatientInvoice() {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState("invoice");
  const [subTab, setSubTab] = useState("services");

  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [patientName, setPatientName] = useState("");

  useEffect(() => {
    const originalTitle = document.title;
    return () => { document.title = originalTitle; };
  }, []);

  useEffect(() => {
    if (patientName.trim()) {
      document.title = `فاتورة: ${patientName.trim()}`;
    } else {
      document.title = "فاتورة مريض جديدة";
    }
  }, [patientName]);
  const [patientPhone, setPatientPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [patientType, setPatientType] = useState<"cash" | "contract">("cash");
  const [contractName, setContractName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");

  const [warehouseId, setWarehouseId] = useState("");
  const [fefoLoading, setFefoLoading] = useState(false);

  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [statsItemName, setStatsItemName] = useState("");
  const [statsData, setStatsData] = useState<any[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [distOpen, setDistOpen] = useState(false);
  const [distCount, setDistCount] = useState(2);
  const [distPatients, setDistPatients] = useState<{ name: string; phone: string }[]>([{ name: "", phone: "" }, { name: "", phone: "" }]);
  const [distLoading, setDistLoading] = useState(false);
  const [distSearchIdx, setDistSearchIdx] = useState<number | null>(null);
  const [distSearchText, setDistSearchText] = useState("");
  const [distSearchResults, setDistSearchResults] = useState<Patient[]>([]);
  const [distSearching, setDistSearching] = useState(false);
  const debouncedDistSearch = useDebounce(distSearchText, 200);

  const [lines, setLines] = useState<LineLocal[]>([]);
  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  const pendingQtyRef = useRef<Map<string, string>>(new Map());
  const [payments, setPayments] = useState<PaymentLocal[]>([]);

  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const debouncedPatientSearch = useDebounce(patientSearch, 200);
  const patientSearchRef = useRef<HTMLInputElement>(null);
  const patientDropdownRef = useRef<HTMLDivElement>(null);

  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorResults, setDoctorResults] = useState<Doctor[]>([]);
  const [searchingDoctors, setSearchingDoctors] = useState(false);
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);
  const debouncedDoctorSearch = useDebounce(doctorSearch, 200);
  const doctorSearchRef = useRef<HTMLInputElement>(null);
  const doctorDropdownRef = useRef<HTMLDivElement>(null);

  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceResults, setServiceResults] = useState<Service[]>([]);
  const [searchingServices, setSearchingServices] = useState(false);
  const debouncedServiceSearch = useDebounce(serviceSearch, 300);

  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const debouncedItemSearch = useDebounce(itemSearch, 150);
  const itemSearchRef = useRef<HTMLInputElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);
  const serviceSearchRef = useRef<HTMLInputElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const addingItemRef = useRef<Set<string>>(new Set());

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [regPage, setRegPage] = useState(1);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [regDateFrom, setRegDateFrom] = useState(todayStr);
  const [regDateTo, setRegDateTo] = useState(todayStr);
  const [regPatientName, setRegPatientName] = useState("");
  const [regDoctorName, setRegDoctorName] = useState("");
  const [regStatus, setRegStatus] = useState("all");
  const regPageSize = 20;

  const isDraft = status === "draft";

  const { data: nextNumberData } = useQuery<{ nextNumber: string }>({
    queryKey: ["/api/patient-invoices/next-number"],
  });

  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });
  const { data: warehouses } = useQuery<any[]>({ queryKey: ["/api/warehouses"] });

  useEffect(() => {
    if (nextNumberData?.nextNumber && !invoiceId && !invoiceNumber) {
      setInvoiceNumber(nextNumberData.nextNumber);
    }
  }, [nextNumberData, invoiceId, invoiceNumber]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loadId = params.get("loadId");
    if (loadId) {
      loadInvoice(loadId);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!debouncedServiceSearch || debouncedServiceSearch.length < 2) {
      setServiceResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchingServices(true);
    fetch(`/api/services?search=${encodeURIComponent(debouncedServiceSearch)}&page=1&pageSize=10`, {
      signal: controller.signal,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setServiceResults(data.data || []);
        setSearchingServices(false);
      })
      .catch(() => setSearchingServices(false));
    return () => controller.abort();
  }, [debouncedServiceSearch]);

  useEffect(() => {
    if (!debouncedItemSearch || debouncedItemSearch.length < 1) {
      setItemResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchingItems(true);
    const useAdvanced = debouncedItemSearch.includes("%");
    const url = useAdvanced
      ? `/api/items/search?q=${encodeURIComponent(debouncedItemSearch)}&limit=15`
      : `/api/items?search=${encodeURIComponent(debouncedItemSearch)}&limit=15&page=1`;
    fetch(url, {
      signal: controller.signal,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setItemResults(useAdvanced ? (data || []) : (data.items || []));
        setSearchingItems(false);
      })
      .catch(() => setSearchingItems(false));
    return () => controller.abort();
  }, [debouncedItemSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        itemDropdownRef.current &&
        !itemDropdownRef.current.contains(e.target as Node) &&
        itemSearchRef.current &&
        !itemSearchRef.current.contains(e.target as Node)
      ) {
        setItemResults([]);
      }
    }
    if (itemResults.length > 0) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [itemResults.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        serviceDropdownRef.current &&
        !serviceDropdownRef.current.contains(e.target as Node) &&
        serviceSearchRef.current &&
        !serviceSearchRef.current.contains(e.target as Node)
      ) {
        setServiceResults([]);
      }
    }
    if (serviceResults.length > 0) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [serviceResults.length]);

  useEffect(() => {
    if (!debouncedDistSearch || debouncedDistSearch.length < 1 || distSearchIdx === null) {
      setDistSearchResults([]);
      return;
    }
    const controller = new AbortController();
    setDistSearching(true);
    fetch(`/api/patients?search=${encodeURIComponent(debouncedDistSearch)}`, {
      signal: controller.signal,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setDistSearchResults(Array.isArray(data) ? data : []);
        setDistSearching(false);
      })
      .catch(() => setDistSearching(false));
    return () => controller.abort();
  }, [debouncedDistSearch, distSearchIdx]);

  useEffect(() => {
    if (!debouncedPatientSearch || debouncedPatientSearch.length < 1) {
      setPatientResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchingPatients(true);
    fetch(`/api/patients?search=${encodeURIComponent(debouncedPatientSearch)}`, {
      signal: controller.signal,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setPatientResults(Array.isArray(data) ? data : []);
        setSearchingPatients(false);
      })
      .catch(() => setSearchingPatients(false));
    return () => controller.abort();
  }, [debouncedPatientSearch]);

  useEffect(() => {
    if (!debouncedDoctorSearch || debouncedDoctorSearch.length < 1) {
      setDoctorResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchingDoctors(true);
    fetch(`/api/doctors?search=${encodeURIComponent(debouncedDoctorSearch)}`, {
      signal: controller.signal,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setDoctorResults(Array.isArray(data) ? data : []);
        setSearchingDoctors(false);
      })
      .catch(() => setSearchingDoctors(false));
    return () => controller.abort();
  }, [debouncedDoctorSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        patientDropdownRef.current &&
        !patientDropdownRef.current.contains(e.target as Node) &&
        patientSearchRef.current &&
        !patientSearchRef.current.contains(e.target as Node)
      ) {
        setShowPatientDropdown(false);
      }
    }
    if (showPatientDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPatientDropdown]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        doctorDropdownRef.current &&
        !doctorDropdownRef.current.contains(e.target as Node) &&
        doctorSearchRef.current &&
        !doctorSearchRef.current.contains(e.target as Node)
      ) {
        setShowDoctorDropdown(false);
      }
    }
    if (showDoctorDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDoctorDropdown]);

  const regQp = useMemo(() => {
    const qp = new URLSearchParams();
    if (regStatus !== "all") qp.set("status", regStatus);
    if (regDateFrom) qp.set("dateFrom", regDateFrom);
    if (regDateTo) qp.set("dateTo", regDateTo);
    if (regPatientName) qp.set("patientName", regPatientName);
    if (regDoctorName) qp.set("doctorName", regDoctorName);
    qp.set("page", String(regPage));
    qp.set("pageSize", String(regPageSize));
    return qp.toString();
  }, [regStatus, regDateFrom, regDateTo, regPatientName, regDoctorName, regPage]);

  const { data: registryData, isLoading: regLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: [`/api/patient-invoices?${regQp}`],
    enabled: mainTab === "registry",
  });

  const regTotalPages = Math.ceil((registryData?.total || 0) / regPageSize);

  const totals = useMemo(() => {
    const totalAmount = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const totalDiscount = lines.reduce((s, l) => s + l.discountAmount, 0);
    const netAmount = totalAmount - totalDiscount;
    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = netAmount - paidAmount;
    return {
      totalAmount: +totalAmount.toFixed(2),
      discountAmount: +totalDiscount.toFixed(2),
      netAmount: +netAmount.toFixed(2),
      paidAmount: +paidAmount.toFixed(2),
      remaining: +remaining.toFixed(2),
    };
  }, [lines, payments]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const header = {
        invoiceNumber,
        invoiceDate,
        patientName,
        patientPhone: patientPhone || null,
        patientType,
        departmentId: departmentId || null,
        warehouseId: warehouseId || null,
        doctorName: doctorName || null,
        contractName: patientType === "contract" ? contractName : null,
        notes: notes || null,
        status: "draft",
        totalAmount: String(totals.totalAmount),
        discountAmount: String(totals.discountAmount),
        netAmount: String(totals.netAmount),
        paidAmount: String(totals.paidAmount),
      };
      const lineData = lines.map((l, i) => ({
        lineType: l.lineType,
        serviceId: l.serviceId || null,
        itemId: l.itemId || null,
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        discountPercent: String(l.discountPercent),
        discountAmount: String(l.discountAmount),
        totalPrice: String(l.totalPrice),
        unitLevel: l.unitLevel || "minor",
        doctorName: l.doctorName || null,
        nurseName: l.nurseName || null,
        notes: l.notes || null,
        sortOrder: i,
        lotId: l.lotId || null,
        expiryMonth: l.expiryMonth || null,
        expiryYear: l.expiryYear || null,
        priceSource: l.priceSource || null,
      }));
      const payData = payments.map((p) => ({
        paymentDate: p.paymentDate,
        amount: String(p.amount),
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber || null,
        notes: p.notes || null,
      }));

      if (invoiceId) {
        const res = await apiRequest("PUT", `/api/patient-invoices/${invoiceId}`, { header, lines: lineData, payments: payData });
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/patient-invoices", { header, lines: lineData, payments: payData });
        return res.json();
      }
    },
    onSuccess: (data) => {
      setInvoiceId(data.id);
      setStatus(data.status);
      toast({ title: "تم الحفظ", description: "تم حفظ فاتورة المريض بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices/next-number"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceId) throw new Error("يجب حفظ الفاتورة أولاً");
      const missingDoctor = lines.filter(l => l.lineType === "service" && l.requiresDoctor && !l.doctorName.trim());
      const missingNurse = lines.filter(l => l.lineType === "service" && l.requiresNurse && !l.nurseName.trim());
      if (missingDoctor.length > 0) {
        throw new Error(`يجب إدخال اسم الطبيب للخدمات: ${missingDoctor.map(l => l.description).join("، ")}`);
      }
      if (missingNurse.length > 0) {
        throw new Error(`يجب إدخال اسم الممرض للخدمات: ${missingNurse.map(l => l.description).join("، ")}`);
      }
      const res = await apiRequest("POST", `/api/patient-invoices/${invoiceId}/finalize`);
      return res.json();
    },
    onSuccess: (data) => {
      setStatus(data.status || "finalized");
      toast({ title: "تم الاعتماد", description: "تم اعتماد فاتورة المريض بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/patient-invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم الحذف", description: "تم حذف فاتورة المريض" });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices/next-number"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const openDistributeDialog = useCallback(() => {
    if (lines.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد بنود للتوزيع", variant: "destructive" });
      return;
    }
    setDistCount(2);
    setDistPatients([{ name: "", phone: "" }, { name: "", phone: "" }]);
    setDistOpen(true);
  }, [lines, toast]);

  const handleDistCountChange = useCallback((newCount: number) => {
    const count = Math.max(2, Math.min(50, newCount));
    setDistCount(count);
    setDistPatients(prev => {
      const updated = [...prev];
      while (updated.length < count) updated.push({ name: "", phone: "" });
      return updated.slice(0, count);
    });
  }, []);

  const resetForm = useCallback(() => {
    setInvoiceId(null);
    setInvoiceNumber(nextNumberData?.nextNumber || "");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setPatientName("");
    setPatientPhone("");
    setDepartmentId("");
    setWarehouseId("");
    setDoctorName("");
    setPatientType("cash");
    setContractName("");
    setNotes("");
    setStatus("draft");
    setLines([]);
    setPayments([]);
    setSubTab("services");
  }, [nextNumberData]);

  const handleDistribute = useCallback(async () => {
    const emptyNames = distPatients.slice(0, distCount).filter(p => !p.name.trim());
    if (emptyNames.length > 0) {
      toast({ title: "تنبيه", description: "يجب إدخال اسم كل مريض", variant: "destructive" });
      return;
    }
    if (lines.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد بنود للتوزيع", variant: "destructive" });
      return;
    }
    setDistLoading(true);
    try {
      const linesToSend = lines.map(l => ({
        lineType: l.lineType,
        serviceId: l.serviceId,
        itemId: l.itemId,
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        discountPercent: String(l.discountPercent),
        discountAmount: String(l.discountAmount),
        totalPrice: String(l.totalPrice),
        unitLevel: l.unitLevel,
        lotId: l.lotId,
        expiryMonth: l.expiryMonth,
        expiryYear: l.expiryYear,
        priceSource: l.priceSource,
        doctorName: l.doctorName,
        nurseName: l.nurseName,
        notes: l.notes,
        sortOrder: l.sortOrder,
      }));

      const res = await apiRequest("POST", `/api/patient-invoices/distribute-direct`, {
        patients: distPatients.slice(0, distCount).map(p => ({ name: p.name.trim(), phone: p.phone.trim() || undefined })),
        lines: linesToSend,
        invoiceDate,
        departmentId: departmentId || null,
        warehouseId: warehouseId || null,
        doctorName: doctorName || null,
        patientType,
        contractName: contractName || null,
        notes,
      });
      const data = await res.json();
      const newInvoices: PatientInvoiceHeader[] = data.invoices;

      setDistOpen(false);
      if (invoiceId) {
        try { await apiRequest("DELETE", `/api/patient-invoices/${invoiceId}`); } catch {}
      }
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices/next-number"] });

      const skipped = distCount - newInvoices.length;
      const desc = skipped > 0
        ? `تم إنشاء ${newInvoices.length} فاتورة (${skipped} مريض لم يحصل على كمية كافية)`
        : `تم إنشاء ${newInvoices.length} فاتورة بنجاح`;
      toast({ title: "تم التوزيع", description: desc });

      for (const inv of newInvoices) {
        window.open(`/patient-invoices?loadId=${inv.id}`, "_blank");
      }
    } catch (error: any) {
      toast({ title: "خطأ في التوزيع", description: error.message, variant: "destructive" });
    } finally {
      setDistLoading(false);
    }
  }, [lines, distPatients, distCount, toast, resetForm, invoiceId, invoiceDate, departmentId, warehouseId, doctorName, patientType, contractName, notes]);

  const loadInvoice = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/patient-invoices/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInvoiceId(data.id);
      setInvoiceNumber(data.invoiceNumber);
      setInvoiceDate(data.invoiceDate);
      setPatientName(data.patientName);
      setPatientPhone(data.patientPhone || "");
      setDepartmentId(data.departmentId || "");
      setWarehouseId(data.warehouseId || "");
      setDoctorName(data.doctorName || "");
      setPatientType(data.patientType || "cash");
      setContractName(data.contractName || "");
      setNotes(data.notes || "");
      setStatus(data.status);

      const loadedLines: LineLocal[] = (data.lines || []).map((l: any) => ({
        tempId: genId(),
        lineType: l.lineType,
        serviceId: l.serviceId,
        itemId: l.itemId,
        description: l.description,
        doctorName: l.doctorName || "",
        nurseName: l.nurseName || "",
        requiresDoctor: l.service?.requiresDoctor ?? l.requiresDoctor ?? false,
        requiresNurse: l.service?.requiresNurse ?? l.requiresNurse ?? false,
        quantity: parseFloat(l.quantity) || 1,
        unitPrice: parseFloat(l.unitPrice) || 0,
        discountPercent: parseFloat(l.discountPercent) || 0,
        discountAmount: parseFloat(l.discountAmount) || 0,
        totalPrice: parseFloat(l.totalPrice) || 0,
        notes: l.notes || "",
        sortOrder: l.sortOrder || 0,
        serviceType: l.service?.serviceType || "",
        unitLevel: l.unitLevel || "minor",
        item: l.itemData || null,
        lotId: l.line?.lotId || l.lotId || null,
        expiryMonth: l.line?.expiryMonth || l.expiryMonth || null,
        expiryYear: l.line?.expiryYear || l.expiryYear || null,
        priceSource: l.line?.priceSource || l.priceSource || "",
      }));
      setLines(loadedLines);

      const loadedPayments: PaymentLocal[] = (data.payments || []).map((p: any) => ({
        tempId: genId(),
        paymentDate: p.paymentDate,
        amount: parseFloat(p.amount) || 0,
        paymentMethod: p.paymentMethod || "cash",
        referenceNumber: p.referenceNumber || "",
        notes: p.notes || "",
      }));
      setPayments(loadedPayments);

      setMainTab("invoice");
      setSubTab("services");
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }, [toast]);

  const addServiceLine = useCallback((svc: any) => {
    const newLine: LineLocal = {
      tempId: genId(),
      lineType: "service",
      serviceId: svc.id,
      itemId: null,
      description: svc.nameAr || svc.name || svc.code,
      quantity: 1,
      unitPrice: parseFloat(svc.basePrice) || 0,
      discountPercent: 0,
      discountAmount: 0,
      totalPrice: parseFloat(svc.basePrice) || 0,
      doctorName: "",
      nurseName: "",
      requiresDoctor: svc.requiresDoctor ?? false,
      requiresNurse: svc.requiresNurse ?? false,
      notes: "",
      sortOrder: lines.filter((l) => l.lineType === "service").length,
      serviceType: svc.serviceType || "SERVICE",
      unitLevel: "minor" as const,
      lotId: null,
      expiryMonth: null,
      expiryYear: null,
      priceSource: "service",
    };
    setLines((prev) => [...prev, newLine]);
    setServiceSearch("");
    setServiceResults([]);
  }, [lines]);

  const addItemLine = useCallback((item: any, lineType: "drug" | "consumable" | "equipment") => {
    const hasMajor = itemHasMajorUnit(item);
    const hasMedium = itemHasMediumUnit(item);
    const defaultUnit: "major" | "medium" | "minor" = hasMajor ? "major" : hasMedium ? "medium" : "minor";
    const baseSalePrice = parseFloat(String(item.salePriceCurrent || item.purchasePriceLast || "0")) || 0;
    const unitPrice = computeUnitPriceFromBase(baseSalePrice, defaultUnit, item);

    if (item.hasExpiry && !warehouseId) {
      toast({
        title: "يجب اختيار المخزن",
        description: "اختر المخزن أولاً لتفعيل التوزيع التلقائي للصلاحية (FEFO)",
        variant: "destructive",
      });
      setItemSearch("");
      setItemResults([]);
      return;
    }

    const tempLineId = genId();
    const placeholderLine: LineLocal = {
      tempId: tempLineId,
      lineType,
      serviceId: null,
      itemId: item.id,
      description: item.nameAr || item.itemCode,
      quantity: 1,
      unitPrice,
      discountPercent: 0,
      discountAmount: 0,
      totalPrice: unitPrice,
      doctorName: "",
      nurseName: "",
      requiresDoctor: false,
      requiresNurse: false,
      notes: "",
      sortOrder: 0,
      serviceType: "",
      unitLevel: defaultUnit,
      item,
      lotId: null,
      expiryMonth: null,
      expiryYear: null,
      priceSource: "item",
    };

    setLines((prev) => [...prev, placeholderLine]);
    setItemSearch("");
    setItemResults([]);
    requestAnimationFrame(() => itemSearchRef.current?.focus());

    const asyncToken = genId();
    addingItemRef.current.add(asyncToken);

    (async () => {
      try {
        let resolvedPrice = baseSalePrice;
        let priceSource = "item";
        if (departmentId || warehouseId) {
          try {
            const params = new URLSearchParams({ itemId: item.id });
            if (departmentId) params.set("departmentId", departmentId);
            if (warehouseId) params.set("warehouseId", warehouseId);
            const priceRes = await fetch(`/api/pricing?${params.toString()}`);
            if (priceRes.ok) {
              const priceData = await priceRes.json();
              const resolved = parseFloat(priceData.price);
              if (resolved > 0) resolvedPrice = resolved;
              if (priceData.source) priceSource = priceData.source;
            }
          } catch {}
        }
        const isDeptPrice = priceSource === "department";
        const finalUnitPrice = computeUnitPriceFromBase(resolvedPrice, defaultUnit, item);

        if (!addingItemRef.current.has(asyncToken)) return;

        if (item.hasExpiry && warehouseId) {
          setFefoLoading(true);
          try {
            const currentLines = linesRef.current;
            const existingLines = currentLines.filter(l => l.itemId === item.id && l.tempId !== tempLineId);
            const existingQtyMinor = existingLines.reduce((sum, l) => sum + calculateQtyInMinor(l.quantity, l.unitLevel, l.item || item), 0);
            const additionalMinor = calculateQtyInMinor(1, defaultUnit, item);
            const totalRequiredMinor = existingQtyMinor + additionalMinor;

            const fefoParams = new URLSearchParams({
              itemId: item.id,
              warehouseId,
              requiredQtyInMinor: String(totalRequiredMinor),
              asOfDate: invoiceDate,
            });
            const res = await fetch(`/api/transfer/fefo-preview?${fefoParams.toString()}`);
            if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
            const preview = await res.json();

            if (!addingItemRef.current.has(asyncToken)) return;

            if (!preview.fulfilled) {
              setLines(prev => prev.filter(l => l.tempId !== tempLineId));
              toast({
                title: "الكمية غير متاحة",
                description: preview.shortfall ? `العجز: ${preview.shortfall}` : "الرصيد غير كافي",
                variant: "destructive",
              });
              return;
            }

            const newFefoLines: LineLocal[] = preview.allocations
              .filter((a: any) => parseFloat(a.allocatedQty) > 0)
              .map((alloc: any) => {
                const allocMinor = parseFloat(alloc.allocatedQty);
                const displayQty = convertMinorToDisplayQty(allocMinor, defaultUnit, item);
                const lineBasePrice = isDeptPrice
                  ? resolvedPrice
                  : (parseFloat(alloc.lotSalePrice || "0") > 0 ? parseFloat(alloc.lotSalePrice) : resolvedPrice);
                const linePrice = computeUnitPriceFromBase(lineBasePrice, defaultUnit, item);
                const lineTotal = +(displayQty * linePrice).toFixed(2);

                return {
                  tempId: genId(),
                  lineType,
                  serviceId: null,
                  itemId: item.id,
                  description: item.nameAr || item.itemCode,
                  quantity: displayQty,
                  unitPrice: linePrice,
                  discountPercent: 0,
                  discountAmount: 0,
                  totalPrice: lineTotal,
                  doctorName: "",
                  nurseName: "",
                  requiresDoctor: false,
                  requiresNurse: false,
                  notes: "",
                  sortOrder: 0,
                  serviceType: "",
                  unitLevel: defaultUnit,
                  item,
                  lotId: alloc.lotId || null,
                  expiryMonth: alloc.expiryMonth || null,
                  expiryYear: alloc.expiryYear || null,
                  priceSource,
                } as LineLocal;
              });

            setLines(prev => {
              const filtered = prev.filter(l => l.itemId !== item.id);
              return [...filtered, ...newFefoLines];
            });

            if (newFefoLines.length > 1) {
              toast({ title: `${item.nameAr}`, description: `تم التوزيع على ${newFefoLines.length} دفعات (FEFO)` });
            }
          } catch (err: any) {
            toast({ title: "خطأ في توزيع الصلاحية", description: err.message, variant: "destructive" });
          } finally {
            setFefoLoading(false);
          }
        } else {
          if (finalUnitPrice !== unitPrice || priceSource !== "item") {
            setLines(prev => prev.map(l => {
              if (l.tempId !== tempLineId) return l;
              return { ...l, unitPrice: finalUnitPrice, totalPrice: +(l.quantity * finalUnitPrice).toFixed(2), priceSource };
            }));
          }
        }
      } finally {
        addingItemRef.current.delete(asyncToken);
      }
    })();
  }, [departmentId, warehouseId, invoiceDate, toast]);

  const updateLine = useCallback((tempId: string, field: string, value: any) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.tempId !== tempId) return l;
        const updated = { ...l, [field]: value };
        if (field === "discountPercent") return recalcLineFromPercent(updated);
        if (field === "discountAmount") return recalcLineFromAmount(updated);
        if (field === "quantity" || field === "unitPrice") return recalcLineFromPercent(updated);
        return updated;
      })
    );
  }, []);

  const removeLine = useCallback((tempId: string) => {
    setLines((prev) => prev.filter((l) => l.tempId !== tempId));
  }, []);

  const addPayment = useCallback(() => {
    setPayments((prev) => [
      ...prev,
      {
        tempId: genId(),
        paymentDate: new Date().toISOString().split("T")[0],
        amount: 0,
        paymentMethod: "cash",
        referenceNumber: "",
        notes: "",
      },
    ]);
  }, []);

  const updatePayment = useCallback((tempId: string, field: string, value: any) => {
    setPayments((prev) =>
      prev.map((p) => (p.tempId === tempId ? { ...p, [field]: value } : p))
    );
  }, []);

  const removePayment = useCallback((tempId: string) => {
    setPayments((prev) => prev.filter((p) => p.tempId !== tempId));
  }, []);

  const filteredLines = useCallback(
    (type: string) => lines.filter((l) => l.lineType === type),
    [lines]
  );

  const openStatsPopup = useCallback(async (itemId: string, itemName: string) => {
    setStatsItemId(itemId);
    setStatsItemName(itemName);
    setStatsData(null);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/warehouse-stats`);
      if (res.ok) {
        setStatsData(await res.json());
      }
    } catch {} finally {
      setStatsLoading(false);
    }
  }, []);

  const handleUnitLevelChange = useCallback(async (tempId: string, newLevel: "major" | "medium" | "minor") => {
    const currentLines = linesRef.current;
    const line = currentLines.find(l => l.tempId === tempId);
    if (!line || !line.itemId || !line.item) return;

    const oldLevel = line.unitLevel;
    if (oldLevel === newLevel) return;

    const newDisplayQty = 1;
    const baseSalePrice = parseFloat(String(line.item.salePriceCurrent || line.item.purchasePriceLast || "0")) || 0;
    let newUnitPrice = computeUnitPriceFromBase(baseSalePrice, newLevel, line.item);

    if (line.priceSource === "department" && departmentId) {
      try {
        const params = new URLSearchParams({ itemId: line.itemId });
        if (departmentId) params.set("departmentId", departmentId);
        if (warehouseId) params.set("warehouseId", warehouseId);
        const priceRes = await fetch(`/api/pricing?${params.toString()}`);
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const resolved = parseFloat(priceData.price);
          if (resolved > 0) newUnitPrice = computeUnitPriceFromBase(resolved, newLevel, line.item);
        }
      } catch {}
    }

    const isExpiry = !!(line.lotId || line.expiryMonth || line.expiryYear);
    if (isExpiry && warehouseId) {
      const otherLines = currentLines.filter(l => l.itemId === line.itemId && l.tempId !== tempId);
      const otherMinor = otherLines.reduce((sum, l) => sum + calculateQtyInMinor(l.quantity, l.unitLevel, l.item || line.item), 0);
      const thisMinor = calculateQtyInMinor(newDisplayQty, newLevel, line.item);
      const totalMinor = otherMinor + thisMinor;

      setFefoLoading(true);
      try {
        const fefoParams = new URLSearchParams({
          itemId: line.itemId,
          warehouseId,
          requiredQtyInMinor: String(totalMinor),
          asOfDate: invoiceDate,
        });
        const res = await fetch(`/api/transfer/fefo-preview?${fefoParams.toString()}`);
        if (!res.ok) throw new Error("فشل حساب التوزيع");
        const preview = await res.json();

        if (preview.fulfilled) {
          const isDeptPrice = line.priceSource === "department";
          const newFefoLines: LineLocal[] = preview.allocations
            .filter((a: any) => parseFloat(a.allocatedQty) > 0)
            .map((alloc: any) => {
              const allocMinor = parseFloat(alloc.allocatedQty);
              const displayQty = convertMinorToDisplayQty(allocMinor, newLevel, line.item);
              const lotBase = isDeptPrice
                ? newUnitPrice
                : computeUnitPriceFromBase(
                    parseFloat(alloc.lotSalePrice || "0") > 0 ? parseFloat(alloc.lotSalePrice) : baseSalePrice,
                    newLevel,
                    line.item
                  );
              const lineTotal = +(displayQty * lotBase).toFixed(2);

              return {
                tempId: genId(),
                lineType: line.lineType,
                serviceId: null,
                itemId: line.itemId,
                description: line.description,
                quantity: displayQty,
                unitPrice: lotBase,
                discountPercent: 0,
                discountAmount: 0,
                totalPrice: lineTotal,
                doctorName: "",
                nurseName: "",
                requiresDoctor: false,
                requiresNurse: false,
                notes: "",
                sortOrder: 0,
                serviceType: "",
                unitLevel: newLevel,
                item: line.item,
                lotId: alloc.lotId || null,
                expiryMonth: alloc.expiryMonth || null,
                expiryYear: alloc.expiryYear || null,
                priceSource: line.priceSource,
              } as LineLocal;
            });

          setLines(prev => {
            const filtered = prev.filter(l => l.itemId !== line.itemId);
            return [...filtered, ...newFefoLines];
          });
        }
      } catch (err: any) {
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
    } else {
      setLines(prev => prev.map(l => {
        if (l.tempId !== tempId) return l;
        const total = +(newDisplayQty * newUnitPrice).toFixed(2);
        return { ...l, unitLevel: newLevel, quantity: newDisplayQty, unitPrice: newUnitPrice, totalPrice: total, discountPercent: 0, discountAmount: 0 };
      }));
    }
  }, [warehouseId, invoiceDate, departmentId, toast]);

  const handleQtyConfirm = useCallback(async (tempId: string) => {
    const currentLines = linesRef.current;
    const line = currentLines.find(l => l.tempId === tempId);
    if (!line || !line.itemId) return;

    const pendingVal = pendingQtyRef.current.get(tempId);
    const qtyEntered = parseFloat(pendingVal ?? String(line.quantity)) || 0;
    pendingQtyRef.current.delete(tempId);

    if (qtyEntered <= 0) {
      toast({ title: "كمية غير صحيحة", variant: "destructive" });
      return;
    }

    const isExpiry = !!(line.lotId || line.expiryMonth || line.expiryYear);
    if (!isExpiry || !warehouseId) {
      updateLine(tempId, "quantity", qtyEntered);
      return;
    }

    const allLinesForItem = currentLines.filter(l => l.itemId === line.itemId);
    const otherLinesMinor = allLinesForItem
      .filter(l => l.tempId !== tempId)
      .reduce((sum, l) => sum + calculateQtyInMinor(l.quantity, l.unitLevel, l.item), 0);
    const enteredMinor = calculateQtyInMinor(qtyEntered, line.unitLevel, line.item);
    const totalRequired = otherLinesMinor + enteredMinor;

    if (totalRequired <= 0) return;

    setFefoLoading(true);
    try {
      const fefoParams = new URLSearchParams({
        itemId: line.itemId,
        warehouseId,
        requiredQtyInMinor: String(totalRequired),
        asOfDate: invoiceDate,
      });
      const res = await fetch(`/api/transfer/fefo-preview?${fefoParams.toString()}`);
      if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
      const preview = await res.json();

      if (!preview.fulfilled) {
        toast({
          title: "الكمية غير متاحة",
          description: preview.shortfall ? `العجز: ${preview.shortfall}` : "الرصيد غير كافي",
          variant: "destructive",
        });
        setFefoLoading(false);
        return;
      }

      let resolvedPrice = parseFloat(String(line.unitPrice)) || 0;
      let isDeptPrice = line.priceSource === "department";

      if (departmentId || warehouseId) {
        try {
          const params = new URLSearchParams({ itemId: line.itemId });
          if (departmentId) params.set("departmentId", departmentId);
          if (warehouseId) params.set("warehouseId", warehouseId);
          const priceRes = await fetch(`/api/pricing?${params.toString()}`);
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const resolved = parseFloat(priceData.price);
            if (resolved > 0) resolvedPrice = resolved;
            isDeptPrice = priceData.source === "department";
          }
        } catch {}
      }

      const ul = line.unitLevel || "minor";
      const itemRef = line.item;

      const newFefoLines: LineLocal[] = preview.allocations
        .filter((a: any) => parseFloat(a.allocatedQty) > 0)
        .map((alloc: any) => {
          const allocMinor = parseFloat(alloc.allocatedQty);
          const displayQty = convertMinorToDisplayQty(allocMinor, ul, itemRef);
          const basePrice = isDeptPrice
            ? resolvedPrice
            : (parseFloat(alloc.lotSalePrice || "0") > 0 ? parseFloat(alloc.lotSalePrice) : resolvedPrice);
          const linePrice = computeUnitPriceFromBase(basePrice, ul, itemRef);
          const lineTotal = +(displayQty * linePrice).toFixed(2);

          return {
            tempId: genId(),
            lineType: line.lineType,
            serviceId: null,
            itemId: line.itemId,
            description: line.description,
            quantity: displayQty,
            unitPrice: linePrice,
            discountPercent: 0,
            discountAmount: 0,
            totalPrice: lineTotal,
            doctorName: "",
            nurseName: "",
            requiresDoctor: false,
            requiresNurse: false,
            notes: "",
            sortOrder: 0,
            serviceType: "",
            unitLevel: ul,
            item: itemRef,
            lotId: alloc.lotId || null,
            expiryMonth: alloc.expiryMonth || null,
            expiryYear: alloc.expiryYear || null,
            priceSource: isDeptPrice ? "department" : (parseFloat(alloc.lotSalePrice || "0") > 0 ? "lot" : "item"),
          } as LineLocal;
        });

      setLines(prev => {
        const filtered = prev.filter(l => l.itemId !== line.itemId);
        return [...filtered, ...newFefoLines];
      });

      if (newFefoLines.length > 1) {
        toast({ title: `تم التوزيع على ${newFefoLines.length} دفعات (FEFO)` });
      }
    } catch (err: any) {
      toast({ title: "خطأ في توزيع الصلاحية", description: err.message, variant: "destructive" });
    } finally {
      setFefoLoading(false);
    }
  }, [warehouseId, invoiceDate, departmentId, toast, updateLine]);

  function renderLineGrid(type: string) {
    const typeLines = filteredLines(type);
    return (
      <div className="space-y-3">
        {type !== "service" ? (
          <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={itemSearchRef}
                placeholder="بحث عن صنف... (استخدم % للبحث المتقدم)"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setItemSearch("");
                    setItemResults([]);
                  }
                }}
                className="pr-8"
                disabled={!isDraft}
                data-testid={`input-item-search-${type}`}
              />
            </div>
            {searchingItems && <Loader2 className="h-4 w-4 animate-spin" />}
            {fefoLoading && <Badge variant="secondary" className="text-xs">جاري توزيع الصلاحية...</Badge>}
          </div>
        ) : (
          <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={serviceSearchRef}
                placeholder="بحث عن خدمة..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setServiceSearch("");
                    setServiceResults([]);
                  }
                }}
                className="pr-8"
                disabled={!isDraft}
                data-testid="input-service-search"
              />
            </div>
            {searchingServices && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        )}

        {type === "service" && serviceResults.length > 0 && (
          <div className="relative" style={{ zIndex: 50 }}>
            <div ref={serviceDropdownRef} className="absolute top-0 right-0 left-0 border rounded-md max-h-48 overflow-y-auto bg-popover shadow-lg">
              {serviceResults.map((svc: any) => (
                <div
                  key={svc.id}
                  className="flex flex-row-reverse items-center justify-between gap-2 p-2 hover-elevate cursor-pointer border-b last:border-b-0"
                  onClick={() => addServiceLine(svc)}
                  data-testid={`result-service-${svc.id}`}
                >
                  <span className="text-sm">{svc.nameAr || svc.code}</span>
                  <span className="text-xs text-muted-foreground">{formatNumber(svc.basePrice)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {type !== "service" && itemResults.length > 0 && (
          <div className="relative" style={{ zIndex: 50 }}>
            <div ref={itemDropdownRef} className="absolute top-0 right-0 left-0 border rounded-md max-h-48 overflow-y-auto bg-popover shadow-lg">
              {itemResults.map((item: any) => (
                <div
                  key={item.id}
                  className="flex flex-row-reverse items-center justify-between gap-2 p-2 hover-elevate cursor-pointer border-b last:border-b-0"
                  onClick={() => addItemLine(item, type as "drug" | "consumable" | "equipment")}
                  data-testid={`result-item-${type}-${item.id}`}
                >
                  <div className="flex flex-row-reverse items-center gap-2">
                    <span className="text-sm">{item.nameAr || item.itemCode}</span>
                    {item.itemCode && <span className="text-[10px] text-muted-foreground">({item.itemCode})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{item.majorUnitName || item.mediumUnitName || item.minorUnitName || "وحدة"}</span>
                    <span className="text-xs text-muted-foreground">{formatNumber(item.salePriceCurrent || item.purchasePriceLast || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto border rounded-md">
          <table className="peachtree-grid w-full text-sm">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="text-center" style={{ width: 40 }}>#</th>
                <th>الوصف</th>
                {type === "service" && <th className="text-center" style={{ width: 120 }}>الطبيب</th>}
                {type === "service" && <th className="text-center" style={{ width: 120 }}>الممرض</th>}
                {type !== "service" && <th className="text-center" style={{ width: 80 }}>الوحدة</th>}
                <th className="text-center" style={{ width: 80 }}>الكمية</th>
                <th className="text-center" style={{ width: 100 }}>سعر الوحدة</th>
                <th className="text-center" style={{ width: 80 }}>خصم %</th>
                <th className="text-center" style={{ width: 100 }}>قيمة الخصم</th>
                <th className="text-center" style={{ width: 110 }}>الإجمالي</th>
                {isDraft && <th className="text-center" style={{ width: 50 }}></th>}
              </tr>
            </thead>
            <tbody>
              {typeLines.map((line, i) => (
                <tr
                  key={line.tempId}
                  className={`peachtree-grid-row ${type === "service" ? getServiceRowClass(line.serviceType) : ""}`}
                  data-testid={`row-line-${type}-${i}`}
                >
                  <td className="text-center">{i + 1}</td>
                  <td>
                    {isDraft ? (
                      <div className="space-y-0.5">
                        <div className="flex flex-row-reverse items-center gap-1">
                          <Input
                            value={line.description}
                            onChange={(e) => updateLine(line.tempId, "description", e.target.value)}
                            className="h-7 text-xs flex-1"
                            data-testid={`input-desc-${type}-${i}`}
                          />
                          {(type === "drug" || type === "consumable") && line.itemId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => openStatsPopup(line.itemId!, line.description)}
                              data-testid={`button-stock-stats-${type}-${i}`}
                            >
                              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                        {(type === "drug" || type === "consumable") && line.expiryMonth && line.expiryYear && (
                          <div className="flex flex-row-reverse items-center gap-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {String(line.expiryMonth).padStart(2, "0")}/{line.expiryYear}
                            </Badge>
                            {line.priceSource === "department" && (
                              <Badge variant="secondary" className="text-[10px] bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400">سعر القسم</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-row-reverse items-center gap-1">
                          <span>{line.description}</span>
                          {(type === "drug" || type === "consumable") && line.itemId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => openStatsPopup(line.itemId!, line.description)}
                              data-testid={`button-stock-stats-${type}-${i}`}
                            >
                              <BarChart3 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                        {(type === "drug" || type === "consumable") && line.expiryMonth && line.expiryYear && (
                          <div className="flex flex-row-reverse items-center gap-1 mt-0.5">
                            <Badge variant="secondary" className="text-[10px]">
                              {String(line.expiryMonth).padStart(2, "0")}/{line.expiryYear}
                            </Badge>
                            {line.priceSource === "department" && (
                              <Badge variant="secondary" className="text-[10px] bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400">سعر القسم</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  {type === "service" && (
                    <td className={`text-center ${line.requiresDoctor ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}>
                      {line.requiresDoctor ? (
                        isDraft ? (
                          <Input
                            value={line.doctorName}
                            onChange={(e) => updateLine(line.tempId, "doctorName", e.target.value)}
                            placeholder="اسم الطبيب *"
                            className={`h-7 text-xs ${!line.doctorName ? "border-blue-400 dark:border-blue-600" : ""}`}
                            data-testid={`input-doctor-${i}`}
                          />
                        ) : (
                          <span className="text-xs">{line.doctorName || "-"}</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  {type === "service" && (
                    <td className={`text-center ${line.requiresNurse ? "bg-purple-50 dark:bg-purple-950/40" : ""}`}>
                      {line.requiresNurse ? (
                        isDraft ? (
                          <Input
                            value={line.nurseName}
                            onChange={(e) => updateLine(line.tempId, "nurseName", e.target.value)}
                            placeholder="اسم الممرض *"
                            className={`h-7 text-xs ${!line.nurseName ? "border-purple-400 dark:border-purple-600" : ""}`}
                            data-testid={`input-nurse-${i}`}
                          />
                        ) : (
                          <span className="text-xs">{line.nurseName || "-"}</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                  )}
                  {type !== "service" && (
                    <td className="text-center">
                      {isDraft && line.itemId && line.item ? (
                        <select
                          value={line.unitLevel}
                          onChange={(e) => handleUnitLevelChange(line.tempId, e.target.value as "major" | "medium" | "minor")}
                          className="h-7 text-xs text-center bg-transparent border rounded px-1 w-full"
                          data-testid={`select-unit-${type}-${i}`}
                        >
                          {itemHasMajorUnit(line.item) && (
                            <option value="major">{line.item?.majorUnitName || "كبرى"}</option>
                          )}
                          {itemHasMediumUnit(line.item) && (
                            <option value="medium">{line.item?.mediumUnitName || "متوسطة"}</option>
                          )}
                          {(line.item?.minorUnitName || (!itemHasMajorUnit(line.item) && !itemHasMediumUnit(line.item))) && (
                            <option value="minor">{line.item?.minorUnitName || "وحدة"}</option>
                          )}
                        </select>
                      ) : (
                        <span className="text-xs">{line.item ? getUnitName(line.item, line.unitLevel) : "-"}</span>
                      )}
                    </td>
                  )}
                  <td className="text-center">
                    {isDraft ? (
                      (type === "drug" || type === "consumable") && line.lotId ? (
                        <Input
                          type="number"
                          defaultValue={line.quantity}
                          min={0}
                          step="any"
                          onChange={(e) => {
                            pendingQtyRef.current.set(line.tempId, e.target.value);
                          }}
                          onBlur={() => handleQtyConfirm(line.tempId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleQtyConfirm(line.tempId);
                            }
                          }}
                          className="h-7 text-xs text-center"
                          data-testid={`input-qty-${type}-${i}`}
                        />
                      ) : (
                        <Input
                          type="number"
                          value={line.quantity}
                          min={0}
                          step="any"
                          onChange={(e) => updateLine(line.tempId, "quantity", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs text-center"
                          data-testid={`input-qty-${type}-${i}`}
                        />
                      )
                    ) : (
                      formatNumber(line.quantity)
                    )}
                  </td>
                  <td className="text-center">
                    {isDraft ? (
                      <Input
                        type="number"
                        value={line.unitPrice}
                        min={0}
                        onChange={(e) => updateLine(line.tempId, "unitPrice", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-center"
                        data-testid={`input-price-${type}-${i}`}
                      />
                    ) : (
                      formatNumber(line.unitPrice)
                    )}
                  </td>
                  <td className="text-center">
                    {isDraft ? (
                      <Input
                        type="number"
                        value={line.discountPercent}
                        min={0}
                        max={100}
                        onChange={(e) => updateLine(line.tempId, "discountPercent", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-center"
                        data-testid={`input-disc-pct-${type}-${i}`}
                      />
                    ) : (
                      formatNumber(line.discountPercent)
                    )}
                  </td>
                  <td className="text-center">
                    {isDraft ? (
                      <Input
                        type="number"
                        value={line.discountAmount}
                        min={0}
                        onChange={(e) => updateLine(line.tempId, "discountAmount", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-center"
                        data-testid={`input-disc-amt-${type}-${i}`}
                      />
                    ) : (
                      formatNumber(line.discountAmount)
                    )}
                  </td>
                  <td className="text-center font-bold">{formatNumber(line.totalPrice)}</td>
                  {isDraft && (
                    <td className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line.tempId)}
                        data-testid={`button-remove-line-${type}-${i}`}
                      >
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {typeLines.length === 0 && (
                <tr>
                  <td colSpan={type === "service" ? (isDraft ? 10 : 9) : (isDraft ? 8 : 7)} className="text-center text-muted-foreground py-4">
                    لا توجد بنود
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderPaymentsTab() {
    return (
      <div className="space-y-3">
        {isDraft && (
          <Button variant="outline" size="sm" onClick={addPayment} data-testid="button-add-payment">
            <Plus className="h-3 w-3 ml-1" />
            اضافة دفعة
          </Button>
        )}
        <div className="overflow-x-auto border rounded-md">
          <table className="peachtree-grid w-full text-sm">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="text-center" style={{ width: 40 }}>#</th>
                <th className="text-center" style={{ width: 130 }}>التاريخ</th>
                <th className="text-center" style={{ width: 120 }}>المبلغ</th>
                <th className="text-center" style={{ width: 140 }}>طريقة الدفع</th>
                <th>المرجع</th>
                <th>ملاحظات</th>
                {isDraft && <th className="text-center" style={{ width: 50 }}></th>}
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={p.tempId} className="peachtree-grid-row" data-testid={`row-payment-${i}`}>
                  <td className="text-center">{i + 1}</td>
                  <td className="text-center">
                    {isDraft ? (
                      <Input
                        type="date"
                        value={p.paymentDate}
                        onChange={(e) => updatePayment(p.tempId, "paymentDate", e.target.value)}
                        className="h-7 text-xs"
                        data-testid={`input-pay-date-${i}`}
                      />
                    ) : (
                      formatDateShort(p.paymentDate)
                    )}
                  </td>
                  <td className="text-center">
                    {isDraft ? (
                      <Input
                        type="number"
                        value={p.amount}
                        min={0}
                        onChange={(e) => updatePayment(p.tempId, "amount", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-center"
                        data-testid={`input-pay-amount-${i}`}
                      />
                    ) : (
                      formatNumber(p.amount)
                    )}
                  </td>
                  <td className="text-center">
                    {isDraft ? (
                      <Select
                        value={p.paymentMethod}
                        onValueChange={(v) => updatePayment(p.tempId, "paymentMethod", v)}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid={`select-pay-method-${i}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(paymentMethodLabels).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      paymentMethodLabels[p.paymentMethod] || p.paymentMethod
                    )}
                  </td>
                  <td>
                    {isDraft ? (
                      <Input
                        value={p.referenceNumber}
                        onChange={(e) => updatePayment(p.tempId, "referenceNumber", e.target.value)}
                        className="h-7 text-xs"
                        data-testid={`input-pay-ref-${i}`}
                      />
                    ) : (
                      p.referenceNumber
                    )}
                  </td>
                  <td>
                    {isDraft ? (
                      <Input
                        value={p.notes}
                        onChange={(e) => updatePayment(p.tempId, "notes", e.target.value)}
                        className="h-7 text-xs"
                        data-testid={`input-pay-notes-${i}`}
                      />
                    ) : (
                      p.notes
                    )}
                  </td>
                  {isDraft && (
                    <td className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePayment(p.tempId)}
                        data-testid={`button-remove-payment-${i}`}
                      >
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={isDraft ? 7 : 6} className="text-center text-muted-foreground py-4">
                    لا توجد دفعات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderConsolidatedTab() {
    const grouped: Record<string, LineLocal[]> = {};
    lines.forEach((l) => {
      if (!grouped[l.lineType]) grouped[l.lineType] = [];
      grouped[l.lineType].push(l);
    });
    const typeOrder = ["service", "drug", "consumable", "equipment"];
    let counter = 0;

    return (
      <div className="space-y-4">
        <div className="overflow-x-auto border rounded-md">
          <table className="peachtree-grid w-full text-sm">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="text-center" style={{ width: 40 }}>#</th>
                <th>النوع</th>
                <th>الوصف</th>
                <th className="text-center" style={{ width: 80 }}>الكمية</th>
                <th className="text-center" style={{ width: 100 }}>سعر الوحدة</th>
                <th className="text-center" style={{ width: 80 }}>خصم %</th>
                <th className="text-center" style={{ width: 100 }}>قيمة الخصم</th>
                <th className="text-center" style={{ width: 110 }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {typeOrder.map((type) => {
                const group = grouped[type];
                if (!group || group.length === 0) return null;
                return group.map((line, i) => {
                  counter++;
                  return (
                    <tr
                      key={line.tempId}
                      className={`peachtree-grid-row ${line.lineType === "service" ? getServiceRowClass(line.serviceType) : ""}`}
                      data-testid={`row-consolidated-${counter}`}
                    >
                      <td className="text-center">{counter}</td>
                      <td>
                        <Badge variant="secondary" className="text-xs">
                          {lineTypeLabels[line.lineType] || line.lineType}
                        </Badge>
                      </td>
                      <td>
                        <span>{line.description}</span>
                        {(line.lineType === "drug" || line.lineType === "consumable") && line.expiryMonth && line.expiryYear && (
                          <span className="mr-2">
                            <Badge variant="secondary" className="text-[10px]">
                              {String(line.expiryMonth).padStart(2, "0")}/{line.expiryYear}
                            </Badge>
                          </span>
                        )}
                      </td>
                      <td className="text-center">{formatNumber(line.quantity)}</td>
                      <td className="text-center">{formatNumber(line.unitPrice)}</td>
                      <td className="text-center">{formatNumber(line.discountPercent)}</td>
                      <td className="text-center">{formatNumber(line.discountAmount)}</td>
                      <td className="text-center font-bold">{formatNumber(line.totalPrice)}</td>
                    </tr>
                  );
                });
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-4">
                    لا توجد بنود
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">الإجمالي</span>
                <span className="font-bold" data-testid="text-consolidated-total">{formatCurrency(totals.totalAmount)}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">الخصم</span>
                <span className="font-bold" data-testid="text-consolidated-discount">{formatCurrency(totals.discountAmount)}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">الصافي</span>
                <span className="font-bold" data-testid="text-consolidated-net">{formatCurrency(totals.netAmount)}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">المدفوع</span>
                <span className="font-bold" data-testid="text-consolidated-paid">{formatCurrency(totals.paidAmount)}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-muted-foreground">المتبقي</span>
                <span className="font-bold" data-testid="text-consolidated-remaining">{formatCurrency(totals.remaining)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {payments.length > 0 && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">سجل الدفعات</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="overflow-x-auto border rounded-md">
                <table className="peachtree-grid w-full text-sm">
                  <thead>
                    <tr className="peachtree-grid-header">
                      <th className="text-center">#</th>
                      <th className="text-center">التاريخ</th>
                      <th className="text-center">المبلغ</th>
                      <th className="text-center">طريقة الدفع</th>
                      <th>المرجع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={p.tempId} className="peachtree-grid-row">
                        <td className="text-center">{i + 1}</td>
                        <td className="text-center">{formatDateShort(p.paymentDate)}</td>
                        <td className="text-center font-bold">{formatNumber(p.amount)}</td>
                        <td className="text-center">{paymentMethodLabels[p.paymentMethod]}</td>
                        <td>{p.referenceNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="patient-invoice-page p-2 space-y-2" dir="rtl" lang="ar" data-testid="page-patient-invoice">
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="w-full justify-start" data-testid="tabs-main">
          <TabsTrigger value="invoice" data-testid="tab-invoice">
            <FileText className="h-4 w-4 ml-1" />
            فاتورة مريض
          </TabsTrigger>
          <TabsTrigger value="registry" data-testid="tab-registry">
            <Search className="h-4 w-4 ml-1" />
            سجل المرضى
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoice" className="mt-2">
          <div className="space-y-2">
            <div className="border rounded-md p-2 space-y-2">
              <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
                {invoiceId && (
                  <Badge className={getStatusBadgeClass(status)} data-testid="badge-invoice-status">
                    {patientInvoiceStatusLabels[status] || status}
                  </Badge>
                )}
                <div className="flex flex-row-reverse items-center gap-1">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">رقم:</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    disabled={!isDraft}
                    className="h-7 text-xs w-24"
                    data-testid="input-invoice-number"
                  />
                </div>
                <div className="flex flex-row-reverse items-center gap-1">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">تاريخ:</Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    disabled={!isDraft}
                    className="h-7 text-xs w-36"
                    data-testid="input-invoice-date"
                  />
                </div>
                <div className="flex flex-row-reverse items-center gap-1 relative">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">المريض:</Label>
                  <Input
                    ref={patientSearchRef}
                    value={patientName}
                    onChange={(e) => {
                      setPatientName(e.target.value);
                      setPatientSearch(e.target.value);
                      setShowPatientDropdown(true);
                    }}
                    onFocus={() => {
                      if (patientName.length >= 1) {
                        setPatientSearch(patientName);
                        setShowPatientDropdown(true);
                      }
                    }}
                    disabled={!isDraft}
                    className="h-7 text-xs w-40"
                    placeholder="ابحث عن مريض..."
                    data-testid="input-patient-name"
                  />
                  {showPatientDropdown && (patientResults.length > 0 || searchingPatients) && (
                    <div
                      ref={patientDropdownRef}
                      className="absolute top-full right-0 mt-1 w-72 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto"
                      data-testid="dropdown-patient-search"
                    >
                      {searchingPatients && (
                        <div className="flex items-center justify-center gap-2 p-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>جاري البحث...</span>
                        </div>
                      )}
                      {patientResults.map((p) => (
                        <div
                          key={p.id}
                          className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex flex-row-reverse items-center justify-between gap-2 border-b last:border-b-0"
                          onClick={() => {
                            setPatientName(p.fullName);
                            setPatientPhone(p.phone || "");
                            setShowPatientDropdown(false);
                            setPatientSearch("");
                            setPatientResults([]);
                          }}
                          data-testid={`option-patient-${p.id}`}
                        >
                          <span className="font-medium truncate">{p.fullName}</span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {p.phone || ""}{p.age ? ` | ${p.age} سنة` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-row-reverse items-center gap-1">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">هاتف:</Label>
                  <Input
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    disabled={!isDraft}
                    className="h-7 text-xs w-28"
                    data-testid="input-patient-phone"
                  />
                </div>
                <div className="flex flex-row-reverse items-center gap-1">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">القسم:</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId} disabled={!isDraft}>
                    <SelectTrigger className="h-7 text-xs w-32" data-testid="select-department">
                      <SelectValue placeholder="اختر" />
                    </SelectTrigger>
                    <SelectContent>
                      {(departments || []).map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>{dept.nameAr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-row-reverse items-center gap-1">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">المخزن:</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId} disabled={!isDraft}>
                    <SelectTrigger className="h-7 text-xs w-36" data-testid="select-warehouse">
                      <SelectValue placeholder="اختر مخزن" />
                    </SelectTrigger>
                    <SelectContent>
                      {(warehouses || []).filter((w: any) => w.isActive).map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-row-reverse items-center gap-1 relative">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">الطبيب:</Label>
                  <Input
                    ref={doctorSearchRef}
                    value={doctorName}
                    onChange={(e) => {
                      setDoctorName(e.target.value);
                      setDoctorSearch(e.target.value);
                      setShowDoctorDropdown(true);
                    }}
                    onFocus={() => {
                      if (doctorName.length >= 1) {
                        setDoctorSearch(doctorName);
                        setShowDoctorDropdown(true);
                      }
                    }}
                    disabled={!isDraft}
                    className="h-7 text-xs w-32"
                    placeholder="ابحث عن طبيب..."
                    data-testid="input-doctor-name"
                  />
                  {showDoctorDropdown && (doctorResults.length > 0 || searchingDoctors) && (
                    <div
                      ref={doctorDropdownRef}
                      className="absolute top-full right-0 mt-1 w-60 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto"
                      data-testid="dropdown-doctor-search"
                    >
                      {searchingDoctors && (
                        <div className="flex items-center justify-center gap-2 p-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>جاري البحث...</span>
                        </div>
                      )}
                      {doctorResults.map((d) => (
                        <div
                          key={d.id}
                          className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex flex-row-reverse items-center justify-between gap-2 border-b last:border-b-0"
                          onClick={() => {
                            setDoctorName(d.name);
                            setShowDoctorDropdown(false);
                            setDoctorSearch("");
                            setDoctorResults([]);
                          }}
                          data-testid={`option-doctor-${d.id}`}
                        >
                          <span className="font-medium truncate">{d.name}</span>
                          {d.specialty && <span className="text-muted-foreground whitespace-nowrap">{d.specialty}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-row-reverse items-center gap-1">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">النوع:</Label>
                  <label className="flex flex-row-reverse items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="patientType"
                      value="cash"
                      checked={patientType === "cash"}
                      onChange={() => setPatientType("cash")}
                      disabled={!isDraft}
                      data-testid="radio-patient-type-cash"
                    />
                    {patientTypeLabels.cash}
                  </label>
                  <label className="flex flex-row-reverse items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="patientType"
                      value="contract"
                      checked={patientType === "contract"}
                      onChange={() => setPatientType("contract")}
                      disabled={!isDraft}
                      data-testid="radio-patient-type-contract"
                    />
                    {patientTypeLabels.contract}
                  </label>
                </div>
                {patientType === "contract" && (
                  <div className="flex flex-row-reverse items-center gap-1">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">جهة:</Label>
                    <Input
                      value={contractName}
                      onChange={(e) => setContractName(e.target.value)}
                      disabled={!isDraft}
                      className="h-7 text-xs w-32"
                      data-testid="input-contract-name"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">ملاحظات:</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!isDraft}
                  className="h-7 text-xs flex-1"
                  placeholder="ملاحظات..."
                  data-testid="input-notes"
                />
              </div>
            </div>

            <div className="border rounded-md p-2">
              <Tabs value={subTab} onValueChange={setSubTab}>
                <TabsList className="w-full justify-start flex-wrap" data-testid="tabs-sub">
                  <TabsTrigger value="services" data-testid="tab-services">خدمات</TabsTrigger>
                  <TabsTrigger value="drugs" data-testid="tab-drugs">أدوية</TabsTrigger>
                  <TabsTrigger value="consumables" data-testid="tab-consumables">مستهلكات</TabsTrigger>
                  <TabsTrigger value="equipment" data-testid="tab-equipment">أجهزة</TabsTrigger>
                  <TabsTrigger value="payments" data-testid="tab-payments">سداد دفعات</TabsTrigger>
                  <TabsTrigger value="consolidated" data-testid="tab-consolidated">فاتورة مجمعة</TabsTrigger>
                </TabsList>

                <TabsContent value="services" className="mt-2">{renderLineGrid("service")}</TabsContent>
                <TabsContent value="drugs" className="mt-2">{renderLineGrid("drug")}</TabsContent>
                <TabsContent value="consumables" className="mt-2">{renderLineGrid("consumable")}</TabsContent>
                <TabsContent value="equipment" className="mt-2">{renderLineGrid("equipment")}</TabsContent>
                <TabsContent value="payments" className="mt-2">{renderPaymentsTab()}</TabsContent>
                <TabsContent value="consolidated" className="mt-2">{renderConsolidatedTab()}</TabsContent>
              </Tabs>
            </div>

            <div className="border rounded-md p-2">
              <div className="flex flex-row-reverse flex-wrap items-center justify-between gap-3">
                <div className="flex flex-row-reverse flex-wrap items-center gap-3 text-sm">
                  <div className="flex flex-row-reverse items-center gap-1">
                    <span className="text-muted-foreground text-xs">الإجمالي:</span>
                    <span className="font-bold text-xs" data-testid="text-footer-total">{formatCurrency(totals.totalAmount)}</span>
                  </div>
                  <div className="flex flex-row-reverse items-center gap-1">
                    <span className="text-muted-foreground text-xs">الخصم:</span>
                    <span className="font-bold text-xs" data-testid="text-footer-discount">{formatCurrency(totals.discountAmount)}</span>
                  </div>
                  <div className="flex flex-row-reverse items-center gap-1">
                    <span className="text-muted-foreground text-xs">الصافي:</span>
                    <span className="font-bold text-xs" data-testid="text-footer-net">{formatCurrency(totals.netAmount)}</span>
                  </div>
                  <div className="flex flex-row-reverse items-center gap-1">
                    <span className="text-muted-foreground text-xs">المدفوع:</span>
                    <span className="font-bold text-xs" data-testid="text-footer-paid">{formatCurrency(totals.paidAmount)}</span>
                  </div>
                  <div className="flex flex-row-reverse items-center gap-1">
                    <span className="text-muted-foreground text-xs">المتبقي:</span>
                    <span className={`font-bold text-xs ${totals.remaining > 0 ? "text-destructive" : ""}`} data-testid="text-footer-remaining">
                      {formatCurrency(totals.remaining)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetForm}
                    data-testid="button-new"
                  >
                    <Plus className="h-3 w-3 ml-1" />
                    جديد
                  </Button>
                  {isDraft && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending || !patientName || !invoiceNumber}
                        data-testid="button-save"
                      >
                        {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
                        حفظ
                      </Button>
                      {invoiceId && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => finalizeMutation.mutate()}
                          disabled={finalizeMutation.isPending}
                          className="bg-green-600 text-white border-green-700"
                          data-testid="button-finalize"
                        >
                          {finalizeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <CheckCircle className="h-3 w-3 ml-1" />}
                          اعتماد
                        </Button>
                      )}
                      {invoiceId && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirmDeleteId(invoiceId)}
                          disabled={deleteMutation.isPending}
                          data-testid="button-delete"
                        >
                          <Trash2 className="h-3 w-3 ml-1" />
                          حذف
                        </Button>
                      )}
                      {lines.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={openDistributeDialog}
                          data-testid="button-distribute"
                          className="border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                        >
                          <Users className="h-3 w-3 ml-1" />
                          توزيع على حالات
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="registry" className="mt-2">
          <div className="border rounded-md p-2 space-y-2">
            <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">من:</Label>
                <Input
                  type="date"
                  value={regDateFrom}
                  onChange={(e) => { setRegDateFrom(e.target.value); setRegPage(1); }}
                  className="h-7 text-xs w-36"
                  data-testid="input-reg-date-from"
                />
              </div>
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">إلى:</Label>
                <Input
                  type="date"
                  value={regDateTo}
                  onChange={(e) => { setRegDateTo(e.target.value); setRegPage(1); }}
                  className="h-7 text-xs w-36"
                  data-testid="input-reg-date-to"
                />
              </div>
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">المريض:</Label>
                <Input
                  value={regPatientName}
                  onChange={(e) => { setRegPatientName(e.target.value); setRegPage(1); }}
                  placeholder="بحث..."
                  className="h-7 text-xs w-36"
                  data-testid="input-reg-patient-name"
                />
              </div>
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">الطبيب:</Label>
                <Input
                  value={regDoctorName}
                  onChange={(e) => { setRegDoctorName(e.target.value); setRegPage(1); }}
                  placeholder="بحث..."
                  className="h-7 text-xs w-32"
                  data-testid="input-reg-doctor-name"
                />
              </div>
              <div className="flex flex-row-reverse items-center gap-1">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">الحالة:</Label>
                <Select value={regStatus} onValueChange={(v) => { setRegStatus(v); setRegPage(1); }}>
                  <SelectTrigger className="h-7 text-xs w-24" data-testid="select-reg-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="draft">مسودة</SelectItem>
                    <SelectItem value="finalized">نهائي</SelectItem>
                    <SelectItem value="cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {regLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <table className="peachtree-grid w-full text-sm">
                  <thead>
                    <tr className="peachtree-grid-header">
                      <th className="text-center" style={{ width: 40 }}>#</th>
                      <th className="text-center">رقم الفاتورة</th>
                      <th className="text-center">التاريخ</th>
                      <th>اسم المريض</th>
                      <th className="text-center">القسم</th>
                      <th>الطبيب</th>
                      <th className="text-center">الإجمالي</th>
                      <th className="text-center">الحالة</th>
                      <th className="text-center" style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(registryData?.data || []).map((inv: any, i: number) => (
                      <tr
                        key={inv.id}
                        className="peachtree-grid-row cursor-pointer"
                        onClick={() => loadInvoice(inv.id)}
                        data-testid={`row-registry-${inv.id}`}
                      >
                        <td className="text-center">{(regPage - 1) * regPageSize + i + 1}</td>
                        <td className="text-center font-mono">{inv.invoiceNumber}</td>
                        <td className="text-center">{formatDateShort(inv.invoiceDate)}</td>
                        <td>{inv.patientName}</td>
                        <td className="text-center">{inv.department?.nameAr || ""}</td>
                        <td>{inv.doctorName || ""}</td>
                        <td className="text-center">{formatNumber(inv.netAmount)}</td>
                        <td className="text-center">
                          <Badge
                            className={getStatusBadgeClass(inv.status)}
                            data-testid={`badge-reg-status-${inv.id}`}
                          >
                            {patientInvoiceStatusLabels[inv.status] || inv.status}
                          </Badge>
                        </td>
                        <td className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadInvoice(inv.id);
                            }}
                            data-testid={`button-view-reg-${inv.id}`}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(registryData?.data || []).length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center text-muted-foreground py-4">
                          لا توجد فواتير
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {regTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={regPage <= 1}
                  onClick={() => setRegPage((p) => p - 1)}
                  data-testid="button-reg-prev-page"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  صفحة {regPage} من {regTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={regPage >= regTotalPages}
                  onClick={() => setRegPage((p) => p + 1)}
                  data-testid="button-reg-next-page"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} data-testid="button-cancel-delete">
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDeleteId) {
                  deleteMutation.mutate(confirmDeleteId, { onSettled: () => setConfirmDeleteId(null) });
                }
              }}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              تأكيد الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={distOpen} onOpenChange={(open) => { if (!open) setDistOpen(false); }}>
        <DialogContent className="max-w-2xl" dir="rtl" data-testid="dialog-distribute">
          <DialogHeader>
            <DialogTitle className="text-right flex flex-row-reverse items-center gap-2">
              <Users className="h-4 w-4" />
              <span>توزيع على حالات عمليات</span>
            </DialogTitle>
            <DialogDescription className="text-right">
              سيتم تقسيم الأدوية والمستهلكات بالتساوي على المرضى المحددين وحذف الفاتورة الأصلية
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-row-reverse items-center gap-3">
              <Label className="text-sm whitespace-nowrap">عدد الحالات:</Label>
              <Input
                type="number"
                min={2}
                max={50}
                value={distCount}
                onChange={(e) => handleDistCountChange(parseInt(e.target.value) || 2)}
                className="w-24 text-center"
                data-testid="input-dist-count"
              />
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground w-12">#</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم المريض</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground w-40">رقم التليفون</th>
                  </tr>
                </thead>
                <tbody>
                  {distPatients.slice(0, distCount).map((p, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-1.5 px-3 text-muted-foreground text-center">{idx + 1}</td>
                      <td className="py-1.5 px-3 relative">
                        <Input
                          value={p.name}
                          onChange={(e) => {
                            const updated = [...distPatients];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setDistPatients(updated);
                            setDistSearchIdx(idx);
                            setDistSearchText(e.target.value);
                          }}
                          onFocus={() => {
                            if (p.name.length >= 1) {
                              setDistSearchIdx(idx);
                              setDistSearchText(p.name);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              if (distSearchIdx === idx) {
                                setDistSearchIdx(null);
                                setDistSearchResults([]);
                              }
                            }, 200);
                          }}
                          placeholder={`ابحث عن مريض ${idx + 1}...`}
                          className="h-8 text-sm"
                          data-testid={`input-dist-name-${idx}`}
                        />
                        {distSearchIdx === idx && (distSearchResults.length > 0 || distSearching) && (
                          <div className="absolute top-full right-0 left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-40 overflow-y-auto" data-testid={`dropdown-dist-patient-${idx}`}>
                            {distSearching && (
                              <div className="flex items-center justify-center gap-2 p-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>جاري البحث...</span>
                              </div>
                            )}
                            {distSearchResults.map((pt) => (
                              <div
                                key={pt.id}
                                className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex flex-row-reverse items-center justify-between gap-2 border-b last:border-b-0"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const updated = [...distPatients];
                                  updated[idx] = { name: pt.fullName, phone: pt.phone || "" };
                                  setDistPatients(updated);
                                  setDistSearchIdx(null);
                                  setDistSearchResults([]);
                                  setDistSearchText("");
                                }}
                                data-testid={`option-dist-patient-${idx}-${pt.id}`}
                              >
                                <span className="font-medium truncate">{pt.fullName}</span>
                                <span className="text-muted-foreground whitespace-nowrap">
                                  {pt.phone || ""}{pt.age ? ` | ${pt.age} سنة` : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-3">
                        <Input
                          value={p.phone}
                          onChange={(e) => {
                            const updated = [...distPatients];
                            updated[idx] = { ...updated[idx], phone: e.target.value };
                            setDistPatients(updated);
                          }}
                          placeholder="اختياري"
                          className="h-8 text-sm"
                          data-testid={`input-dist-phone-${idx}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border rounded-md p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground mb-2 text-right">معاينة التوزيع:</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {lines.filter(l => l.lineType === "drug" || l.lineType === "consumable").map((l) => {
                  const origQty = l.quantity;
                  const origLevel = l.unitLevel || "minor";
                  const item = l.item;
                  let convQty = origQty;
                  let convLevel = origLevel;

                  if (item && origLevel !== "minor") {
                    const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
                    const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
                    let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
                    if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
                      majorToMinor = majorToMedium * mediumToMinor;
                    }
                    if (origLevel === "major") {
                      if (item.minorUnitName && majorToMinor > 1) { convQty = origQty * majorToMinor; convLevel = "minor"; }
                      else if (item.mediumUnitName && majorToMedium > 1) { convQty = origQty * majorToMedium; convLevel = "medium"; }
                    } else if (origLevel === "medium") {
                      if (item.minorUnitName && mediumToMinor > 1) { convQty = origQty * mediumToMinor; convLevel = "minor"; }
                    }
                  }

                  const convQtyRounded = +convQty.toFixed(4);
                  const intQty = Math.round(convQtyRounded);
                  const isInt = Math.abs(convQtyRounded - intQty) < 0.0001 && intQty > 0;
                  let baseShare: number;
                  let remainder = 0;
                  if (isInt) {
                    baseShare = Math.floor(intQty / distCount);
                    remainder = intQty - baseShare * distCount;
                  } else {
                    baseShare = +(Math.round((convQtyRounded / distCount) * 10000) / 10000);
                  }
                  const convUnitName = convLevel === "major" ? (item?.majorUnitName || "وحدة")
                    : convLevel === "medium" ? (item?.mediumUnitName || "وحدة")
                    : (item?.minorUnitName || item?.mediumUnitName || "وحدة");
                  const origUnitName = origLevel === "major" ? (item?.majorUnitName || "وحدة")
                    : origLevel === "medium" ? (item?.mediumUnitName || "وحدة")
                    : (item?.minorUnitName || item?.mediumUnitName || "وحدة");
                  const showConversion = convLevel !== origLevel;
                  const displayConvQty = isInt ? intQty : convQtyRounded;
                  return (
                    <div key={l.tempId} className="flex flex-row-reverse items-center justify-between text-xs gap-2">
                      <span className="truncate flex-1 text-right">{l.description}</span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {showConversion ? `${origQty} ${origUnitName} → ${displayConvQty} ${convUnitName}` : `${origQty} ${origUnitName}`}
                        {" = "}{baseShare}{remainder > 0 ? `~${baseShare + 1}` : ""} {convUnitName} لكل حالة
                      </span>
                    </div>
                  );
                })}
                {lines.filter(l => l.lineType === "service").length > 0 && (
                  <div className="text-xs text-muted-foreground text-right mt-1 border-t pt-1">
                    الخدمات ({lines.filter(l => l.lineType === "service").length}) ستوزع أيضاً
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDistOpen(false)} data-testid="button-dist-cancel">
              إلغاء
            </Button>
            <Button
              onClick={handleDistribute}
              disabled={distLoading}
              data-testid="button-dist-confirm"
            >
              {distLoading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Users className="h-4 w-4 ml-1" />}
              تنفيذ التوزيع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statsItemId} onOpenChange={(open) => { if (!open) { setStatsItemId(null); setStatsData(null); } }}>
        <DialogContent className="max-w-lg" dir="rtl" data-testid="dialog-stock-stats">
          <DialogHeader>
            <DialogTitle className="text-right flex flex-row-reverse items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span>أرصدة المخازن - {statsItemName}</span>
            </DialogTitle>
            <DialogDescription className="text-right">كميات الصنف وتواريخ الصلاحية في جميع المخازن</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {statsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : statsData && statsData.length > 0 ? (
              <div className="space-y-3">
                {statsData.map((wh: any) => (
                  <div key={wh.warehouseId} className="border rounded-md p-3">
                    <div className="flex flex-row-reverse items-center justify-between gap-2 mb-2">
                      <span className="font-semibold text-sm">{wh.warehouseName}</span>
                      <Badge variant="secondary" data-testid={`text-wh-total-${wh.warehouseId}`}>
                        {formatNumber(parseFloat(wh.qtyMinor))}
                      </Badge>
                    </div>
                    {wh.expiryBreakdown && wh.expiryBreakdown.length > 0 ? (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-right py-1 font-medium text-muted-foreground">الصلاحية</th>
                            <th className="text-center py-1 font-medium text-muted-foreground">الكمية</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wh.expiryBreakdown.map((eb: any, idx: number) => (
                            <tr key={idx} className="border-b last:border-b-0">
                              <td className="text-right py-1">
                                {eb.expiryMonth && eb.expiryYear
                                  ? `${String(eb.expiryMonth).padStart(2, "0")}/${eb.expiryYear}`
                                  : "بدون صلاحية"}
                              </td>
                              <td className="text-center py-1">{formatNumber(parseFloat(eb.qty))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <span className="text-xs text-muted-foreground">لا توجد تفاصيل صلاحية</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">لا توجد أرصدة لهذا الصنف</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
