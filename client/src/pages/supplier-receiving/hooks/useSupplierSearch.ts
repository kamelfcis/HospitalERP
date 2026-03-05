/**
 * useSupplierSearch — combobox بحث وتحديد مورد
 */
import { useState, useCallback, useRef } from "react";
import type { Supplier } from "@shared/schema";

export interface UseSupplierSearchReturn {
  supplierSearchText: string;
  setSupplierSearchText: (v: string) => void;
  supplierResults: Supplier[];
  supplierDropdownOpen: boolean;
  setSupplierDropdownOpen: (v: boolean) => void;
  selectedSupplier: Supplier | null;
  setSelectedSupplier: (v: Supplier | null) => void;
  supplierHighlightIdx: number;
  setSupplierHighlightIdx: (v: number) => void;
  supplierSearchLoading: boolean;
  supplierSearchRef: React.RefObject<HTMLInputElement>;
  handleSupplierSearchChange: (val: string) => void;
  handleSupplierKeyDown: (e: React.KeyboardEvent, onSelect: (s: Supplier) => void) => void;
  selectSupplier: (supplier: Supplier) => void;
  resetSupplier: () => void;
  supplierCacheRef: React.MutableRefObject<Map<string, Supplier[]>>;
}

export function useSupplierSearch(
  onSupplierId: (id: string) => void,
): UseSupplierSearchReturn {
  const [supplierSearchText, setSupplierSearchText]   = useState("");
  const [supplierResults, setSupplierResults]         = useState<Supplier[]>([]);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier]       = useState<Supplier | null>(null);
  const [supplierHighlightIdx, setSupplierHighlightIdx] = useState(-1);
  const [supplierSearchLoading, setSupplierSearchLoading] = useState(false);

  const supplierSearchRef   = useRef<HTMLInputElement>(null);
  const supplierDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supplierAbortRef    = useRef<AbortController | null>(null);
  const supplierCacheRef    = useRef<Map<string, Supplier[]>>(new Map());

  const handleSupplierSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setSupplierResults([]);
      setSupplierSearchLoading(false);
      return;
    }
    const cached = supplierCacheRef.current.get(trimmed);
    if (cached) {
      setSupplierResults(cached);
      setSupplierDropdownOpen(true);
      setSupplierHighlightIdx(-1);
      setSupplierSearchLoading(false);
      return;
    }
    if (supplierAbortRef.current) supplierAbortRef.current.abort();
    const controller = new AbortController();
    supplierAbortRef.current = controller;
    setSupplierSearchLoading(true);
    try {
      const res = await fetch(
        `/api/suppliers/search?q=${encodeURIComponent(trimmed)}&limit=20`,
        { signal: controller.signal },
      );
      if (res.ok) {
        const data = await res.json();
        supplierCacheRef.current.set(trimmed, data);
        if (supplierCacheRef.current.size > 50) {
          const firstKey = supplierCacheRef.current.keys().next().value;
          if (firstKey !== undefined) supplierCacheRef.current.delete(firstKey);
        }
        setSupplierResults(data);
        setSupplierDropdownOpen(true);
        setSupplierHighlightIdx(-1);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setSupplierResults([]);
    } finally {
      setSupplierSearchLoading(false);
    }
  }, []);

  const handleSupplierSearchChange = (val: string) => {
    setSupplierSearchText(val);
    if (supplierDebounceRef.current) clearTimeout(supplierDebounceRef.current);
    supplierDebounceRef.current = setTimeout(() => handleSupplierSearch(val), 250);
  };

  const handleSupplierKeyDown = (e: React.KeyboardEvent, onSelect: (s: Supplier) => void) => {
    if (!supplierDropdownOpen || supplierResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSupplierHighlightIdx((prev) => Math.min(prev + 1, supplierResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSupplierHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && supplierHighlightIdx >= 0) {
      e.preventDefault();
      onSelect(supplierResults[supplierHighlightIdx]);
    }
  };

  const selectSupplier = useCallback((supplier: Supplier) => {
    setSelectedSupplier(supplier);
    onSupplierId(supplier.id);
    setSupplierSearchText(`${supplier.code} - ${supplier.nameAr}`);
    setSupplierDropdownOpen(false);
  }, [onSupplierId]);

  const resetSupplier = useCallback(() => {
    setSelectedSupplier(null);
    setSupplierSearchText("");
    setSupplierResults([]);
    setSupplierDropdownOpen(false);
  }, []);

  return {
    supplierSearchText, setSupplierSearchText,
    supplierResults,
    supplierDropdownOpen, setSupplierDropdownOpen,
    selectedSupplier, setSelectedSupplier,
    supplierHighlightIdx, setSupplierHighlightIdx,
    supplierSearchLoading,
    supplierSearchRef,
    handleSupplierSearchChange,
    handleSupplierKeyDown,
    selectSupplier,
    resetSupplier,
    supplierCacheRef,
  };
}
