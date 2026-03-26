/*
 * useTreasurySelector — hook مشترك لاختيار الخزنة
 * ─────────────────────────────────────────────────
 * المنطق الموحّد لكلٍ من تحصيل الآجل وسداد الموردين:
 *
 * أدمن/مالك:
 *   → يجلب جميع الخزن النشطة من /api/customer-payments/active-treasuries
 *   → قائمة منسدلة كاملة، يختار منها
 *
 * موظف عادي:
 *   → يجلب خزنته المخصصة من /api/treasuries/mine
 *   → إن وُجدت → يختارها تلقائياً (شارة للقراءة فقط)
 *   → إن لم تُوجد → "لا توجد خزنة مخصصة"
 */

import { useState, useEffect } from "react";
import { useQuery }            from "@tanstack/react-query";
import { useAuth }             from "@/hooks/use-auth";

// خزنة من قائمة الخزن النشطة (للأدمن)
export interface ActiveTreasury {
  id:            string;
  name:          string;
  gl_account_id: string;
}

// خزنة المستخدم الشخصية من user_treasuries
export interface MyTreasury {
  id:             string;
  name:           string;
  glAccountId:    string;
  glAccountCode:  string;
  glAccountName:  string;
}

export interface TreasurySelectorState {
  selectedTreasuryId:   string;
  setSelectedTreasuryId:(id: string) => void;
  selectedGlAccountId:  string | null;
  isAdmin:              boolean;
  myTreasury:           MyTreasury | null;
  allTreasuries:        ActiveTreasury[];
  isLoading:            boolean;
}

export function useTreasurySelector(): TreasurySelectorState {
  const { user } = useAuth();
  const isAdmin  = user?.role === "admin" || user?.role === "owner";

  const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>("none");

  // خزنة المستخدم المخصصة (للموظف غير الأدمن)
  const { data: myTreasuryRaw, isLoading: myLoading } = useQuery<MyTreasury | null>({
    queryKey: ["/api/treasuries/mine"],
    queryFn: async () => {
      const r = await fetch("/api/treasuries/mine", { credentials: "include" });
      if (!r.ok) return null;
      const d = await r.json();
      return d ?? null;
    },
    enabled: !isAdmin,
    retry: false,
    staleTime: 60_000,
  });

  // جميع الخزن النشطة (للأدمن)
  const { data: allTreasuriesData, isLoading: allLoading } = useQuery<{ treasuries: ActiveTreasury[] }>({
    queryKey: ["/api/customer-payments/active-treasuries"],
    queryFn: async () => {
      const r = await fetch("/api/customer-payments/active-treasuries", { credentials: "include" });
      if (!r.ok) return { treasuries: [] };
      return r.json();
    },
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const myTreasury   = myTreasuryRaw ?? null;
  const allTreasuries = allTreasuriesData?.treasuries ?? [];

  // اختيار تلقائي للموظف عند توفّر خزنة مخصصة
  useEffect(() => {
    if (!isAdmin && myTreasury?.id) {
      setSelectedTreasuryId(myTreasury.id);
    }
  }, [isAdmin, myTreasury?.id]);

  // حساب GL الخزنة المختارة
  let selectedGlAccountId: string | null = null;
  if (selectedTreasuryId !== "none") {
    if (isAdmin) {
      const found = allTreasuries.find((t) => t.id === selectedTreasuryId);
      selectedGlAccountId = found?.gl_account_id ?? null;
    } else if (myTreasury?.id === selectedTreasuryId) {
      selectedGlAccountId = myTreasury.glAccountId ?? null;
    }
  }

  return {
    selectedTreasuryId,
    setSelectedTreasuryId,
    selectedGlAccountId,
    isAdmin,
    myTreasury,
    allTreasuries,
    isLoading: isAdmin ? allLoading : myLoading,
  };
}
