import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Save, CheckCircle, Trash2, Plus, Search, ChevronLeft, ChevronRight, Loader2, Eye, X, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber, formatCurrency, formatDateShort } from "@/lib/formatters";
import type { PatientInvoiceHeader, PatientInvoiceLine, PatientInvoicePayment, Department, Service, Item } from "@shared/schema";
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
  notes: string;
  sortOrder: number;
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

export default function PatientInvoice() {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState("invoice");
  const [subTab, setSubTab] = useState("services");

  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [patientType, setPatientType] = useState<"cash" | "contract">("cash");
  const [contractName, setContractName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");

  const [lines, setLines] = useState<LineLocal[]>([]);
  const [payments, setPayments] = useState<PaymentLocal[]>([]);

  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceResults, setServiceResults] = useState<Service[]>([]);
  const [searchingServices, setSearchingServices] = useState(false);
  const debouncedServiceSearch = useDebounce(serviceSearch, 300);

  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const debouncedItemSearch = useDebounce(itemSearch, 300);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [regPage, setRegPage] = useState(1);
  const [regDateFrom, setRegDateFrom] = useState("");
  const [regDateTo, setRegDateTo] = useState("");
  const [regPatientName, setRegPatientName] = useState("");
  const [regDoctorName, setRegDoctorName] = useState("");
  const [regStatus, setRegStatus] = useState("all");
  const regPageSize = 20;

  const isDraft = status === "draft";

  const { data: nextNumberData } = useQuery<{ nextNumber: string }>({
    queryKey: ["/api/patient-invoices/next-number"],
  });

  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });

  useEffect(() => {
    if (nextNumberData?.nextNumber && !invoiceId && !invoiceNumber) {
      setInvoiceNumber(nextNumberData.nextNumber);
    }
  }, [nextNumberData, invoiceId, invoiceNumber]);

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
    if (!debouncedItemSearch || debouncedItemSearch.length < 2) {
      setItemResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchingItems(true);
    fetch(`/api/items?search=${encodeURIComponent(debouncedItemSearch)}&limit=10&page=1`, {
      signal: controller.signal,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setItemResults(data.items || []);
        setSearchingItems(false);
      })
      .catch(() => setSearchingItems(false));
    return () => controller.abort();
  }, [debouncedItemSearch]);

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
        notes: l.notes || null,
        sortOrder: i,
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

  const resetForm = useCallback(() => {
    setInvoiceId(null);
    setInvoiceNumber(nextNumberData?.nextNumber || "");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setPatientName("");
    setPatientPhone("");
    setDepartmentId("");
    setDoctorName("");
    setPatientType("cash");
    setContractName("");
    setNotes("");
    setStatus("draft");
    setLines([]);
    setPayments([]);
    setSubTab("services");
  }, [nextNumberData]);

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
        quantity: parseFloat(l.quantity) || 1,
        unitPrice: parseFloat(l.unitPrice) || 0,
        discountPercent: parseFloat(l.discountPercent) || 0,
        discountAmount: parseFloat(l.discountAmount) || 0,
        totalPrice: parseFloat(l.totalPrice) || 0,
        notes: l.notes || "",
        sortOrder: l.sortOrder || 0,
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
      notes: "",
      sortOrder: lines.filter((l) => l.lineType === "service").length,
    };
    setLines((prev) => [...prev, newLine]);
    setServiceSearch("");
    setServiceResults([]);
  }, [lines]);

  const addItemLine = useCallback((item: Item, lineType: "drug" | "consumable" | "equipment") => {
    const price = parseFloat(String(item.salePriceCurrent || item.purchasePriceLast || "0")) || 0;
    const newLine: LineLocal = {
      tempId: genId(),
      lineType,
      serviceId: null,
      itemId: item.id,
      description: item.nameAr || item.itemCode,
      quantity: 1,
      unitPrice: price,
      discountPercent: 0,
      discountAmount: 0,
      totalPrice: price,
      notes: "",
      sortOrder: lines.filter((l) => l.lineType === lineType).length,
    };
    setLines((prev) => [...prev, newLine]);
    setItemSearch("");
    setItemResults([]);
  }, [lines]);

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

  function renderLineGrid(type: string) {
    const typeLines = filteredLines(type);
    return (
      <div className="space-y-3">
        {type !== "service" ? (
          <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث عن صنف..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="pr-8"
                disabled={!isDraft}
                data-testid={`input-item-search-${type}`}
              />
            </div>
            {searchingItems && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        ) : (
          <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث عن خدمة..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className="pr-8"
                disabled={!isDraft}
                data-testid="input-service-search"
              />
            </div>
            {searchingServices && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        )}

        {type === "service" && serviceResults.length > 0 && (
          <div className="border rounded-md max-h-40 overflow-y-auto">
            {serviceResults.map((svc: any) => (
              <div
                key={svc.id}
                className="flex flex-row-reverse items-center justify-between gap-2 p-2 hover-elevate cursor-pointer"
                onClick={() => addServiceLine(svc)}
                data-testid={`result-service-${svc.id}`}
              >
                <span className="text-sm">{svc.nameAr || svc.code}</span>
                <span className="text-xs text-muted-foreground">{formatNumber(svc.basePrice)}</span>
              </div>
            ))}
          </div>
        )}

        {type !== "service" && itemResults.length > 0 && (
          <div className="border rounded-md max-h-40 overflow-y-auto">
            {itemResults.map((item: any) => (
              <div
                key={item.id}
                className="flex flex-row-reverse items-center justify-between gap-2 p-2 hover-elevate cursor-pointer"
                onClick={() => addItemLine(item, type as "drug" | "consumable" | "equipment")}
                data-testid={`result-item-${type}-${item.id}`}
              >
                <span className="text-sm">{item.nameAr || item.itemCode}</span>
                <span className="text-xs text-muted-foreground">{formatNumber(item.salePriceCurrent || item.purchasePriceLast || 0)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto border rounded-md">
          <table className="peachtree-grid w-full text-sm">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="text-center" style={{ width: 40 }}>#</th>
                <th>الوصف</th>
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
                <tr key={line.tempId} className="peachtree-grid-row" data-testid={`row-line-${type}-${i}`}>
                  <td className="text-center">{i + 1}</td>
                  <td>
                    {isDraft ? (
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.tempId, "description", e.target.value)}
                        className="h-7 text-xs"
                        data-testid={`input-desc-${type}-${i}`}
                      />
                    ) : (
                      line.description
                    )}
                  </td>
                  <td className="text-center">
                    {isDraft ? (
                      <Input
                        type="number"
                        value={line.quantity}
                        min={0}
                        onChange={(e) => updateLine(line.tempId, "quantity", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-center"
                        data-testid={`input-qty-${type}-${i}`}
                      />
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
                  <td colSpan={isDraft ? 8 : 7} className="text-center text-muted-foreground py-4">
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
                    <tr key={line.tempId} className="peachtree-grid-row" data-testid={`row-consolidated-${counter}`}>
                      <td className="text-center">{counter}</td>
                      <td>
                        <Badge variant="secondary" className="text-xs">
                          {lineTypeLabels[line.lineType] || line.lineType}
                        </Badge>
                      </td>
                      <td>{line.description}</td>
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
        <TabsList className="w-full justify-end" data-testid="tabs-main">
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
                <div className="flex flex-row-reverse items-center gap-1">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">المريض:</Label>
                  <Input
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    disabled={!isDraft}
                    className="h-7 text-xs w-40"
                    data-testid="input-patient-name"
                  />
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
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">الطبيب:</Label>
                  <Input
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    disabled={!isDraft}
                    className="h-7 text-xs w-32"
                    data-testid="input-doctor-name"
                  />
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
                <TabsList className="w-full justify-end flex-wrap" data-testid="tabs-sub">
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
    </div>
  );
}
