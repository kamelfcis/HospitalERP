import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export function useCashierShift() {
  const { toast } = useToast();

  const [selectedUnitType, setSelectedUnitType] = useState<UnitType | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [cashierName, setCashierName] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [shiftGlAccountId, setShiftGlAccountId] = useState("");
  const [drawerPassword, setDrawerPassword] = useState("");
  const [glAccountSearch, setGlAccountSearch] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closingCash, setClosingCash] = useState("0");

  const { data: unitsData } = useQuery<{ pharmacies: any[]; departments: any[] }>({
    queryKey: ["/api/cashier/units"],
  });

  const { data: staffList } = useQuery<{ id: string; username: string; fullName: string }[]>({
    queryKey: ["/api/cashier/staff"],
  });

  const { data: drawerPasswordsData } = useQuery<{ glAccountId: string; hasPassword: boolean; code: string; name: string }[]>({
    queryKey: ["/api/drawer-passwords"],
  });

  const selectedDrawerHasPassword = useMemo(() => {
    if (!shiftGlAccountId || !drawerPasswordsData) return false;
    return drawerPasswordsData.find(d => d.glAccountId === shiftGlAccountId)?.hasPassword || false;
  }, [shiftGlAccountId, drawerPasswordsData]);

  const cashAccounts = useMemo(() => {
    if (!drawerPasswordsData) return [];
    return drawerPasswordsData.filter(d => d.code !== "1211" && d.code !== "1212");
  }, [drawerPasswordsData]);

  const filteredGlAccounts = useMemo(() => {
    if (!cashAccounts.length) return [];
    if (!glAccountSearch.trim()) return cashAccounts;
    const q = glAccountSearch.toLowerCase();
    return cashAccounts.filter(a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [cashAccounts, glAccountSearch]);

  const { data: activeShift, isLoading: shiftLoading } = useQuery<CashierShift | null>({
    queryKey: ["/api/cashier/shift/active", selectedUnitType, selectedUnitId],
    queryFn: async () => {
      if (!selectedUnitType || !selectedUnitId) return null;
      const res = await fetch(`/api/cashier/shift/active?unitType=${selectedUnitType}&unitId=${selectedUnitId}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل جلب بيانات الوردية");
      return res.json();
    },
    enabled: !!selectedUnitType && !!selectedUnitId,
    retry: false,
  });

  const shiftId = activeShift?.id;
  const hasActiveShift = !!activeShift && activeShift.status === "open";
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

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const body: any = { cashierName, openingCash, unitType: selectedUnitType, glAccountId: shiftGlAccountId || undefined };
      if (selectedUnitType === "pharmacy") body.pharmacyId = selectedUnitId;
      else body.departmentId = selectedUnitId;
      if (drawerPassword) body.drawerPassword = drawerPassword;
      const res = await apiRequest("POST", "/api/cashier/shift/open", body);
      return res.json();
    },
    onSuccess: () => {
      setDrawerPassword("");
      toast({ title: "تم فتح الوردية بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/shift/active", selectedUnitType, selectedUnitId] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/cashier/shift/active", selectedUnitType, selectedUnitId] });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في الإغلاق", description: error.message, variant: "destructive" });
    },
  });

  const canOpenShift = !!cashierName.trim() && !!selectedUnitId && !!shiftGlAccountId && (!selectedDrawerHasPassword || !!drawerPassword);

  return {
    selectedUnitType, setSelectedUnitType,
    selectedUnitId, setSelectedUnitId,
    cashierName, setCashierName,
    openingCash, setOpeningCash,
    shiftGlAccountId, setShiftGlAccountId,
    drawerPassword, setDrawerPassword,
    glAccountSearch, setGlAccountSearch,
    closeDialogOpen, setCloseDialogOpen,
    closingCash, setClosingCash,
    unitsData, staffList, drawerPasswordsData,
    selectedDrawerHasPassword, cashAccounts, filteredGlAccounts,
    activeShift, shiftLoading, hasActiveShift,
    shiftId, shiftUnitType, shiftUnitId,
    shiftTotals, expectedCash, varianceCalc,
    openShiftMutation, closeShiftMutation, canOpenShift,
  };
}
