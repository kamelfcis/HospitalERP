import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowRight, Save, CheckCircle, Trash2, ChevronLeft, ChevronRight, ShoppingCart, Search, X, Plus, Barcode, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber, formatDateShort } from "@/lib/formatters";
import type { Warehouse, SalesInvoiceWithDetails, Item } from "@shared/schema";
import { salesInvoiceStatusLabels, customerTypeLabels } from "@shared/schema";

interface SalesLineLocal {
  tempId: string;
  itemId: string;
  item: Item | null;
  unitLevel: string;
  qty: number;
  salePrice: number;
  baseSalePrice: number;
  lineTotal: number;
  expiryMonth: number | null;
  expiryYear: number | null;
  lotId: string | null;
  fefoLocked: boolean;
  expiryOptions?: { expiryMonth: number; expiryYear: number; qtyAvailableMinor: string }[];
}

function getUnitName(item: any, unitLevel: string): string {
  if (unitLevel === "major") return item?.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return item?.mediumUnitName || "وحدة وسطى";
  return item?.minorUnitName || "وحدة صغرى";
}

function getUnitOptions(item: any): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  if (item?.majorUnitName) opts.push({ value: "major", label: item.majorUnitName });
  if (item?.mediumUnitName) opts.push({ value: "medium", label: item.mediumUnitName });
  if (item?.minorUnitName) opts.push({ value: "minor", label: item.minorUnitName });
  if (opts.length === 0) opts.push({ value: "major", label: "وحدة" });
  return opts;
}

function genId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
}

function calculateQtyInMinor(qty: number, unitLevel: string, item: any): number {
  if (!item) return qty;
  if (unitLevel === "minor") return qty;
  if (unitLevel === "medium") return qty * (parseFloat(item.mediumToMinor) || 1);
  return qty * (parseFloat(item.majorToMinor) || 1);
}

function computeUnitPriceFromBase(baseSalePrice: number, unitLevel: string, item: any): number {
  if (!item || !baseSalePrice) return baseSalePrice || 0;
  if (unitLevel === "major" || !unitLevel) return baseSalePrice;
  const majorToMedium = parseFloat(String(item.majorToMedium)) || 1;
  const majorToMinor = parseFloat(String(item.majorToMinor)) || 1;
  if (unitLevel === "medium") return +(baseSalePrice / majorToMedium).toFixed(2);
  if (unitLevel === "minor") return +(baseSalePrice / majorToMinor).toFixed(2);
  return baseSalePrice;
}

function convertMinorToDisplayQty(allocMinor: number, unitLevel: string, item: any): number {
  let displayQty = allocMinor;
  if (unitLevel === "major" && item?.majorToMinor) {
    displayQty = allocMinor / parseFloat(item.majorToMinor);
  } else if (unitLevel === "medium" && item?.mediumToMinor) {
    displayQty = allocMinor / parseFloat(item.mediumToMinor);
  }
  return Math.round(displayQty * 10000) / 10000;
}

export default function SalesInvoices() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const editId = params.get("id");
  const today = new Date().toISOString().split("T")[0];

  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCustomerType, setFilterCustomerType] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [customerType, setCustomerType] = useState("cash");
  const [customerName, setCustomerName] = useState("");
  const [contractCompany, setContractCompany] = useState("");
  const [lines, setLines] = useState<SalesLineLocal[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountValue, setDiscountValue] = useState(0);
  const [notes, setNotes] = useState("");
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [seedLoading, setSeedLoading] = useState(false);
  const [quickTestLoading, setQuickTestLoading] = useState(false);

  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveDataRef = useRef<string>("");
  const autoSaveIdRef = useRef<string | null>(null);

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState("AR");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fefoLoading, setFefoLoading] = useState(false);
  const pendingQtyRef = useRef<Map<string, string>>(new Map());
  const linesRef = useRef<SalesLineLocal[]>([]);
  linesRef.current = lines;

  const qtyRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filterSearch.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filterSearch]);

  const { data: warehouses } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });

  const buildListQuery = () => {
    const p = new URLSearchParams();
    p.set("page", page.toString());
    p.set("pageSize", pageSize.toString());
    if (filterStatus !== "all") p.set("status", filterStatus);
    if (filterCustomerType !== "all") p.set("customerType", filterCustomerType);
    if (filterDateFrom) p.set("dateFrom", filterDateFrom);
    if (filterDateTo) p.set("dateTo", filterDateTo);
    if (debouncedSearch) p.set("search", debouncedSearch);
    return p.toString();
  };

  const { data: listData, isLoading: listLoading } = useQuery<{ data: SalesInvoiceWithDetails[]; total: number }>({
    queryKey: ["/api/sales-invoices", page, filterStatus, filterCustomerType, filterDateFrom, filterDateTo, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/sales-invoices?${buildListQuery()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !editId,
  });

  const invoices = listData?.data || [];
  const totalInvoices = listData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalInvoices / pageSize));

  const { data: invoiceDetail, isLoading: detailLoading } = useQuery<SalesInvoiceWithDetails>({
    queryKey: ["/api/sales-invoices", editId],
    queryFn: async () => {
      const res = await fetch(`/api/sales-invoices/${editId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!editId && editId !== "new",
  });

  const isNew = editId === "new";
  const isDraft = isNew || invoiceDetail?.status === "draft";
  const isFinalized = invoiceDetail?.status === "finalized";

  useEffect(() => {
    if (isNew) {
      setLines([]);
      setWarehouseId(warehouses?.[0]?.id || "");
      setInvoiceDate(today);
      setCustomerType("cash");
      setCustomerName("");
      setContractCompany("");
      setDiscountPct(0);
      setDiscountValue(0);
      setNotes("");
    }
  }, [isNew, warehouses, today]);

  useEffect(() => {
    if (invoiceDetail && !isNew) {
      setWarehouseId(invoiceDetail.warehouseId);
      setInvoiceDate(invoiceDetail.invoiceDate);
      setCustomerType(invoiceDetail.customerType);
      setCustomerName(invoiceDetail.customerName || "");
      setContractCompany(invoiceDetail.contractCompany || "");
      setDiscountPct(parseFloat(String(invoiceDetail.discountPercent)) || 0);
      setDiscountValue(parseFloat(String(invoiceDetail.discountValue)) || 0);
      setNotes(invoiceDetail.notes || "");
      const mapped: SalesLineLocal[] = (invoiceDetail.lines || []).map((ln: any) => ({
        tempId: ln.id || genId(),
        itemId: ln.itemId,
        item: ln.item || null,
        unitLevel: ln.unitLevel || "major",
        qty: parseFloat(String(ln.qty)) || 0,
        salePrice: parseFloat(String(ln.salePrice)) || 0,
        baseSalePrice: parseFloat(String(ln.salePrice)) || 0,
        lineTotal: parseFloat(String(ln.lineTotal)) || 0,
        expiryMonth: ln.expiryMonth ?? null,
        expiryYear: ln.expiryYear ?? null,
        lotId: ln.lotId ?? null,
        fefoLocked: !!(ln.expiryMonth && ln.expiryYear),
      }));
      setLines(mapped);
    }
  }, [invoiceDetail, isNew]);

  useEffect(() => {
    if (editId && isDraft) {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [editId, isDraft]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.lineTotal, 0), [lines]);

  const netTotal = useMemo(() => {
    return +(subtotal - discountValue).toFixed(2);
  }, [subtotal, discountValue]);

  const handleDiscountPctChange = useCallback((val: string) => {
    const pct = Math.min(100, Math.max(0, parseFloat(val) || 0));
    setDiscountPct(+pct.toFixed(4));
    setDiscountValue(+(subtotal * (pct / 100)).toFixed(2));
  }, [subtotal]);

  const handleDiscountValueChange = useCallback((val: string) => {
    const dv = Math.min(subtotal, Math.max(0, parseFloat(val) || 0));
    setDiscountValue(+dv.toFixed(2));
    setDiscountPct(subtotal > 0 ? +((dv / subtotal) * 100).toFixed(4) : 0);
  }, [subtotal]);

  const updateLine = useCallback((index: number, patch: Partial<SalesLineLocal>) => {
    setLines((prev) => {
      const updated = [...prev];
      const target = updated[index];
      if (patch.unitLevel && target.fefoLocked) {
        const newUnit = patch.unitLevel;
        const newSalePrice = computeUnitPriceFromBase(target.baseSalePrice, newUnit, target.item);
        return updated.map((ln) => {
          if (ln.itemId !== target.itemId) return ln;
          const oldMinor = calculateQtyInMinor(ln.qty, ln.unitLevel, ln.item);
          const newQty = convertMinorToDisplayQty(oldMinor, newUnit, ln.item);
          const total = +(newQty * newSalePrice).toFixed(2);
          return { ...ln, unitLevel: newUnit, salePrice: newSalePrice, qty: newQty, lineTotal: total };
        });
      }
      const ln = { ...target, ...patch };
      if (patch.unitLevel) {
        ln.salePrice = computeUnitPriceFromBase(ln.baseSalePrice, ln.unitLevel, ln.item);
      }
      ln.lineTotal = +(ln.qty * ln.salePrice).toFixed(2);
      updated[index] = ln;
      return updated;
    });
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addItemToLines = useCallback(async (itemData: any) => {
    let baseSalePrice = parseFloat(String(itemData.salePriceCurrent)) || 0;
    if (warehouseId) {
      try {
        const priceRes = await fetch(`/api/pricing?itemId=${itemData.id}&warehouseId=${warehouseId}`);
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const resolved = parseFloat(priceData.price);
          if (resolved > 0) baseSalePrice = resolved;
        }
      } catch {}
    }

    if (itemData.hasExpiry && warehouseId) {
      const currentLines = linesRef.current;
      const existingLinesForItem = currentLines.filter((l) => l.itemId === itemData.id);
      const existingTotalMinor = existingLinesForItem.reduce(
        (sum, l) => sum + calculateQtyInMinor(l.qty, l.unitLevel, l.item),
        0
      );
      const additionalMinor = calculateQtyInMinor(1, "major", itemData);
      const totalRequiredMinor = existingTotalMinor + additionalMinor;

      setFefoLoading(true);
      try {
        const fefoParams = new URLSearchParams({
          itemId: itemData.id,
          warehouseId,
          requiredQtyInMinor: String(totalRequiredMinor),
          asOfDate: invoiceDate,
        });
        const res = await fetch(`/api/transfer/fefo-preview?${fefoParams.toString()}`);
        if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
        const preview = await res.json();

        if (!preview.fulfilled) {
          toast({
            title: "الكمية غير متاحة",
            description: preview.shortfall ? `العجز: ${preview.shortfall}` : undefined,
            variant: "destructive",
          });
          setFefoLoading(false);
          return;
        }

        const unitLevel = existingLinesForItem.length > 0 ? existingLinesForItem[0].unitLevel : "major";
        const salePrice = computeUnitPriceFromBase(baseSalePrice, unitLevel, itemData);

        const newFefoLines: SalesLineLocal[] = preview.allocations
          .filter((a: any) => parseFloat(a.allocatedQty) > 0)
          .map((alloc: any) => {
            const allocMinor = parseFloat(alloc.allocatedQty);
            const displayQty = convertMinorToDisplayQty(allocMinor, unitLevel, itemData);
            return {
              tempId: genId(),
              itemId: itemData.id,
              item: itemData,
              unitLevel,
              qty: displayQty,
              salePrice,
              baseSalePrice,
              lineTotal: +(displayQty * salePrice).toFixed(2),
              expiryMonth: alloc.expiryMonth || null,
              expiryYear: alloc.expiryYear || null,
              lotId: alloc.lotId || null,
              fefoLocked: true,
            } as SalesLineLocal;
          });

        setLines((prev) => {
          const filtered = prev.filter((l) => l.itemId !== itemData.id);
          return [...filtered, ...newFefoLines];
        });

        if (newFefoLines.length > 1) {
          toast({ title: `تمت إضافة: ${itemData.nameAr}`, description: `تم التوزيع على ${newFefoLines.length} دفعات (FEFO)` });
        } else {
          toast({ title: `تمت إضافة: ${itemData.nameAr}` });
        }
      } catch (err: any) {
        toast({ title: "خطأ في توزيع الصلاحية", description: err.message, variant: "destructive" });
      } finally {
        setFefoLoading(false);
      }
      return;
    }

    const existingIdx = linesRef.current.findIndex(
      (l) => l.itemId === itemData.id && l.unitLevel === "major"
    );
    if (existingIdx >= 0) {
      updateLine(existingIdx, { qty: linesRef.current[existingIdx].qty + 1 });
      return;
    }

    const salePrice = baseSalePrice;
    const newLine: SalesLineLocal = {
      tempId: genId(),
      itemId: itemData.id,
      item: itemData,
      unitLevel: "major",
      qty: 1,
      salePrice,
      baseSalePrice,
      lineTotal: salePrice,
      expiryMonth: null,
      expiryYear: null,
      lotId: null,
      fefoLocked: false,
    };

    setLines((prev) => [...prev, newLine]);
  }, [updateLine, warehouseId, invoiceDate, toast]);

  const handleQtyConfirm = useCallback(async (tempId: string) => {
    const currentLines = linesRef.current;
    const index = currentLines.findIndex((l) => l.tempId === tempId);
    const line = currentLines[index];
    if (!line) return;

    const pendingVal = pendingQtyRef.current.get(tempId);
    const qtyEntered = parseFloat(pendingVal ?? String(line.qty)) || 0;
    if (qtyEntered <= 0) {
      toast({ title: "كمية غير صحيحة", variant: "destructive" });
      return;
    }

    pendingQtyRef.current.delete(tempId);

    if (line.item?.hasExpiry && warehouseId) {
      const allLinesForItem = currentLines.filter((l) => l.itemId === line.itemId);
      const otherLinesMinor = allLinesForItem
        .filter((l) => l.tempId !== tempId)
        .reduce((sum, l) => sum + calculateQtyInMinor(l.qty, l.unitLevel, l.item), 0);
      const thisLineMinor = calculateQtyInMinor(qtyEntered, line.unitLevel, line.item);
      const totalRequiredMinor = otherLinesMinor + thisLineMinor;

      if (totalRequiredMinor <= 0) return;

      setFefoLoading(true);
      try {
        const fefoParams = new URLSearchParams({
          itemId: line.itemId,
          warehouseId,
          requiredQtyInMinor: String(totalRequiredMinor),
          asOfDate: invoiceDate,
        });
        const res = await fetch(`/api/transfer/fefo-preview?${fefoParams.toString()}`);
        if (!res.ok) throw new Error("فشل حساب توزيع الصلاحية");
        const preview = await res.json();

        if (!preview.fulfilled) {
          toast({
            title: "الكمية غير متاحة",
            description: preview.shortfall ? `العجز: ${preview.shortfall}` : undefined,
            variant: "destructive",
          });
          setFefoLoading(false);
          return;
        }

        const unitLevel = line.unitLevel;
        const baseSalePrice = line.baseSalePrice;
        const salePrice = line.salePrice;
        const itemData = line.item;

        const newFefoLines: SalesLineLocal[] = preview.allocations
          .filter((a: any) => parseFloat(a.allocatedQty) > 0)
          .map((alloc: any) => {
            const allocMinor = parseFloat(alloc.allocatedQty);
            const displayQty = convertMinorToDisplayQty(allocMinor, unitLevel, itemData);
            return {
              tempId: genId(),
              itemId: line.itemId,
              item: itemData,
              unitLevel,
              qty: displayQty,
              salePrice,
              baseSalePrice,
              lineTotal: +(displayQty * salePrice).toFixed(2),
              expiryMonth: alloc.expiryMonth || null,
              expiryYear: alloc.expiryYear || null,
              lotId: alloc.lotId || null,
              fefoLocked: true,
            } as SalesLineLocal;
          });

        setLines((prev) => {
          const filtered = prev.filter((l) => l.itemId !== line.itemId);
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
    } else {
      updateLine(index, { qty: qtyEntered });
    }

    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }, [warehouseId, invoiceDate, toast, updateLine]);

  const handleBarcodeScan = useCallback(async () => {
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeLoading(true);
    try {
      const res = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.found && data.itemId) {
        const itemRes = await fetch(`/api/items/search?warehouseId=${warehouseId}&mode=CODE&q=${encodeURIComponent(data.itemCode)}&page=1&pageSize=1&includeZeroStock=true`);
        if (itemRes.ok) {
          const itemData = await itemRes.json();
          const items = itemData.data || itemData.items || itemData;
          if (Array.isArray(items) && items.length > 0) {
            await addItemToLines(items[0]);
          }
        }
      } else {
        toast({ title: "لم يتم العثور على الصنف", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في قراءة الباركود", variant: "destructive" });
    }
    setBarcodeInput("");
    setBarcodeLoading(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }, [barcodeInput, warehouseId, addItemToLines, toast]);

  const handleSearchItems = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/items/search?warehouseId=${warehouseId}&mode=${searchMode}&q=${encodeURIComponent(q.trim())}&page=1&pageSize=30&includeZeroStock=true`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.data || data.items || data || []);
      }
    } catch {}
    setSearchLoading(false);
  }, [warehouseId, searchMode]);

  const onSearchQueryChange = useCallback((val: string) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => handleSearchItems(val), 300);
  }, [handleSearchItems]);

  const fetchExpiryOptions = useCallback(async (itemId: string, lineIndex: number) => {
    if (!warehouseId) return;
    try {
      const res = await fetch(`/api/items/${itemId}/expiry-options?warehouseId=${warehouseId}&asOfDate=${invoiceDate}`);
      if (res.ok) {
        const opts = await res.json();
        setLines((prev) => {
          const updated = [...prev];
          updated[lineIndex] = { ...updated[lineIndex], expiryOptions: opts };
          return updated;
        });
      }
    } catch {}
  }, [warehouseId, invoiceDate]);

  const performAutoSave = useCallback(async () => {
    if (!isDraft || !warehouseId) return;
    const header = {
      warehouseId,
      invoiceDate,
      customerType,
      customerName: customerName || null,
      contractCompany: customerType === "contract" ? contractCompany : null,
      discountPercent: discountPct,
      discountValue,
      subtotal: +subtotal.toFixed(2),
      netTotal: +netTotal.toFixed(2),
      notes: notes || null,
    };
    const linesPayload = lines.map((ln, i) => ({
      itemId: ln.itemId,
      unitLevel: ln.unitLevel,
      qty: ln.qty,
      salePrice: ln.salePrice,
      lineTotal: ln.lineTotal,
      expiryMonth: ln.expiryMonth,
      expiryYear: ln.expiryYear,
      lotId: ln.lotId,
      lineNo: i + 1,
    }));
    const existingId = autoSaveIdRef.current || (editId !== "new" ? editId : undefined);
    const payload = { header, lines: linesPayload, existingId };
    const dataStr = JSON.stringify(payload);
    if (dataStr === lastAutoSaveDataRef.current) return;
    setAutoSaveStatus("saving");
    try {
      const res = await fetch("/api/sales-invoices/auto-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: dataStr,
      });
      if (!res.ok) throw new Error("Auto-save failed");
      const data = await res.json();
      lastAutoSaveDataRef.current = dataStr;
      setAutoSaveStatus("saved");
      if (isNew && !autoSaveIdRef.current && data?.id) {
        autoSaveIdRef.current = data.id;
        navigate(`/sales-invoices?id=${data.id}`);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
    } catch {
      setAutoSaveStatus("error");
    }
  }, [isDraft, warehouseId, invoiceDate, customerType, customerName, contractCompany, discountPct, discountValue, subtotal, netTotal, notes, lines, editId, isNew, navigate]);

  useEffect(() => {
    if (!isDraft || !warehouseId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 15000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [isDraft, warehouseId, invoiceDate, customerType, customerName, contractCompany, discountPct, discountValue, lines, notes, performAutoSave]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isDraft || !warehouseId) return;
      const header = {
        warehouseId,
        invoiceDate,
        customerType,
        customerName: customerName || null,
        contractCompany: customerType === "contract" ? contractCompany : null,
        discountPercent: discountPct,
        discountValue,
        subtotal: +subtotal.toFixed(2),
        netTotal: +netTotal.toFixed(2),
        notes: notes || null,
      };
      const linesPayload = lines.map((ln, i) => ({
        itemId: ln.itemId,
        unitLevel: ln.unitLevel,
        qty: ln.qty,
        salePrice: ln.salePrice,
        lineTotal: ln.lineTotal,
        expiryMonth: ln.expiryMonth,
        expiryYear: ln.expiryYear,
        lotId: ln.lotId,
        lineNo: i + 1,
      }));
      const existingId = autoSaveIdRef.current || (editId !== "new" ? editId : undefined);
      const payload = JSON.stringify({ header, lines: linesPayload, existingId });
      if (payload === lastAutoSaveDataRef.current) return;
      navigator.sendBeacon("/api/sales-invoices/auto-save", new Blob([payload], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDraft, warehouseId, invoiceDate, customerType, customerName, contractCompany, discountPct, discountValue, subtotal, netTotal, notes, lines, editId]);

  useEffect(() => {
    if (isNew) {
      autoSaveIdRef.current = null;
      lastAutoSaveDataRef.current = "";
      setAutoSaveStatus("idle");
    } else if (editId && editId !== "new") {
      autoSaveIdRef.current = editId;
    }
  }, [isNew, editId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("يجب اختيار المخزن");
      if (lines.length === 0) throw new Error("يجب إضافة صنف واحد على الأقل");

      const header = {
        warehouseId,
        invoiceDate,
        customerType,
        customerName: customerName || null,
        contractCompany: customerType === "contract" ? contractCompany : null,
        discountPercent: discountPct,
        discountValue,
        subtotal: +subtotal.toFixed(2),
        netTotal: +netTotal.toFixed(2),
        notes: notes || null,
      };
      const linesPayload = lines.map((ln, i) => ({
        itemId: ln.itemId,
        unitLevel: ln.unitLevel,
        qty: ln.qty,
        salePrice: ln.salePrice,
        lineTotal: ln.lineTotal,
        expiryMonth: ln.expiryMonth,
        expiryYear: ln.expiryYear,
        lotId: ln.lotId,
        lineNo: i + 1,
      }));

      if (isNew) {
        const res = await apiRequest("POST", "/api/sales-invoices", { header, lines: linesPayload });
        const created = await res.json();
        return created;
      } else {
        await apiRequest("PATCH", `/api/sales-invoices/${editId}`, { header, lines: linesPayload });
        return null;
      }
    },
    onSuccess: (data) => {
      toast({ title: "تم الحفظ بنجاح" });
      lastAutoSaveDataRef.current = "";
      setAutoSaveStatus("idle");
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      if (isNew && data?.id) {
        navigate(`/sales-invoices?id=${data.id}`);
      } else if (editId) {
        queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", editId] });
      }
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const saveRes = await saveMutation.mutateAsync();
        const id = saveRes?.id || editId;
        if (id) await apiRequest("POST", `/api/sales-invoices/${id}/finalize`);
      } else {
        await saveMutation.mutateAsync();
        await apiRequest("POST", `/api/sales-invoices/${editId}/finalize`);
      }
    },
    onSuccess: () => {
      toast({ title: "تم الاعتماد النهائي بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      if (editId && editId !== "new") {
        queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", editId] });
      }
      setConfirmFinalizeOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الاعتماد", description: err.message, variant: "destructive" });
      setConfirmFinalizeOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/sales-invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم الحذف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    },
  });

  const warehouseName = (id: string) => warehouses?.find((w) => w.id === id)?.nameAr || "";

  const statusBadge = (status: string) => {
    const label = salesInvoiceStatusLabels[status] || status;
    if (status === "finalized")
      return <Badge className="bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{label}</Badge>;
    if (status === "cancelled")
      return <Badge className="bg-red-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{label}</Badge>;
    return <Badge variant="secondary" data-testid="badge-status">{label}</Badge>;
  };

  const handleSeedDemo = async () => {
    setSeedLoading(true);
    try {
      const res = await fetch("/api/seed/pharmacy-sales-demo", { method: "POST" });
      if (!res.ok) throw new Error("Seed failed");
      const data = await res.json();
      toast({ title: "تم تحميل البيانات التجريبية", description: `${data.items.length} أصناف + مخزون تجريبي` });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSeedLoading(false);
    }
  };

  const handleQuickTest = async () => {
    setQuickTestLoading(true);
    try {
      const seedRes = await fetch("/api/seed/pharmacy-sales-demo", { method: "POST" });
      if (!seedRes.ok) throw new Error("Seed failed");
      const seedData = await seedRes.json();
      const wId = seedData.warehouseId;
      const testItem = seedData.items[0];

      const createRes = await apiRequest("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: today,
          warehouseId: wId,
          customerType: "cash",
          customerName: "عميل اختبار سريع",
        },
        lines: [{
          itemId: testItem.id,
          unitLevel: "minor",
          qty: "7",
          salePrice: "0",
        }],
      });
      const invoice = await createRes.json();
      toast({ title: "تم إنشاء فاتورة اختبار", description: `فاتورة #${invoice.invoiceNumber} - تحقق من التقسيم FEFO` });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      navigate(`/sales-invoices?id=${invoice.id}`);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setQuickTestLoading(false);
    }
  };

  if (editId) {
    if (editId !== "new" && detailLoading) {
      return (
        <div className="p-4 space-y-4" dir="rtl">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }

    if (editId !== "new" && !invoiceDetail) {
      return (
        <div className="p-4 text-center" dir="rtl">
          <p className="text-muted-foreground">لم يتم العثور على الفاتورة</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/sales-invoices")} data-testid="button-back-not-found">
            <ArrowRight className="h-4 w-4 ml-1" />
            رجوع
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full" dir="rtl">
        <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 sticky top-0 z-50">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate("/sales-invoices")} data-testid="button-back">
              <ArrowRight className="h-4 w-4 ml-1" />
              رجوع
            </Button>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-sm font-bold">
              {isNew ? "فاتورة بيع جديدة" : `فاتورة بيع #${invoiceDetail?.invoiceNumber}`}
            </h1>
            {!isNew && invoiceDetail && statusBadge(invoiceDetail.status)}
            {fefoLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          </div>
          {isDraft && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save">
                {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
                حفظ
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
              <Button size="sm" onClick={() => setConfirmFinalizeOpen(true)} disabled={finalizeMutation.isPending} data-testid="button-finalize">
                {finalizeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <CheckCircle className="h-3 w-3 ml-1" />}
                اعتماد نهائي
              </Button>
            </div>
          )}
        </div>

        <div className="peachtree-toolbar flex items-center gap-4 flex-wrap text-[12px]">
          <div className="flex items-center gap-1">
            <span className="font-semibold">المخزن:</span>
            {isDraft ? (
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="peachtree-select min-w-[140px]"
                data-testid="select-warehouse"
              >
                <option value="">اختر المخزن</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>{w.nameAr}</option>
                ))}
              </select>
            ) : (
              <span data-testid="text-warehouse">{warehouseName(warehouseId)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">التاريخ:</span>
            {isDraft ? (
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="peachtree-input w-[130px]"
                data-testid="input-invoice-date"
              />
            ) : (
              <span data-testid="text-invoice-date">{formatDateShort(invoiceDate)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">نوع العميل:</span>
            {isDraft ? (
              <select
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value)}
                className="peachtree-select"
                data-testid="select-customer-type"
              >
                <option value="cash">نقدي</option>
                <option value="credit">آجل</option>
                <option value="contract">تعاقد</option>
              </select>
            ) : (
              <span data-testid="text-customer-type">{customerTypeLabels[customerType] || customerType}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">العميل:</span>
            {isDraft ? (
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="اسم العميل"
                className="peachtree-input w-[160px]"
                data-testid="input-customer-name"
              />
            ) : (
              <span data-testid="text-customer-name">{customerName || "-"}</span>
            )}
          </div>
          {customerType === "contract" && (
            <div className="flex items-center gap-1">
              <span className="font-semibold">الشركة الأم:</span>
              {isDraft ? (
                <input
                  type="text"
                  value={contractCompany}
                  onChange={(e) => setContractCompany(e.target.value)}
                  placeholder="الشركة الأم"
                  className="peachtree-input w-[160px]"
                  data-testid="input-contract-company"
                />
              ) : (
                <span data-testid="text-contract-company">{contractCompany || "-"}</span>
              )}
            </div>
          )}
        </div>

        {isDraft && (
          <div className="peachtree-toolbar flex items-center gap-2 text-[12px]">
            <Barcode className="h-4 w-4 text-muted-foreground" />
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBarcodeScan(); } }}
              placeholder="امسح الباركود أو أدخل الكود..."
              className="peachtree-input flex-1"
              disabled={barcodeLoading}
              data-testid="input-barcode"
            />
            {barcodeLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            <Button variant="outline" size="sm" onClick={() => { setSearchModalOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100); }} data-testid="button-open-search">
              <Search className="h-3 w-3 ml-1" />
              بحث
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-2">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-lines">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="w-8">#</th>
                <th>الصنف</th>
                <th className="w-24">الوحدة</th>
                <th className="w-20">الكمية</th>
                <th className="w-24">سعر البيع</th>
                <th className="w-24">إجمالي السطر</th>
                <th className="w-28">الصلاحية</th>
                {isDraft && <th className="w-10">حذف</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => {
                const needsExpiry = ln.item?.hasExpiry && !ln.expiryMonth;
                return (
                  <tr
                    key={ln.tempId}
                    className={`peachtree-grid-row ${needsExpiry ? "bg-yellow-50 dark:bg-yellow-900/20" : ""}`}
                    data-testid={`row-line-${i}`}
                  >
                    <td className="text-center">{i + 1}</td>
                    <td className="max-w-[200px] truncate" title={ln.item?.nameAr || ""}>
                      <span className="font-semibold text-[13px]">{ln.item?.nameAr || ln.itemId}</span>
                    </td>
                    <td className="text-center">
                      {isDraft ? (
                        <select
                          value={ln.unitLevel}
                          onChange={(e) => updateLine(i, { unitLevel: e.target.value })}
                          className="peachtree-select w-full"
                          data-testid={`select-unit-${i}`}
                        >
                          {getUnitOptions(ln.item).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        getUnitName(ln.item, ln.unitLevel)
                      )}
                    </td>
                    <td className="text-center">
                      {isDraft ? (
                        <input
                          ref={(el) => { if (el) qtyRefs.current.set(i, el); else qtyRefs.current.delete(i); }}
                          type="number"
                          step="1"
                          min="1"
                          defaultValue={ln.qty}
                          key={`qty-${ln.tempId}`}
                          onChange={(e) => {
                            if (ln.item?.hasExpiry) {
                              pendingQtyRef.current.set(ln.tempId, e.target.value);
                            } else {
                              updateLine(i, { qty: Math.max(1, parseInt(e.target.value) || 1) });
                            }
                          }}
                          onBlur={() => {
                            if (ln.item?.hasExpiry) {
                              handleQtyConfirm(ln.tempId);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              if (ln.item?.hasExpiry) {
                                handleQtyConfirm(ln.tempId);
                              }
                              setTimeout(() => barcodeInputRef.current?.focus(), 50);
                            }
                          }}
                          className="peachtree-input w-[60px] text-center"
                          disabled={fefoLoading}
                          data-testid={`input-qty-${i}`}
                        />
                      ) : (
                        <span className="peachtree-amount">{formatNumber(ln.qty)}</span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className="peachtree-amount" data-testid={`text-sale-price-${i}`}>{formatNumber(ln.salePrice)}</span>
                    </td>
                    <td className="text-center peachtree-amount font-semibold">{formatNumber(ln.lineTotal)}</td>
                    <td className="text-center text-[11px]">
                      {ln.item?.hasExpiry ? (
                        ln.fefoLocked && ln.expiryMonth && ln.expiryYear ? (
                          <span data-testid={`text-expiry-${i}`}>{String(ln.expiryMonth).padStart(2, "0")}/{ln.expiryYear}</span>
                        ) : isDraft && ln.expiryOptions && ln.expiryOptions.length > 0 ? (
                          <select
                            value={ln.expiryMonth && ln.expiryYear ? `${ln.expiryMonth}-${ln.expiryYear}` : ""}
                            onChange={(e) => {
                              const [m, y] = e.target.value.split("-").map(Number);
                              updateLine(i, { expiryMonth: m || null, expiryYear: y || null });
                            }}
                            className={`peachtree-select w-full ${needsExpiry ? "border-yellow-400" : ""}`}
                            data-testid={`select-expiry-${i}`}
                          >
                            <option value="">اختر الصلاحية</option>
                            {ln.expiryOptions.map((opt) => (
                              <option key={`${opt.expiryMonth}-${opt.expiryYear}`} value={`${opt.expiryMonth}-${opt.expiryYear}`}>
                                {String(opt.expiryMonth).padStart(2, "0")}/{opt.expiryYear} ({formatNumber(opt.qtyAvailableMinor)})
                              </option>
                            ))}
                          </select>
                        ) : ln.expiryMonth && ln.expiryYear ? (
                          <span data-testid={`text-expiry-${i}`}>{String(ln.expiryMonth).padStart(2, "0")}/{ln.expiryYear}</span>
                        ) : (
                          <span className="text-yellow-600">مطلوب</span>
                        )
                      ) : (
                        "-"
                      )}
                    </td>
                    {isDraft && (
                      <td className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => removeLine(i)} data-testid={`button-delete-line-${i}`}>
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={isDraft ? 8 : 7} className="text-center text-muted-foreground py-6">لا توجد أصناف - امسح الباركود أو استخدم البحث لإضافة أصناف</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-gradient-to-l from-slate-700 to-slate-800 text-white p-3 m-2 rounded-md sticky bottom-0 z-40">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <div>
              <span className="font-semibold block opacity-80">إجمالي قبل الخصم</span>
              <span className="text-sm font-bold" data-testid="text-subtotal">{formatNumber(subtotal)}</span>
            </div>
            <div>
              <span className="font-semibold block opacity-80">خصم %</span>
              {isDraft ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={discountPct}
                  onChange={(e) => handleDiscountPctChange(e.target.value)}
                  className="peachtree-input w-[70px] text-center text-black"
                  data-testid="input-discount-pct"
                />
              ) : (
                <span className="text-sm font-bold" data-testid="text-discount-pct">{formatNumber(discountPct)}%</span>
              )}
            </div>
            <div>
              <span className="font-semibold block opacity-80">خصم قيمة</span>
              {isDraft ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountValue}
                  onChange={(e) => handleDiscountValueChange(e.target.value)}
                  className="peachtree-input w-[80px] text-center text-black"
                  data-testid="input-discount-value"
                />
              ) : (
                <span className="text-sm font-bold" data-testid="text-discount-value">{formatNumber(discountValue)}</span>
              )}
            </div>
            <div>
              <span className="font-semibold block opacity-80">صافي المستحق</span>
              <span className="text-sm font-bold text-green-300" data-testid="text-net-total">{formatNumber(netTotal)}</span>
            </div>
          </div>
        </div>

        <Dialog open={confirmFinalizeOpen} onOpenChange={setConfirmFinalizeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الاعتماد النهائي</DialogTitle>
              <DialogDescription>هل أنت متأكد من اعتماد هذه الفاتورة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setConfirmFinalizeOpen(false)} data-testid="button-cancel-finalize">إلغاء</Button>
              <Button onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending} data-testid="button-confirm-finalize">
                {finalizeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                تأكيد الاعتماد
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh]" dir="rtl">
            <DialogHeader>
              <DialogTitle>بحث عن صنف</DialogTitle>
              <DialogDescription>ابحث عن الأصناف وأضفها للفاتورة</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <select
                value={searchMode}
                onChange={(e) => setSearchMode(e.target.value)}
                className="peachtree-select"
                data-testid="select-search-mode"
              >
                <option value="AR">اسم عربي</option>
                <option value="EN">اسم انجليزي</option>
                <option value="CODE">كود</option>
                <option value="BARCODE">باركود</option>
              </select>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="ابحث..."
                className="peachtree-input flex-1"
                data-testid="input-search-query"
              />
              {searchLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            <ScrollArea className="max-h-[50vh]">
              <table className="peachtree-grid w-full text-[12px]" data-testid="table-search-results">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th>الكود</th>
                    <th>الاسم</th>
                    <th>الوحدة</th>
                    <th>السعر</th>
                    <th>إضافة</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((item: any) => (
                    <tr key={item.id} className="peachtree-grid-row" data-testid={`row-search-${item.id}`}>
                      <td className="text-center font-mono">{item.itemCode}</td>
                      <td className="font-semibold">{item.nameAr}</td>
                      <td className="text-center">{item.majorUnitName || item.minorUnitName || "-"}</td>
                      <td className="text-center peachtree-amount">{formatNumber(item.salePriceCurrent)}</td>
                      <td className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => addItemToLines(item)}
                          data-testid={`button-add-item-${item.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {searchResults.length === 0 && searchQuery && !searchLoading && (
                    <tr>
                      <td colSpan={5} className="text-center text-muted-foreground py-4">لا توجد نتائج</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
            <div className="flex justify-end mt-2">
              <Button variant="outline" size="sm" onClick={() => setSearchModalOpen(false)} data-testid="button-close-search">
                <X className="h-3 w-3 ml-1" />
                إغلاق
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-bold text-foreground">فواتير البيع</h1>
          <span className="text-xs text-muted-foreground">({totalInvoices} فاتورة)</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleSeedDemo} disabled={seedLoading} data-testid="button-seed-demo">
            {seedLoading ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : null}
            Seed Demo Data
          </Button>
          <Button size="sm" variant="outline" onClick={handleQuickTest} disabled={quickTestLoading} data-testid="button-quick-test">
            {quickTestLoading ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : null}
            Quick Test Invoice
          </Button>
          <Button size="sm" onClick={() => navigate("/sales-invoices?id=new")} data-testid="button-new-invoice">
            <Plus className="h-3 w-3 ml-1" />
            فاتورة جديدة
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap text-[12px]">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">من:</span>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
            className="peachtree-input w-[130px]"
            data-testid="input-filter-date-from"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">إلى:</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
            className="peachtree-input w-[130px]"
            data-testid="input-filter-date-to"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">الحالة:</span>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="peachtree-select"
            data-testid="select-filter-status"
          >
            <option value="all">الكل</option>
            <option value="draft">مسودة</option>
            <option value="finalized">نهائي</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">نوع العميل:</span>
          <select
            value={filterCustomerType}
            onChange={(e) => { setFilterCustomerType(e.target.value); setPage(1); }}
            className="peachtree-select"
            data-testid="select-filter-customer-type"
          >
            <option value="all">الكل</option>
            <option value="cash">نقدي</option>
            <option value="credit">آجل</option>
            <option value="contract">تعاقد</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="بحث..."
            className="peachtree-input w-[160px]"
            data-testid="input-filter-search"
          />
        </div>
      </div>

      {listLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-invoices">
            <thead>
              <tr className="peachtree-grid-header">
                <th>#</th>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>نوع العميل</th>
                <th>العميل</th>
                <th>المخزن</th>
                <th>الإجمالي</th>
                <th>الخصم</th>
                <th>الصافي</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr
                  key={inv.id}
                  className="peachtree-grid-row cursor-pointer"
                  onClick={() => navigate(`/sales-invoices?id=${inv.id}`)}
                  data-testid={`row-invoice-${inv.id}`}
                >
                  <td className="text-center">{(page - 1) * pageSize + i + 1}</td>
                  <td className="text-center font-mono">{inv.invoiceNumber}</td>
                  <td className="text-center">{formatDateShort(inv.invoiceDate)}</td>
                  <td className="text-center">{customerTypeLabels[inv.customerType] || inv.customerType}</td>
                  <td>{inv.customerName || "-"}</td>
                  <td>{inv.warehouse?.nameAr || warehouseName(inv.warehouseId)}</td>
                  <td className="text-center peachtree-amount">{formatNumber(inv.subtotal)}</td>
                  <td className="text-center peachtree-amount">{formatNumber(inv.discountValue)}</td>
                  <td className="text-center peachtree-amount font-bold">{formatNumber(inv.netTotal)}</td>
                  <td className="text-center">
                    {statusBadge(inv.status)}
                  </td>
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {inv.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDeleteId(inv.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${inv.id}`}
                        >
                          {deleteMutation.isPending && deleteMutation.variables === inv.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3 text-destructive" />
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-muted-foreground py-6">لا توجد فواتير</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page">
            <ChevronRight className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">
            <ChevronLeft className="h-3 w-3" />
          </Button>
        </div>
      )}

      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} data-testid="button-cancel-delete">إلغاء</Button>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
