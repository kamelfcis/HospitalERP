import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import type { LookupItem } from "@/lib/lookupTypes";

export type LookupMode = "server-search" | "client-filter";

export interface UseLookupOptions<TRaw> {
  baseQueryKey: unknown[];
  fetcher: (search?: string) => Promise<TRaw[]>;
  adapter: (raw: TRaw) => LookupItem;
  mode: LookupMode;
  search?: string;
  minChars?: number;
  staleTime?: number;
  enabled?: boolean;
  resolveByIdFetcher?: (id: string) => Promise<TRaw>;
}

export interface UseLookupResult {
  items: LookupItem[];
  isLoading: boolean;
  resolveById: (id: string) => LookupItem | undefined;
}

export function useLookup<TRaw>(options: UseLookupOptions<TRaw>): UseLookupResult {
  const {
    baseQueryKey,
    fetcher,
    adapter,
    mode,
    search = "",
    minChars = 0,
    staleTime = 0,
    enabled = true,
    resolveByIdFetcher,
  } = options;

  const debouncedSearch = useDebounce(search, 300);
  const queryClient     = useQueryClient();

  const queryKey = mode === "server-search"
    ? [...baseQueryKey, debouncedSearch]
    : baseQueryKey;

  const isSearchReady = mode === "server-search"
    ? debouncedSearch.length >= minChars
    : true;

  const { data: rawItems = [], isLoading } = useQuery<TRaw[]>({
    queryKey,
    queryFn: () => fetcher(mode === "server-search" ? debouncedSearch : undefined),
    staleTime,
    enabled: enabled && isSearchReady,
  });

  const items = useMemo(() => rawItems.map(adapter), [rawItems, adapter]);

  const filteredItems = useMemo(() => {
    if (mode === "client-filter" && search.trim()) {
      const q = search.trim().toLowerCase();
      return items.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.code?.toLowerCase().includes(q) ?? false)
      );
    }
    return items;
  }, [items, mode, search]);

  function resolveById(id: string): LookupItem | undefined {
    if (!id) return undefined;

    const fromCurrent = filteredItems.find(i => i.id === id);
    if (fromCurrent) return fromCurrent;

    if (mode === "client-filter") {
      const fullCache = queryClient.getQueryData<TRaw[]>(baseQueryKey);
      return fullCache?.map(adapter).find(i => i.id === id);
    }

    if (mode === "server-search" && resolveByIdFetcher) {
      const singleKey = [...baseQueryKey, "__resolve__", id];
      const cached = queryClient.getQueryData<TRaw>(singleKey);
      if (cached) return adapter(cached);

      queryClient.fetchQuery({
        queryKey: singleKey,
        queryFn: () => resolveByIdFetcher(id),
        staleTime: 5 * 60 * 1000,
      });
    }

    return undefined;
  }

  return { items: filteredItems, isLoading, resolveById };
}
