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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Save, CheckCircle, Trash2, Plus, Search, ChevronLeft, ChevronRight, Loader2, Eye, X, FileText, BarChart3, Users, BedDouble, Layers, LogOut, Printer, Stethoscope, ArrowLeftRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber, formatCurrency, formatDateShort } from "@/lib/formatters";
import type { PatientInvoiceHeader, PatientInvoiceLine, PatientInvoicePayment, Department, Service, Item, Warehouse, Patient, Doctor, Admission, DoctorTransfer } from "@shared/schema";
import { patientInvoiceStatusLabels, patientTypeLabels, lineTypeLabels, paymentMethodLabels } from "@shared/schema";

import { useDebounce } from "./utils/debounce";
import { genId } from "./utils/id";
import {
  getEffectiveMajorToMinor,
  getEffectiveMediumToMinor,
  getSmallestUnitLevel,
  calculateQtyInSmallest,
  calculateQtyInMinor,
  computeUnitPriceFromBase,
  convertSmallestToDisplayQty,
  convertMinorToDisplayQty,
  itemHasMajorUnit,
  itemHasMediumUnit,
  getUnitName,
} from "./utils/units";
import type { LineLocal, PaymentLocal } from "./types";
import { InvoiceTab } from "./tabs/InvoiceTab";
import { RegistryTab } from "./tabs/RegistryTab";
import { AdmissionsTab } from "./tabs/AdmissionsTab";
import { SurgeryTypeBar } from "./components/SurgeryTypeBar";
import { DistributeDialog } from "./components/DistributeDialog";
import { useInvoiceBootstrap } from "./hooks/useInvoiceBootstrap";
import { useAdmissions } from "./hooks/useAdmissions";
import { useAdmissionsMutations } from "./hooks/useAdmissionsMutations";
import { useRegistry } from "./hooks/useRegistry";
import { useInvoiceMutations } from "./hooks/useInvoiceMutations";

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
  const [admissionId, setAdmissionId] = useState("");

  const [warehouseId, setWarehouseId] = useState("");
  const [fefoLoading, setFefoLoading] = useState(false);

  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [statsItemName, setStatsItemName] = useState("");
  const [statsData, setStatsData] = useState<any[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [distOpen, setDistOpen] = useState(false);

  const [lines, setLines] = useState<LineLocal[]>([]);
  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  const pendingQtyRef = useRef<Map<string, string>>(new Map());
  const [payments, setPayments] = useState<PaymentLocal[]>([]);
  const paymentRefOffsetRef = useRef(0);

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
  const debouncedItemSearch = useDebounce(itemSearch, 300);
  const itemSearchRef = useRef<HTMLInputElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);
  const serviceSearchRef = useRef<HTMLInputElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const addingItemRef = useRef<Set<string>>(new Set());

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [dtOpen, setDtOpen] = useState(false);
  const [dtDoctorName, setDtDoctorName] = useState("");
  const [dtAmount, setDtAmount] = useState("");
  const [dtNotes, setDtNotes] = useState("");
  const [dtConfirmOpen, setDtConfirmOpen] = useState(false);
  const [dtClientRequestId, setDtClientRequestId] = useState("");


  const { nextNumber, departments, warehouses, activeAdmissions } = useInvoiceBootstrap();

  const {
    admSelectedAdmission, setAdmSelectedAdmission,
    admIsCreateOpen, setAdmIsCreateOpen,
    admSearchQuery, setAdmSearchQuery,
    admStatusFilter, setAdmStatusFilter,
    admDeptFilter, setAdmDeptFilter,
    admDateFrom, setAdmDateFrom,
    admDateTo, setAdmDateTo,
    admPatientSearch, setAdmPatientSearch,
    admPatientResults, admSearchingPatients,
    admShowPatientDropdown, setAdmShowPatientDropdown,
    admPatientSearchRef, admPatientDropdownRef,
    admFormData, setAdmFormData,
    admPrintDeptId, setAdmPrintDeptId, admPrintRef,
    admAllAdmissions, admListLoading,
    admDetail, admInvoices, admInvoicesLoading,
    admReportData, admReportLoading,
    admInvoicesByDepartment, admFilteredPrintInvoices, admTotalAllInvoices,
    admStatusLabels, admGetStatusBadgeClass,
    admHandleCloseCreate, admHandleSelectPatient,
  } = useAdmissions(mainTab);

  const { admCreateMutation, admDischargeMutation, admConsolidateMutation } = useAdmissionsMutations({
    onCreateSuccess: admHandleCloseCreate,
    admSelectedAdmission,
    setAdmSelectedAdmission,
  });

  const {
    regPage, setRegPage, regDateFrom, setRegDateFrom,
    regDateTo, setRegDateTo, regPatientName, setRegPatientName,
    regDoctorName, setRegDoctorName, regStatus, setRegStatus,
    regPageSize, regTotalPages, regLoading, registryData,
  } = useRegistry(mainTab);

  const isDraft = status === "draft";

  const admHandleCreateSubmit = () => {
    if (!admFormData.patientName.trim()) { toast({ title: "خطأ", description: "اسم المريض مطلوب", variant: "destructive" }); return; }
    if (!admFormData.admissionNumber.trim()) { toast({ title: "خطأ", description: "رقم الإقامة مطلوب", variant: "destructive" }); return; }
    if (!admFormData.admissionDate) { toast({ title: "خطأ", description: "تاريخ الإقامة مطلوب", variant: "destructive" }); return; }
    const body: any = {
      patientName: admFormData.patientName.trim(),
      patientPhone: admFormData.patientPhone || null,
      admissionDate: admFormData.admissionDate,
      admissionNumber: admFormData.admissionNumber.trim(),
      doctorName: admFormData.doctorName.trim() || null,
      notes: admFormData.notes.trim() || null,
    };
    if (admFormData.patientId) body.patientId = admFormData.patientId;
    admCreateMutation.mutate(body);
  };

  useEffect(() => {
    if (nextNumber && !invoiceId && !invoiceNumber) {
      setInvoiceNumber(nextNumber);
    }
  }, [nextNumber, invoiceId, invoiceNumber]);

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
    const svcQp = new URLSearchParams();
    svcQp.set("search", debouncedServiceSearch);
    svcQp.set("page", "1");
    svcQp.set("pageSize", "15");
    if (departmentId) svcQp.set("departmentId", departmentId);
    fetch(`/api/services?${svcQp.toString()}`, {
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
  }, [debouncedServiceSearch, departmentId]);

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

  const { data: dtTransfers = [], refetch: refetchTransfers } = useQuery<DoctorTransfer[]>({
    queryKey: ["/api/patient-invoices", invoiceId, "transfers"],
    enabled: !!invoiceId && status === "finalized",
    queryFn: () => fetch(`/api/patient-invoices/${invoiceId}/transfers`, { credentials: "include" }).then(r => r.json()),
  });

  const dtAlreadyTransferred = dtTransfers.reduce((s, t) => s + parseFloat(t.amount), 0);
  const dtRemaining = Math.max(0, totals.netAmount - dtAlreadyTransferred);

  const dtMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/patient-invoices/${invoiceId}/transfer-to-doctor`, {
        doctorName: dtDoctorName.trim(),
        amount: parseFloat(dtAmount),
        clientRequestId: dtClientRequestId,
        notes: dtNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "تم التحويل", description: "تم تحويل المستحقات للطبيب بنجاح" });
      setDtConfirmOpen(false);
      setDtOpen(false);
      setDtDoctorName("");
      setDtAmount("");
      setDtNotes("");
      setDtClientRequestId("");
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices", invoiceId, "transfers"] });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "خطأ في التحويل", description: error.message });
    },
  });

  function openDtConfirm() {
    if (!dtDoctorName.trim()) { toast({ variant: "destructive", title: "اسم الطبيب مطلوب" }); return; }
    const amt = parseFloat(dtAmount);
    if (!dtAmount || isNaN(amt) || amt <= 0) { toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" }); return; }
    if (amt > dtRemaining + 0.001) { toast({ variant: "destructive", title: `المبلغ يتجاوز المتبقي (${dtRemaining.toFixed(2)})` }); return; }
    const newId = genId();
    setDtClientRequestId(newId);
    setDtConfirmOpen(true);
  }

  const resetForm = useCallback(() => {
    setInvoiceId(null);
    setInvoiceNumber(nextNumber || "");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setPatientName("");
    setPatientPhone("");
    setDepartmentId("");
    setWarehouseId("");
    setDoctorName("");
    setPatientType("cash");
    setContractName("");
    setNotes("");
    setAdmissionId("");
    setStatus("draft");
    setLines([]);
    setPayments([]);
    paymentRefOffsetRef.current = 0;
    setSubTab("services");
  }, [nextNumber]);

  const { saveMutation, finalizeMutation, deleteMutation } = useInvoiceMutations({
    invoiceId,
    invoiceNumber,
    invoiceDate,
    patientName,
    patientPhone,
    patientType,
    departmentId,
    warehouseId,
    doctorName,
    contractName,
    notes,
    admissionId,
    totals,
    lines,
    payments,
    setInvoiceId,
    setStatus,
    resetForm,
  });

  const openDistributeDialog = useCallback(() => {
    if (lines.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد بنود للتوزيع", variant: "destructive" });
      return;
    }
    setDistOpen(true);
  }, [lines, toast]);

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
      setAdmissionId(data.admissionId || "");
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
        sourceType: l.sourceType || null,
        sourceId: l.sourceId || null,
      }));
      setLines(loadedLines);

      const loadedPayments: PaymentLocal[] = (data.payments || []).map((p: any) => ({
        tempId: genId(),
        paymentDate: p.paymentDate,
        amount: parseFloat(p.amount) || 0,
        paymentMethod: p.paymentMethod || "cash",
        referenceNumber: p.referenceNumber || "",
        notes: p.notes || "",
        treasuryId: p.treasuryId || null,
      }));
      setPayments(loadedPayments);
      paymentRefOffsetRef.current = 0;

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
      sourceType: null,
      sourceId: null,
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
      sourceType: null,
      sourceId: null,
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
                  sourceType: null,
                  sourceId: null,
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

  const addPayment = useCallback(async () => {
    const offset = paymentRefOffsetRef.current;
    paymentRefOffsetRef.current += 1;
    let ref = "";
    try {
      const res = await apiRequest("GET", `/api/patient-invoice-payments/next-ref?offset=${offset}`);
      const data = await res.json();
      ref = data.ref ?? "";
    } catch { /* fallback: empty ref */ }
    setPayments((prev) => [
      ...prev,
      {
        tempId: genId(),
        paymentDate: new Date().toISOString().split("T")[0],
        amount: 0,
        paymentMethod: "cash",
        referenceNumber: ref,
        notes: "",
        treasuryId: null,
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
                sourceType: null,
                sourceId: null,
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
            sourceType: null,
            sourceId: null,
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
          <TabsTrigger value="admission" data-testid="tab-admission">
            <BedDouble className="h-4 w-4 ml-1" />
            إقامة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoice" className="mt-2">
          {invoiceId && admissionId && (
            <SurgeryTypeBar
              invoiceId={invoiceId}
              admissionId={admissionId}
              isDraft={isDraft}
              onInvoiceReload={() => loadInvoice(invoiceId)}
            />
          )}
          <InvoiceTab
            invoiceId={invoiceId}
            invoiceNumber={invoiceNumber}
            setInvoiceNumber={setInvoiceNumber}
            invoiceDate={invoiceDate}
            setInvoiceDate={setInvoiceDate}
            status={status}
            isDraft={isDraft}
            patientName={patientName}
            setPatientName={setPatientName}
            patientPhone={patientPhone}
            setPatientPhone={setPatientPhone}
            patientSearch={patientSearch}
            setPatientSearch={setPatientSearch}
            patientResults={patientResults}
            searchingPatients={searchingPatients}
            showPatientDropdown={showPatientDropdown}
            setShowPatientDropdown={setShowPatientDropdown}
            patientSearchRef={patientSearchRef}
            patientDropdownRef={patientDropdownRef}
            doctorName={doctorName}
            setDoctorName={setDoctorName}
            doctorSearch={doctorSearch}
            setDoctorSearch={setDoctorSearch}
            doctorResults={doctorResults}
            searchingDoctors={searchingDoctors}
            showDoctorDropdown={showDoctorDropdown}
            setShowDoctorDropdown={setShowDoctorDropdown}
            doctorSearchRef={doctorSearchRef}
            doctorDropdownRef={doctorDropdownRef}
            departmentId={departmentId}
            setDepartmentId={setDepartmentId}
            departments={departments}
            warehouseId={warehouseId}
            setWarehouseId={setWarehouseId}
            warehouses={warehouses}
            admissionId={admissionId}
            setAdmissionId={setAdmissionId}
            activeAdmissions={activeAdmissions}
            patientType={patientType}
            setPatientType={setPatientType}
            contractName={contractName}
            setContractName={setContractName}
            notes={notes}
            setNotes={setNotes}
            subTab={subTab}
            setSubTab={setSubTab}
            lines={lines}
            filteredLines={filteredLines}
            itemSearch={itemSearch}
            setItemSearch={setItemSearch}
            setItemResults={setItemResults}
            itemResults={itemResults}
            searchingItems={searchingItems}
            fefoLoading={fefoLoading}
            serviceSearch={serviceSearch}
            setServiceSearch={setServiceSearch}
            setServiceResults={setServiceResults}
            serviceResults={serviceResults}
            searchingServices={searchingServices}
            itemSearchRef={itemSearchRef}
            itemDropdownRef={itemDropdownRef}
            serviceSearchRef={serviceSearchRef}
            serviceDropdownRef={serviceDropdownRef}
            pendingQtyRef={pendingQtyRef}
            addServiceLine={addServiceLine}
            addItemLine={addItemLine}
            updateLine={updateLine}
            removeLine={removeLine}
            handleQtyConfirm={handleQtyConfirm}
            handleUnitLevelChange={handleUnitLevelChange}
            openStatsPopup={openStatsPopup}
            payments={payments}
            addPayment={addPayment}
            updatePayment={updatePayment}
            removePayment={removePayment}
            totals={totals}
            resetForm={resetForm}
            saveMutation={saveMutation}
            finalizeMutation={finalizeMutation}
            deleteMutation={deleteMutation}
            setConfirmDeleteId={setConfirmDeleteId}
            openDistributeDialog={openDistributeDialog}
            dtTransfers={dtTransfers}
            dtAlreadyTransferred={dtAlreadyTransferred}
            dtRemaining={dtRemaining}
            dtOpen={dtOpen}
            setDtOpen={setDtOpen}
            dtAmount={dtAmount}
            setDtAmount={setDtAmount}
            dtDoctorName={dtDoctorName}
            setDtDoctorName={setDtDoctorName}
            dtNotes={dtNotes}
            setDtNotes={setDtNotes}
            openDtConfirm={openDtConfirm}
            getStatusBadgeClass={getStatusBadgeClass}
            getServiceRowClass={getServiceRowClass}
          />
        </TabsContent>

        <TabsContent value="registry" className="mt-2">
          <RegistryTab
            regDateFrom={regDateFrom}
            setRegDateFrom={setRegDateFrom}
            regDateTo={regDateTo}
            setRegDateTo={setRegDateTo}
            regPatientName={regPatientName}
            setRegPatientName={setRegPatientName}
            regDoctorName={regDoctorName}
            setRegDoctorName={setRegDoctorName}
            regStatus={regStatus}
            setRegStatus={setRegStatus}
            regPage={regPage}
            setRegPage={setRegPage}
            regTotalPages={regTotalPages}
            regLoading={regLoading}
            registryData={registryData}
            regPageSize={regPageSize}
            loadInvoice={loadInvoice}
            getStatusBadgeClass={getStatusBadgeClass}
          />
        </TabsContent>

        <TabsContent value="admission" className="mt-2">
          <AdmissionsTab
            admSelectedAdmission={admSelectedAdmission}
            setAdmSelectedAdmission={setAdmSelectedAdmission}
            admDetail={admDetail}
            admDischargeMutation={admDischargeMutation}
            admConsolidateMutation={admConsolidateMutation}
            admInvoicesLoading={admInvoicesLoading}
            admInvoices={admInvoices}
            admPrintDeptId={admPrintDeptId}
            setAdmPrintDeptId={setAdmPrintDeptId}
            departments={departments}
            admReportLoading={admReportLoading}
            admReportData={admReportData}
            admInvoicesByDepartment={admInvoicesByDepartment}
            admTotalAllInvoices={admTotalAllInvoices}
            admFilteredPrintInvoices={admFilteredPrintInvoices}
            admPrintRef={admPrintRef}
            admAllAdmissions={admAllAdmissions}
            admListLoading={admListLoading}
            admSearchQuery={admSearchQuery}
            setAdmSearchQuery={setAdmSearchQuery}
            admStatusFilter={admStatusFilter}
            setAdmStatusFilter={setAdmStatusFilter}
            admDeptFilter={admDeptFilter}
            setAdmDeptFilter={setAdmDeptFilter}
            admDateFrom={admDateFrom}
            setAdmDateFrom={setAdmDateFrom}
            admDateTo={admDateTo}
            setAdmDateTo={setAdmDateTo}
            admIsCreateOpen={admIsCreateOpen}
            setAdmIsCreateOpen={setAdmIsCreateOpen}
            admFormData={admFormData}
            setAdmFormData={setAdmFormData}
            admPatientSearch={admPatientSearch}
            setAdmPatientSearch={setAdmPatientSearch}
            admPatientResults={admPatientResults}
            admSearchingPatients={admSearchingPatients}
            admShowPatientDropdown={admShowPatientDropdown}
            setAdmShowPatientDropdown={setAdmShowPatientDropdown}
            admPatientSearchRef={admPatientSearchRef}
            admPatientDropdownRef={admPatientDropdownRef}
            admHandleSelectPatient={admHandleSelectPatient}
            admHandleCloseCreate={admHandleCloseCreate}
            admHandleCreateSubmit={admHandleCreateSubmit}
            admCreateMutation={admCreateMutation}
            admGetStatusBadgeClass={admGetStatusBadgeClass}
            admStatusLabels={admStatusLabels}
          />
        </TabsContent>
      </Tabs>

      <Sheet open={dtConfirmOpen} onOpenChange={setDtConfirmOpen}>
        <SheetContent side="bottom" dir="rtl" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle className="flex flex-row-reverse items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-blue-600" />
              تأكيد تحويل مستحقات الطبيب
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-3 text-right">
            <div className="flex flex-row-reverse gap-2 text-sm">
              <span className="text-muted-foreground">الطبيب:</span>
              <strong>{dtDoctorName}</strong>
            </div>
            <div className="flex flex-row-reverse gap-2 text-sm">
              <span className="text-muted-foreground">المبلغ:</span>
              <strong className="text-blue-700 text-base">{formatCurrency(parseFloat(dtAmount || "0"))}</strong>
            </div>
            {dtNotes && (
              <div className="flex flex-row-reverse gap-2 text-sm">
                <span className="text-muted-foreground">ملاحظات:</span>
                <span>{dtNotes}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground border rounded p-2 bg-muted">
              سيتم تسجيل هذا التحويل كمستحق مالي (مستحقات للطبيب على المستشفى). لا يمكن التراجع عنه بعد التأكيد.
            </p>
          </div>
          <SheetFooter className="flex-row-reverse gap-2 pb-2">
            <Button
              onClick={() => dtMutation.mutate()}
              disabled={dtMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-dt-submit"
            >
              {dtMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <CheckCircle className="h-3 w-3 ml-1" />}
              تأكيد التحويل
            </Button>
            <Button variant="outline" onClick={() => setDtConfirmOpen(false)} data-testid="button-dt-cancel">
              إلغاء
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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

      <DistributeDialog
        open={distOpen}
        onClose={() => setDistOpen(false)}
        lines={lines}
        invoiceContext={{
          invoiceDate,
          departmentId,
          warehouseId,
          doctorName,
          patientType,
          contractName,
          notes,
          admissionId,
          invoiceId,
        }}
        onSuccess={() => resetForm()}
      />

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
