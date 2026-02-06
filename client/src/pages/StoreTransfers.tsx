import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeftRight, Loader2, AlertTriangle, Check, Search, Package, Trash2, Send, Save, Plus, ChevronLeft, ChevronRight, Eye, FileText, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateShort } from "@/lib/formatters";
import type { Warehouse, Item, StoreTransferWithDetails } from "@shared/schema";
import { transferStatusLabels } from "@shared/schema";

interface TransferLineLocal {
  id: string;
  itemId: string;
  item: any;
  unitLevel: string;
  qtyEntered: number;
  qtyInMinor: number;
  selectedExpiryDate: string | null;
  availableQtyMinor: string;
  notes: string;
}

interface ExpiryOption {
  expiryDate: string;
  qtyAvailableMinor: string;
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

function formatAvailability(availQtyMinor: string, unitLevel: string, item: any): string {
  const minorQty = parseFloat(availQtyMinor);
  if (isNaN(minorQty)) return "0";

  if (item && unitLevel === "major" && item.majorToMinor) {
    const factor = parseFloat(item.majorToMinor);
    if (factor > 0) {
      const wholeMajor = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - (wholeMajor * factor));
      if (remainderMinor > 0) {
        return `${wholeMajor} ${item.majorUnitName || ""} + ${remainderMinor} ${item.minorUnitName || ""}`;
      }
      return `${wholeMajor} ${item.majorUnitName || ""}`;
    }
  }

  if (item && unitLevel === "medium" && item.mediumToMinor) {
    const factor = parseFloat(item.mediumToMinor);
    if (factor > 0) {
      const wholeMed = Math.floor(minorQty / factor);
      const remainderMinor = Math.round(minorQty - (wholeMed * factor));
      if (remainderMinor > 0) {
        return `${wholeMed} ${item.mediumUnitName || ""} + ${remainderMinor} ${item.minorUnitName || ""}`;
      }
      return `${wholeMed} ${item.mediumUnitName || ""}`;
    }
  }

  return `${minorQty.toFixed(3)} ${item?.minorUnitName || "وحدة"}`;
}

export default function StoreTransfers() {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [activeTab, setActiveTab] = useState<string>("log");

  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterSourceWarehouse, setFilterSourceWarehouse] = useState("");
  const [filterDestWarehouse, setFilterDestWarehouse] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 20;

  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [transferDate, setTransferDate] = useState(today);
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<TransferLineLocal[]>([]);
  const [formStatus, setFormStatus] = useState<string>("draft");
  const [formTransferNumber, setFormTransferNumber] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearchMode, setModalSearchMode] = useState("AR");
  const [modalSearchText, setModalSearchText] = useState("");
  const [modalResults, setModalResults] = useState<any[]>([]);
  const [modalResultsTotal, setModalResultsTotal] = useState(0);
  const [modalSearching, setModalSearching] = useState(false);
  const [modalSelectedIndex, setModalSelectedIndex] = useState(0);
  const [modalUnit, setModalUnit] = useState("major");
  const [modalQty, setModalQty] = useState(1);
  const [modalExpiryOptions, setModalExpiryOptions] = useState<ExpiryOption[]>([]);
  const [modalSelectedExpiry, setModalSelectedExpiry] = useState<string>("");
  const [modalIncludeZeroStock, setModalIncludeZeroStock] = useState(false);
  const [modalDrugsOnly, setModalDrugsOnly] = useState(false);
  const [modalValidation, setModalValidation] = useState("");
  const [modalLoadingExpiry, setModalLoadingExpiry] = useState(false);

  const modalResultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalSearchInputRef = useRef<HTMLInputElement>(null);

  const [availPopupItemId, setAvailPopupItemId] = useState<string | null>(null);
  const [availPopupData, setAvailPopupData] = useState<any[] | null>(null);
  const [availPopupLoading, setAvailPopupLoading] = useState(false);
  const [availPopupPosition, setAvailPopupPosition] = useState<{top: number; left: number} | null>(null);
  const availPopupCache = useRef<Record<string, {data: any[]; ts: number}>>({});

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const buildLogQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", logPage.toString());
    params.set("pageSize", logPageSize.toString());
    if (filterFromDate) params.set("fromDate", filterFromDate);
    if (filterToDate) params.set("toDate", filterToDate);
    if (filterSourceWarehouse) params.set("sourceWarehouseId", filterSourceWarehouse);
    if (filterDestWarehouse) params.set("destWarehouseId", filterDestWarehouse);
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    if (filterSearch) params.set("search", filterSearch);
    return params.toString();
  };

  const { data: transfersData, isLoading: transfersLoading } = useQuery<{ data: StoreTransferWithDetails[]; total: number }>({
    queryKey: ["/api/transfers", logPage, filterFromDate, filterToDate, filterSourceWarehouse, filterDestWarehouse, filterStatus, filterSearch],
    queryFn: async () => {
      const res = await fetch(`/api/transfers?${buildLogQueryString()}`);
      if (!res.ok) throw new Error("Failed to fetch transfers");
      return res.json();
    },
  });

  const transfers = transfersData?.data || [];
  const totalTransfers = transfersData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalTransfers / logPageSize));

  const handleFilterSearch = () => {
    setLogPage(1);
    queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
  };

  const loadTransferForEditing = useCallback(async (transferId: string) => {
    try {
      const res = await fetch(`/api/transfers/${transferId}`);
      if (!res.ok) throw new Error("Failed to load transfer");
      const transfer: StoreTransferWithDetails = await res.json();

      setEditingTransferId(transfer.id);
      setTransferDate(transfer.transferDate);
      setSourceWarehouseId(transfer.sourceWarehouseId);
      setDestWarehouseId(transfer.destinationWarehouseId);
      setFormNotes(transfer.notes || "");
      setFormStatus(transfer.status);
      setFormTransferNumber(transfer.transferNumber);

      const loadedLines: TransferLineLocal[] = (transfer.lines || []).map((line) => ({
        id: crypto.randomUUID(),
        itemId: line.itemId,
        item: line.item || null,
        unitLevel: line.unitLevel,
        qtyEntered: parseFloat(line.qtyEntered as string),
        qtyInMinor: parseFloat(line.qtyInMinor as string),
        selectedExpiryDate: line.selectedExpiryDate || null,
        availableQtyMinor: line.availableAtSaveMinor as string || "0",
        notes: line.notes || "",
      }));
      setFormLines(loadedLines);
      setActiveTab("form");
    } catch (err: any) {
      toast({ title: "خطأ في تحميل التحويل", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        notes: formNotes || undefined,
        lines: formLines.map((l) => ({
          itemId: l.itemId,
          unitLevel: l.unitLevel,
          qtyEntered: String(l.qtyEntered),
          qtyInMinor: String(l.qtyInMinor),
          selectedExpiryDate: l.selectedExpiryDate || undefined,
          availableAtSaveMinor: l.availableQtyMinor || undefined,
          notes: l.notes || undefined,
        })),
      };
      return apiRequest("POST", "/api/transfers", payload);
    },
    onSuccess: () => {
      toast({ title: "تم حفظ المسودة بنجاح" });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في حفظ المسودة", description: error.message, variant: "destructive" });
    },
  });

  const postTransferMutation = useMutation({
    mutationFn: async () => {
      if (editingTransferId) {
        await apiRequest("POST", `/api/transfers/${editingTransferId}/post`);
        return;
      }
      const payload = {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        notes: formNotes || undefined,
        lines: formLines.map((l) => ({
          itemId: l.itemId,
          unitLevel: l.unitLevel,
          qtyEntered: String(l.qtyEntered),
          qtyInMinor: String(l.qtyInMinor),
          selectedExpiryDate: l.selectedExpiryDate || undefined,
          availableAtSaveMinor: l.availableQtyMinor || undefined,
          notes: l.notes || undefined,
        })),
      };
      const createRes = await apiRequest("POST", "/api/transfers", payload);
      const created = await createRes.json();
      await apiRequest("POST", `/api/transfers/${created.id}/post`);
    },
    onSuccess: () => {
      toast({ title: "تم ترحيل التحويل بنجاح" });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في ترحيل التحويل", description: error.message, variant: "destructive" });
    },
  });

  const postDraftMutation = useMutation({
    mutationFn: async (transferId: string) => {
      return apiRequest("POST", `/api/transfers/${transferId}/post`);
    },
    onSuccess: () => {
      toast({ title: "تم ترحيل التحويل بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في ترحيل التحويل", description: error.message, variant: "destructive" });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (transferId: string) => {
      return apiRequest("DELETE", `/api/transfers/${transferId}`);
    },
    onSuccess: () => {
      toast({ title: "تم حذف التحويل" });
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    },
    onError: (error: any) => {
      toast({ title: "خطأ في حذف التحويل", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setEditingTransferId(null);
    setTransferDate(today);
    setSourceWarehouseId("");
    setDestWarehouseId("");
    setFormNotes("");
    setFormLines([]);
    setFormStatus("draft");
    setFormTransferNumber(null);
  };

  const canSaveDraft =
    !!transferDate &&
    !!sourceWarehouseId &&
    !!destWarehouseId &&
    sourceWarehouseId !== destWarehouseId &&
    formLines.length > 0 &&
    formStatus === "draft";

  const isPending = saveDraftMutation.isPending || postTransferMutation.isPending;
  const isViewOnly = formStatus === "executed";

  const doModalSearch = useCallback(async () => {
    if (!modalSearchText.trim() || !sourceWarehouseId) return;
    setModalSearching(true);
    try {
      const params = new URLSearchParams({
        warehouseId: sourceWarehouseId,
        mode: modalSearchMode,
        q: modalSearchText,
        page: "1",
        pageSize: "50",
        includeZeroStock: modalIncludeZeroStock.toString(),
        drugsOnly: modalDrugsOnly.toString(),
      });
      const res = await fetch(`/api/items/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setModalResults(data.items || []);
        setModalResultsTotal(data.total || 0);
        setModalSelectedIndex(0);
        if (data.items && data.items.length > 0) {
          selectModalItem(data.items[0]);
        } else {
          resetModalDetails();
        }
      }
    } catch {
      setModalResults([]);
      setModalResultsTotal(0);
    } finally {
      setModalSearching(false);
    }
  }, [modalSearchText, sourceWarehouseId, modalSearchMode, modalIncludeZeroStock, modalDrugsOnly]);

  const resetModalDetails = () => {
    setModalUnit("major");
    setModalQty(1);
    setModalExpiryOptions([]);
    setModalSelectedExpiry("");
    setModalValidation("");
  };

  const selectModalItem = useCallback(async (item: any) => {
    const defaultUnit = getDefaultUnitLevel(item);
    setModalUnit(defaultUnit);
    setModalQty(1);
    setModalValidation("");

    if (item.hasExpiry) {
      setModalLoadingExpiry(true);
      try {
        const params = new URLSearchParams({
          warehouseId: sourceWarehouseId,
          asOfDate: transferDate,
        });
        const res = await fetch(`/api/items/${item.id}/expiry-options?${params.toString()}`);
        if (res.ok) {
          const options: ExpiryOption[] = await res.json();
          setModalExpiryOptions(options);
          if (options.length > 0) {
            setModalSelectedExpiry(options[0].expiryDate);
          } else {
            setModalSelectedExpiry("");
          }
        }
      } catch {
        setModalExpiryOptions([]);
        setModalSelectedExpiry("");
      } finally {
        setModalLoadingExpiry(false);
      }
    } else {
      setModalExpiryOptions([]);
      setModalSelectedExpiry("");
    }
  }, [sourceWarehouseId, transferDate]);

  const showAvailabilityPopup = useCallback(async (itemId: string, item: any, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setAvailPopupPosition({ top: rect.bottom + 4, left: rect.left });
    setAvailPopupItemId(itemId);

    const cached = availPopupCache.current[itemId];
    if (cached && Date.now() - cached.ts < 60000) {
      setAvailPopupData(cached.data);
      return;
    }

    setAvailPopupLoading(true);
    setAvailPopupData(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/items/${itemId}/availability-summary?asOfDate=${today}&excludeExpired=1`);
      if (res.ok) {
        const data = await res.json();
        setAvailPopupData(data);
        availPopupCache.current[itemId] = { data, ts: Date.now() };
      }
    } catch {
      setAvailPopupData([]);
    } finally {
      setAvailPopupLoading(false);
    }
  }, []);

  const closeAvailPopup = useCallback(() => {
    setAvailPopupItemId(null);
    setAvailPopupData(null);
    setAvailPopupPosition(null);
  }, []);

  const handleModalSearchTextChange = (val: string) => {
    setModalSearchText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim()) {
        doModalSearch();
      }
    }, 250);
  };

  const modalOpenPrev = useRef(false);
  useEffect(() => {
    if (modalOpen && !modalOpenPrev.current) {
      setModalSearchText("");
      setModalResults([]);
      setModalResultsTotal(0);
      setModalSelectedIndex(0);
      resetModalDetails();
    }
    modalOpenPrev.current = modalOpen;
  }, [modalOpen]);

  const selectedModalItem = modalResults[modalSelectedIndex] || null;

  useEffect(() => {
    if (!selectedModalItem) return;
    const qtyInMinor = calculateQtyInMinor(modalQty, modalUnit, selectedModalItem);

    if (selectedModalItem.hasExpiry && modalSelectedExpiry) {
      const expiryOpt = modalExpiryOptions.find((o) => o.expiryDate === modalSelectedExpiry);
      if (expiryOpt) {
        const available = parseFloat(expiryOpt.qtyAvailableMinor);
        if (qtyInMinor > available) {
          setModalValidation(`الكمية المطلوبة (${qtyInMinor}) تتجاوز المتاح (${available}) لهذه الصلاحية`);
          return;
        }
      }
    } else if (!selectedModalItem.hasExpiry) {
      const totalAvail = parseFloat(selectedModalItem.availableQtyMinor || "0");
      if (qtyInMinor > totalAvail) {
        setModalValidation(`الكمية المطلوبة (${qtyInMinor}) تتجاوز الرصيد المتاح (${totalAvail})`);
        return;
      }
    }
    setModalValidation("");
  }, [modalQty, modalUnit, selectedModalItem, modalSelectedExpiry, modalExpiryOptions]);

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setModalSelectedIndex((prev) => {
        const next = Math.min(prev + 1, modalResults.length - 1);
        selectModalItem(modalResults[next]);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setModalSelectedIndex((prev) => {
        const next = Math.max(prev - 1, 0);
        selectModalItem(modalResults[next]);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (modalResults.length > 0) {
        handleModalOk();
      }
    }
  };

  const handleModalOk = () => {
    if (!selectedModalItem) return;
    const qtyInMinor = calculateQtyInMinor(modalQty, modalUnit, selectedModalItem);

    if (selectedModalItem.hasExpiry && modalSelectedExpiry) {
      const expiryOpt = modalExpiryOptions.find((o) => o.expiryDate === modalSelectedExpiry);
      if (expiryOpt) {
        const available = parseFloat(expiryOpt.qtyAvailableMinor);
        if (qtyInMinor > available) {
          setModalValidation(`الكمية المطلوبة (${qtyInMinor}) تتجاوز المتاح (${available}) لهذه الصلاحية`);
          return;
        }
      }
    } else if (!selectedModalItem.hasExpiry) {
      const totalAvail = parseFloat(selectedModalItem.availableQtyMinor || "0");
      if (qtyInMinor > totalAvail) {
        setModalValidation(`الكمية المطلوبة (${qtyInMinor}) تتجاوز الرصيد المتاح (${totalAvail})`);
        return;
      }
    }

    if (modalQty <= 0) {
      setModalValidation("الكمية يجب أن تكون أكبر من صفر");
      return;
    }

    const newLine: TransferLineLocal = {
      id: crypto.randomUUID(),
      itemId: selectedModalItem.id,
      item: selectedModalItem,
      unitLevel: modalUnit,
      qtyEntered: modalQty,
      qtyInMinor,
      selectedExpiryDate: selectedModalItem.hasExpiry ? (modalSelectedExpiry || null) : null,
      availableQtyMinor: selectedModalItem.availableQtyMinor || "0",
      notes: "",
    };

    setFormLines((prev) => [...prev, newLine]);
    toast({ title: `تمت إضافة: ${selectedModalItem.nameAr}` });

    setModalQty(1);
    setModalUnit("major");
    setModalExpiryOptions([]);
    setModalSelectedExpiry("");
    setModalValidation("");
    setModalSelectedIndex(-1);

    setTimeout(() => modalSearchInputRef.current?.focus(), 50);
  };

  const handleDeleteLine = (index: number) => {
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (modalResultsRef.current && modalResults.length > 0) {
      const selectedRow = modalResultsRef.current.querySelector(`[data-row-index="${modalSelectedIndex}"]`);
      if (selectedRow) {
        selectedRow.scrollIntoView({ block: "nearest" });
      }
    }
  }, [modalSelectedIndex, modalResults]);

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold text-foreground">التحويلات المخزنية</h1>
        <span className="text-xs text-muted-foreground">|</span>
        <span className="text-xs text-muted-foreground">حركة مخزنية فقط - بدون تسعير</span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-2">
          <TabsTrigger value="log" data-testid="tab-log">سجل التحويلات</TabsTrigger>
          <TabsTrigger value="form" data-testid="tab-form">إذن تحويل</TabsTrigger>
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
            <Select value={filterSourceWarehouse} onValueChange={setFilterSourceWarehouse}>
              <SelectTrigger className="h-7 text-[11px] px-1 w-[140px]" data-testid="filter-source-warehouse">
                <SelectValue placeholder="مخزن المصدر" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {warehouses?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDestWarehouse} onValueChange={setFilterDestWarehouse}>
              <SelectTrigger className="h-7 text-[11px] px-1 w-[140px]" data-testid="filter-dest-warehouse">
                <SelectValue placeholder="مخزن الوجهة" />
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
                <SelectItem value="executed">مُنفّذ</SelectItem>
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
            {transfersLoading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]" data-testid="table-transfer-log">
                    <thead>
                      <tr className="peachtree-grid-header">
                        <th className="py-1 px-2 text-right font-medium">رقم الإذن</th>
                        <th className="py-1 px-2 text-right font-medium">التاريخ</th>
                        <th className="py-1 px-2 text-right font-medium">المصدر</th>
                        <th className="py-1 px-2 text-right font-medium">الوجهة</th>
                        <th className="py-1 px-2 text-right font-medium">عدد الأصناف</th>
                        <th className="py-1 px-2 text-right font-medium">الحالة</th>
                        <th className="py-1 px-2 text-right font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.length > 0 ? (
                        transfers.map((t) => (
                          <tr key={t.id} className="peachtree-grid-row" data-testid={`row-transfer-${t.id}`}>
                            <td className="py-1 px-2 font-mono">{t.transferNumber}</td>
                            <td className="py-1 px-2">{formatDateShort(t.transferDate)}</td>
                            <td className="py-1 px-2">{t.sourceWarehouse?.nameAr || "—"}</td>
                            <td className="py-1 px-2">{t.destinationWarehouse?.nameAr || "—"}</td>
                            <td className="py-1 px-2">{t.lines?.length || 0}</td>
                            <td className="py-1 px-2">
                              {t.status === "executed" ? (
                                <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">
                                  {transferStatusLabels[t.status] || t.status}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px]">
                                  {transferStatusLabels[t.status] || t.status}
                                </Badge>
                              )}
                            </td>
                            <td className="py-1 px-2">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => loadTransferForEditing(t.id)}
                                  data-testid={`button-open-transfer-${t.id}`}
                                >
                                  <Eye className="h-3 w-3 ml-1" />
                                  فتح
                                </Button>
                                {t.status === "draft" && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={postDraftMutation.isPending}
                                      onClick={() => postDraftMutation.mutate(t.id)}
                                      data-testid={`button-post-draft-${t.id}`}
                                    >
                                      {postDraftMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 ml-1" />}
                                      ترحيل
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={deleteDraftMutation.isPending}
                                      onClick={() => deleteDraftMutation.mutate(t.id)}
                                      data-testid={`button-delete-draft-${t.id}`}
                                    >
                                      {deleteDraftMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 ml-1" />}
                                      حذف
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-muted-foreground">
                            لا توجد تحويلات مسجلة
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

        <TabsContent value="form" className="space-y-2">
          <fieldset className="peachtree-grid p-2">
            <legend className="text-xs font-semibold px-1">بيانات إذن التحويل</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">رقم الإذن</Label>
                <Input
                  type="text"
                  value={formTransferNumber ? String(formTransferNumber) : "تلقائي"}
                  readOnly
                  className="h-7 text-[11px] px-1 bg-muted/30"
                  data-testid="input-transfer-number"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">تاريخ التحويل</Label>
                <Input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="h-7 text-[11px] px-1"
                  disabled={isViewOnly}
                  data-testid="input-transfer-date"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">مخزن المصدر *</Label>
                <Select value={sourceWarehouseId} onValueChange={(val) => { setSourceWarehouseId(val); setFormLines([]); }} disabled={isViewOnly}>
                  <SelectTrigger className="h-7 text-[11px] px-1" data-testid="select-source-warehouse">
                    <SelectValue placeholder="اختر المخزن" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.warehouseCode} - {w.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">مخزن الوجهة *</Label>
                <Select value={destWarehouseId} onValueChange={setDestWarehouseId} disabled={isViewOnly}>
                  <SelectTrigger className="h-7 text-[11px] px-1" data-testid="select-dest-warehouse">
                    <SelectValue placeholder="اختر المخزن" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      ?.filter((w) => w.id !== sourceWarehouseId)
                      .map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.warehouseCode} - {w.nameAr}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">الحالة</Label>
                <div className="pt-1">
                  {formStatus === "executed" ? (
                    <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">مُنفّذ</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px]">مسودة</Badge>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
                <Input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="اختياري"
                  className="h-7 text-[11px] px-1"
                  disabled={isViewOnly}
                  data-testid="input-transfer-notes"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="peachtree-grid p-2">
            <legend className="text-xs font-semibold px-1">أصناف التحويل</legend>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]" data-testid="table-transfer-lines">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th className="py-1 px-2 text-right font-medium">اسم الصنف</th>
                    <th className="py-1 px-2 text-right font-medium">كود الصنف</th>
                    <th className="py-1 px-1 text-center font-medium w-8">📊</th>
                    <th className="py-1 px-2 text-right font-medium">الوحدة</th>
                    <th className="py-1 px-2 text-right font-medium">الكمية</th>
                    <th className="py-1 px-2 text-right font-medium">الصلاحية</th>
                    <th className="py-1 px-2 text-right font-medium">الرصيد المتاح</th>
                    <th className="py-1 px-2 text-right font-medium">ملاحظات</th>
                    {!isViewOnly && <th className="py-1 px-2 text-center font-medium">حذف</th>}
                  </tr>
                </thead>
                <tbody>
                  {formLines.length > 0 ? (
                    formLines.map((line, idx) => (
                      <tr key={line.id} className="peachtree-grid-row" data-testid={`row-line-${idx}`}>
                        <td className="py-1 px-2">{line.item?.nameAr || "—"}</td>
                        <td className="py-1 px-2 font-mono">{line.item?.itemCode || "—"}</td>
                        <td className="py-1 px-1 text-center">
                          <button
                            type="button"
                            onClick={(e) => showAvailabilityPopup(line.itemId, line.item, e)}
                            className="text-muted-foreground hover:text-foreground cursor-pointer text-[11px]"
                            title="تواجد الصنف"
                            data-testid={`button-avail-${idx}`}
                          >
                            📊
                          </button>
                        </td>
                        <td className="py-1 px-2">{line.item ? getUnitName(line.item, line.unitLevel) : "—"}</td>
                        <td className="py-1 px-2">{line.qtyEntered}</td>
                        <td className="py-1 px-2">
                          {line.selectedExpiryDate ? formatDateShort(line.selectedExpiryDate) : "—"}
                        </td>
                        <td className="py-1 px-2">
                          {line.item ? formatAvailability(line.availableQtyMinor, line.unitLevel, line.item) : "—"}
                        </td>
                        <td className="py-1 px-2 text-muted-foreground">{line.notes || "—"}</td>
                        {!isViewOnly && (
                          <td className="py-1 px-2 text-center">
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
                      <td colSpan={isViewOnly ? 8 : 9} className="py-4 text-center text-muted-foreground">
                        لا توجد أصناف - اضغط "إضافة صنف" لإضافة أصناف
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </fieldset>

          {!isViewOnly && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(true)}
                disabled={!sourceWarehouseId}
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
                حفظ كمسودة
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canSaveDraft || isPending}
                onClick={() => postTransferMutation.mutate()}
                data-testid="button-post-transfer"
              >
                {postTransferMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Send className="h-3 w-3 ml-1" />}
                ترحيل التحويل
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetForm}
                data-testid="button-new-transfer"
              >
                <FileText className="h-3 w-3 ml-1" />
                إذن جديد
              </Button>
              {formLines.length > 0 && (
                <span className="text-[10px] text-muted-foreground mr-auto">{formLines.length} صنف مُضاف</span>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl" dir="rtl" onKeyDown={handleModalKeyDown}>
          <DialogHeader>
            <DialogTitle className="text-sm">بحث عن صنف</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Label className="text-[10px] whitespace-nowrap">بحث بـ:</Label>
                <Select value={modalSearchMode} onValueChange={setModalSearchMode}>
                  <SelectTrigger className="h-7 text-[11px] px-1 w-[120px]" data-testid="modal-search-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AR">الاسم (AR)</SelectItem>
                    <SelectItem value="EN">Name (EN)</SelectItem>
                    <SelectItem value="CODE">الكود</SelectItem>
                    <SelectItem value="BARCODE">الباركود</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                placeholder="نص البحث..."
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

            <div className="flex items-center gap-4 text-[10px]">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalIncludeZeroStock}
                  onChange={(e) => setModalIncludeZeroStock(e.target.checked)}
                  className="rounded"
                  data-testid="checkbox-zero-stock"
                />
                أصناف بدون رصيد
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalDrugsOnly}
                  onChange={(e) => setModalDrugsOnly(e.target.checked)}
                  className="rounded"
                  data-testid="checkbox-drugs-only"
                />
                أدوية فقط
              </label>
            </div>

            <div
              ref={modalResultsRef}
              className="border rounded-md overflow-auto max-h-[250px]"
              data-testid="modal-results-grid"
            >
              <table className="w-full text-[10px]">
                <thead className="sticky top-0">
                  <tr className="peachtree-grid-header">
                    <th className="py-1 px-2 text-right font-medium">الكود</th>
                    <th className="py-1 px-2 text-right font-medium">اسم الصنف</th>
                    <th className="py-1 px-2 text-right font-medium">الرصيد</th>
                    <th className="py-1 px-2 text-right font-medium">أقرب صلاحية</th>
                  </tr>
                </thead>
                <tbody>
                  {modalResults.length > 0 ? (
                    modalResults.map((item, idx) => (
                      <tr
                        key={item.id}
                        data-row-index={idx}
                        className={`cursor-pointer border-b transition-colors ${
                          idx === modalSelectedIndex
                            ? "bg-blue-100 dark:bg-blue-900/30"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          setModalSelectedIndex(idx);
                          selectModalItem(item);
                        }}
                      >
                        <td className="py-1 px-2 font-mono">{item.itemCode}</td>
                        <td className="py-1 px-2">{item.nameAr}</td>
                        <td className="py-1 px-2 font-mono">
                          {parseFloat(item.availableQtyMinor || "0").toFixed(2)}
                        </td>
                        <td className="py-1 px-2">
                          {item.nearestExpiryDate ? formatDateShort(item.nearestExpiryDate) : "—"}
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

            {selectedModalItem && (
              <div className="bg-muted/30 border-t p-3 rounded-b-md space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px] whitespace-nowrap">الوحدة:</Label>
                    <Select value={modalUnit} onValueChange={setModalUnit}>
                      <SelectTrigger className="h-7 text-[11px] px-1 w-[100px]" data-testid="modal-unit-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedModalItem.majorUnitName && (
                          <SelectItem value="major">{selectedModalItem.majorUnitName}</SelectItem>
                        )}
                        {selectedModalItem.mediumUnitName && (
                          <SelectItem value="medium">{selectedModalItem.mediumUnitName}</SelectItem>
                        )}
                        <SelectItem value="minor">{selectedModalItem.minorUnitName || "وحدة صغرى"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px] whitespace-nowrap">الكمية:</Label>
                    <Input
                      type="number"
                      min="1"
                      value={modalQty}
                      onChange={(e) => setModalQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-7 text-[11px] px-1 w-[70px]"
                      data-testid="modal-qty-input"
                    />
                  </div>
                  {selectedModalItem.hasExpiry && (
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] whitespace-nowrap">صلاحية:</Label>
                      {modalLoadingExpiry ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Select value={modalSelectedExpiry} onValueChange={setModalSelectedExpiry}>
                          <SelectTrigger className="h-7 text-[11px] px-1 w-[180px]" data-testid="modal-expiry-select">
                            <SelectValue placeholder="FEFO" />
                          </SelectTrigger>
                          <SelectContent>
                            {modalExpiryOptions.map((opt) => (
                              <SelectItem key={opt.expiryDate} value={opt.expiryDate}>
                                {formatDateShort(opt.expiryDate)} (متاح: {parseFloat(opt.qtyAvailableMinor).toFixed(2)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>
                    الرصيد: {formatAvailability(selectedModalItem.availableQtyMinor || "0", modalUnit, selectedModalItem)}
                  </span>
                  <span>
                    س.صغ: {parseFloat(selectedModalItem.availableQtyMinor || "0").toFixed(2)}
                  </span>
                  <span>عدد الأصناف= {modalResultsTotal}</span>
                </div>

                {modalValidation && (
                  <p className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {modalValidation}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleModalOk}
              disabled={!selectedModalItem || !!modalValidation || modalQty <= 0}
              data-testid="button-modal-ok"
            >
              <Check className="h-3 w-3 ml-1" />
              موافق OK
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              data-testid="button-modal-close"
            >
              <X className="h-3 w-3 ml-1" />
              إغلاق C
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {availPopupItemId && availPopupPosition && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeAvailPopup} onKeyDown={(e) => e.key === "Escape" && closeAvailPopup()} />
          <div
            className="fixed z-50 bg-popover border rounded-md shadow-lg p-3 min-w-[220px] max-w-[320px]"
            style={{ top: availPopupPosition.top, left: availPopupPosition.left }}
            dir="rtl"
            data-testid="popup-availability"
          >
            <div className="flex items-center gap-1 mb-2 text-[11px] font-semibold border-b pb-1">
              <Package className="h-3 w-3" />
              <span>تواجد الصنف - إحصائي</span>
            </div>
            {availPopupLoading ? (
              <div className="flex items-center gap-2 py-2 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>جاري التحميل...</span>
              </div>
            ) : availPopupData && availPopupData.length > 0 ? (
              <div className="space-y-1">
                {availPopupData.map((row: any, i: number) => {
                  const minorQty = parseFloat(row.qtyMinor);
                  const factor = row.majorToMinor ? parseFloat(row.majorToMinor) : 0;
                  const majorQty = factor > 0 ? Math.floor(minorQty / factor) : minorQty;
                  const unitLabel = row.majorUnitName || "وحدة";
                  return (
                    <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="text-foreground">{row.warehouseNameAr}</span>
                      <span className="font-mono text-foreground font-medium">{majorQty} {unitLabel}</span>
                    </div>
                  );
                })}
                <div className="border-t pt-1 mt-1 text-[9px] text-muted-foreground text-center">
                  الوحدة: {availPopupData[0]?.majorUnitName || "وحدة"} | إرشادي فقط
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground py-2 text-center">لا يوجد رصيد</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
