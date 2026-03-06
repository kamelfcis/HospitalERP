import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let serverMsg = "";
    try {
      const parsed = JSON.parse(text);
      if (parsed.message) serverMsg = parsed.message;
    } catch {}

    if (res.status === 401) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      throw new Error(serverMsg || "انتهت الجلسة، يرجى تسجيل الدخول مجدداً");
    }

    if (res.status === 403) {
      const isFiscalPeriod = serverMsg.includes("الفترة المحاسبية") || serverMsg.includes("الفترة المالية");
      const msg = isFiscalPeriod
        ? (serverMsg || "الفترة المالية مقفولة، برجاء فتح الفترة أو تغيير التاريخ")
        : (serverMsg || "غير مصرح");
      throw new Error(msg);
    }
    throw new Error(serverMsg || `${res.status}: ${res.statusText}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal,
  });

  await throwIfResNotOk(res);
  return res;
}

export async function apiRequestJson<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const res = await apiRequest(method, url, data);
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      retry: false,
    },
  },
});
