/*
 * useTreasurySelector — hook مشترك لاختيار الخزنة
 * ─────────────────────────────────────────────────
 * منطق موحّد لكلٍ من تحصيل الآجل وسداد الموردين:
 *   • غير أدمن + وردية مفتوحة → اختيار تلقائي (للقراءة فقط)
 *   • أدمن → قائمة منسدلة بجميع الورديات المفتوحة
 *   • غير أدمن بدون وردية → فارغ/معطّل
 */

import { useState, useEffect } from "react";
import { useQuery }            from "@tanstack/react-query";
import { useAuth }             from "@/hooks/use-auth";

// هيكل وردية من endpoint الكل (للأدمن)
export interface OpenShift {
  id:            string;
  opened_at:     string;
  cashier_name:  string;
  pharmacy_name: string;
  gl_account_id: string | null;
}

// هيكل وردية المستخدم الحالي (من my-open-shift — يُعيد CashierShift بـ camelCase)
export interface MyShift {
  id:           string;
  openedAt:     string;
  cashierName:  string;
  glAccountId:  string | null;
  pharmacyId:   string | null;
  unitType:     string;
}

export interface TreasurySelectorState {
  selectedShiftId:      string;
  setSelectedShiftId:   (id: string) => void;
  selectedGlAccountId:  string | null;
  isAdmin:              boolean;
  myShift:              MyShift | null;
  allShifts:            OpenShift[];
  isLoading:            boolean;
}

export function useTreasurySelector(): TreasurySelectorState {
  const { user } = useAuth();
  const isAdmin  = user?.role === "admin" || user?.role === "owner";

  const [selectedShiftId, setSelectedShiftId] = useState<string>("none");

  // وردية المستخدم الحالي (غير الأدمن فقط)
  const { data: myShiftRaw, isLoading: myShiftLoading } = useQuery<MyShift | null>({
    queryKey: ["/api/cashier/my-open-shift"],
    queryFn: async () => {
      const r = await fetch("/api/cashier/my-open-shift", { credentials: "include" });
      if (r.status === 404) return null;
      if (!r.ok) return null;
      const data = await r.json();
      return data ?? null;
    },
    enabled: !isAdmin,
    retry: false,
    staleTime: 30_000,
  });

  // جميع الورديات المفتوحة (للأدمن فقط)
  const { data: openShiftsData, isLoading: shiftsLoading } = useQuery<{ shifts: OpenShift[] }>({
    queryKey: ["/api/customer-payments/open-shifts"],
    queryFn: async () => {
      const r = await fetch("/api/customer-payments/open-shifts", { credentials: "include" });
      if (!r.ok) return { shifts: [] };
      return r.json();
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const myShift   = myShiftRaw ?? null;
  const allShifts = openShiftsData?.shifts ?? [];

  // اختيار تلقائي للمستخدم غير الأدمن عند توفّر وردية
  useEffect(() => {
    if (!isAdmin && myShift?.id) {
      setSelectedShiftId(myShift.id);
    }
  }, [isAdmin, myShift?.id]);

  // حساب GL الخزنة المختارة
  let selectedGlAccountId: string | null = null;
  if (selectedShiftId !== "none") {
    if (isAdmin) {
      const found = allShifts.find((s) => s.id === selectedShiftId);
      selectedGlAccountId = found?.gl_account_id ?? null;
    } else if (myShift?.id === selectedShiftId) {
      selectedGlAccountId = myShift.glAccountId ?? null;
    }
  }

  return {
    selectedShiftId,
    setSelectedShiftId,
    selectedGlAccountId,
    isAdmin,
    myShift,
    allShifts,
    isLoading: isAdmin ? shiftsLoading : myShiftLoading,
  };
}
