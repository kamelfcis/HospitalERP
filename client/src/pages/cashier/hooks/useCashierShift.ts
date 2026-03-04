import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ShiftCloseValidation } from "../components/CloseShiftValidationDialog";

export type UnitType = "pharmacy" | "department";

export interface CashierUnit {
  id: string;
  code: string;
  nameAr: string;
  type: UnitType;
}

export interface CashierShift {
  id: string;
  cashierId: string;
  cashierName: string;
  unitType: string;
  pharmacyId: string | null;
  departmentId: string | null;
  glAccountId: string | null;
  status: string;
  openingCash: string;
  closingCash: string;
  expectedCash: string;
  variance: string;
  openedAt: string;
  closedAt: string | null;
}

export interface ShiftTotals {
  openingCash: string;
  totalCollected: string;
  collectCount: number;
  totalRefunded: string;
  refundCount: number;
  netCash: string;
}

export interface UserGlAccount {
  glAccountId: string;
  code: string;
  name: string;
  hasPassword: boolean;
}

export function useCashierShift() {
  const { toast } = useToast();

  const [selectedUnitType, setSelectedUnitType] = useState<UnitType | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [unitConfirmed, setUnitConfirmed] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [drawerPassword, setDrawerPassword] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closingCash, setClosingCash] = useState("0");
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [validation, setValidation] = useState<ShiftCloseValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const { data: unitsData } = useQuery<{ pharmacies: any[]; departments: any[] }>({
    queryKey: ["/api/cashier/units"],
  });

  const { data: myOpenShift, isLoading: shiftLoading } = useQuery<CashierShift | null>({
    queryKey: ["/api/cashier/my-open-shift"],
    queryFn: async () => {
      const res = await fetch("/api/cashier/my-open-shift", { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب بيانات الوردية");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: userGlAccount } = useQuery<UserGlAccount | null>({
    queryKey: ["/api/cashier/my-cashier-gl-account"],
    queryFn: async () => {
      const res = await fetch("/api/cashier/my-cashier-gl-account", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const activeShift = myOpenShift || null;
  const hasActiveShift = !!activeShift && activeShift.status === "open";
  const shiftId = activeShift?.id;
  const shiftUnitType = activeShift?.unitType || selectedUnitType || "pharmacy";
  const shiftUnitId = activeShift?.pharmacyId || activeShift?.departmentId || selectedUnitId;

  const { data: shiftTotals } = useQuery<ShiftTotals>({
    queryKey: ["/api/cashier/shift", shiftId, "totals"],
    queryFn: async () => {
      const res = await fetch(`/api/cashier/shift/${shiftId}/totals`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب إجماليات الوردية");
      return res.json();
    },
    enabled: !!shiftId && hasActiveShift,
  });

  const expectedCash = useMemo(() => {
    if (!shiftTotals) return 0;
    return parseFloat(shiftTotals.openingCash || "0") +
      parseFloat(shiftTotals.totalCollected || "0") -
      parseFloat(shiftTotals.totalRefunded || "0");
  }, [shiftTotals]);

  const varianceCalc = useMemo(() => parseFloat(closingCash || "0") - expectedCash, [closingCash, expectedCash]);

  const canOpenShift = !!selectedUnitId && !!userGlAccount && (!userGlAccount.hasPassword || !!drawerPassword);

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const body: any = { openingCash, unitType: selectedUnitType };
      if (selectedUnitType === "pharmacy") body.pharmacyId = selectedUnitId;
      else body.departmentId = selectedUnitId;
      if (drawerPassword) body.drawerPassword = drawerPassword;
      const res = await apiRequest("POST", "/api/cashier/shift/open", body);
      return res.json();
    },
    onSuccess: () => {
      setDrawerPassword("");
      toast({ title: "تم فتح الوردية بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/my-open-shift"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cashier/shift/${shiftId}/close`, { closingCash });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم إغلاق الوردية بنجاح" });
      setCloseDialogOpen(false);
      setUnitConfirmed(false);
      setSelectedUnitType(null);
      setSelectedUnitId("");
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/my-open-shift"] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في الإغلاق", description: error.message, variant: "destructive" });
    },
  });

  const handleCloseShiftClick = useCallback(async () => {
    if (!shiftId) return;
    setIsValidating(true);
    setValidation(null);
    try {
      const res = await fetch(`/api/cashier/shift/${shiftId}/validate-close`, { credentials: "include" });
      const result: ShiftCloseValidation = await res.json();
      setValidation(result);
      if (result.reasonCode === "CLEAN") {
        setCloseDialogOpen(true);
      } else {
        setValidationDialogOpen(true);
      }
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
    selectedUnitType, setSelectedUnitType,
    selectedUnitId, setSelectedUnitId,
    unitConfirmed, setUnitConfirmed,
    openingCash, setOpeningCash,
    drawerPassword, setDrawerPassword,
    closeDialogOpen, setCloseDialogOpen,
    closingCash, setClosingCash,
    unitsData, userGlAccount,
    activeShift, shiftLoading, hasActiveShift,
    shiftId, shiftUnitType, shiftUnitId,
    shiftTotals, expectedCash, varianceCalc,
    openShiftMutation, closeShiftMutation, canOpenShift,
    validationDialogOpen, setValidationDialogOpen,
    validation, isValidating,
    handleCloseShiftClick, handleProceedFromValidation,
  };
}
