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
import { ArrowLeftRight, Loader2, AlertTriangle, Check, Search, Package, Trash2, Send, Save, Plus, ChevronLeft, ChevronRight, Eye, FileText, X, Printer, ScanBarcode } from "lucide-react";
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
  fefoLocked: boolean;
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
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [editingQtyIndex, setEditingQtyIndex] = useState<number | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState<string>("");
  const [fefoLoadingIndex, setFefoLoadingIndex] = useState<number | null>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const qtyConfirmedViaEnterRef = useRef(false);

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
        fefoLocked: true,
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
    setEditingQtyIndex(null);
    setEditingQtyValue("");
    setFefoLoadingIndex(null);
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

  const addItemWithFefo = useCallback(async (item: any, unitLevel: string, qtyEntered: number): Promise<boolean> => {
    const qtyInMinor = calculateQtyInMinor(qtyEntered, unitLevel, item);
    if (qtyInMinor <= 0) {
      toast({ title: "الكمية يجب أن تكون أكبر من صفر", variant: "destructive" });
      return false;
    }

    const totalAvail = parseFloat(item.availableQtyMinor || "0");
    if (qtyInMinor > totalAvail) {
      toast({
        title: "الكمية غير متاحة",
        description: `المطلوب: ${qtyEntered} ${getUnitName(item, unitLevel)} — المتاح: ${formatAvailability(String(totalAvail), unitLevel, item)}`,
        variant: "destructive",
      });
      return false;
    }

    if (item.hasExpiry) {
      try {
        const params = new URLSearchParams({
          itemId: item.id,
          warehouseId: sourceWarehouseId,
          requiredQtyInMinor: String(qtyInMinor),
          asOfDate: transferDate,
        });
        const res = await fetch(`/api/transfer/fefo-preview?${params.toString()}`);
        if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
        const preview = await res.json();

        if (!preview.fulfilled) {
          const shortfall = parseFloat(preview.shortfall);
          toast({
            title: "الكمية غير متاحة",
            description: `العجز: ${formatAvailability(String(shortfall), unitLevel, item)}`,
            variant: "destructive",
          });
          return false;
        }

        const newLines: TransferLineLocal[] = preview.allocations
          .filter((a: any) => parseFloat(a.allocatedQty) > 0)
          .map((alloc: any) => {
            const allocMinor = parseFloat(alloc.allocatedQty);
            let displayQty = allocMinor;
            if (unitLevel === "major" && item.majorToMinor) {
              displayQty = allocMinor / parseFloat(item.majorToMinor);
            } else if (unitLevel === "medium" && item.mediumToMinor) {
              displayQty = allocMinor / parseFloat(item.mediumToMinor);
            }
            displayQty = Math.round(displayQty * 10000) / 10000;

            return {
              id: crypto.randomUUID(),
              itemId: item.id,
              item,
              unitLevel,
              qtyEntered: displayQty,
              qtyInMinor: allocMinor,
              selectedExpiryDate: alloc.expiryDate || null,
              availableQtyMinor: alloc.availableQty || "0",
              notes: "",
              fefoLocked: true,
            } as TransferLineLocal;
          });

        setFormLines((prev) => [...prev, ...newLines]);
        const lotCount = newLines.length;
        toast({
          title: `تمت إضافة: ${item.nameAr}`,
          description: lotCount > 1 ? `تم التوزيع على ${lotCount} دفعات (FEFO)` : undefined,
        });
        return true;
      } catch (err: any) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err.message, variant: "destructive" });
        return false;
      }
    } else {
      const newLine: TransferLineLocal = {
        id: crypto.randomUUID(),
        itemId: item.id,
        item,
        unitLevel,
        qtyEntered,
        qtyInMinor,
        selectedExpiryDate: null,
        availableQtyMinor: item.availableQtyMinor || "0",
        notes: "",
        fefoLocked: true,
      };
      setFormLines((prev) => [...prev, newLine]);
      toast({ title: `تمت إضافة: ${item.nameAr}` });
      return true;
    }
  }, [sourceWarehouseId, transferDate, toast]);

  const handleModalOk = async () => {
    if (!selectedModalItem) return;

    if (selectedModalItem.hasExpiry && modalSelectedExpiry) {
      const expiryOpt = modalExpiryOptions.find((o) => o.expiryDate === modalSelectedExpiry);
      if (expiryOpt) {
        const qtyInMinor = calculateQtyInMinor(modalQty, modalUnit, selectedModalItem);
        const available = parseFloat(expiryOpt.qtyAvailableMinor);
        if (qtyInMinor > available) {
          setModalValidation(`الكمية المطلوبة (${qtyInMinor}) تتجاوز المتاح (${available}) لهذه الصلاحية`);
          return;
        }
      }
    }

    const success = await addItemWithFefo(selectedModalItem, modalUnit, modalQty);
    if (success) {
      setModalQty(1);
      setModalUnit("major");
      setModalExpiryOptions([]);
      setModalSelectedExpiry("");
      setModalValidation("");
      setModalSelectedIndex(-1);
      setTimeout(() => modalSearchInputRef.current?.focus(), 50);
    }
  };

  const handleDeleteLine = (index: number) => {
    if (editingQtyIndex === index) {
      setEditingQtyIndex(null);
    } else if (editingQtyIndex !== null && editingQtyIndex > index) {
      setEditingQtyIndex(editingQtyIndex - 1);
    }
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQtyConfirm = useCallback(async (index: number) => {
    const line = formLines[index];
    if (!line) return;
    const qtyEntered = parseFloat(editingQtyValue) || 0;
    if (qtyEntered <= 0) {
      toast({ title: "كمية غير صحيحة", variant: "destructive" });
      setTimeout(() => qtyInputRef.current?.focus(), 50);
      return;
    }

    const qtyInMinor = calculateQtyInMinor(qtyEntered, line.unitLevel, line.item);
    const totalAvail = parseFloat(line.item?.availableQtyMinor || "0");
    if (qtyInMinor > totalAvail) {
      toast({
        title: "الكمية غير متاحة",
        description: `المطلوب: ${qtyEntered} ${getUnitName(line.item, line.unitLevel)} — المتاح: ${formatAvailability(String(totalAvail), line.unitLevel, line.item)}`,
        variant: "destructive",
      });
      setTimeout(() => qtyInputRef.current?.focus(), 50);
      return;
    }

    setEditingQtyIndex(null);

    if (line.item?.hasExpiry) {
      setFefoLoadingIndex(index);
      try {
        const params = new URLSearchParams({
          itemId: line.itemId,
          warehouseId: sourceWarehouseId,
          requiredQtyInMinor: String(qtyInMinor),
          asOfDate: transferDate,
        });
        const res = await fetch(`/api/transfer/fefo-preview?${params}`);
        const preview = await res.json();

        if (!preview.fulfilled) {
          const shortfall = parseFloat(preview.shortfall);
          toast({
            title: "الكمية غير متاحة",
            description: `العجز: ${formatAvailability(String(shortfall), line.unitLevel, line.item)}`,
            variant: "destructive",
          });
          setFefoLoadingIndex(null);
          setEditingQtyIndex(index);
          setEditingQtyValue(String(qtyEntered));
          setTimeout(() => qtyInputRef.current?.focus(), 50);
          return;
        }

        const newLines: TransferLineLocal[] = preview.allocations
          .filter((a: any) => parseFloat(a.allocatedQty) > 0)
          .map((alloc: any) => {
            const allocMinor = parseFloat(alloc.allocatedQty);
            let displayQty = allocMinor;
            if (line.unitLevel === "major" && line.item.majorToMinor) {
              displayQty = allocMinor / parseFloat(line.item.majorToMinor);
            } else if (line.unitLevel === "medium" && line.item.mediumToMinor) {
              displayQty = allocMinor / parseFloat(line.item.mediumToMinor);
            }
            displayQty = Math.round(displayQty * 10000) / 10000;

            return {
              id: crypto.randomUUID(),
              itemId: line.itemId,
              item: line.item,
              unitLevel: line.unitLevel,
              qtyEntered: displayQty,
              qtyInMinor: allocMinor,
              selectedExpiryDate: alloc.expiryDate || null,
              availableQtyMinor: alloc.availableQty || "0",
              notes: "",
              fefoLocked: true,
            } as TransferLineLocal;
          });

        setFormLines((prev) => {
          const copy = [...prev];
          copy.splice(index, 1, ...newLines);
          return copy;
        });

        if (newLines.length > 1) {
          toast({ title: `تم التوزيع على ${newLines.length} دفعات (FEFO)` });
        }
      } catch (err: any) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err.message, variant: "destructive" });
      } finally {
        setFefoLoadingIndex(null);
      }
    } else {
      setFormLines((prev) => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          qtyEntered,
          qtyInMinor,
          fefoLocked: true,
        };
        return copy;
      });
    }

    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }, [formLines, editingQtyValue, sourceWarehouseId, transferDate, toast]);

  const handleBarcodeScan = useCallback(async (barcodeValue: string) => {
    if (!barcodeValue.trim() || !sourceWarehouseId || barcodeLoading) return;

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

      const searchRes = await fetch(`/api/items/search?warehouseId=${sourceWarehouseId}&mode=CODE&q=${encodeURIComponent(resolved.itemCode)}&page=1&pageSize=1&includeZeroStock=false&drugsOnly=false`);
      if (!searchRes.ok) throw new Error("فشل جلب بيانات الصنف");
      const searchData = await searchRes.json();
      const item = searchData.items?.[0];
      if (!item) {
        toast({ title: "الصنف غير متاح في المخزن المصدر", variant: "destructive" });
        return;
      }

      const newLine: TransferLineLocal = {
        id: crypto.randomUUID(),
        itemId: item.id,
        item,
        unitLevel: "major",
        qtyEntered: 1,
        qtyInMinor: calculateQtyInMinor(1, "major", item),
        selectedExpiryDate: null,
        availableQtyMinor: item.availableQtyMinor || "0",
        notes: "",
        fefoLocked: false,
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
  }, [sourceWarehouseId, barcodeLoading, toast, editingQtyIndex, handleQtyConfirm]);

  useEffect(() => {
    if (modalResultsRef.current && modalResults.length > 0) {
      const selectedRow = modalResultsRef.current.querySelector(`[data-row-index="${modalSelectedIndex}"]`);
      if (selectedRow) {
        selectedRow.scrollIntoView({ block: "nearest" });
      }
    }
  }, [modalSelectedIndex, modalResults]);

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
    if (editingQtyIndex === null && !modalOpen) {
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  }, [editingQtyIndex, modalOpen]);

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold text-foreground">التحويلات المخزنية</h1>
        <span className="text-xs text-muted-foreground">|</span>
        <span className="text-xs text-muted-foreground">حركة مخزنية فقط - بدون تسعير</span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-2 no-print">
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
                  <table className="w-full text-[10px]" dir="rtl" data-testid="table-transfer-log">
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

        <TabsContent value="form" className="space-y-2" onClick={handleFormContainerClick}>
          <fieldset className="peachtree-grid p-2">
            <legend className="text-xs font-semibold px-1">بيانات إذن التحويل</legend>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 w-[100px]">
                <Label className="text-[10px] text-muted-foreground">رقم الإذن</Label>
                <Input
                  type="text"
                  value={formTransferNumber ? String(formTransferNumber) : "تلقائي"}
                  readOnly
                  className="h-7 text-[11px] px-1 bg-muted/30"
                  data-testid="input-transfer-number"
                />
              </div>
              <div className="space-y-1 w-[120px]">
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
              <div className="space-y-1 flex-1 min-w-[160px]">
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
              <div className="space-y-1 flex-1 min-w-[160px]">
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
              <div className="flex items-center h-7">
                {formStatus === "executed" ? (
                  <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">مُنفّذ</Badge>
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
                  data-testid="input-transfer-notes"
                />
              </div>
            </div>
          </fieldset>

          {!isViewOnly && sourceWarehouseId && destWarehouseId && (
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
            <legend className="text-xs font-semibold px-1">أصناف التحويل</legend>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" dir="rtl" data-testid="table-transfer-lines">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th className="py-1 px-2 text-right font-bold text-[13px]">اسم الصنف</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">كود الصنف</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">الوحدة</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">الكمية</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">الصلاحية</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">الرصيد المتاح</th>
                    <th className="py-1 px-2 text-right whitespace-nowrap">ملاحظات</th>
                    {!isViewOnly && <th className="py-1 px-2 text-center whitespace-nowrap">حذف</th>}
                  </tr>
                </thead>
                <tbody>
                  {formLines.length > 0 ? (
                    formLines.map((line, idx) => (
                      <tr
                        key={line.id}
                        className={`peachtree-grid-row ${!line.fefoLocked ? "bg-yellow-50 dark:bg-yellow-900/20" : ""} ${editingQtyIndex === idx ? "ring-1 ring-blue-300 dark:ring-blue-700" : ""}`}
                        data-testid={`row-line-${idx}`}
                      >
                        <td className="py-1 px-2" title={`${line.item?.nameAr || ""} — ${line.item?.itemCode || ""}`}>
                          <div className="flex items-start gap-1">
                            <span className="text-foreground leading-tight line-clamp-2" style={{ fontSize: "14px", fontWeight: 700, wordBreak: "break-word" }}>
                              {line.item?.nameAr || "—"}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => showAvailabilityPopup(line.itemId, line.item, e)}
                              className="text-muted-foreground hover:text-foreground cursor-pointer text-[11px] shrink-0 mt-0.5"
                              title="تواجد الصنف"
                              data-testid={`button-avail-${idx}`}
                            >
                              📊
                            </button>
                          </div>
                        </td>
                        <td className="py-0.5 px-2 font-mono whitespace-nowrap">{line.item?.itemCode || "—"}</td>
                        <td className="py-0.5 px-2 whitespace-nowrap">{line.item ? getUnitName(line.item, line.unitLevel) : "—"}</td>
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
                          {fefoLoadingIndex === idx ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" />
                          ) : line.selectedExpiryDate ? (
                            formatDateShort(line.selectedExpiryDate)
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-0.5 px-2 whitespace-nowrap">
                          {line.item ? formatAvailability(line.availableQtyMinor, line.unitLevel, line.item) : "—"}
                        </td>
                        <td className="py-0.5 px-2 text-muted-foreground">{line.notes || "—"}</td>
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
                      <td colSpan={isViewOnly ? 7 : 8} className="py-4 text-center text-muted-foreground">
                        لا توجد أصناف - اضغط "إضافة صنف" لإضافة أصناف
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </fieldset>

          {!isViewOnly && (
            <div className="flex items-center gap-2 flex-wrap no-print">
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                data-testid="button-print-transfer"
              >
                <Printer className="h-3 w-3 ml-1" />
                طباعة
              </Button>
              {formLines.length > 0 && (
                <span className="text-[10px] text-muted-foreground mr-auto">{formLines.length} صنف مُضاف</span>
              )}
            </div>
          )}
          {isViewOnly && (formLines.length > 0 || editingTransferId) && (
            <div className="flex items-center gap-2 flex-wrap no-print">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                data-testid="button-print-transfer"
              >
                <Printer className="h-3 w-3 ml-1" />
                طباعة
              </Button>
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
