import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TreasurySummary, TreasuryForm, UserTreasuryRow, UserRow } from "../types";
import type { Account } from "@shared/schema";

// ─── Query keys ──────────────────────────────────────────────────────────────

export const KEYS = {
  summary:      ["/api/treasuries/summary"] as const,
  list:         ["/api/treasuries"]         as const,
  accounts:     ["/api/accounts"]           as const,
  users:        ["/api/users"]              as const,
  userTreasuries: ["/api/user-treasuries"]  as const,
};

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useTreasuries() {
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: KEYS.summary });
    queryClient.invalidateQueries({ queryKey: KEYS.list });
  };

  // ── Queries ────────────────────────────────────────────────────────────────

  const summariesQuery = useQuery<TreasurySummary[]>({
    queryKey: KEYS.summary,
  });

  const usersQuery = useQuery<UserRow[]>({
    queryKey: KEYS.users,
  });

  const userAssignmentsQuery = useQuery<UserTreasuryRow[]>({
    queryKey: KEYS.userTreasuries,
  });

  // ── Treasury CRUD mutations ────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: async (data: TreasuryForm) => {
      const res = await apiRequest("POST", "/api/treasuries", data);
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "تم إنشاء الخزنة بنجاح" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TreasuryForm }) => {
      const res = await apiRequest("PATCH", `/api/treasuries/${id}`, data);
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "تم تحديث الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/treasuries/${id}`);
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "تم حذف الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ── Password mutations ─────────────────────────────────────────────────────

  const setPasswordMut = useMutation({
    mutationFn: async ({ glAccountId, password }: { glAccountId: string; password: string }) => {
      const res = await apiRequest("POST", "/api/drawer-passwords/set", { glAccountId, password });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.summary });
      toast({ title: "تم تعيين كلمة السر بنجاح" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const removePasswordMut = useMutation({
    mutationFn: async (glAccountId: string) => {
      const res = await apiRequest("DELETE", `/api/drawer-passwords/${glAccountId}`);
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.summary });
      toast({ title: "تم إزالة كلمة السر" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ── User assignment mutations ──────────────────────────────────────────────

  const assignMut = useMutation({
    mutationFn: async ({ userId, treasuryId }: { userId: string; treasuryId: string }) => {
      const res = await apiRequest("POST", "/api/user-treasuries", { userId, treasuryId });
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.userTreasuries });
      toast({ title: "تم تعيين الخزنة للمستخدم" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const removeAssignMut = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/user-treasuries/${userId}`);
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.userTreasuries });
      toast({ title: "تم إلغاء تعيين الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return {
    summaries:       summariesQuery.data ?? [],
    summariesLoading: summariesQuery.isLoading,
    users:           usersQuery.data ?? [],
    userAssignments: userAssignmentsQuery.data ?? [],
    createMut, updateMut, deleteMut,
    setPasswordMut, removePasswordMut,
    assignMut, removeAssignMut,
  };
}

// ─── Accounts query (lazy, only when form opens) ──────────────────────────────

export function useAccountsForForm(enabled: boolean) {
  return useQuery<Account[]>({
    queryKey: KEYS.accounts,
    enabled,
  });
}
