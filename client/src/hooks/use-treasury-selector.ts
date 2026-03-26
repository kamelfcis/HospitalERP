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

export interface OpenShift {
  id:            string;
  shift_number:  number;
  started_at:    string;
  cashier_name:  string;
  pharmacy_name: string;
  gl_account_id: string | null;
}

interface MyShiftResponse {
  id:            string;
  shiftNumber:   number;
  startedAt:     string;
  cashierName?:  string;
  pharmacyName?: string;
  glAccountId:   string | null;
}

export interface TreasurySelectorState {
  selectedShiftId:      string;
  setSelectedShiftId:   (id: string) => void;
  selectedGlAccountId:  string | null;
  isAdmin:              boolean;
  myShift:              MyShiftResponse | null;
  allShifts:            OpenShift[];
  isLoading:            boolean;
}

export function useTreasurySelector(): TreasurySelectorState {
  const { user } = useAuth();
  const isAdmin  = user?.role === "admin" || user?.role === "owner";

  const [selectedShiftId, setSelectedShiftId] = useState<string>("none");

  // وردية المستخدم الحالي
  const { data: myShiftData, isLoading: myShiftLoading } = useQuery<MyShiftResponse | null>({
    queryKey: ["/api/cashier/my-open-shift"],
    queryFn: async () => {
      const r = await fetch("/api/cashier/my-open-shift", { credentials: "include" });
      if (r.status === 404) return null;
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !isAdmin,
    retry: false,
    staleTime: 30_000,
  });

  // جميع الورديات المفتوحة (للأدمن)
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

  const myShift   = myShiftData ?? null;
  const allShifts = openShiftsData?.shifts ?? [];

  // اختيار تلقائي للمستخدم غير الأدمن عند توفّر وردية
  useEffect(() => {
    if (!isAdmin && myShift?.id) {
      setSelectedShiftId(myShift.id);
    }
  }, [isAdmin, myShift?.id]);

  // حساب حساب الخزنة المختار
  let selectedGlAccountId: string | null = null;
  if (selectedShiftId !== "none") {
    if (isAdmin) {
      const found = allShifts.find((s) => s.id === selectedShiftId);
      selectedGlAccountId = found?.gl_account_id ?? null;
    } else if (myShift?.id === selectedShiftId) {
      selectedGlAccountId = myShift.gl_account_id ?? null;
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
