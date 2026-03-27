// ============================================================
//  useCashierShift — إدارة دورة حياة الوردية
//
//  المسؤوليات:
//  1. قراءة الوردية النشطة من الـ API
//  2. فتح الوردية / إغلاقها
//  3. التحقق من الفواتير المعلّقة قبل الإغلاق
//  4. حساب: النقدية المتوقعة + الفرق
//  5. resolveUnitName — ترجمة ID إلى اسم الوحدة
// ============================================================
import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { printShiftHandover, type ReceiptSettings } from "@/utils/receipt-printer";
import type {
  UnitType, CashierShift, ShiftTotals, UserGlAccount, ShiftCloseValidation,
} from "../types";

export function useCashierShift() {
  const { toast } = useToast();

  // ── State اختيار الوحدة ──────────────────────────────────
  const [selectedUnitType, setSelectedUnitType] = useState<UnitType | null>(null);
  const [selectedUnitId,   setSelectedUnitId]   = useState<string>("");
  const [unitConfirmed,    setUnitConfirmed]     = useState(false);

  // ── State فتح الوردية ────────────────────────────────────
  const [openingCash,    setOpeningCash]    = useState("0");
  const [drawerPassword, setDrawerPassword] = useState("");

  // ── State إغلاق الوردية ──────────────────────────────────
  const [closeDialogOpen,      setCloseDialogOpen]      = useState(false);
  const [closingCash,          setClosingCash]           = useState("0");
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [validation,           setValidation]            = useState<ShiftCloseValidation | null>(null);
  const [isValidating,         setIsValidating]          = useState(false);

  // ── Ref لحفظ آخر إجماليات معروفة قبل الإغلاق ────────────
  const lastShiftTotalsRef = useRef<ShiftTotals | null>(null);
  const lastUnitNameRef    = useRef<string>("");

  // ── جلب إعدادات إيصال الطباعة ────────────────────────────
  const { data: receiptSettings } = useQuery<ReceiptSettings>({
    queryKey: ["/api/receipt-settings"],
  });

  // ── جلب قائمة الوحدات المتاحة ────────────────────────────
  const { data: unitsData } = useQuery<{ pharmacies: any[]; departments: any[] }>({
    queryKey: ["/api/cashier/units"],
  });

  // ── جلب الوردية النشطة (تحديث كل 60 ثانية) ──────────────
  const { data: myOpenShift, isLoading: shiftLoading } = useQuery<CashierShift | null>({
    queryKey: ["/api/cashier/my-open-shift"],
    queryFn: async () => {
      const res = await fetch("/api/cashier/my-open-shift", { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب بيانات الوردية");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // ── حساب GL للمستخدم ─────────────────────────────────────
  const { data: userGlAccount } = useQuery<UserGlAccount | null>({
    queryKey: ["/api/cashier/my-cashier-gl-account"],
    queryFn: async () => {
      const res = await fetch("/api/cashier/my-cashier-gl-account", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  // ── مشتقّات من الوردية النشطة ────────────────────────────
  const activeShift    = myOpenShift || null;
  // الوردية "فعّالة" فقط إذا كانت status='open' (stale مُقصاة من getMyOpenShift)
  const hasActiveShift = !!activeShift && activeShift.status === "open";
  const isStale        = activeShift?.status === "stale";
  const shiftId        = activeShift?.id;
  const shiftUnitType  = activeShift?.unitType || selectedUnitType || "pharmacy";
  const shiftUnitId    = activeShift?.pharmacyId || activeShift?.departmentId || selectedUnitId;

  // ── إجماليات الوردية (لحظية عبر SSE + polling كل 20 ث كشبكة أمان) ───
  const { data: shiftTotals } = useQuery<ShiftTotals>({
    queryKey: ["/api/cashier/shift", shiftId, "totals"],
    queryFn: async () => {
      const res = await fetch(`/api/cashier/shift/${shiftId}/totals`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب إجماليات الوردية");
      const data = await res.json();
      lastShiftTotalsRef.current = data;
      return data;
    },
    enabled: !!shiftId && (hasActiveShift || isStale),
    refetchInterval: 20_000,
    staleTime: 5_000,
  });

  // ── حسابات مالية ─────────────────────────────────────────
  const expectedCash = useMemo(() => {
    if (!shiftTotals) return 0;
    return parseFloat(shiftTotals.openingCash   || "0")
         + parseFloat(shiftTotals.totalCollected || "0")
         - parseFloat(shiftTotals.totalRefunded  || "0");
  }, [shiftTotals]);

  const varianceCalc = useMemo(
    () => parseFloat(closingCash || "0") - expectedCash,
    [closingCash, expectedCash]
  );

  // ── ترجمة unit ID إلى الاسم العربي ───────────────────────
  const resolveUnitName = useCallback(
    (type: string | null, id: string): string => {
      if (!unitsData || !id) return id;
      if (type === "pharmacy")
        return unitsData.pharmacies.find((p) => p.id === id)?.nameAr || id;
      return unitsData.departments.find((d) => d.id === id)?.nameAr || id;
    },
    [unitsData]
  );

  const activeUnitName = resolveUnitName(
    activeShift?.unitType || selectedUnitType,
    shiftUnitId
  );

  // ── قدرة فتح الوردية ─────────────────────────────────────
  const canOpenShift =
    !!selectedUnitId &&
    !!userGlAccount &&
    (!userGlAccount.hasPassword || !!drawerPassword);

  // ── mutation: فتح الوردية ─────────────────────────────────
  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const body: any = { openingCash, unitType: selectedUnitType };
      if (selectedUnitType === "pharmacy") body.pharmacyId = selectedUnitId;
      else                                 body.departmentId = selectedUnitId;
      if (drawerPassword) body.drawerPassword = drawerPassword;
      const res = await apiRequest("POST", "/api/cashier/shift/open", body);
      return res.json();
    },
    onSuccess: () => {
      setDrawerPassword("");
      toast({ title: "تم فتح الوردية بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/my-open-shift"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  // ── mutation: إغلاق الوردية ──────────────────────────────
  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      // احفظ الإجماليات واسم الوحدة قبل الإغلاق (ستُلغى بعد invalidate)
      lastUnitNameRef.current = activeUnitName;
      const res = await apiRequest("POST", `/api/cashier/shift/${shiftId}/close`, { closingCash });
      return res.json();
    },
    onSuccess: (closedShift) => {
      toast({ title: "تم إغلاق الوردية بنجاح" });

      // طباعة إيصال تسليم الدرج تلقائياً
      const totals = lastShiftTotalsRef.current;
      const settings = receiptSettings ?? { header: "", footer: "", logoText: "", autoPrint: false, showPreview: false };
      if (totals) {
        // الحقول تأتي بصيغة snake_case من raw SQL RETURNING *
        const raw = closedShift as any;
        printShiftHandover({
          receiptNumber:     raw.handover_receipt_number ?? raw.handoverReceiptNumber ?? null,
          cashierName:       raw.cashier_name   || raw.cashierName   || "",
          unitName:          lastUnitNameRef.current || "",
          openedAt:          raw.opened_at      || raw.openedAt      || "",
          closedAt:          raw.closed_at      || raw.closedAt      || new Date().toISOString(),
          openingCash:       parseFloat(totals.openingCash       || "0"),
          cashSales:         parseFloat(totals.totalCollected    || "0"),
          creditSales:       parseFloat(totals.creditCollected   || "0"),
          deliveryCollected: parseFloat(totals.deliveryCollected ?? "0"),
          returns:           parseFloat(totals.totalRefunded     || "0"),
          netShift:          parseFloat(totals.netCash           || "0"),
          closingCash:       parseFloat(raw.closing_cash || raw.closingCash || "0"),
          variance:          parseFloat(raw.variance     || "0"),
        }, settings);
      }

      setCloseDialogOpen(false);
      setUnitConfirmed(false);
      setSelectedUnitType(null);
      setSelectedUnitId("");
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/my-open-shift"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ في الإغلاق", description: err.message, variant: "destructive" });
    },
  });

  // ── التحقق من الفواتير المعلّقة قبل الإغلاق ─────────────
  const handleCloseShiftClick = useCallback(async () => {
    if (!shiftId) return;
    setIsValidating(true);
    setValidation(null);
    try {
      const res    = await fetch(`/api/cashier/shift/${shiftId}/validate-close`, { credentials: "include" });
      const result: ShiftCloseValidation = await res.json();
      setValidation(result);
      if (result.reasonCode === "CLEAN") setCloseDialogOpen(true);
      else                               setValidationDialogOpen(true);
    } catch {
      toast({ title: "خطأ", description: "فشل التحقق من حالة الوردية", variant: "destructive" });
    } finally {
      setIsValidating(false);
    }
  }, [shiftId, toast]);

  const handleProceedFromValidation = useCallback(() => {
    setValidationDialogOpen(false);
    setCloseDialogOpen(true);
  }, []);

  return {
    // اختيار الوحدة
    selectedUnitType, setSelectedUnitType,
    selectedUnitId,   setSelectedUnitId,
    unitConfirmed,    setUnitConfirmed,
    unitsData,        resolveUnitName, activeUnitName,
    // فتح الوردية
    openingCash, setOpeningCash,
    drawerPassword, setDrawerPassword,
    userGlAccount, canOpenShift,
    openShiftMutation,
    // الوردية النشطة
    activeShift, shiftLoading, hasActiveShift, isStale,
    shiftId, shiftUnitType, shiftUnitId,
    // الإجماليات
    shiftTotals, expectedCash, varianceCalc,
    // إغلاق الوردية
    closeDialogOpen,      setCloseDialogOpen,
    closingCash,          setClosingCash,
    validationDialogOpen, setValidationDialogOpen,
    validation,           isValidating,
    closeShiftMutation,
    handleCloseShiftClick, handleProceedFromValidation,
  };
}
