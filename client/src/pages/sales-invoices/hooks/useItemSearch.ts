import { useState, useRef, useCallback } from "react";

export function useItemSearch(warehouseId: string) {
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState("AR");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchItems = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/items/search?warehouseId=${warehouseId}&mode=${searchMode}&q=${encodeURIComponent(q.trim())}&page=1&pageSize=30&includeZeroStock=true`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.data || data.items || data || []);
      }
    } catch {}
    setSearchLoading(false);
  }, [warehouseId, searchMode]);

  const onSearchQueryChange = useCallback((val: string) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => handleSearchItems(val), 300);
  }, [handleSearchItems]);

  const openSearchModal = useCallback(() => {
    setSearchModalOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const closeSearchModal = useCallback(() => {
    setSearchModalOpen(false);
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
