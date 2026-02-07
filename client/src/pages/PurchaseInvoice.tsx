import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, ArrowRight, Save, CheckCircle, Eye, Trash2, ChevronLeft, ChevronRight, FileText, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateShort, formatNumber } from "@/lib/formatters";
import type { Supplier, Warehouse, PurchaseInvoiceWithDetails } from "@shared/schema";
import { purchaseInvoiceStatusLabels } from "@shared/schema";

interface InvoiceLineLocal {
  id: string;
  receivingLineId: string | null;
  itemId: string;
  item: any;
  unitLevel: string;
  qty: number;
  bonusQty: number;
  sellingPrice: number;
  purchasePrice: number;
  lineDiscountPct: number;
  lineDiscountValue: number;
  vatRate: number;
  valueBeforeVat: number;
  vatAmount: number;
  valueAfterVat: number;
  batchNumber: string;
  expiryMonth: number | null;
  expiryYear: number | null;
}

function recalcLine(line: InvoiceLineLocal): InvoiceLineLocal {
  const { qty, bonusQty, purchasePrice, sellingPrice, lineDiscountPct, vatRate } = line;
  const valueBeforeVat = +(qty * purchasePrice).toFixed(2);
  const vatBase = +((qty + bonusQty) * purchasePrice).toFixed(2);
  const vatAmount = +(vatBase * (vatRate / 100)).toFixed(2);
  const valueAfterVat = +(valueBeforeVat + vatAmount).toFixed(2);
  const lineDiscountValue = +(sellingPrice * (lineDiscountPct / 100)).toFixed(2);
  return { ...line, valueBeforeVat, vatAmount, valueAfterVat, lineDiscountValue };
}

function getLineDiscountErrors(ln: InvoiceLineLocal): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  if (ln.purchasePrice < 0) errors.push({ field: "purchasePrice", message: "سعر الشراء لا يمكن أن يكون سالب" });
  if (ln.lineDiscountPct >= 100) errors.push({ field: "discountPct", message: "نسبة الخصم لا يمكن أن تكون 100% أو أكثر" });
  if (ln.sellingPrice > 0 && ln.lineDiscountValue > ln.sellingPrice) errors.push({ field: "discountValue", message: "قيمة الخصم أكبر من سعر البيع" });
  return errors;
}

function itemRequiresExpiry(item: any): boolean {
  return Boolean(
    item?.expiryIndicator === 1 ||
      item?.expiryIndicator === true ||
      item?.hasExpiry === true ||
      item?.expiryRequired === true ||
      item?.trackExpiry === true
  );
}

function getLineCoreErrors(ln: InvoiceLineLocal): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];

  // سعر البيع إلزامي
  if (!ln.sellingPrice || ln.sellingPrice <= 0) {
    errors.push({ field: "sellingPrice", message: "سعر البيع إلزامي ولازم يكون أكبر من صفر" });
  }

  // الصلاحية إلزامية فقط لو الصنف له صلاحية
  const requiresExpiry = itemRequiresExpiry(ln.item);
  if (requiresExpiry) {
    if (!ln.expiryMonth || !ln.expiryYear) {
      errors.push({ field: "expiry", message: "تاريخ الصلاحية إلزامي لهذا الصنف" });
    }
  }

  return errors;
}

function formatLineErrors(lines: InvoiceLineLocal[]): string {
  const bad: { index: number; messages: string[] }[] = [];

  lines.forEach((ln, i) => {
    const errs = [...getLineCoreErrors(ln), ...getLineDiscountErrors(ln)];
    if (errs.length) bad.push({ index: i + 1, messages: errs.map((e) => e.message) });
  });

  if (!bad.length) return "";

  return bad
    .slice(0, 8)
    .map((x) => `سطر ${x.index}: ${Array.from(new Set(x.messages)).join(" | ")}`)
    .join("\n");
}

function getUnitName(item: any, unitLevel: string): string {
  if (unitLevel === "major") return item?.majorUnitName || "وحدة كبرى";
  if (unitLevel === "medium") return item?.mediumUnitName || "وحدة وسطى";
  return item?.minorUnitName || "وحدة صغرى";
}

export default function PurchaseInvoice() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const editId = params.get("id");

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [lines, setLines] = useState<InvoiceLineLocal[]>([]);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [discountType, setDiscountType] = useState("value");
  const [discountValue, setDiscountValue] = useState(0);
  const [invoiceDiscountPct, setInvoiceDiscountPct] = useState(0);
  const [invoiceDiscountVal, setInvoiceDiscountVal] = useState(0);
  const [notes, setNotes] = useState("");
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: suppliersData } = useQuery<{ suppliers: Supplier[]; total: number }>({
    queryKey: ["/api/suppliers?page=1&pageSize=500"],
  });
  const suppliers = suppliersData?.suppliers || [];

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: listData, isLoading: listLoading } = useQuery<{ data: PurchaseInvoiceWithDetails[]; total: number }>({
    queryKey: [
      `/api/purchase-invoices?page=${page}&pageSize=${pageSize}${
        filterStatus !== "all" ? `&status=${filterStatus}` : ""
      }${filterSupplierId !== "all" ? `&supplierId=${filterSupplierId}` : ""}${filterDateFrom ? `&dateFrom=${filterDateFrom}` : ""}${
        filterDateTo ? `&dateTo=${filterDateTo}` : ""
      }`,
    ],
    enabled: !editId,
  });

  const invoices = listData?.data || [];
  const totalInvoices = listData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalInvoices / pageSize));

  const { data: invoiceDetail, isLoading: detailLoading } = useQuery<PurchaseInvoiceWithDetails>({
    queryKey: [`/api/purchase-invoices/${editId}`],
    enabled: !!editId,
  });

  useEffect(() => {
    if (invoiceDetail) {
      setInvoiceDate(invoiceDetail.invoiceDate);
      const dt = invoiceDetail.discountType || "value";
      const dv = parseFloat(String(invoiceDetail.discountValue)) || 0;
      setDiscountType("value");

      const totalBV = (invoiceDetail.lines || []).reduce((s: number, ln: any) => {
        return s + (parseFloat(String(ln.qty)) || 0) * (parseFloat(String(ln.purchasePrice)) || 0);
      }, 0);

      if (dt === "percent") {
        const calcVal = +(totalBV * (dv / 100)).toFixed(2);
        setInvoiceDiscountPct(dv);
        setInvoiceDiscountVal(calcVal);
        setDiscountValue(calcVal);
      } else {
        setInvoiceDiscountVal(dv);
        setDiscountValue(dv);
        const calcPct = totalBV > 0 ? +((dv / totalBV) * 100).toFixed(4) : 0;
        setInvoiceDiscountPct(calcPct);
      }
      setNotes(invoiceDetail.notes || "");
      const mapped: InvoiceLineLocal[] = (invoiceDetail.lines || []).map((ln: any) => {
        const line: InvoiceLineLocal = {
          id: ln.id,
          receivingLineId: ln.receivingLineId || null,
          itemId: ln.itemId,
          item: ln.item || null,
          unitLevel: ln.unitLevel,
          qty: parseFloat(String(ln.qty)) || 0,
          bonusQty: parseFloat(String(ln.bonusQty)) || 0,
          sellingPrice: parseFloat(String(ln.sellingPrice)) || 0,
          purchasePrice: parseFloat(String(ln.purchasePrice)) || 0,
          lineDiscountPct: parseFloat(String(ln.lineDiscountPct)) || 0,
          lineDiscountValue: parseFloat(String(ln.lineDiscountValue)) || 0,
          vatRate: parseFloat(String(ln.vatRate)) || 14,
          valueBeforeVat: parseFloat(String(ln.valueBeforeVat)) || 0,
          vatAmount: parseFloat(String(ln.vatAmount)) || 0,
          valueAfterVat: parseFloat(String(ln.valueAfterVat)) || 0,
          batchNumber: ln.batchNumber || "",
          expiryMonth: ln.expiryMonth ?? null,
          expiryYear: ln.expiryYear ?? null,
        };
        return recalcLine(line);
      });
      setLines(mapped);
    }
  }, [invoiceDetail]);

  const isApproved = invoiceDetail?.status === "approved_costed";
  const isDraft = invoiceDetail?.status === "draft";

  const summary = useMemo(() => {
    const totalBeforeVat = lines.reduce((s, l) => s + l.valueBeforeVat, 0);
    const totalVatBeforeDiscount = lines.reduce((s, l) => s + l.vatAmount, 0);
    const totalAfterVatBeforeDiscount = totalBeforeVat + totalVatBeforeDiscount;
    const totalLineDiscounts = lines.reduce((s, l) => s + l.lineDiscountValue, 0);

    let invoiceDiscountAmount = Math.min(invoiceDiscountVal, totalAfterVatBeforeDiscount);
    if (invoiceDiscountAmount < 0) invoiceDiscountAmount = 0;

    const netPayable = +(totalAfterVatBeforeDiscount - invoiceDiscountAmount).toFixed(2);

    return {
      totalBeforeVat: +totalBeforeVat.toFixed(2),
      totalVat: +totalVatBeforeDiscount.toFixed(2),
      totalAfterVat: +totalAfterVatBeforeDiscount.toFixed(2),
      totalLineDiscounts: +totalLineDiscounts.toFixed(2),
      invoiceDiscountAmount: +invoiceDiscountAmount.toFixed(2),
      netPayable,
    };
  }, [lines, invoiceDiscountVal]);

  const handlePurchasePriceChange = useCallback((index: number, val: string) => {
    const newPrice = Math.max(0, parseFloat(val) || 0);
    setLines((prev) => {
      const updated = [...prev];
      const ln = { ...updated[index] };
      ln.purchasePrice = newPrice;
      if (ln.sellingPrice > 0) {
        const dv = +(ln.sellingPrice - newPrice).toFixed(2);
        ln.lineDiscountValue = Math.max(0, dv);
        ln.lineDiscountPct = +((ln.lineDiscountValue / ln.sellingPrice) * 100).toFixed(2);
      }
      updated[index] = recalcLine(ln);
      return updated;
    });
  }, []);

  const handleDiscountPctChange = useCallback((index: number, val: string) => {
    const pct = +Math.min(99.99, Math.max(0, parseFloat(val) || 0)).toFixed(2);
    setLines((prev) => {
      const updated = [...prev];
      const ln = { ...updated[index] };
      ln.lineDiscountPct = pct;
      ln.lineDiscountValue = +(ln.sellingPrice * (pct / 100)).toFixed(2);
      ln.purchasePrice = +(ln.sellingPrice - ln.lineDiscountValue).toFixed(4);
      updated[index] = recalcLine(ln);
      return updated;
    });
  }, []);

  const handleDiscountValueChange = useCallback((index: number, val: string) => {
    setLines((prev) => {
      const updated = [...prev];
      const ln = { ...updated[index] };
      const dv = parseFloat(val) || 0;
      ln.lineDiscountValue = +Math.min(ln.sellingPrice, Math.max(0, dv)).toFixed(2);
      if (ln.sellingPrice > 0) {
        ln.lineDiscountPct = +((ln.lineDiscountValue / ln.sellingPrice) * 100).toFixed(2);
      }
      ln.purchasePrice = +(ln.sellingPrice - ln.lineDiscountValue).toFixed(4);
      updated[index] = recalcLine(ln);
      return updated;
    });
  }, []);

  const handleVatRateChange = useCallback((index: number, val: string) => {
    const rate = Math.max(0, parseFloat(val) || 0);
    setLines((prev) => {
      const updated = [...prev];
      const ln = { ...updated[index] };
      ln.vatRate = rate;
      updated[index] = recalcLine(ln);
      return updated;
    });
  }, []);

  const handleInvoiceDiscountPctChange = useCallback((val: string) => {
    const pct = Math.min(100, Math.max(0, parseFloat(val) || 0));
    setInvoiceDiscountPct(+pct.toFixed(4));
    const totalBV = lines.reduce((s, l) => s + l.valueBeforeVat, 0);
    const calcVal = +(totalBV * (pct / 100)).toFixed(2);
    setInvoiceDiscountVal(calcVal);
    setDiscountType("value");
    setDiscountValue(calcVal);
  }, [lines]);

  const handleInvoiceDiscountValChange = useCallback((val: string) => {
    const totalBV = lines.reduce((s, l) => s + l.valueBeforeVat, 0);
    const v = Math.min(totalBV, Math.max(0, parseFloat(val) || 0));
    setInvoiceDiscountVal(+v.toFixed(2));
    const calcPct = totalBV > 0 ? +((v / totalBV) * 100).toFixed(4) : 0;
    setInvoiceDiscountPct(calcPct);
    setDiscountType("value");
    setDiscountValue(+v.toFixed(2));
  }, [lines]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const errorText = formatLineErrors(lines);
      if (errorText) {
        throw new Error(`لا يمكن الحفظ بسبب أخطاء في بيانات الأصناف:\n${errorText}`);
      }

      const body = {
        lines: lines.map((ln) => ({
          id: ln.id,
          receivingLineId: ln.receivingLineId,
          itemId: ln.itemId,
          unitLevel: ln.unitLevel,
          qty: ln.qty,
          bonusQty: ln.bonusQty,
          sellingPrice: ln.sellingPrice,
          purchasePrice: ln.purchasePrice,
          lineDiscountPct: ln.lineDiscountPct,
          lineDiscountValue: ln.lineDiscountValue,
          vatRate: ln.vatRate,
          valueBeforeVat: ln.valueBeforeVat,
          vatAmount: ln.vatAmount,
          valueAfterVat: ln.valueAfterVat,
          batchNumber: ln.batchNumber,
          expiryMonth: ln.expiryMonth,
          expiryYear: ln.expiryYear,
        })),
        discountType,
        discountValue,
        invoiceDate,
        notes,
      };

      await apiRequest("PATCH", `/api/purchase-invoices/${editId}`, body);
    },
    onSuccess: () => {
      toast({ title: "تم الحفظ بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: [`/api/purchase-invoices/${editId}`] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const errorText = formatLineErrors(lines);
      if (errorText) {
        throw new Error(`لا يمكن الاعتماد بسبب أخطاء في بيانات الأصناف:\n${errorText}`);
      }

      const body = {
        lines: lines.map((ln) => ({
          id: ln.id,
          receivingLineId: ln.receivingLineId,
          itemId: ln.itemId,
          unitLevel: ln.unitLevel,
          qty: ln.qty,
          bonusQty: ln.bonusQty,
          sellingPrice: ln.sellingPrice,
          purchasePrice: ln.purchasePrice,
          lineDiscountPct: ln.lineDiscountPct,
          lineDiscountValue: ln.lineDiscountValue,
          vatRate: ln.vatRate,
          valueBeforeVat: ln.valueBeforeVat,
          vatAmount: ln.vatAmount,
          valueAfterVat: ln.valueAfterVat,
          batchNumber: ln.batchNumber,
          expiryMonth: ln.expiryMonth,
          expiryYear: ln.expiryYear,
        })),
        discountType,
        discountValue,
        invoiceDate,
        notes,
      };

      await apiRequest("PATCH", `/api/purchase-invoices/${editId}`, body);
      await apiRequest("POST", `/api/purchase-invoices/${editId}/approve`);
    },
    onSuccess: () => {
      toast({ title: "تم الحفظ والاعتماد والتسعير بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: [`/api/purchase-invoices/${editId}`] });
      setConfirmApproveOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الاعتماد", description: err.message, variant: "destructive" });
      setConfirmApproveOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/purchase-invoices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم الحذف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    },
  });

  const supplierName = (id: string) => {
    const s = suppliers.find((s) => s.id === id);
    return s ? s.nameAr : "";
  };

  const warehouseName = (id: string) => {
    const w = warehouses?.find((w) => w.id === id);
    return w ? w.nameAr : "";
  };

  if (editId) {
    if (detailLoading) {
      return (
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }

    if (!invoiceDetail) {
      return (
        <div className="p-4 text-center">
          <p className="text-muted-foreground">لم يتم العثور على الفاتورة</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/purchase-invoices")} data-testid="button-back-not-found">
            <ArrowRight className="h-4 w-4 ml-1" />
            رجوع
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 sticky top-0 z-50">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate("/purchase-invoices")} data-testid="button-back">
              <ArrowRight className="h-4 w-4 ml-1" />
              رجوع
            </Button>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-sm font-bold">فاتورة شراء #{invoiceDetail.invoiceNumber}</h1>
            <Badge
              className={invoiceDetail.status === "approved_costed" ? "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" : ""}
              variant={invoiceDetail.status === "draft" ? "secondary" : "default"}
              data-testid="badge-status"
            >
              {purchaseInvoiceStatusLabels[invoiceDetail.status] || invoiceDetail.status}
            </Badge>
          </div>
          {isDraft && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save">
                {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
                حفظ
              </Button>
              <Button size="sm" onClick={() => setConfirmApproveOpen(true)} disabled={approveMutation.isPending} data-testid="button-approve">
                {approveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <CheckCircle className="h-3 w-3 ml-1" />}
                اعتماد وتسعير
              </Button>
            </div>
          )}
        </div>

        <div className="peachtree-toolbar flex items-center gap-4 flex-wrap text-[12px]">
          <div className="flex items-center gap-1">
            <span className="font-semibold">المورد:</span>
            <span data-testid="text-supplier">{invoiceDetail.supplier?.nameAr || supplierName(invoiceDetail.supplierId)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">رقم فاتورة المورد:</span>
            <span data-testid="text-supplier-invoice">{invoiceDetail.supplierInvoiceNo}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">المخزن:</span>
            <span data-testid="text-warehouse">{invoiceDetail.warehouse?.nameAr || warehouseName(invoiceDetail.warehouseId)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">التاريخ:</span>
            {isDraft ? (
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="peachtree-input w-[130px]" data-testid="input-invoice-date" />
            ) : (
              <span data-testid="text-invoice-date">{formatDateShort(invoiceDate)}</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          <table className="peachtree-grid w-full text-[12px]" data-testid="table-lines">
            <thead>
              <tr className="peachtree-grid-header">
                <th>#</th>
                <th>الصنف</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>هدية</th>
                <th>سعر البيع</th>
                <th>سعر الشراء</th>
                <th>خصم%</th>
                <th>خصم قيمة</th>
                <th>ض.ق.م%</th>
                <th>قبل ض.ق.م</th>
                <th>ض.ق.م</th>
                <th>بعد ض.ق.م</th>
                <th>التشغيلة/الصلاحية</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => {
                const priceWarning = ln.purchasePrice > ln.sellingPrice && ln.sellingPrice > 0;
                const hasCoreErrors = getLineCoreErrors(ln).length > 0;

                return (
                  <tr
                    key={ln.id}
                    className={`peachtree-grid-row ${hasCoreErrors ? "bg-red-50 dark:bg-red-900/20" : ""} ${
                      priceWarning ? "bg-orange-50 dark:bg-orange-900/20" : ""
                    }`}
                    data-testid={`row-line-${i}`}
                  >
                    <td className="text-center">{i + 1}</td>
                    <td className="max-w-[160px] truncate" title={ln.item?.nameAr || ""}>
                      {ln.item?.nameAr || ln.itemId}
                      {priceWarning && <AlertTriangle className="inline h-3 w-3 text-orange-500 mr-1" />}
                    </td>
                    <td className="text-center">{getUnitName(ln.item, ln.unitLevel)}</td>
                    <td className="text-center peachtree-amount">{formatNumber(ln.qty)}</td>
                    <td className="text-center peachtree-amount">{formatNumber(ln.bonusQty)}</td>
                    <td className="text-center peachtree-amount">{formatNumber(ln.sellingPrice)}</td>
                    <td className="text-center">
                      {isDraft ? (
                        <>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={ln.purchasePrice}
                            onChange={(e) => handlePurchasePriceChange(i, e.target.value)}
                            className={`peachtree-input w-[80px] text-center ${priceWarning ? "border-orange-400" : ""} ${ln.purchasePrice < 0 ? "border-red-400" : ""}`}
                            data-testid={`input-purchase-price-${i}`}
                          />
                          {priceWarning && <span className="text-[10px] text-orange-500">سعر الشراء أعلى من البيع</span>}
                        </>
                      ) : (
                        <span className="peachtree-amount">{formatNumber(ln.purchasePrice)}</span>
                      )}
                    </td>
                    <td className="text-center">
                      {isDraft ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="99.99"
                          value={ln.lineDiscountPct}
                          onChange={(e) => handleDiscountPctChange(i, e.target.value)}
                          className={`peachtree-input w-[60px] text-center ${ln.lineDiscountPct >= 100 ? "border-red-400" : ""}`}
                          data-testid={`input-discount-pct-${i}`}
                        />
                      ) : (
                        <span className="peachtree-amount">{formatNumber(ln.lineDiscountPct)}</span>
                      )}
                    </td>
                    <td className="text-center">
                      {isDraft ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ln.lineDiscountValue}
                          onChange={(e) => handleDiscountValueChange(i, e.target.value)}
                          className={`peachtree-input w-[80px] text-center ${ln.sellingPrice > 0 && ln.lineDiscountValue > ln.sellingPrice ? "border-red-400" : ""}`}
                          data-testid={`input-discount-value-${i}`}
                        />
                      ) : (
                        <span className="peachtree-amount">{formatNumber(ln.lineDiscountValue)}</span>
                      )}
                    </td>
                    <td className="text-center">
                      {isDraft ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ln.vatRate}
                          onChange={(e) => handleVatRateChange(i, e.target.value)}
                          className="peachtree-input w-[55px] text-center"
                          data-testid={`input-vat-rate-${i}`}
                        />
                      ) : (
                        <span className="peachtree-amount">{formatNumber(ln.vatRate)}</span>
                      )}
                    </td>
                    <td className="text-center peachtree-amount">{formatNumber(ln.valueBeforeVat)}</td>
                    <td className="text-center peachtree-amount">{formatNumber(ln.vatAmount)}</td>
                    <td className="text-center peachtree-amount">{formatNumber(ln.valueAfterVat)}</td>
                    <td className="text-center text-[11px]">
                      {ln.batchNumber && <span className="ml-1">{ln.batchNumber}</span>}
                      {ln.expiryMonth && ln.expiryYear && <span>{ln.expiryMonth}/{ln.expiryYear}</span>}
                      {!ln.batchNumber && !ln.expiryMonth && "-"}
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={14} className="text-center text-muted-foreground py-6">لا توجد أصناف</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="peachtree-totals p-3 m-2 sticky bottom-0 z-40">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-[12px]">
            <div>
              <span className="font-semibold block">إجمالي قبل ض.ق.م</span>
              <span className="peachtree-amount text-sm font-bold" data-testid="text-total-before-vat">{formatNumber(summary.totalBeforeVat)}</span>
            </div>
            <div>
              <span className="font-semibold block">إجمالي ض.ق.م</span>
              <span className="peachtree-amount text-sm font-bold" data-testid="text-total-vat">{formatNumber(summary.totalVat)}</span>
            </div>
            <div>
              <span className="font-semibold block">إجمالي بعد ض.ق.م</span>
              <span className="peachtree-amount text-sm font-bold" data-testid="text-total-after-vat">{formatNumber(summary.totalAfterVat)}</span>
            </div>
            <div>
              <span className="font-semibold block">إجمالي خصم الأسطر</span>
              <span className="peachtree-amount text-sm" data-testid="text-total-line-discounts">{formatNumber(summary.totalLineDiscounts)}</span>
            </div>
            <div>
              <span className="font-semibold block">خصم إجمالي</span>
              {isDraft ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={invoiceDiscountPct || ""}
                      onChange={(e) => handleInvoiceDiscountPctChange(e.target.value)}
                      className="peachtree-input w-[55px] text-center"
                      placeholder="0"
                      data-testid="input-invoice-discount-pct"
                    />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={invoiceDiscountVal || ""}
                      onChange={(e) => handleInvoiceDiscountValChange(e.target.value)}
                      className="peachtree-input w-[80px] text-center"
                      placeholder="0"
                      data-testid="input-invoice-discount-val"
                    />
                    <span className="text-[10px] text-muted-foreground">ج.م</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="peachtree-amount">{formatNumber(invoiceDiscountPct)}%</span>
                  <span className="text-muted-foreground mx-0.5">=</span>
                  <span className="peachtree-amount">{formatNumber(invoiceDiscountVal)}</span>
                </div>
              )}
            </div>
            <div>
              <span className="font-semibold block">صافي المستحق</span>
              <span className="peachtree-amount text-sm font-bold text-green-700 dark:text-green-400" data-testid="text-net-payable">{formatNumber(summary.netPayable)}</span>
            </div>
          </div>
        </div>

        <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تأكيد الاعتماد والتسعير</DialogTitle>
              <DialogDescription>هل أنت متأكد من اعتماد هذه الفاتورة وتسعيرها؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmApproveOpen(false)} data-testid="button-cancel-approve">
                إلغاء
              </Button>
              <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} data-testid="button-confirm-approve">
                {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                تأكيد الاعتماد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-bold text-foreground">فواتير الشراء</h1>
          <span className="text-xs text-muted-foreground">({totalInvoices} فاتورة)</span>
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
          <span className="text-xs font-medium">المورد:</span>
          <select
            value={filterSupplierId}
            onChange={(e) => { setFilterSupplierId(e.target.value); setPage(1); }}
            className="peachtree-select min-w-[140px]"
            data-testid="select-filter-supplier"
          >
            <option value="all">الكل</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.nameAr}</option>
            ))}
          </select>
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
            <option value="approved_costed">مُعتمد ومُسعّر</option>
          </select>
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
                <th>المورد</th>
                <th>رقم فاتورة المورد</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>الإجمالي</th>
                <th>صافي المستحق</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr key={inv.id} className="peachtree-grid-row" data-testid={`row-invoice-${inv.id}`}>
                  <td className="text-center">{(page - 1) * pageSize + i + 1}</td>
                  <td className="text-center font-mono">{inv.invoiceNumber}</td>
                  <td>{inv.supplier?.nameAr || supplierName(inv.supplierId)}</td>
                  <td className="text-center">{inv.supplierInvoiceNo}</td>
                  <td className="text-center">{formatDateShort(inv.invoiceDate)}</td>
                  <td className="text-center">
                    <Badge
                      className={inv.status === "approved_costed" ? "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" : ""}
                      variant={inv.status === "draft" ? "secondary" : "default"}
                      data-testid={`badge-status-${inv.id}`}
                    >
                      {purchaseInvoiceStatusLabels[inv.status] || inv.status}
                    </Badge>
                  </td>
                  <td className="text-center peachtree-amount">{formatNumber(inv.totalAfterVat)}</td>
                  <td className="text-center peachtree-amount font-bold">{formatNumber(inv.netPayable)}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/purchase-invoices?id=${inv.id}`)}
                        data-testid={`button-view-${inv.id}`}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
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
                  <td colSpan={9} className="text-center text-muted-foreground py-6">لا توجد فواتير</td>
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
          <DialogFooter className="gap-2">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}