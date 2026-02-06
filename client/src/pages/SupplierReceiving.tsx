import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Search, Package, Trash2, Send, Save, Plus, ChevronLeft, ChevronRight, Eye, X, ScanBarcode, Truck, AlertTriangle, Check, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateShort } from "@/lib/formatters";
import type { Warehouse, Item, Supplier, ReceivingHeaderWithDetails } from "@shared/schema";
import { receivingStatusLabels } from "@shared/schema";

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
  onHandInWarehouse: string;
  notes: string;
  isRejected: boolean;
  rejectionReason: string;
}

function calculateQtyInMinor(qtyEntered: number, unitLevel: string, item: any): number {
  if (unitLevel === "major" && item.majorToMinor) return qtyEntered * parseFloat(item.majorToMinor);
  if (unitLevel === "medium" && item.mediumToMinor) return qtyEntered * parseFloat(item.mediumToMinor);
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
  const today = new Date().toISOString().split("T")[0];

  const [activeTab, setActiveTab] = useState<string>("log");

  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState("");
  const [filterWarehouseId, setFilterWarehouseId] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
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
  const supplierSearchRef = useRef<HTMLInputElement>(null);
  const supplierDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const [editingQtyIndex, setEditingQtyIndex] = useState<number | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState<string>("");
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const qtyConfirmedViaEnterRef = useRef(false);

  const [confirmPostOpen, setConfirmPostOpen] = useState(false);

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

  const buildLogQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", logPage.toString());
    params.set("pageSize", logPageSize.toString());
    if (filterFromDate) params.set("fromDate", filterFromDate);
    if (filterToDate) params.set("toDate", filterToDate);
    if (filterSupplierId && filterSupplierId !== "all") params.set("supplierId", filterSupplierId);
    if (filterWarehouseId && filterWarehouseId !== "all") params.set("warehouseId", filterWarehouseId);
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    if (filterSearch) params.set("search", filterSearch);
    return params.toString();
  };

  const { data: receivingsData, isLoading: receivingsLoading } = useQuery<{ data: ReceivingHeaderWithDetails[]; total: number }>({
    queryKey: ["/api/receivings", logPage, filterFromDate, filterToDate, filterSupplierId, filterWarehouseId, filterStatus, filterSearch],
    queryFn: async () => {
      const res = await fetch(`/api/receivings?${buildLogQueryString()}`);
      if (!res.ok) throw new Error("Failed to fetch receivings");
      return res.json();
    },
  });

  const receivings = receivingsData?.data || [];
  const totalReceivings = receivingsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalReceivings / logPageSize));

  const handleFilterSearch = () => {
    setLogPage(1);
    queryClient.invalidateQueries({ queryKey: ["/api/receivings"] });
  };

  const handleSupplierSearch = useCallback(async (text: string) => {
    if (!text.trim()) {
      setSupplierResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/suppliers?search=${encodeURIComponent(text)}&page=1&pageSize=50`);
      if (res.ok) {
        const data = await res.json();
        setSupplierResults(data.suppliers || data.data || []);
        setSupplierDropdownOpen(true);
      }
    } catch {
      setSupplierResults([]);
    }
  }, []);

  const handleSupplierSearchChange = (val: string) => {
    setSupplierSearchText(val);
    if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current);
    supplierDebounceRef.current = setTimeout(() => {
      handleSupplierSearch(val);
    }, 250);
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
    setEditingQtyIndex(null);
    setEditingQtyValue("");
    setInvoiceDuplicateError("");
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

  const isViewOnly = formStatus === "posted";

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
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

  const isPending = saveDraftMutation.isPending || postReceivingMutation.isPending;

  const updateLine = useCallback((index: number, updates: Partial<ReceivingLineLocal>) => {
    setFormLines((prev) => {
      const copy = [...prev];
      const line = { ...copy[index], ...updates };
      if ("qtyEntered" in updates || "unitLevel" in updates) {
        const qty = updates.qtyEntered ?? line.qtyEntered;
        const unitLvl = updates.unitLevel ?? line.unitLevel;
        line.qtyEntered = qty;
        line.qtyInMinor = calculateQtyInMinor(qty, unitLvl, line.item);
        line.unitLevel = unitLvl;
      }
      copy[index] = line;
      return copy;
    });
  }, []);

  const handleDeleteLine = (index: number) => {
    if (editingQtyIndex === index) {
      setEditingQtyIndex(null);
    } else if (editingQtyIndex !== null && editingQtyIndex > index) {
      setEditingQtyIndex(editingQtyIndex - 1);
    }
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQtyConfirm = useCallback((index: number) => {
    const line = formLines[index];
    if (!line) return;
    const qtyEntered = parseFloat(editingQtyValue) || 0;
    if (qtyEntered <= 0) {
      toast({ title: "كمية غير صحيحة", variant: "destructive" });
      setTimeout(() => qtyInputRef.current?.focus(), 50);
      return;
    }

    setEditingQtyIndex(null);
    updateLine(index, { qtyEntered });
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }, [formLines, editingQtyValue, toast, updateLine]);

  const handleBarcodeScan = useCallback(async (barcodeValue: string) => {
    if (!barcodeValue.trim() || barcodeLoading) return;

    if (editingQtyIndex !== null) {
      handleQtyConfirm(editingQtyIndex);
    }

    setBarcodeLoading(true);
    try {
      const resolveRes = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(barcodeValue.trim())}`);
      if (!resolveRes.ok) throw new Error("فشل البحث");
      const resolved = await resolveRes.json();
      if (!resolved.found) {
        toast({ title: "باركود غير معروف", description: barcodeValue, variant: "destructive" });
        return;
      }

      const searchRes = await fetch(`/api/items/search?warehouseId=${warehouseId || ""}&mode=CODE&q=${encodeURIComponent(resolved.itemCode)}&page=1&pageSize=1&includeZeroStock=true&drugsOnly=false`);
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
        onHandInWarehouse: hints?.onHandMinor || "0",
        notes: "",
        isRejected: false,
        rejectionReason: "",
      };

      setFormLines((prev) => {
        const updated = [...prev, newLine];
        const newIndex = updated.length - 1;
        setTimeout(() => {
          setEditingQtyIndex(newIndex);
          setEditingQtyValue("1");
          setTimeout(() => qtyInputRef.current?.focus(), 50);
        }, 0);
        return updated;
      });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setBarcodeLoading(false);
      setBarcodeInput("");
    }
  }, [barcodeLoading, toast, editingQtyIndex, handleQtyConfirm, supplierId, warehouseId, fetchHints]);

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
    setTimeout(() => modalSearchInputRef.current?.focus(), 50);
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
        if (editingQtyIndex !== null) {
          setEditingQtyIndex(null);
        }
        barcodeInputRef.current?.focus();
      }
      if (e.key === "Escape" && editingQtyIndex !== null) {
        e.preventDefault();
        setEditingQtyIndex(null);
        setEditingQtyValue("");
        setTimeout(() => barcodeInputRef.current?.focus(), 50);
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [editingQtyIndex]);

  useEffect(() => {
    if (activeTab === "form" && !modalOpen && editingQtyIndex === null) {
      const timer = setTimeout(() => barcodeInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, modalOpen, editingQtyIndex]);

  const handleFormContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-testid='input-qty-edit']")) return;
    if (target.closest("button")) return;
    if (target.closest("input")) return;
    if (target.closest("select")) return;
    if (target.closest("[role='dialog']")) return;
    if (target.closest("[role='listbox']")) return;
    if (editingQtyIndex === null && !modalOpen) {
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  }, [editingQtyIndex, modalOpen]);

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <Truck className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold text-foreground">استلام الموردين</h1>
        <span className="text-xs text-muted-foreground">|</span>
        <span className="text-xs text-muted-foreground">إدارة أذونات الاستلام من الموردين</span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-2 no-print">
          <TabsTrigger value="log" data-testid="tab-log">السجل</TabsTrigger>
          <TabsTrigger value="form" data-testid="tab-form">إذن استلام</TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-2">
          <div className="peachtree-toolbar flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground whitespace-nowrap">تاريخ من</Label>
              <Input
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className="h-7 text-[11px] px-1 w-[120px]"
                data-testid="filter-from-date"
              />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground whitespace-nowrap">تاريخ إلى</Label>
              <Input
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="h-7 text-[11px] px-1 w-[120px]"
                data-testid="filter-to-date"
              />
            </div>
            <Select value={filterSupplierId} onValueChange={setFilterSupplierId}>
              <SelectTrigger className="h-7 text-[11px] px-1 w-[140px]" data-testid="filter-supplier">
                <SelectValue placeholder="المورد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {allSuppliers?.suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterWarehouseId} onValueChange={setFilterWarehouseId}>
              <SelectTrigger className="h-7 text-[11px] px-1 w-[140px]" data-testid="filter-warehouse">
                <SelectValue placeholder="المستودع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {warehouses?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-7 text-[11px] px-1 w-[100px]" data-testid="filter-status">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="posted">مُرحّل</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFilterSearch()}
              placeholder="بحث نصي..."
              className="h-7 text-[11px] px-1 w-[140px]"
              data-testid="filter-search"
            />
            <Button size="sm" onClick={handleFilterSearch} data-testid="button-filter-search">
              <Search className="h-3 w-3 ml-1" />
              بحث
            </Button>
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
                              {r.status === "posted" ? (
                                <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">
                                  {receivingStatusLabels[r.status] || r.status}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px]">
                                  {receivingStatusLabels[r.status] || r.status}
                                </Badge>
                              )}
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
          <fieldset className="peachtree-grid p-2 sticky top-0 z-50 bg-card">
            <legend className="text-xs font-semibold px-1">بيانات إذن الاستلام</legend>
            <div className="flex flex-wrap items-end gap-2">
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

              <div className="space-y-1 flex-1 min-w-[200px] relative">
                <Label className="text-[10px] text-muted-foreground">المورد *</Label>
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
                  onFocus={() => {
                    if (supplierResults.length > 0) setSupplierDropdownOpen(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setSupplierDropdownOpen(false), 400);
                  }}
                  placeholder="ابحث عن المورد..."
                  className="h-7 text-[11px] px-1"
                  disabled={isViewOnly}
                  data-testid="select-supplier"
                />
                {supplierDropdownOpen && supplierResults.length > 0 && (
                  <div className="absolute top-full right-0 left-0 z-50 bg-card border rounded-md shadow-lg max-h-[200px] overflow-auto mt-1">
                    {supplierResults.map((s) => (
                      <div
                        key={s.id}
                        className="px-2 py-1.5 text-[11px] cursor-pointer hover:bg-muted/50"
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => {
                          selectSupplier(s);
                        }}
                        data-testid={`supplier-option-${s.id}`}
                      >
                        {s.code} - {s.nameAr}
                      </div>
                    ))}
                  </div>
                )}
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

              <div className="flex items-center h-7">
                {formStatus === "posted" ? (
                  <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">مُرحّل</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px]">مسودة</Badge>
                )}
              </div>

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
                    <th className="py-1 px-2 text-right whitespace-nowrap">سعر البيع</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">الصلاحية</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">رقم التشغيلة</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">آخر شراء</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">آخر بيع</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">رصيد المخزن</th>
                    <th className="py-1 px-2 text-center whitespace-nowrap">إحصاء</th>
                    {!isViewOnly && <th className="py-1 px-2 text-center whitespace-nowrap">حذف</th>}
                  </tr>
                </thead>
                <tbody>
                  {formLines.length > 0 ? (
                    formLines.map((line, idx) => (
                      <tr
                        key={line.id}
                        className={`peachtree-grid-row ${editingQtyIndex === idx ? "ring-1 ring-blue-300 dark:ring-blue-700" : ""}`}
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
                          {editingQtyIndex === idx ? (
                            <input
                              ref={qtyInputRef}
                              type="number"
                              value={editingQtyValue}
                              onChange={(e) => setEditingQtyValue(e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  qtyConfirmedViaEnterRef.current = true;
                                  handleQtyConfirm(idx);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEditingQtyIndex(null);
                                  setEditingQtyValue("");
                                  setTimeout(() => barcodeInputRef.current?.focus(), 50);
                                }
                              }}
                              onBlur={() => {
                                if (qtyConfirmedViaEnterRef.current) {
                                  qtyConfirmedViaEnterRef.current = false;
                                  return;
                                }
                                handleQtyConfirm(idx);
                              }}
                              className="w-[70px] h-6 text-[12px] px-1 border-2 border-blue-400 dark:border-blue-600 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                              data-testid="input-qty-edit"
                              min="0"
                              step="any"
                            />
                          ) : (
                            <span
                              className={`cursor-pointer ${!isViewOnly ? "hover:text-blue-600 dark:hover:text-blue-400" : ""}`}
                              onClick={() => {
                                if (!isViewOnly) {
                                  setEditingQtyIndex(idx);
                                  setEditingQtyValue(String(line.qtyEntered));
                                  setTimeout(() => qtyInputRef.current?.focus(), 50);
                                }
                              }}
                              data-testid={`text-qty-${idx}`}
                            >
                              {line.qtyEntered}
                            </span>
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap">
                          {isViewOnly ? (
                            <span>{line.salePrice != null ? line.salePrice.toFixed(2) : "—"}</span>
                          ) : (
                            <input
                              type="number"
                              value={line.salePrice ?? ""}
                              onChange={(e) => updateLine(idx, { salePrice: e.target.value ? parseFloat(e.target.value) : null })}
                              className="w-[80px] h-6 text-[11px] px-1 border rounded bg-transparent text-center"
                              placeholder="0.00"
                              min="0"
                              step="any"
                              data-testid={`input-sale-price-${idx}`}
                            />
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap">
                          {isViewOnly ? (
                            <span>{line.expiryMonth && line.expiryYear ? `${String(line.expiryMonth).padStart(2, '0')}/${line.expiryYear}` : "—"}</span>
                          ) : (
                            <div className="flex gap-0.5 items-center">
                              <select
                                value={line.expiryMonth || ""}
                                onChange={(e) => updateLine(idx, { expiryMonth: e.target.value ? parseInt(e.target.value) : null })}
                                className="h-6 text-[10px] w-[45px] border rounded bg-transparent"
                                data-testid={`select-expiry-month-${idx}`}
                              >
                                <option value="">شهر</option>
                                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
                              </select>
                              <span className="text-muted-foreground text-[10px]">/</span>
                              <input
                                type="number"
                                value={line.expiryYear || ""}
                                onChange={(e) => updateLine(idx, { expiryYear: e.target.value ? parseInt(e.target.value) : null })}
                                className="h-6 text-[10px] w-[55px] border rounded bg-transparent text-center"
                                placeholder="سنة"
                                min="2024"
                                max="2040"
                                data-testid={`input-expiry-year-${idx}`}
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
                      <td colSpan={isViewOnly ? 11 : 12} className="py-4 text-center text-muted-foreground">
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
                      <td colSpan={isViewOnly ? 7 : 8}></td>
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
                        <td className="py-1 px-2">{item.nameAr}</td>
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
    </div>
  );
}
