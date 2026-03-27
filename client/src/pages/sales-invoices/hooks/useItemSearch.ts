import { useState, useRef, useCallback, useEffect } from "react";

const DEBOUNCE_MS = 180;

export function useItemSearch(warehouseId: string) {
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchMode,      setSearchModeRaw]   = useState("AR");
  const [searchQuery,     setSearchQuery]      = useState("");
  const [searchResults,   setSearchResults]    = useState<any[]>([]);
  const [searchLoading,   setSearchLoading]    = useState(false);

  const searchInputRef  = useRef<HTMLInputElement>(null);
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef        = useRef<AbortController | null>(null);

  // ── بحث مع AbortController لإلغاء الطلبات القديمة ──────────────────────
  const execSearch = useCallback(async (q: string, mode: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({
        warehouseId, mode, q: q.trim(),
        page: "1", pageSize: "30", includeZeroStock: "true",
      });
      const res = await fetch(`/api/items/search?${params}`, {
        signal: abortRef.current.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items || data.data || data || []);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [warehouseId]);

  // ── debounce عند كتابة المستخدم ──────────────────────────────────────────
  const onSearchQueryChange = useCallback((val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => execSearch(val, searchMode), DEBOUNCE_MS);
  }, [execSearch, searchMode]);

  // ── تغيير الوضع يُعيد البحث تلقائياً إذا كان هناك استعلام ──────────────
  const setSearchMode = useCallback((mode: string) => {
    setSearchModeRaw(mode);
    if (searchQuery.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => execSearch(searchQuery, mode), DEBOUNCE_MS);
    }
  }, [execSearch, searchQuery]);

  const openSearchModal = useCallback(() => {
    setSearchModalOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, []);

  const closeSearchModal = useCallback(() => {
    setSearchModalOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // ── تنظيف عند إلغاء تحميل الكمبوننت ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current)    abortRef.current.abort();
    };
  }, []);

  return {
    searchModalOpen, setSearchModalOpen,
    searchMode, setSearchMode,
    searchQuery,
    searchResults,
    searchLoading,
    searchInputRef,
    onSearchQueryChange,
    openSearchModal,
    closeSearchModal,
  };
}
