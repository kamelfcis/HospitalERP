import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Search, Package, Trash2, Send, Save, Plus, ChevronLeft, ChevronRight, Eye, X, ScanBarcode, Truck, AlertTriangle, Check, BarChart3, RotateCcw, FileText } from "lucide-react";
import { ExpiryInput } from "@/components/ui/expiry-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateShort } from "@/lib/formatters";
import type { Warehouse, Item, Supplier, ReceivingHeaderWithDetails } from "@shared/schema";
import { receivingStatusLabels, correctionStatusLabels } from "@shared/schema";

interface ReceivingLineLocal {
  id: string;
  itemId: string;
  item: any;
  unitLevel: string;
  qtyEntered: number;
  qtyInMinor: number;
  purchasePrice: number;
  lineTotal: number;
  batchNumber: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  salePrice: number | null;
  lastPurchasePriceHint: number | null;
  lastSalePriceHint: number | null;
  bonusQty: number;
  bonusQtyInMinor: number;
  onHandInWarehouse: string;
  notes: string;
  isRejected: boolean;
  rejectionReason: string;
}

function getEffectiveMediumToMinor(item: any): number {
  const m2m = parseFloat(item?.mediumToMinor);
  if (m2m > 0) return m2m;
  const maj2min = parseFloat(item?.majorToMinor) || 1;
  const maj2med = parseFloat(item?.majorToMedium) || 1;
  return maj2min / maj2med;
}

function calculateQtyInMinor(qtyEntered: number, unitLevel: string, item: any): number {
  if (unitLevel === "major") return qtyEntered * (parseFloat(item?.majorToMinor) || 1);
  if (unitLevel === "medium") return qtyEntered * getEffectiveMediumToMinor(item);
  return qtyEntered;
}

function getDefaultUnitLevel(item: any): string {
  if (item.majorUnitName) return "major";
  return "minor";
}

function getUnitName(item: any, unitLevel: string): string {
  if (unitLevel === "major") return item.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return item.mediumUnitName || "وحدة وسطى";
  return item.minorUnitName || "وحدة صغرى";
}

export default function SupplierReceiving() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const today = new Date().toISOString().split("T")[0];

  const [activeTab, setActiveTab] = useState<string>("log");

  const [filterFromDate, setFilterFromDate] = useState(today);
  const [filterToDate, setFilterToDate] = useState(today);
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterWarehouseId, setFilterWarehouseId] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterSearch, setFilterSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 20;

  const [editingReceivingId, setEditingReceivingId] = useState<string | null>(null);
  const [receiveDate, setReceiveDate] = useState(today);
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<ReceivingLineLocal[]>([]);
  const [formStatus, setFormStatus] = useState<string>("draft");
  const [formReceivingNumber, setFormReceivingNumber] = useState<number | null>(null);

  const [supplierSearchText, setSupplierSearchText] = useState("");
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierHighlightIdx, setSupplierHighlightIdx] = useState(-1);
  const [supplierSearchLoading, setSupplierSearchLoading] = useState(false);
  const supplierSearchRef = useRef<HTMLInputElement>(null);
  const supplierDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supplierAbortRef = useRef<AbortController | null>(null);
  const supplierCacheRef = useRef<Map<string, Supplier[]>>(new Map());

  const [invoiceDuplicateError, setInvoiceDuplicateError] = useState("");
  const invoiceCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearchText, setModalSearchText] = useState("");
  const [modalResults, setModalResults] = useState<any[]>([]);
  const [modalSearching, setModalSearching] = useState(false);
  const modalSearchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const qtyInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const salePriceInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const expiryInputRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);
  const lineFieldFocusedRef = useRef(false);

  const safeFocusBarcode = useCallback((delay = 50) => {
    setTimeout(() => {
      if (!lineFieldFocusedRef.current) {
        barcodeInputRef.current?.focus();
      }
    }, delay);
  }, []);

  const [confirmPostOpen, setConfirmPostOpen] = useState(false);
  const [lineErrors, setLineErrors] = useState<{ lineIndex: number; field: string; messageAr: string }[]>([]);
  const [formCorrectionStatus, setFormCorrectionStatus] = useState<string | null>(null);
  const [formCorrectionOfId, setFormCorrectionOfId] = useState<string | null>(null);

  const [showQuickSupplierDialog, setShowQuickSupplierDialog] = useState(false);
  const [quickSupplierCode, setQuickSupplierCode] = useState("");
  const [quickSupplierNameAr, setQuickSupplierNameAr] = useState("");
  const [quickSupplierPhone, setQuickSupplierPhone] = useState("");
  const [quickSupplierType, setQuickSupplierType] = useState("drugs");
  const [formConvertedToInvoiceId, setFormConvertedToInvoiceId] = useState<string | null>(null);

  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const openStats = async (itemId: string) => {
    setStatsItemId(itemId);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/items/${itemId}/warehouse-stats`);
      if (res.ok) setStatsData(await res.json());
    } catch {}
    setStatsLoading(false);
  };

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: allSuppliers } = useQuery<{ suppliers: Supplier[]; total: number }>({
    queryKey: ["/api/suppliers", "all"],
    queryFn: async () => {
      const res = await fetch("/api/suppliers?page=1&pageSize=500");
      if (!res.ok) throw new Error("Failed to fetch suppliers");
      return res.json();
    },
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filterSearch.trim());
      setLogPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filterSearch]);

  const buildLogQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", logPage.toString());
    params.set("pageSize", logPageSize.toString());
    if (filterFromDate) params.set("fromDate", filterFromDate);
    if (filterToDate) params.set("toDate", filterToDate);
    if (filterSupplierId && filterSupplierId !== "all") params.set("supplierId", filterSupplierId);
    if (filterWarehouseId && filterWarehouseId !== "all") params.set("warehouseId", filterWarehouseId);
    if (filterStatus && filterStatus !== "ALL") params.set("statusFilter", filterStatus);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params.toString();
  };

  const { data: receivingsData, isLoading: receivingsLoading } = useQuery<{ data: ReceivingHeaderWithDetails[]; total: number }>({
    queryKey: ["/api/receivings", logPage, filterFromDate, filterToDate, filterSupplierId, filterWarehouseId, filterStatus, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/receivings?${buildLogQueryString()}`);
      if (!res.ok) throw new Error("Failed to fetch receivings");
      return res.json();
    },
  });

  const receivings = receivingsData?.data || [];
  const totalReceivings = receivingsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalReceivings / logPageSize));

  const handleResetFilters = () => {
    setFilterFromDate(today);
    setFilterToDate(today);
    setFilterSupplierId("");
    setFilterWarehouseId("");
    setFilterStatus("ALL");
    setFilterSearch("");
    setDebouncedSearch("");
    setLogPage(1);
  };

  const handleSupplierSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setSupplierResults([]);
      setSupplierSearchLoading(false);
      return;
    }
    const cached = supplierCacheRef.current.get(trimmed);
    if (cached) {
      setSupplierResults(cached);
      setSupplierDropdownOpen(true);
      setSupplierHighlightIdx(-1);
      setSupplierSearchLoading(false);
      return;
    }
    if (supplierAbortRef.current) supplierAbortRef.current.abort();
    const controller = new AbortController();
    supplierAbortRef.current = controller;
    try {
      setSupplierSearchLoading(true);
      const res = await fetch(`/api/suppliers/search?q=${encodeURIComponent(trimmed)}&limit=20`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        supplierCacheRef.current.set(trimmed, data);
        if (supplierCacheRef.current.size > 50) {
          const firstKey = supplierCacheRef.current.keys().next().value;
          if (firstKey !== undefined) supplierCacheRef.current.delete(firstKey);
        }
        setSupplierResults(data);
        setSupplierDropdownOpen(true);
        setSupplierHighlightIdx(-1);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setSupplierResults([]);
    } finally {
      setSupplierSearchLoading(false);
    }
  }, []);

  const handleSupplierSearchChange = (val: string) => {
    setSupplierSearchText(val);
    if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current);
    supplierDebounceRef.current = setTimeout(() => {
      handleSupplierSearch(val);
    }, 250);
  };

  const handleSupplierKeyDown = (e: React.KeyboardEvent) => {
    if (!supplierDropdownOpen || supplierResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSupplierHighlightIdx((prev) => Math.min(prev + 1, supplierResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSupplierHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && supplierHighlightIdx >= 0) {
      e.preventDefault();
      selectSupplier(supplierResults[supplierHighlightIdx]);
    }
  };

  const selectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setSupplierId(supplier.id);
    setSupplierSearchText(`${supplier.code} - ${supplier.nameAr}`);
    setSupplierDropdownOpen(false);
  };

  const checkInvoiceDuplicate = useCallback(async (sId: string, invoiceNo: string) => {
    if (!sId || !invoiceNo.trim()) {
      setInvoiceDuplicateError("");
      return;
    }
    try {
      const params = new URLSearchParams({ supplierId: sId, supplierInvoiceNo: invoiceNo });
      if (editingReceivingId) {
        params.set("excludeId", editingReceivingId);
      }
      const res = await fetch(`/api/receivings/check-invoice?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.isUnique) {
          setInvoiceDuplicateError("رقم الفاتورة مكرر لنفس المورد");
        } else {
          setInvoiceDuplicateError("");
        }
      }
    } catch {
      setInvoiceDuplicateError("");
    }
  }, [editingReceivingId]);

  useEffect(() => {
    if (invoiceCheckRef.current) clearTimeout(invoiceCheckRef.current);
    invoiceCheckRef.current = setTimeout(() => {
      checkInvoiceDuplicate(supplierId, supplierInvoiceNo);
    }, 500);
    return () => { if (invoiceCheckRef.current) clearTimeout(invoiceCheckRef.current); };
  }, [supplierId, supplierInvoiceNo, checkInvoiceDuplicate]);

  const fetchHints = useCallback(async (itemId: string, sId: string, wId: string): Promise<any> => {
    try {
      const params = new URLSearchParams();
      if (sId) params.set("supplierId", sId);
      if (wId) params.set("warehouseId", wId);
      const res = await fetch(`/api/items/${itemId}/hints?${params}`);
      if (res.ok) return res.json();
    } catch {}
    return null;
  }, []);

  const addItemLine = useCallback(async (item: any) => {
    const unitLevel = getDefaultUnitLevel(item);
    const qtyEntered = 1;
    const qtyInMinor = calculateQtyInMinor(qtyEntered, unitLevel, item);

    const hints = await fetchHints(item.id, supplierId, warehouseId);
    const lastPurchasePrice = hints?.lastPurchasePrice ? parseFloat(hints.lastPurchasePrice) : 0;
    const currentSalePrice = hints?.currentSalePrice ? parseFloat(hints.currentSalePrice) : 0;
    const lastSalePrice = hints?.lastSalePrice ? parseFloat(hints.lastSalePrice) : null;

    const newLine: ReceivingLineLocal = {
      id: crypto.randomUUID(),
      itemId: item.id,
      item,
      unitLevel,
      qtyEntered,
      qtyInMinor,
      purchasePrice: lastPurchasePrice,
      lineTotal: 0,
      batchNumber: "",
      expiryMonth: null,
      expiryYear: null,
      salePrice: currentSalePrice || null,
      lastPurchasePriceHint: lastPurchasePrice || null,
      lastSalePriceHint: lastSalePrice ? parseFloat(String(lastSalePrice)) : null,
      bonusQty: 0,
      bonusQtyInMinor: 0,
      onHandInWarehouse: hints?.onHandMinor || "0",
      notes: "",
      isRejected: false,
      rejectionReason: "",
    };

    setFormLines((prev) => [...prev, newLine]);
    toast({ title: `تمت إضافة: ${item.nameAr}` });
    return newLine;
  }, [supplierId, warehouseId, fetchHints, toast]);

  const loadReceivingForEditing = useCallback(async (receivingId: string) => {
    try {
      const res = await fetch(`/api/receivings/${receivingId}`);
      if (!res.ok) throw new Error("Failed to load receiving");
      const receiving: ReceivingHeaderWithDetails = await res.json();

      setEditingReceivingId(receiving.id);
      setReceiveDate(receiving.receiveDate);
      setSupplierId(receiving.supplierId);
      setWarehouseId(receiving.warehouseId);
      setSupplierInvoiceNo(receiving.supplierInvoiceNo);
      setFormNotes(receiving.notes || "");
      setFormStatus(receiving.status);
      setFormReceivingNumber(receiving.receivingNumber);

      if (receiving.supplier) {
        setSelectedSupplier(receiving.supplier);
        setSupplierSearchText(`${receiving.supplier.code} - ${receiving.supplier.nameAr}`);
      }

      const loadedLines: ReceivingLineLocal[] = (receiving.lines || []).map((line: any) => ({
        id: crypto.randomUUID(),
        itemId: line.itemId,
        item: line.item || null,
        unitLevel: line.unitLevel,
        qtyEntered: parseFloat(line.qtyEntered as string),
        qtyInMinor: parseFloat(line.qtyInMinor as string),
        purchasePrice: parseFloat(line.purchasePrice as string) || 0,
        lineTotal: parseFloat(line.lineTotal as string) || 0,
        batchNumber: line.batchNumber || "",
        expiryMonth: line.expiryMonth ?? null,
        expiryYear: line.expiryYear ?? null,
        salePrice: line.salePrice ? parseFloat(line.salePrice as string) : null,
        lastPurchasePriceHint: line.purchasePrice ? parseFloat(line.purchasePrice as string) : null,
        lastSalePriceHint: line.salePriceHint ? parseFloat(line.salePriceHint as string) : null,
        bonusQty: parseFloat(line.bonusQty as string) || 0,
        bonusQtyInMinor: parseFloat(line.bonusQtyInMinor as string) || 0,
        onHandInWarehouse: "0",
        notes: line.notes || "",
        isRejected: line.isRejected || false,
        rejectionReason: line.rejectionReason || "",
      }));

      for (let i = 0; i < loadedLines.length; i++) {
        const ln = loadedLines[i];
        try {
          const hintsRes = await fetch(`/api/items/${ln.itemId}/hints?supplierId=${receiving.supplierId}&warehouseId=${receiving.warehouseId}`);
          if (hintsRes.ok) {
            const hints = await hintsRes.json();
            loadedLines[i] = {
              ...loadedLines[i],
              onHandInWarehouse: hints.onHandMinor || "0",
              lastPurchasePriceHint: loadedLines[i].lastPurchasePriceHint || (hints.lastPurchasePrice ? parseFloat(hints.lastPurchasePrice) : null),
              lastSalePriceHint: loadedLines[i].lastSalePriceHint || (hints.lastSalePrice ? parseFloat(hints.lastSalePrice) : null),
            };
          }
        } catch {}
      }

      if (receiving.status === "draft") {
        let fixedCount = 0;
        for (let i = 0; i < loadedLines.length; i++) {
          const ln = loadedLines[i];
          const item = ln.item;
          if (item) {
            const expectedUnit = getDefaultUnitLevel(item);
            if (!ln.unitLevel || (item.majorUnitName && ln.unitLevel !== "major")) {
              loadedLines[i] = {
                ...loadedLines[i],
                unitLevel: expectedUnit,
                qtyInMinor: calculateQtyInMinor(loadedLines[i].qtyEntered, expectedUnit, item),
              };
              fixedCount++;
            }
          }
        }
        if (fixedCount > 0) {
          toast({ title: "تم ضبط وحدة الشراء للوحدة الكبرى", description: `تم تصحيح ${fixedCount} سطر` });
        }
      }

      setFormCorrectionStatus((receiving as any).correctionStatus || null);
      setFormCorrectionOfId((receiving as any).correctionOfId || null);
      setFormConvertedToInvoiceId((receiving as any).convertedToInvoiceId || null);
      setFormLines(loadedLines);
      setActiveTab("form");
    } catch (err: any) {
      toast({ title: "خطأ في تحميل إذن الاستلام", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const resetForm = () => {
    setEditingReceivingId(null);
    setReceiveDate(today);
    setSupplierId("");
    setSelectedSupplier(null);
    setSupplierSearchText("");
    setSupplierInvoiceNo("");
    setWarehouseId("");
    setFormNotes("");
    setFormLines([]);
    setFormStatus("draft");
    setFormReceivingNumber(null);
    setInvoiceDuplicateError("");
    setFormCorrectionStatus(null);
    setFormCorrectionOfId(null);
    setFormConvertedToInvoiceId(null);
    setLineErrors([]);
    lastAutoSaveDataRef.current = "";
    setAutoSaveStatus("idle");
  };

  const grandTotal = formLines.reduce((sum, l) => sum + l.lineTotal, 0);

  const canSaveDraft =
    !!supplierId &&
    !!supplierInvoiceNo.trim() &&
    !!warehouseId &&
    !!receiveDate &&
    formLines.length > 0 &&
    formStatus === "draft" &&
    !invoiceDuplicateError;

  const isViewOnly = formStatus !== "draft";

  const validateLines = useCallback((): { lineIndex: number; field: string; messageAr: string }[] => {
    const errors: { lineIndex: number; field: string; messageAr: string }[] = [];
    for (let i = 0; i < formLines.length; i++) {
      const line = formLines[i];
      if (line.isRejected) continue;
      if (line.salePrice == null || line.salePrice <= 0) {
        errors.push({ lineIndex: i, field: "salePrice", messageAr: "سعر البيع مطلوب" });
      }
      if (line.item?.hasExpiry) {
        if (line.expiryMonth == null || line.expiryYear == null || line.expiryMonth < 1 || line.expiryMonth > 12 || line.expiryYear < 2000) {
          errors.push({ lineIndex: i, field: "expiry", messageAr: "تاريخ الصلاحية مطلوب" });
        }
      }
    }
    return errors;
  }, [formLines]);

  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveDataRef = useRef<string>("");

  const performAutoSave = useCallback(async () => {
    if (formStatus !== "draft") return;
    if (!supplierId || !warehouseId) return;

    const payload = {
      header: {
        supplierId,
        supplierInvoiceNo,
        warehouseId,
        receiveDate,
        notes: formNotes || undefined,
      },
      lines: formLines.map((l) => ({
        itemId: l.itemId,
        unitLevel: l.unitLevel,
        qtyEntered: String(l.qtyEntered),
        qtyInMinor: String(l.qtyInMinor),
        bonusQty: String(l.bonusQty),
        bonusQtyInMinor: String(l.bonusQtyInMinor),
        purchasePrice: String(l.purchasePrice),
        lineTotal: String(l.lineTotal),
        batchNumber: l.batchNumber || undefined,
        expiryMonth: l.expiryMonth || undefined,
        expiryYear: l.expiryYear || undefined,
        salePrice: l.salePrice != null ? String(l.salePrice) : undefined,
        notes: l.notes || undefined,
        isRejected: l.isRejected,
        rejectionReason: l.rejectionReason || undefined,
      })),
      existingId: editingReceivingId || undefined,
    };

    const dataKey = JSON.stringify(payload);
    if (dataKey === lastAutoSaveDataRef.current) return;

    setAutoSaveStatus("saving");
    try {
      const res = await fetch("/api/receivings/auto-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        lastAutoSaveDataRef.current = dataKey;
        if (!editingReceivingId && data.id) {
          setEditingReceivingId(data.id);
          if (data.receivingNumber) setFormReceivingNumber(data.receivingNumber);
        }
        setAutoSaveStatus("saved");
        queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
      } else {
        setAutoSaveStatus("error");
      }
    } catch {
      setAutoSaveStatus("error");
    }
  }, [supplierId, warehouseId, supplierInvoiceNo, receiveDate, formNotes, formLines, formStatus, editingReceivingId]);

  useEffect(() => {
    if (formStatus !== "draft" || !supplierId || !warehouseId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 15000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [supplierId, warehouseId, supplierInvoiceNo, receiveDate, formNotes, formLines, performAutoSave, formStatus]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (formStatus === "draft" && supplierId && warehouseId) {
        const payload = {
          header: { supplierId, supplierInvoiceNo, warehouseId, receiveDate, notes: formNotes || undefined },
          lines: formLines.map((l) => ({
            itemId: l.itemId, unitLevel: l.unitLevel, qtyEntered: String(l.qtyEntered),
            qtyInMinor: String(l.qtyInMinor), bonusQty: String(l.bonusQty), bonusQtyInMinor: String(l.bonusQtyInMinor),
            purchasePrice: String(l.purchasePrice), lineTotal: String(l.lineTotal),
            batchNumber: l.batchNumber || undefined, expiryMonth: l.expiryMonth || undefined,
            expiryYear: l.expiryYear || undefined, salePrice: l.salePrice != null ? String(l.salePrice) : undefined,
          })),
          existingId: editingReceivingId || undefined,
        };
        navigator.sendBeacon("/api/receivings/auto-save", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [formStatus, supplierId, warehouseId, supplierInvoiceNo, receiveDate, formNotes, formLines, editingReceivingId]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const errors = validateLines();
      if (errors.length > 0) {
        setLineErrors(errors);
        const first = errors[0];
        if (first.field === "salePrice") {
          salePriceInputRefs.current.get(first.lineIndex)?.focus();
        } else if (first.field === "expiry") {
          const el = expiryInputRefs.current.get(first.lineIndex);
          const input = el?.querySelector('input');
          input?.focus();
        }
        throw new Error("لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة");
      }
      setLineErrors([]);
      const payload = {
        header: {
          supplierId,
          supplierInvoiceNo,
          warehouseId,
          receiveDate,
          notes: formNotes || undefined,
        },
        lines: formLines.map((l) => ({
          itemId: l.itemId,
          unitLevel: l.unitLevel,
          qtyEntered: String(l.qtyEntered),
          qtyInMinor: String(l.qtyInMinor),
          bonusQty: String(l.bonusQty),
          bonusQtyInMinor: String(l.bonusQtyInMinor),
          purchasePrice: String(l.purchasePrice),
          lineTotal: String(l.lineTotal),
          batchNumber: l.batchNumber || undefined,
          expiryMonth: l.expiryMonth || undefined,
          expiryYear: l.expiryYear || undefined,
          salePrice: l.salePrice != null ? String(l.salePrice) : undefined,
          notes: l.notes || undefined,
          isRejected: l.isRejected,
          rejectionReason: l.rejectionReason || undefined,
        })),
      };
      if (editingReceivingId) {
        return apiRequest("PATCH", `/api/receivings/${editingReceivingId}`, payload);
      }
      return apiRequest("POST", "/api/receivings", payload);
    },
    onSuccess: async (res) => {
      toast({ title: "تم حفظ المسودة بنجاح" });
      lastAutoSaveDataRef.current = "";
      setAutoSaveStatus("idle");
      if (!editingReceivingId) {
        try {
          const data = await res.json();
          if (data.id) {
            setEditingReceivingId(data.id);
            if (data.receivingNumber) setFormReceivingNumber(data.receivingNumber);
          }
        } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في حفظ المسودة", description: error.message, variant: "destructive" });
    },
  });

  const postReceivingMutation = useMutation({
    mutationFn: async () => {
      const errors = validateLines();
      if (errors.length > 0) {
        setLineErrors(errors);
        const first = errors[0];
        if (first.field === "salePrice") {
          salePriceInputRefs.current.get(first.lineIndex)?.focus();
        } else if (first.field === "expiry") {
          const el = expiryInputRefs.current.get(first.lineIndex);
          const input = el?.querySelector('input');
          input?.focus();
        }
        throw new Error("لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة");
      }
      setLineErrors([]);
      const payload = {
        header: {
          supplierId,
          supplierInvoiceNo,
          warehouseId,
          receiveDate,
          notes: formNotes || undefined,
        },
        lines: formLines.map((l) => ({
          itemId: l.itemId,
          unitLevel: l.unitLevel,
          qtyEntered: String(l.qtyEntered),
          qtyInMinor: String(l.qtyInMinor),
          bonusQty: String(l.bonusQty),
          bonusQtyInMinor: String(l.bonusQtyInMinor),
          purchasePrice: String(l.purchasePrice),
          lineTotal: String(l.lineTotal),
          batchNumber: l.batchNumber || undefined,
          expiryMonth: l.expiryMonth || undefined,
          expiryYear: l.expiryYear || undefined,
          salePrice: l.salePrice != null ? String(l.salePrice) : undefined,
          notes: l.notes || undefined,
          isRejected: l.isRejected,
          rejectionReason: l.rejectionReason || undefined,
        })),
      };
      if (editingReceivingId) {
        await apiRequest("PATCH", `/api/receivings/${editingReceivingId}`, payload);
        await apiRequest("POST", `/api/receivings/${editingReceivingId}/post`);
      } else {
        const createRes = await apiRequest("POST", "/api/receivings", payload);
        const created = await createRes.json();
        await apiRequest("POST", `/api/receivings/${created.id}/post`);
      }
    },
    onSuccess: () => {
      toast({ title: "تم ترحيل إذن الاستلام بنجاح" });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
      setConfirmPostOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "خطأ في ترحيل إذن الاستلام", description: error.message, variant: "destructive" });
      setConfirmPostOpen(false);
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (receivingId: string) => {
      return apiRequest("DELETE", `/api/receivings/${receivingId}`);
    },
    onSuccess: () => {
      toast({ title: "تم حذف إذن الاستلام" });
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في حذف إذن الاستلام", description: error.message, variant: "destructive" });
    },
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: async (receivingId: string) => {
      return apiRequest("POST", `/api/receivings/${receivingId}/convert-to-invoice`);
    },
    onSuccess: async (res) => {
      const invoice = await res.json();
      toast({ title: "تم التحويل إلى فاتورة شراء بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
      navigate(`/purchase-invoices?id=${invoice.id}`);
    },
    onError: (error: any) => {
      toast({ title: "خطأ في التحويل", description: error.message, variant: "destructive" });
    },
  });

  const correctReceivingMutation = useMutation({
    mutationFn: async (receivingId: string) => {
      return apiRequest("POST", `/api/receivings/${receivingId}/correct`);
    },
    onSuccess: async (res) => {
      const newReceiving = await res.json();
      toast({ title: "تم إنشاء مستند التصحيح بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
      loadReceivingForEditing(newReceiving.id);
    },
    onError: (error: any) => {
      toast({ title: "خطأ في إنشاء التصحيح", description: error.message, variant: "destructive" });
    },
  });

  const handleConvertToInvoice = (receivingId: string) => {
    convertToInvoiceMutation.mutate(receivingId);
  };

  const isPending = saveDraftMutation.isPending || postReceivingMutation.isPending || correctReceivingMutation.isPending;

  const updateLine = useCallback((index: number, updates: Partial<ReceivingLineLocal>) => {
    setLineErrors([]);
    setFormLines((prev) => {
      const copy = [...prev];
      const line = { ...copy[index], ...updates };
      if ("qtyEntered" in updates || "bonusQty" in updates || "unitLevel" in updates) {
        const qty = updates.qtyEntered ?? line.qtyEntered;
        const bonus = updates.bonusQty ?? line.bonusQty;
        const unitLvl = updates.unitLevel ?? line.unitLevel;
        line.qtyEntered = qty;
        line.bonusQty = bonus;
        line.qtyInMinor = calculateQtyInMinor(qty, unitLvl, line.item);
        line.bonusQtyInMinor = calculateQtyInMinor(bonus, unitLvl, line.item);
        line.unitLevel = unitLvl;
      }
      copy[index] = line;
      return copy;
    });
  }, []);

  const quickSupplierMutation = useMutation({
    mutationFn: async (data: { code: string; nameAr: string; phone?: string; supplierType?: string }) => {
      const res = await apiRequest("POST", "/api/suppliers", data);
      return res.json();
    },
    onSuccess: (supplier: Supplier) => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      supplierCacheRef.current.clear();
      selectSupplier(supplier);
      setShowQuickSupplierDialog(false);
      setQuickSupplierCode("");
      setQuickSupplierNameAr("");
      setQuickSupplierPhone("");
      toast({ title: "تم إضافة المورد بنجاح" });
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message || "فشل إضافة المورد", variant: "destructive" });
    },
  });

  const handleQuickSupplierSave = () => {
    if (!quickSupplierCode.trim() || !quickSupplierNameAr.trim()) {
      toast({ title: "خطأ", description: "كود المورد والاسم العربي مطلوبان", variant: "destructive" });
      return;
    }
    quickSupplierMutation.mutate({
      code: quickSupplierCode.trim(),
      nameAr: quickSupplierNameAr.trim(),
      phone: quickSupplierPhone.trim() || undefined,
      supplierType: quickSupplierType,
    });
  };

  const handleDeleteLine = (index: number) => {
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBarcodeScan = useCallback(async (barcodeValue: string) => {
    if (!barcodeValue.trim() || barcodeLoading) return;

    setBarcodeLoading(true);
    try {
      const resolveRes = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(barcodeValue.trim())}`);
      if (!resolveRes.ok) throw new Error("فشل البحث");
      const resolved = await resolveRes.json();
      if (!resolved.found) {
        toast({ title: "باركود غير معروف", description: barcodeValue, variant: "destructive" });
        return;
      }

      const searchRes = await fetch(`/api/items/search?warehouseId=${warehouseId || ""}&mode=CODE&q=${encodeURIComponent(resolved.itemCode)}&page=1&pageSize=1&includeZeroStock=true&drugsOnly=false&excludeServices=true`);
      if (!searchRes.ok) throw new Error("فشل جلب بيانات الصنف");
      const searchData = await searchRes.json();
      const item = searchData.items?.[0];
      if (!item) {
        toast({ title: "الصنف غير موجود", variant: "destructive" });
        return;
      }

      const unitLevel = getDefaultUnitLevel(item);
      const hints = await fetchHints(item.id, supplierId, warehouseId);
      const lastPurchasePrice = hints?.lastPurchasePrice ? parseFloat(hints.lastPurchasePrice) : 0;
      const currentSalePrice = hints?.currentSalePrice ? parseFloat(hints.currentSalePrice) : 0;
      const lastSalePrice = hints?.lastSalePrice ? parseFloat(hints.lastSalePrice) : null;

      const newLine: ReceivingLineLocal = {
        id: crypto.randomUUID(),
        itemId: item.id,
        item,
        unitLevel,
        qtyEntered: 1,
        qtyInMinor: calculateQtyInMinor(1, unitLevel, item),
        purchasePrice: lastPurchasePrice,
        lineTotal: 0,
        batchNumber: "",
        expiryMonth: null,
        expiryYear: null,
        salePrice: currentSalePrice || null,
        lastPurchasePriceHint: lastPurchasePrice || null,
        lastSalePriceHint: lastSalePrice ? parseFloat(String(lastSalePrice)) : null,
        bonusQty: 0,
        bonusQtyInMinor: 0,
        onHandInWarehouse: hints?.onHandMinor || "0",
        notes: "",
        isRejected: false,
        rejectionReason: "",
      };

      setFormLines((prev) => {
        const updated = [...prev, newLine];
        setTimeout(() => {
          const newIdx = updated.length - 1;
          qtyInputRefs.current.get(newIdx)?.focus();
        }, 80);
        return updated;
      });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setBarcodeLoading(false);
      setBarcodeInput("");
    }
  }, [barcodeLoading, toast, supplierId, warehouseId, fetchHints]);

  const doModalSearch = useCallback(async () => {
    if (!modalSearchText.trim()) return;
    setModalSearching(true);
    try {
      const params = new URLSearchParams({
        warehouseId: warehouseId || "",
        mode: "AR",
        q: modalSearchText,
        page: "1",
        pageSize: "50",
        includeZeroStock: "true",
        drugsOnly: "false",
        excludeServices: "true",
      });
      const res = await fetch(`/api/items/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setModalResults(data.items || []);
      }
    } catch {
      setModalResults([]);
    } finally {
      setModalSearching(false);
    }
  }, [modalSearchText, warehouseId]);

  const handleModalSearchTextChange = (val: string) => {
    setModalSearchText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim()) doModalSearch();
    }, 250);
  };

  const handleModalSelectItem = async (item: any) => {
    await addItemLine(item);
    setModalSearchText("");
    setModalResults([]);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const keys = Array.from(qtyInputRefs.current.keys());
        const lastIdx = Math.max(...keys);
        if (!isNaN(lastIdx) && lastIdx >= 0) qtyInputRefs.current.get(lastIdx)?.focus();
      }, 50);
    });
  };

  const modalOpenPrev = useRef(false);
  useEffect(() => {
    if (modalOpen && !modalOpenPrev.current) {
      setModalSearchText("");
      setModalResults([]);
    }
    modalOpenPrev.current = modalOpen;
  }, [modalOpen]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        safeFocusBarcode(0);
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [safeFocusBarcode]);

  useEffect(() => {
    if (activeTab === "form" && !modalOpen) {
      const timer = setTimeout(() => {
        if (!lineFieldFocusedRef.current) {
          safeFocusBarcode(0);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, modalOpen, safeFocusBarcode]);

  const handleFormContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-testid^='input-qty-']")) return;
    if (target.closest("button")) return;
    if (target.closest("input")) return;
    if (target.closest("select")) return;
    if (target.closest("[role='dialog']")) return;
    if (target.closest("[role='listbox']")) return;
    if (target.closest("[data-expiry-input]")) return;
    if (!modalOpen && !lineFieldFocusedRef.current) {
      safeFocusBarcode();
    }
  }, [modalOpen, safeFocusBarcode]);

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">استلام الموردين</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">إدارة أذونات الاستلام من الموردين</span>
          <TabsList className="no-print mr-auto">
            <TabsTrigger value="form" data-testid="tab-form">إذن استلام</TabsTrigger>
            <TabsTrigger value="log" data-testid="tab-log">السجل</TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            variant="outline"
            className="no-print"
            onClick={() => { resetForm(); setActiveTab("form"); }}
            data-testid="button-new-receiving"
          >
            <Plus className="h-3 w-3 ml-1" />
            جديد
          </Button>
        </div>

        <TabsContent value="log" className="space-y-2">
          <div className="peachtree-toolbar space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => { setFilterSearch(e.target.value); setLogPage(1); }}
                  placeholder="ابحث برقم فاتورة المورد أو اسم المورد"
                  className="h-7 text-[11px] pr-7 pl-7"
                  data-testid="filter-search"
                />
                {filterSearch && (
                  <button
                    type="button"
                    onClick={() => { setFilterSearch(""); setDebouncedSearch(""); setLogPage(1); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-clear-search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground whitespace-nowrap">من</Label>
                <Input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => {
                    setFilterFromDate(e.target.value);
                    setLogPage(1);
                  }}
                  className="h-7 text-[11px] px-1 w-[120px]"
                  data-testid="filter-from-date"
                />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground whitespace-nowrap">إلى</Label>
                <Input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => {
                    setFilterToDate(e.target.value);
                    setLogPage(1);
                  }}
                  className="h-7 text-[11px] px-1 w-[120px]"
                  data-testid="filter-to-date"
                />
              </div>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setLogPage(1); }}>
                <SelectTrigger className="h-7 text-[11px] px-1 w-[180px]" data-testid="filter-status">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">الكل</SelectItem>
                  <SelectItem value="DRAFT">مسودة</SelectItem>
                  <SelectItem value="POSTED">تم الترحيل فقط</SelectItem>
                  <SelectItem value="CONVERTED">تم التحويل إلى فاتورة شراء</SelectItem>
                  <SelectItem value="CORRECTED">مُصحَّح</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                data-testid="button-reset-filters"
              >
                <RotateCcw className="h-3 w-3 ml-1" />
                إعادة تعيين
              </Button>
            </div>
            {filterFromDate && filterToDate && filterFromDate > filterToDate && (
              <p className="text-[10px] text-destructive" data-testid="text-date-error">تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية</p>
            )}
          </div>

          <div className="peachtree-grid">
            {receivingsLoading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]" dir="rtl" data-testid="table-receiving-log">
                    <thead>
                      <tr className="peachtree-grid-header">
                        <th className="py-1 px-2 text-right font-medium">رقم الاستلام</th>
                        <th className="py-1 px-2 text-right font-medium">التاريخ</th>
                        <th className="py-1 px-2 text-right font-medium">المورد</th>
                        <th className="py-1 px-2 text-right font-medium">فاتورة المورد</th>
                        <th className="py-1 px-2 text-right font-medium">المستودع</th>
                        <th className="py-1 px-2 text-right font-medium">الحالة</th>
                        <th className="py-1 px-2 text-right font-medium">الإجمالي</th>
                        <th className="py-1 px-2 text-right font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivings.length > 0 ? (
                        receivings.map((r) => (
                          <tr key={r.id} className="peachtree-grid-row" data-testid={`row-receiving-${r.id}`}>
                            <td className="py-1 px-2 font-mono">{r.receivingNumber}</td>
                            <td className="py-1 px-2">{formatDateShort(r.receiveDate)}</td>
                            <td className="py-1 px-2">{r.supplier?.nameAr || "—"}</td>
                            <td className="py-1 px-2">{r.supplierInvoiceNo}</td>
                            <td className="py-1 px-2">{r.warehouse?.nameAr || "—"}</td>
                            <td className="py-1 px-2">
                              <div className="flex items-center gap-1">
                                {r.status === "posted" || r.status === "posted_qty_only" ? (
                                  <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">
                                    {receivingStatusLabels[r.status] || r.status}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[9px]">
                                    {receivingStatusLabels[r.status] || r.status}
                                  </Badge>
                                )}
                                {(r as any).convertedToInvoiceId && (
                                  <Badge variant="default" className="text-[9px] bg-blue-600 no-default-hover-elevate no-default-active-elevate">تم التحويل</Badge>
                                )}
                                {(r as any).correctionStatus === 'corrected' && (
                                  <Badge variant="default" className="text-[9px] bg-orange-600 no-default-hover-elevate no-default-active-elevate">مُصحَّح</Badge>
                                )}
                                {(r as any).correctionStatus === 'correction' && (
                                  <Badge variant="default" className="text-[9px] bg-purple-600 no-default-hover-elevate no-default-active-elevate">تصحيح</Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-1 px-2 font-mono">{parseFloat(r.totalCost as string || "0").toFixed(2)}</td>
                            <td className="py-1 px-2">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => loadReceivingForEditing(r.id)}
                                  data-testid={`button-open-receiving-${r.id}`}
                                >
                                  <Eye className="h-3 w-3 ml-1" />
                                  فتح
                                </Button>
                                {r.status === "draft" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={deleteDraftMutation.isPending}
                                    onClick={() => deleteDraftMutation.mutate(r.id)}
                                    data-testid={`button-delete-draft-${r.id}`}
                                  >
                                    {deleteDraftMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 ml-1" />}
                                    حذف
                                  </Button>
                                )}
                                {r.status === "posted_qty_only" && !(r as any).convertedToInvoiceId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleConvertToInvoice(r.id)}
                                    data-testid={`button-convert-${r.id}`}
                                  >
                                    تحويل إلى فاتورة
                                  </Button>
                                )}
                                {r.status === "posted_qty_only" && (r as any).correctionStatus !== 'corrected' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={correctReceivingMutation.isPending}
                                    onClick={() => correctReceivingMutation.mutate(r.id)}
                                    data-testid={`button-correct-${r.id}`}
                                  >
                                    تصحيح
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-4 text-center text-muted-foreground">
                            لا توجد أذونات استلام مسجلة
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 py-2 text-[11px]">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logPage <= 1}
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      data-testid="button-prev-page"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                    <span className="text-muted-foreground">صفحة {logPage} من {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logPage >= totalPages}
                      onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))}
                      data-testid="button-next-page"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="form" className="space-y-2" onClick={handleFormContainerClick}>
          {isViewOnly && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md p-2 mb-2 text-center text-sm text-amber-800 dark:text-amber-200" data-testid="banner-read-only">
              {receivingStatusLabels[formStatus as keyof typeof receivingStatusLabels] || formStatus} — للعرض فقط
            </div>
          )}
          {formCorrectionStatus === 'correction' && (
            <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-md p-2 mb-2 text-center text-sm text-purple-800 dark:text-purple-200" data-testid="banner-correction">
              مستند تصحيح — يمكنك تعديل الأصناف ثم الترحيل لتطبيق التصحيح
            </div>
          )}
          {formCorrectionStatus === 'corrected' && isViewOnly && (
            <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-md p-2 mb-2 text-center text-sm text-orange-800 dark:text-orange-200" data-testid="banner-corrected">
              تم تصحيح هذا المستند
            </div>
          )}
          <fieldset className="peachtree-grid p-2 sticky top-0 z-50 bg-card">
            <legend className="text-xs font-semibold px-1">بيانات إذن الاستلام</legend>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 flex-1 min-w-[120px]">
                <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
                <Input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="اختياري"
                  className="h-7 text-[11px] px-1"
                  disabled={isViewOnly}
                  data-testid="input-notes"
                />
              </div>

              <div className="flex items-center h-7">
                <Badge
                  variant={formStatus === "draft" ? "outline" : "default"}
                  className={`text-[9px] ${formStatus !== "draft" ? "bg-green-600 no-default-hover-elevate no-default-active-elevate" : ""}`}
                >
                  {receivingStatusLabels[formStatus as keyof typeof receivingStatusLabels] || formStatus}
                </Badge>
              </div>

              <div className="space-y-1 w-[120px]">
                <Label className="text-[10px] text-muted-foreground">تاريخ الاستلام</Label>
                <Input
                  type="date"
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                  className="h-7 text-[11px] px-1"
                  disabled={isViewOnly}
                  data-testid="input-receive-date"
                />
              </div>

              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label className="text-[10px] text-muted-foreground">المستودع *</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId} disabled={isViewOnly}>
                  <SelectTrigger className="h-7 text-[11px] px-1" data-testid="select-receiving-warehouse">
                    <SelectValue placeholder="اختر المستودع" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.warehouseCode} - {w.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 w-[160px]">
                <Label className="text-[10px] text-muted-foreground">رقم فاتورة المورد *</Label>
                <Input
                  type="text"
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  placeholder="رقم الفاتورة"
                  className={`h-7 text-[11px] px-1 ${invoiceDuplicateError ? "border-destructive" : ""}`}
                  disabled={isViewOnly}
                  data-testid="input-supplier-invoice"
                />
                {invoiceDuplicateError && (
                  <span className="text-[9px] text-destructive flex items-center gap-0.5">
                    <AlertTriangle className="h-3 w-3" />
                    {invoiceDuplicateError}
                  </span>
                )}
              </div>

              <div className="space-y-1 flex-1 min-w-[200px] relative">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  المورد *
                  {!isViewOnly && (
                    <Button variant="outline" size="sm" className="text-[9px] gap-0.5 px-1 h-4" onClick={() => setShowQuickSupplierDialog(true)} data-testid="button-quick-add-supplier">
                      <Plus className="h-2.5 w-2.5" />
                      إضافة مورد
                    </Button>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    ref={supplierSearchRef}
                    type="text"
                    value={supplierSearchText}
                    onChange={(e) => {
                      handleSupplierSearchChange(e.target.value);
                      if (selectedSupplier) {
                        setSelectedSupplier(null);
                        setSupplierId("");
                      }
                    }}
                    onKeyDown={handleSupplierKeyDown}
                    onFocus={() => {
                      if (supplierResults.length > 0) setSupplierDropdownOpen(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setSupplierDropdownOpen(false), 400);
                    }}
                    placeholder="ابحث بالكود أو الاسم..."
                    className="h-7 text-[11px] px-1"
                    disabled={isViewOnly}
                    data-testid="select-supplier"
                  />
                  {supplierSearchLoading && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                {supplierDropdownOpen && supplierResults.length > 0 && (
                  <div className="absolute top-full right-0 left-0 z-50 bg-card border rounded-md shadow-lg max-h-[200px] overflow-auto mt-1">
                    {supplierResults.map((s, idx) => (
                      <div
                        key={s.id}
                        className={`px-2 py-1.5 text-[11px] cursor-pointer hover:bg-muted/50 ${idx === supplierHighlightIdx ? "bg-muted" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => {
                          selectSupplier(s);
                        }}
                        data-testid={`supplier-option-${s.id}`}
                      >
                        <span className="font-mono text-muted-foreground">{s.code}</span> - {s.nameAr} {s.nameEn ? `(${s.nameEn})` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 w-[100px]">
                <Label className="text-[10px] text-muted-foreground">رقم الإذن</Label>
                <Input
                  type="text"
                  value={formReceivingNumber ? String(formReceivingNumber) : "تلقائي"}
                  readOnly
                  className="h-7 text-[11px] px-1 bg-muted/30"
                  data-testid="input-receiving-number"
                />
              </div>
            </div>
          </fieldset>

          {!isViewOnly && (
            <div className="flex items-center gap-2 px-2">
              <ScanBarcode className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && barcodeInput.trim()) {
                    e.preventDefault();
                    handleBarcodeScan(barcodeInput);
                  }
                }}
                placeholder="امسح الباركود هنا..."
                className="h-7 text-[11px] px-2 max-w-[300px]"
                disabled={barcodeLoading}
                data-testid="input-barcode-scan"
              />
              {barcodeLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
          )}

          {lineErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-2 mb-2 text-center text-sm text-red-800 dark:text-red-200" data-testid="banner-validation-errors">
              لا يمكن حفظ الإذن: تأكد من سعر البيع وتاريخ الصلاحية للأصناف المطلوبة
            </div>
          )}
          <fieldset className="peachtree-grid p-2">
            <legend className="text-xs font-semibold px-1">أصناف الاستلام</legend>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" dir="rtl" data-testid="table-receiving-lines">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th className="py-1 px-2 text-right font-bold whitespace-nowrap">#</th>
                    <th className="py-1 px-2 text-right font-bold text-[13px]">الصنف</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">الوحدة</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">الكمية</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">هدية</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">سعر البيع</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">الصلاحية</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">رقم التشغيلة</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">آخر شراء</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">آخر بيع</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">رصيد المخزن</th>
                    <th className="py-1 px-2 text-center whitespace-nowrap">إحصاء</th>
                    <th className="py-1 px-2 text-center whitespace-nowrap">تنبيه</th>
                    {!isViewOnly && <th className="py-1 px-2 text-center whitespace-nowrap">حذف</th>}
                  </tr>
                </thead>
                <tbody>
                  {formLines.length > 0 ? (
                    formLines.map((line, idx) => (
                      <tr
                        key={line.id}
                        className={`peachtree-grid-row ${focusedLineIdx === idx ? "ring-1 ring-blue-300 dark:ring-blue-700" : ""}`}
                        data-testid={`row-line-${idx}`}
                      >
                        <td className="py-0.5 px-2 text-muted-foreground">{idx + 1}</td>
                        <td className="py-1 px-2" title={`${line.item?.nameAr || ""} — ${line.item?.itemCode || ""}`}>
                          <div className="leading-tight">
                            <span className="text-foreground font-bold" style={{ fontSize: "13px", wordBreak: "break-word" }}>
                              {line.item?.nameAr || "—"}
                            </span>
                            <div className="text-[10px] text-muted-foreground font-mono">{line.item?.itemCode || ""}</div>
                          </div>
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap">
                          {isViewOnly ? (
                            getUnitName(line.item, line.unitLevel)
                          ) : (
                            <select
                              value={line.unitLevel}
                              onChange={(e) => updateLine(idx, { unitLevel: e.target.value })}
                              className="h-6 text-[11px] px-0.5 border rounded bg-transparent"
                              data-testid={`select-unit-${idx}`}
                            >
                              {line.item?.majorUnitName && <option value="major">{line.item.majorUnitName}</option>}
                              {line.item?.mediumUnitName && <option value="medium">{line.item.mediumUnitName}</option>}
                              <option value="minor">{line.item?.minorUnitName || "وحدة صغرى"}</option>
                            </select>
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap">
                          {isViewOnly ? (
                            <span data-testid={`text-qty-${idx}`}>{line.qtyEntered}</span>
                          ) : (
                            <input
                              ref={(el) => {
                                if (el) qtyInputRefs.current.set(idx, el);
                                else qtyInputRefs.current.delete(idx);
                              }}
                              type="number"
                              value={line.qtyEntered}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) updateLine(idx, { qtyEntered: val });
                              }}
                              onFocus={(e) => {
                                lineFieldFocusedRef.current = true;
                                setFocusedLineIdx(idx);
                                e.target.select();
                              }}
                              onBlur={() => {
                                lineFieldFocusedRef.current = false;
                                setFocusedLineIdx(null);
                                if (line.qtyEntered <= 0) {
                                  updateLine(idx, { qtyEntered: 1 });
                                }
                              }}
                              className="w-[70px] h-6 text-[12px] px-1 border rounded text-center bg-transparent focus:border-blue-400 dark:focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              data-testid={`input-qty-${idx}`}
                              min="0"
                              step="any"
                            />
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap">
                          {isViewOnly ? (
                            <span>{line.bonusQty}</span>
                          ) : (
                            <input
                              type="number"
                              value={line.bonusQty || ""}
                              onChange={(e) => updateLine(idx, { bonusQty: parseFloat(e.target.value) || 0 })}
                              onFocus={() => { lineFieldFocusedRef.current = true; }}
                              onBlur={() => { lineFieldFocusedRef.current = false; }}
                              className="w-[55px] h-6 text-[11px] px-1 border rounded text-center bg-transparent"
                              placeholder="0"
                              min="0"
                              step="any"
                              data-testid={`input-bonus-qty-${idx}`}
                            />
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap">
                          {isViewOnly ? (
                            <span>{line.salePrice != null ? line.salePrice.toFixed(2) : "—"}</span>
                          ) : (
                            <input
                              ref={(el) => {
                                if (el) salePriceInputRefs.current.set(idx, el);
                                else salePriceInputRefs.current.delete(idx);
                              }}
                              type="number"
                              value={line.salePrice ?? ""}
                              onChange={(e) => updateLine(idx, { salePrice: e.target.value ? parseFloat(e.target.value) : null })}
                              onFocus={() => { lineFieldFocusedRef.current = true; }}
                              onBlur={() => { lineFieldFocusedRef.current = false; }}
                              className={`w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent text-center ${lineErrors.some(e => e.lineIndex === idx && e.field === "salePrice") ? "border-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
                              placeholder="0.00"
                              min="0"
                              step="any"
                              data-testid={`input-sale-price-${idx}`}
                            />
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap"
                            onFocusCapture={() => { lineFieldFocusedRef.current = true; }}
                            onBlurCapture={() => { lineFieldFocusedRef.current = false; }}
                        >
                          {isViewOnly ? (
                            <span>{line.expiryMonth && line.expiryYear ? `${String(line.expiryMonth).padStart(2, '0')}/${line.expiryYear}` : "—"}</span>
                          ) : (
                            <div
                              ref={(el) => {
                                if (el) expiryInputRefs.current.set(idx, el);
                                else expiryInputRefs.current.delete(idx);
                              }}
                              className={lineErrors.some(e => e.lineIndex === idx && e.field === "expiry") ? "[&_input]:border-red-500 [&_input]:bg-red-50 dark:[&_input]:bg-red-900/20" : ""}
                            >
                              <ExpiryInput
                                expiryMonth={line.expiryMonth}
                                expiryYear={line.expiryYear}
                                onChange={(month, year) => updateLine(idx, { expiryMonth: month, expiryYear: year })}
                                disabled={isViewOnly || !line.item?.hasExpiry}
                                data-testid={`input-expiry-${idx}`}
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap">
                          {isViewOnly ? (
                            <span>{line.batchNumber || "—"}</span>
                          ) : (
                            <input
                              type="text"
                              value={line.batchNumber}
                              onChange={(e) => updateLine(idx, { batchNumber: e.target.value })}
                              onFocus={() => { lineFieldFocusedRef.current = true; }}
                              onBlur={() => { lineFieldFocusedRef.current = false; }}
                              className="w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent"
                              placeholder={line.item?.hasBatch ? "مطلوب" : "—"}
                              data-testid={`input-batch-${idx}`}
                            />
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap text-muted-foreground font-mono text-[10px]">
                          {line.lastPurchasePriceHint != null ? line.lastPurchasePriceHint.toFixed(2) : "—"}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap text-muted-foreground font-mono text-[10px]">
                          {line.lastSalePriceHint != null ? line.lastSalePriceHint.toFixed(2) : "—"}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap text-muted-foreground font-mono text-[10px]">
                          {line.onHandInWarehouse}
                        </td>
                        <td className="py-0.5 px-2 text-center">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openStats(line.itemId)}
                            data-testid={`button-stats-${idx}`}
                          >
                            <BarChart3 className="h-3 w-3" />
                          </Button>
                        </td>
                        <td className="py-0.5 px-2 text-center whitespace-nowrap">
                          <div className="flex gap-0.5 items-center justify-center">
                            {line.salePrice != null && line.lastSalePriceHint != null && line.lastSalePriceHint > 0 && 
                             Math.abs(line.salePrice - line.lastSalePriceHint) > 0.01 && (
                              <span title={`سعر البيع (${line.salePrice}) يختلف عن آخر سعر (${line.lastSalePriceHint})`} className="text-orange-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                            {line.expiryMonth && line.expiryYear && (() => {
                              const now = new Date();
                              const monthsUntilExpiry = (line.expiryYear - now.getFullYear()) * 12 + (line.expiryMonth - (now.getMonth() + 1));
                              return monthsUntilExpiry <= 6 && monthsUntilExpiry >= 0;
                            })() && (
                              <span title="صلاحية قريبة (أقل من 6 أشهر)" className="text-red-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </td>
                        {!isViewOnly && (
                          <td className="py-0.5 px-2 text-center">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteLine(idx)}
                              data-testid={`button-delete-line-${idx}`}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isViewOnly ? 13 : 14} className="py-4 text-center text-muted-foreground">
                        لا توجد أصناف - اضغط "إضافة صنف" أو امسح الباركود
                      </td>
                    </tr>
                  )}
                </tbody>
                {formLines.length > 0 && (
                  <tfoot>
                    <tr className="border-t font-bold">
                      <td colSpan={3} className="py-1 px-2 text-left">إجمالي الأصناف</td>
                      <td className="py-1 px-2 font-mono">{formLines.length}</td>
                      <td colSpan={isViewOnly ? 9 : 10}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </fieldset>

          {!isViewOnly && (
            <div className="flex items-center gap-2 flex-wrap no-print">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(true)}
                data-testid="button-add-item"
              >
                <Plus className="h-3 w-3 ml-1" />
                إضافة صنف
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canSaveDraft || isPending}
                onClick={() => saveDraftMutation.mutate()}
                data-testid="button-save-draft"
              >
                {saveDraftMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
                حفظ مسودة
              </Button>
              {autoSaveStatus === "saving" && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid="text-auto-save-status">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  جاري الحفظ التلقائي...
                </span>
              )}
              {autoSaveStatus === "saved" && (
                <span className="text-[10px] text-green-600 flex items-center gap-1" data-testid="text-auto-save-status">
                  <Check className="h-3 w-3" />
                  تم الحفظ التلقائي
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={!canSaveDraft || isPending}
                onClick={() => setConfirmPostOpen(true)}
                data-testid="button-post-receiving"
              >
                {postReceivingMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Send className="h-3 w-3 ml-1" />}
                ترحيل
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetForm}
                data-testid="button-new-receiving"
              >
                <Plus className="h-3 w-3 ml-1" />
                جديد
              </Button>
              {formLines.length > 0 && (
                <span className="text-[10px] text-muted-foreground mr-auto">
                  {formLines.length} صنف
                </span>
              )}
            </div>
          )}
          {isViewOnly && (
            <div className="flex items-center gap-2 flex-wrap no-print">
              <Button
                variant="outline"
                size="sm"
                onClick={resetForm}
                data-testid="button-new-receiving"
              >
                <Plus className="h-3 w-3 ml-1" />
                إذن جديد
              </Button>
              {formStatus === "posted_qty_only" && !formConvertedToInvoiceId && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={convertToInvoiceMutation.isPending}
                  onClick={() => editingReceivingId && handleConvertToInvoice(editingReceivingId)}
                  data-testid="button-form-convert-to-invoice"
                >
                  {convertToInvoiceMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <FileText className="h-3 w-3 ml-1" />}
                  تحويل إلى فاتورة شراء
                </Button>
              )}
              {formStatus === "posted_qty_only" && formCorrectionStatus !== 'corrected' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={correctReceivingMutation.isPending}
                  onClick={() => editingReceivingId && correctReceivingMutation.mutate(editingReceivingId)}
                  data-testid="button-form-correct"
                >
                  {correctReceivingMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <RotateCcw className="h-3 w-3 ml-1" />}
                  تصحيح
                </Button>
              )}
              {formConvertedToInvoiceId && (
                <Badge variant="default" className="text-[9px] bg-blue-600 no-default-hover-elevate no-default-active-elevate">تم التحويل إلى فاتورة شراء</Badge>
              )}
              {formLines.length > 0 && (
                <span className="text-[10px] text-muted-foreground mr-auto">
                  {formLines.length} صنف
                </span>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">بحث عن صنف</DialogTitle>
            <DialogDescription className="text-[10px]">ابحث بالاسم أو الكود أو الباركود</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="text"
                value={modalSearchText}
                onChange={(e) => handleModalSearchTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    doModalSearch();
                  }
                }}
                placeholder="ابحث بالاسم أو الكود..."
                className="h-7 text-[11px] px-1 flex-1 min-w-[150px]"
                data-testid="modal-search-text"
                ref={modalSearchInputRef}
                autoFocus
              />
              <Button size="sm" onClick={() => doModalSearch()} disabled={modalSearching} data-testid="button-modal-search">
                {modalSearching ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Search className="h-3 w-3 ml-1" />}
                بحث
              </Button>
            </div>

            <div className="border rounded-md overflow-auto max-h-[300px]" data-testid="modal-results-grid">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0">
                  <tr className="peachtree-grid-header">
                    <th className="py-1 px-2 text-right font-medium">الكود</th>
                    <th className="py-1 px-2 text-right font-medium">اسم الصنف</th>
                    <th className="py-1 px-2 text-right font-medium">الفئة</th>
                    <th className="py-1 px-2 text-center font-medium">اختيار</th>
                  </tr>
                </thead>
                <tbody>
                  {modalResults.length > 0 ? (
                    modalResults.map((item) => (
                      <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50">
                        <td className="py-1 px-2 font-mono">{item.itemCode}</td>
                        <td className="py-1 px-2">
                          {item.nameAr}
                          {" "}
                          <span className="text-[9px] text-muted-foreground">
                            ({item.majorUnitName || item.minorUnitName || "—"})
                          </span>
                        </td>
                        <td className="py-1 px-2">{item.category === "drug" ? "دواء" : item.category === "supply" ? "مستلزمات" : "خدمة"}</td>
                        <td className="py-1 px-2 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleModalSelectItem(item)}
                            data-testid={`button-select-item-${item.id}`}
                          >
                            <Check className="h-3 w-3 ml-1" />
                            اختيار
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground">
                        {modalSearching ? "جاري البحث..." : "ابدأ البحث للعثور على أصناف"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} data-testid="button-close-modal">
              <X className="h-3 w-3 ml-1" />
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmPostOpen} onOpenChange={setConfirmPostOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">تأكيد الترحيل</DialogTitle>
            <DialogDescription className="text-[11px]">
              هل أنت متأكد من ترحيل إذن الاستلام؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmPostOpen(false)}
              data-testid="button-cancel-post"
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={postReceivingMutation.isPending}
              onClick={() => postReceivingMutation.mutate()}
              data-testid="button-confirm-post"
            >
              {postReceivingMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Send className="h-3 w-3 ml-1" />}
              تأكيد الترحيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statsItemId} onOpenChange={(open) => !open && setStatsItemId(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إحصاء المخزون</DialogTitle>
            <DialogDescription>الكميات المتاحة في جميع المستودعات</DialogDescription>
          </DialogHeader>
          {statsLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : statsData.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">لا يوجد مخزون</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {statsData.map((wh: any, i: number) => (
                <div key={i} className="border rounded p-2 text-[12px]">
                  <div className="font-bold">{wh.warehouseCode} - {wh.warehouseName}</div>
                  <div>الكمية: <span className="font-mono">{parseFloat(wh.qtyMinor).toFixed(2)}</span></div>
                  {wh.expiryBreakdown && wh.expiryBreakdown.length > 0 && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {wh.expiryBreakdown.map((eb: any, j: number) => (
                        <div key={j}>
                          {eb.expiryMonth && eb.expiryYear ? `${String(eb.expiryMonth).padStart(2,'0')}/${eb.expiryYear}` : "بدون صلاحية"}: {parseFloat(eb.qty).toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showQuickSupplierDialog} onOpenChange={setShowQuickSupplierDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">إضافة مورد سريع</DialogTitle>
            <DialogDescription className="text-[10px]">أدخل بيانات المورد الأساسية</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[10px]">كود المورد *</Label>
              <Input
                value={quickSupplierCode}
                onChange={(e) => setQuickSupplierCode(e.target.value)}
                placeholder="مثال: SUP001"
                className="h-7 text-[11px] px-1"
                dir="ltr"
                data-testid="input-quick-supplier-code"
              />
            </div>
            <div>
              <Label className="text-[10px]">اسم المورد *</Label>
              <Input
                value={quickSupplierNameAr}
                onChange={(e) => setQuickSupplierNameAr(e.target.value)}
                placeholder="اسم المورد بالعربي"
                className="h-7 text-[11px] px-1"
                data-testid="input-quick-supplier-name"
              />
            </div>
            <div>
              <Label className="text-[10px]">الهاتف</Label>
              <Input
                value={quickSupplierPhone}
                onChange={(e) => setQuickSupplierPhone(e.target.value)}
                placeholder="اختياري"
                className="h-7 text-[11px] px-1"
                dir="ltr"
                data-testid="input-quick-supplier-phone"
              />
            </div>
            <div>
              <Label className="text-[10px]">نوع المورد *</Label>
              <select
                value={quickSupplierType}
                onChange={(e) => setQuickSupplierType(e.target.value)}
                className="w-full h-7 text-[11px] px-1 border rounded-md bg-background"
                data-testid="select-quick-supplier-type"
              >
                <option value="drugs">أدوية</option>
                <option value="consumables">مستلزمات</option>
              </select>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowQuickSupplierDialog(false)} data-testid="button-cancel-quick-supplier">
              إلغاء
            </Button>
            <Button size="sm" onClick={handleQuickSupplierSave} disabled={quickSupplierMutation.isPending} data-testid="button-save-quick-supplier">
              {quickSupplierMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
