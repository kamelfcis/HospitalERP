import { createContext, useContext, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  departmentId: string | null;
  pharmacyId: string | null;
  isActive: boolean;
  defaultWarehouseId: string | null;
  defaultPurchaseWarehouseId: string | null;
  maxDiscountPct:   string | null;
  maxDiscountValue: string | null;
  defaultRoute:     string | null;
}

interface AuthData {
  user: AuthUser;
  permissions: string[];
  allowedWarehouseIds: string[];
  allowedDepartmentIds: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  permissions: string[];
  allowedWarehouseIds: string[];
  allowedDepartmentIds: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery<AuthData | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.status === 401) return null;
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // ── Guard: تأكد أن الـ prefetch يحدث مرة واحدة فقط لكل session ────────────
  // نستخدم userId حتى يُعاد الـ prefetch لو تسجّل مستخدم مختلف
  const lastPrefetchedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!data?.user) return;

    // تجنّب double-prefetch عند إعادة الـ render
    if (lastPrefetchedUserId.current === data.user.id) return;
    lastPrefetchedUserId.current = data.user.id;

    const perms = data.permissions;
    const has = (p: string) => perms.includes(p);

    // ── البيانات العامة (خفيفة، مشتركة بين جميع الشاشات) ────────────────────
    // prefetchQuery آمن: لا يُعيد الجلب لو البيانات موجودة في الكاش
    queryClient.prefetchQuery({ queryKey: ["/api/departments"] });
    queryClient.prefetchQuery({ queryKey: ["/api/warehouses"] });

    // ── Prefetch مبكّر لبيانات الشاشة الافتتاحية (fire-and-forget) ──────────
    // الـ redirect يحدث فوراً بعد هذا الـ effect بدون انتظار اكتمال الـ prefetch
    // الصفحة تستفيد من البيانات لو وصلت قبلها، وإلا تُكمل loading طبيعي
    const route = data.user.defaultRoute;

    if (route === "/cashier-collection" && has("cashier.view")) {
      queryClient.prefetchQuery({ queryKey: ["/api/cashier/units"] });
      queryClient.prefetchQuery({ queryKey: ["/api/cashier/my-open-shift"] });
      queryClient.prefetchQuery({ queryKey: ["/api/receipt-settings"] });

    } else if (route === "/sales-invoices" && has("sales.view")) {
      // pharmacists list خفيف (أسماء فقط) — آمن للـ prefetch
      queryClient.prefetchQuery({ queryKey: ["/api/sales-invoices/pharmacists"] });
      // لا نعمل prefetch لـ /api/items — قد يكون كبير جداً

    } else if (route === "/patient-invoices" && has("patient_invoices.view")) {
      queryClient.prefetchQuery({ queryKey: ["/api/doctors"] });

    } else if (route === "/cashier-handover" && has("cashier.handover_view")) {
      queryClient.prefetchQuery({ queryKey: ["/api/cashier/units"] });

    } else if (route === "/clinic-booking" && has("clinic.book")) {
      queryClient.prefetchQuery({ queryKey: ["/api/doctors"] });

    } else if (route === "/store-transfers" && has("transfers.view")) {
      queryClient.prefetchQuery({ queryKey: ["/api/warehouses"] });

    } else if (route === "/supplier-receiving" && has("receiving.view")) {
      queryClient.prefetchQuery({ queryKey: ["/api/warehouses"] });
    }
  }, [data?.user?.id]); // userId فقط — يمنع double-prefetch عند إعادة الـ render

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      return res.json();
    },
    onSuccess: () => {
      // علّم أن الجلسة الحالية نتيجة تسجيل دخول طازج (لاستخدامه في التوجيه الافتتاحي)
      sessionStorage.setItem("__plr", "1");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.clear();
      // إعادة تعيين الـ guard لضمان الـ prefetch عند الجلسة القادمة
      lastPrefetchedUserId.current = null;
    },
  });

  const login = useCallback(async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  }, [loginMutation]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const permissions = data?.permissions || [];
  const allowedWarehouseIds = data?.allowedWarehouseIds || [];
  const allowedDepartmentIds = data?.allowedDepartmentIds || [];
  const hasPermission = useCallback((permission: string) => {
    return permissions.includes(permission);
  }, [permissions]);

  return (
    <AuthContext.Provider
      value={{
        user: data?.user || null,
        permissions,
        allowedWarehouseIds,
        allowedDepartmentIds,
        isLoading,
        isAuthenticated: !!data?.user,
        hasPermission,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
