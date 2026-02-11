import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, DollarSign, LogIn, LogOut, Search, Receipt, Undo2, Wallet, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber, formatDateShort } from "@/lib/formatters";
import { salesInvoiceStatusLabels } from "@shared/schema";

const CASHIER_ID = "cashier-1";

interface Pharmacy {
  id: string;
  code: string;
  nameAr: string;
  isActive: boolean;
}

interface PendingInvoice {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  customerType: string;
  customerName: string | null;
  subtotal: string;
  discountValue: string;
  netTotal: string;
  createdBy: string | null;
  status: string;
  createdAt: string;
  warehouseName: string | null;
}

interface InvoiceLine {
  id: string;
  lineNo: number;
  itemId: string;
  qty: string;
  salePrice: string;
  lineTotal: string;
  itemName: string;
  itemCode: string;
}

interface InvoiceDetails extends PendingInvoice {
  lines: InvoiceLine[];
}

interface ShiftTotals {
  openingCash: string;
  totalCollected: string;
  collectCount: number;
  totalRefunded: string;
  refundCount: number;
  netCash: string;
}

interface CashierShift {
  id: string;
  cashierId: string;
  cashierName: string;
  pharmacyId: string;
  status: string;
  openingCash: string;
  closingCash: string;
  expectedCash: string;
  variance: string;
  openedAt: string;
  closedAt: string | null;
}

function getStatusBadgeClass(status: string) {
  if (status === "finalized") return "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "collected") return "bg-blue-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "cancelled") return "bg-red-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "draft") return "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate";
  return "";
}

export default function CashierCollection() {
  const { toast } = useToast();
  const [cashierName, setCashierName] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [shiftGlAccountId, setShiftGlAccountId] = useState("");
  const [glAccountSearch, setGlAccountSearch] = useState("");
  const [selectedPharmacyId, setSelectedPharmacyId] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closingCash, setClosingCash] = useState("0");

  const [salesSearch, setSalesSearch] = useState("");
  const [salesSelected, setSalesSelected] = useState<Set<string>>(new Set());

  const [returnsSearch, setReturnsSearch] = useState("");
  const [returnsSelected, setReturnsSelected] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState("sales");
  const sseRef = useRef<EventSource | null>(null);

  const { data: pharmaciesList } = useQuery<Pharmacy[]>({
    queryKey: ["/api/pharmacies"],
  });

  const { data: glAccountsList } = useQuery<{ id: string; code: string; nameAr: string }[]>({
    queryKey: ["/api/accounts"],
  });

  const filteredGlAccounts = useMemo(() => {
    if (!glAccountsList) return [];
    if (!glAccountSearch.trim()) return glAccountsList.slice(0, 50);
    const q = glAccountSearch.toLowerCase();
    return glAccountsList.filter(a => a.code.toLowerCase().includes(q) || a.nameAr.toLowerCase().includes(q)).slice(0, 50);
  }, [glAccountsList, glAccountSearch]);

  const activePharmacyId = selectedPharmacyId || (pharmaciesList && pharmaciesList.length > 0 ? pharmaciesList[0].id : "");

  const { data: activeShift, isLoading: shiftLoading } = useQuery<CashierShift | null>({
    queryKey: ["/api/cashier/shift/active", CASHIER_ID, activePharmacyId],
    queryFn: async () => {
      if (!activePharmacyId) return null;
      const res = await fetch(`/api/cashier/shift/active/${CASHIER_ID}?pharmacyId=${activePharmacyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب بيانات الوردية");
      return res.json();
    },
    enabled: !!activePharmacyId,
  });

  const shiftId = activeShift?.id;
  const hasActiveShift = !!activeShift && activeShift.status === "open";
  const shiftPharmacyId = activeShift?.pharmacyId || activePharmacyId;

  const { data: shiftTotals } = useQuery<ShiftTotals>({
    queryKey: ["/api/cashier/shift", shiftId, "totals"],
    queryFn: async () => {
      const res = await fetch(`/api/cashier/shift/${shiftId}/totals`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب إجماليات الوردية");
      return res.json();
    },
    enabled: !!shiftId && hasActiveShift,
  });

  const { data: pendingSales, isLoading: salesLoading } = useQuery<PendingInvoice[]>({
    queryKey: ["/api/cashier/pending-sales", shiftPharmacyId, salesSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ pharmacyId: shiftPharmacyId });
      if (salesSearch) params.set("search", salesSearch);
      const res = await fetch(`/api/cashier/pending-sales?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب الفواتير");
      return res.json();
    },
    enabled: hasActiveShift && !!shiftPharmacyId,
  });

  const { data: pendingReturns, isLoading: returnsLoading } = useQuery<PendingInvoice[]>({
    queryKey: ["/api/cashier/pending-returns", shiftPharmacyId, returnsSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ pharmacyId: shiftPharmacyId });
      if (returnsSearch) params.set("search", returnsSearch);
      const res = await fetch(`/api/cashier/pending-returns?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب المرتجعات");
      return res.json();
    },
    enabled: hasActiveShift && !!shiftPharmacyId,
  });

  useEffect(() => {
    if (!hasActiveShift || !shiftPharmacyId) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      return;
    }

    const es = new EventSource(`/api/cashier/sse/${shiftPharmacyId}`);
    sseRef.current = es;

    es.addEventListener("invoice_finalized", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-sales", shiftPharmacyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-returns", shiftPharmacyId] });
    });

    es.onerror = () => {
      es.close();
      setTimeout(() => {
        if (hasActiveShift && shiftPharmacyId) {
          queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-sales", shiftPharmacyId] });
          queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-returns", shiftPharmacyId] });
        }
      }, 3000);
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [hasActiveShift, shiftPharmacyId]);

  const singleSalesId = salesSelected.size === 1 ? Array.from(salesSelected)[0] : null;
  const singleReturnsId = returnsSelected.size === 1 ? Array.from(returnsSelected)[0] : null;

  const { data: salesDetails } = useQuery<InvoiceDetails>({
    queryKey: ["/api/cashier/invoice", singleSalesId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/cashier/invoice/${singleSalesId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب تفاصيل الفاتورة");
      return res.json();
    },
    enabled: !!singleSalesId,
  });

  const { data: returnsDetails } = useQuery<InvoiceDetails>({
    queryKey: ["/api/cashier/invoice", singleReturnsId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/cashier/invoice/${singleReturnsId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب تفاصيل الفاتورة");
      return res.json();
    },
    enabled: !!singleReturnsId,
  });

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cashier/shift/open", {
        cashierId: CASHIER_ID,
        cashierName: cashierName.trim(),
        openingCash,
        pharmacyId: activePharmacyId,
        glAccountId: shiftGlAccountId || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم فتح الوردية بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/shift/active", CASHIER_ID, activePharmacyId] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cashier/shift/${shiftId}/close`, {
        closingCash,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم إغلاق الوردية بنجاح" });
      setCloseDialogOpen(false);
      setSalesSelected(new Set());
      setReturnsSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/shift/active", CASHIER_ID, activePharmacyId] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const collectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cashier/collect", {
        shiftId,
        invoiceIds: Array.from(salesSelected),
        collectedBy: activeShift?.cashierName || CASHIER_ID,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "تم التحصيل بنجاح",
        description: `عدد الفواتير: ${data.count} - الإجمالي: ${formatNumber(data.totalCollected)}`,
      });
      setSalesSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-sales", shiftPharmacyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/shift", shiftId, "totals"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في التحصيل", description: error.message, variant: "destructive" });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cashier/refund", {
        shiftId,
        invoiceIds: Array.from(returnsSelected),
        refundedBy: activeShift?.cashierName || CASHIER_ID,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "تم صرف المرتجع بنجاح",
        description: `عدد الفواتير: ${data.count} - الإجمالي: ${formatNumber(data.totalRefunded)}`,
      });
      setReturnsSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/pending-returns", shiftPharmacyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/shift", shiftId, "totals"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في صرف المرتجع", description: error.message, variant: "destructive" });
    },
  });

  const toggleSelection = useCallback((id: string, selected: Set<string>, setSelected: (s: Set<string>) => void) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }, []);

  const toggleAllSelection = useCallback((invoices: PendingInvoice[], selected: Set<string>, setSelected: (s: Set<string>) => void) => {
    if (selected.size === invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map((inv) => inv.id)));
    }
  }, []);

  const salesAggregated = useMemo(() => {
    if (salesSelected.size <= 1) return null;
    const items = (pendingSales || []).filter((inv) => salesSelected.has(inv.id));
    return {
      count: items.length,
      subtotal: items.reduce((s, inv) => s + parseFloat(inv.subtotal || "0"), 0),
      netTotal: items.reduce((s, inv) => s + parseFloat(inv.netTotal || "0"), 0),
    };
  }, [salesSelected, pendingSales]);

  const returnsAggregated = useMemo(() => {
    if (returnsSelected.size <= 1) return null;
    const items = (pendingReturns || []).filter((inv) => returnsSelected.has(inv.id));
    return {
      count: items.length,
      subtotal: items.reduce((s, inv) => s + parseFloat(inv.subtotal || "0"), 0),
      netTotal: items.reduce((s, inv) => s + parseFloat(inv.netTotal || "0"), 0),
    };
  }, [returnsSelected, pendingReturns]);

  const expectedCash = useMemo(() => {
    if (!shiftTotals) return 0;
    return parseFloat(shiftTotals.openingCash || "0") +
      parseFloat(shiftTotals.totalCollected || "0") -
      parseFloat(shiftTotals.totalRefunded || "0");
  }, [shiftTotals]);

  const varianceCalc = useMemo(() => {
    return parseFloat(closingCash || "0") - expectedCash;
  }, [closingCash, expectedCash]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === "Enter") || e.key === "F9") {
        e.preventDefault();
        if (activeTab === "sales" && salesSelected.size > 0 && hasActiveShift && !collectMutation.isPending) {
          collectMutation.mutate();
        } else if (activeTab === "returns" && returnsSelected.size > 0 && hasActiveShift && !refundMutation.isPending) {
          refundMutation.mutate();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, salesSelected, returnsSelected, hasActiveShift, collectMutation, refundMutation]);

  const renderInvoiceTable = (
    invoices: PendingInvoice[],
    loading: boolean,
    search: string,
    setSearch: (v: string) => void,
    selected: Set<string>,
    setSelected: (s: Set<string>) => void,
    testPrefix: string,
  ) => (
    <div className="space-y-2">
      <div className="flex flex-row-reverse items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الفاتورة أو اسم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8 text-right"
            data-testid={`input-${testPrefix}-search`}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-md">
          <Table dir="rtl" className="text-xs">
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-right w-8 py-1 px-2">
                  <Checkbox
                    checked={invoices.length > 0 && selected.size === invoices.length}
                    onCheckedChange={() => toggleAllSelection(invoices, selected, setSelected)}
                    data-testid={`checkbox-${testPrefix}-select-all`}
                  />
                </TableHead>
                <TableHead className="text-right py-1 px-2">رقم الفاتورة</TableHead>
                <TableHead className="text-right py-1 px-2">الإجمالي</TableHead>
                <TableHead className="text-right py-1 px-2">الصافي</TableHead>
                <TableHead className="text-right py-1 px-2">الصيدلي</TableHead>
                <TableHead className="text-right py-1 px-2">التاريخ</TableHead>
                <TableHead className="text-right py-1 px-2">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-xs">
                    لا توجد فواتير معلّقة
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className={`h-7 ${selected.has(inv.id) ? "bg-muted" : ""}`}
                    data-testid={`row-${testPrefix}-${inv.id}`}
                  >
                    <TableCell className="py-1 px-2">
                      <Checkbox
                        checked={selected.has(inv.id)}
                        onCheckedChange={() => toggleSelection(inv.id, selected, setSelected)}
                        data-testid={`checkbox-${testPrefix}-${inv.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium py-1 px-2">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-right py-1 px-2">{formatNumber(inv.subtotal)}</TableCell>
                    <TableCell className="text-right font-medium py-1 px-2">{formatNumber(inv.netTotal)}</TableCell>
                    <TableCell className="text-right py-1 px-2">{inv.createdBy || "-"}</TableCell>
                    <TableCell className="text-right py-1 px-2">{formatDateShort(inv.createdAt)}</TableCell>
                    <TableCell className="text-right py-1 px-2">
                      <Badge className={`text-[10px] px-1.5 py-0 ${getStatusBadgeClass(inv.status)}`}>
                        {salesInvoiceStatusLabels[inv.status] || inv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  const renderDetailsPanel = (
    selected: Set<string>,
    details: InvoiceDetails | undefined,
    aggregated: { count: number; subtotal: number; netTotal: number } | null,
    testPrefix: string,
  ) => (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs">تفاصيل الفاتورة</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {selected.size === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            اختر فاتورة لعرض التفاصيل
          </p>
        ) : selected.size === 1 && details ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs" dir="rtl">
              <div className="text-muted-foreground">رقم الفاتورة:</div>
              <div data-testid={`text-${testPrefix}-detail-number`}>{details.invoiceNumber}</div>
              <div className="text-muted-foreground">الإجمالي:</div>
              <div>{formatNumber(details.subtotal)}</div>
              <div className="text-muted-foreground">الصافي:</div>
              <div className="font-medium">{formatNumber(details.netTotal)}</div>
              <div className="text-muted-foreground">الصيدلي:</div>
              <div>{details.createdBy || "-"}</div>
            </div>
            {details.lines && details.lines.length > 0 && (
              <div className="border rounded-md">
                <Table dir="rtl" className="text-[11px]">
                  <TableHeader>
                    <TableRow className="h-7">
                      <TableHead className="text-right py-1 px-1.5">#</TableHead>
                      <TableHead className="text-right py-1 px-1.5">الكود</TableHead>
                      <TableHead className="text-right py-1 px-1.5">الصنف</TableHead>
                      <TableHead className="text-right py-1 px-1.5">الكمية</TableHead>
                      <TableHead className="text-right py-1 px-1.5">السعر</TableHead>
                      <TableHead className="text-right py-1 px-1.5">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.lines.map((line, idx) => (
                      <TableRow key={line.id} className="h-6" data-testid={`row-${testPrefix}-detail-line-${idx}`}>
                        <TableCell className="text-right py-0.5 px-1.5">{line.lineNo || idx + 1}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{line.itemCode}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{line.itemName}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.qty)}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.salePrice)}</TableCell>
                        <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.lineTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : selected.size === 1 ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : aggregated ? (
          <div className="space-y-2" dir="rtl">
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
              <div className="text-muted-foreground">عدد الفواتير المحددة:</div>
              <div className="font-medium" data-testid={`text-${testPrefix}-agg-count`}>{aggregated.count}</div>
              <div className="text-muted-foreground">إجمالي قبل الخصم:</div>
              <div>{formatNumber(aggregated.subtotal)}</div>
              <div className="text-muted-foreground">إجمالي الصافي:</div>
              <div className="font-medium">{formatNumber(aggregated.netTotal)}</div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-3 space-y-3" dir="rtl" data-testid="page-cashier-collection">
      <h1 className="text-lg font-bold text-right">شاشة تحصيل الكاشير</h1>

      <Card>
        <CardContent className="p-3">
          {shiftLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : hasActiveShift ? (
            <div className="flex flex-row-reverse items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
                <Badge className="text-[10px] px-1.5 py-0 bg-green-600 text-white no-default-hover-elevate no-default-active-elevate">
                  وردية مفتوحة
                </Badge>
                {pharmaciesList && pharmaciesList.length > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate" data-testid="text-shift-pharmacy">
                    <Building2 className="h-2.5 w-2.5 ml-1" />
                    {pharmaciesList.find(p => p.id === shiftPharmacyId)?.nameAr || shiftPharmacyId}
                  </Badge>
                )}
                <span className="text-xs" data-testid="text-shift-cashier-name">
                  الكاشير: {activeShift.cashierName}
                </span>
                <span className="text-xs text-muted-foreground">
                  رصيد الافتتاح: {formatNumber(activeShift.openingCash)}
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setClosingCash("0");
                  setCloseDialogOpen(true);
                }}
                data-testid="button-close-shift"
              >
                <LogOut className="ml-1 h-3 w-3" />
                إغلاق الوردية
              </Button>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
                  <Wallet className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">لا توجد وردية مفتوحة</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  لبدء تحصيل الفواتير، قم بفتح وردية جديدة. اختر الصيدلية وأدخل اسمك والمبلغ النقدي الموجود في الخزنة حالياً.
                </p>
              </div>

              <div className="max-w-sm mx-auto space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium block text-right">الصيدلية</label>
                  <Select value={activePharmacyId} onValueChange={setSelectedPharmacyId} data-testid="select-pharmacy">
                    <SelectTrigger className="text-right" data-testid="select-pharmacy-trigger">
                      <SelectValue placeholder="اختر الصيدلية..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(pharmaciesList || []).filter(p => p.isActive).map(p => (
                        <SelectItem key={p.id} value={p.id} data-testid={`select-pharmacy-option-${p.id}`}>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3 w-3" />
                            <span>{p.nameAr}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium block text-right">اسم الكاشير</label>
                  <Input
                    placeholder="أدخل اسمك هنا..."
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    className="text-right"
                    data-testid="input-cashier-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium block text-right">رصيد الافتتاح (ج.م)</label>
                  <Input
                    type="number"
                    placeholder="المبلغ النقدي الموجود في الخزنة"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    className="text-right"
                    data-testid="input-opening-cash"
                  />
                  <p className="text-xs text-muted-foreground text-right">المبلغ النقدي الفعلي المتواجد في درج الكاشير عند بداية الوردية</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium block text-right">حساب الخزنة (GL)</label>
                  <Select value={shiftGlAccountId} onValueChange={setShiftGlAccountId}>
                    <SelectTrigger className="text-right" data-testid="select-gl-account-trigger">
                      <SelectValue placeholder="اختر حساب الخزنة..." />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input
                          placeholder="بحث بالكود أو الاسم..."
                          value={glAccountSearch}
                          onChange={(e) => setGlAccountSearch(e.target.value)}
                          className="text-right"
                          data-testid="input-gl-account-search"
                        />
                      </div>
                      {filteredGlAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id} data-testid={`select-gl-account-option-${a.id}`}>
                          {a.code} - {a.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground text-right">حساب خزنة الكاشير لتسجيل القيود المحاسبية</p>
                </div>
                <Button
                  onClick={() => openShiftMutation.mutate()}
                  disabled={!cashierName.trim() || !activePharmacyId || openShiftMutation.isPending}
                  className="w-full"
                  data-testid="button-open-shift"
                >
                  {openShiftMutation.isPending ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="ml-2 h-4 w-4" />
                  )}
                  فتح وردية جديدة
                </Button>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-medium text-center mb-3">كيف تعمل شاشة التحصيل؟</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
                  <div className="text-center space-y-1 p-3 rounded-md bg-muted/50">
                    <div className="text-2xl font-bold text-primary">1</div>
                    <div className="text-sm font-medium">افتح الوردية</div>
                    <div className="text-xs text-muted-foreground">أدخل اسمك ورصيد الخزنة الافتتاحي</div>
                  </div>
                  <div className="text-center space-y-1 p-3 rounded-md bg-muted/50">
                    <div className="text-2xl font-bold text-primary">2</div>
                    <div className="text-sm font-medium">حصّل الفواتير</div>
                    <div className="text-xs text-muted-foreground">اختر الفواتير الجاهزة واضغط تحصيل لتسجيل الدفع</div>
                  </div>
                  <div className="text-center space-y-1 p-3 rounded-md bg-muted/50">
                    <div className="text-2xl font-bold text-primary">3</div>
                    <div className="text-sm font-medium">أغلق الوردية</div>
                    <div className="text-xs text-muted-foreground">أدخل المبلغ الفعلي بالخزنة وأغلق الوردية</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {hasActiveShift && (
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
          <TabsList className="w-full justify-start gap-2">
            <TabsTrigger value="sales" data-testid="tab-sales">
              <Receipt className="ml-2 h-4 w-4" />
              تحصيل فواتير البيع
            </TabsTrigger>
            <TabsTrigger value="returns" data-testid="tab-returns">
              <Undo2 className="ml-2 h-4 w-4" />
              رد مرتجعات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <div className="flex flex-row-reverse gap-3">
              <div className="w-[60%] min-w-0">
                {renderInvoiceTable(
                  pendingSales || [],
                  salesLoading,
                  salesSearch,
                  setSalesSearch,
                  salesSelected,
                  setSalesSelected,
                  "sales",
                )}
                <div className="mt-2 flex flex-row-reverse items-center gap-3 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => collectMutation.mutate()}
                    disabled={salesSelected.size === 0 || !hasActiveShift || collectMutation.isPending}
                    data-testid="button-collect"
                  >
                    {collectMutation.isPending ? (
                      <Loader2 className="ml-1 h-3 w-3 animate-spin" />
                    ) : (
                      <DollarSign className="ml-1 h-3 w-3" />
                    )}
                    تحصيل ({salesSelected.size})
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Ctrl+Enter / F9
                  </span>
                </div>
              </div>
              <div className="w-[40%] min-w-0">
                {renderDetailsPanel(salesSelected, salesDetails, salesAggregated, "sales")}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="returns">
            <div className="flex flex-row-reverse gap-3">
              <div className="w-[60%] min-w-0">
                {renderInvoiceTable(
                  pendingReturns || [],
                  returnsLoading,
                  returnsSearch,
                  setReturnsSearch,
                  returnsSelected,
                  setReturnsSelected,
                  "returns",
                )}
                <div className="mt-2 flex flex-row-reverse items-center gap-3 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => refundMutation.mutate()}
                    disabled={returnsSelected.size === 0 || !hasActiveShift || refundMutation.isPending}
                    data-testid="button-refund"
                  >
                    {refundMutation.isPending ? (
                      <Loader2 className="ml-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Undo2 className="ml-1 h-3 w-3" />
                    )}
                    صرف المرتجع ({returnsSelected.size})
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Ctrl+Enter / F9
                  </span>
                </div>
              </div>
              <div className="w-[40%] min-w-0">
                {renderDetailsPanel(returnsSelected, returnsDetails, returnsAggregated, "returns")}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {hasActiveShift && shiftTotals && (
        <div className="fixed bottom-3 left-3 z-50" data-testid="widget-shift-totals">
          <Card className="w-56">
            <CardHeader className="pb-1 pt-2 px-3">
              <CardTitle className="text-[10px] flex flex-row-reverse items-center gap-1">
                <Wallet className="h-3 w-3" />
                ملخص الوردية
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 space-y-0.5" dir="rtl">
              <div className="flex flex-row-reverse justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">التحصيل:</span>
                <span className="font-medium" data-testid="text-total-collected">{formatNumber(shiftTotals.totalCollected)}</span>
              </div>
              <div className="flex flex-row-reverse justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">المرتجعات:</span>
                <span className="font-medium" data-testid="text-total-refunded">{formatNumber(shiftTotals.totalRefunded)}</span>
              </div>
              <div className="border-t pt-0.5 flex flex-row-reverse justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">الصافي:</span>
                <span className="font-bold" data-testid="text-net-cash">{formatNumber(shiftTotals.netCash)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إغلاق الوردية</DialogTitle>
            <DialogDescription className="text-right">
              أدخل المبلغ النقدي الفعلي في الخزنة لإغلاق الوردية
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground text-right">النقدية المتوقعة:</div>
              <div className="text-right font-medium" data-testid="text-expected-cash">
                {formatNumber(expectedCash)}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-right block">النقدية الفعلية:</label>
              <Input
                type="number"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="text-right"
                data-testid="input-closing-cash"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground text-right">الفرق:</div>
              <div
                className={`text-right font-medium ${varianceCalc < 0 ? "text-red-600" : varianceCalc > 0 ? "text-green-600" : ""}`}
                data-testid="text-variance"
              >
                {formatNumber(varianceCalc)}
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-row-reverse gap-2">
            <Button
              onClick={() => closeShiftMutation.mutate()}
              disabled={closeShiftMutation.isPending}
              data-testid="button-confirm-close-shift"
            >
              {closeShiftMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="ml-2 h-4 w-4" />
              )}
              تأكيد إغلاق الوردية
            </Button>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)} data-testid="button-cancel-close-shift">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}