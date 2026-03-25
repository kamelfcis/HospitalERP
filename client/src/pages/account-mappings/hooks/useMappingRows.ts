/**
 * useMappingRows
 *
 * Owns all data-fetching and local row-state for the Account Mappings editor.
 * The page-level component only needs to call this hook and pass the result
 * down to child components — no business logic lives in the page.
 */

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  type AccountMapping,
  type Warehouse,
  type Pharmacy,
} from "@shared/schema";
import {
  type MappingRow,
  lineTypeSpecs,
  suggestedLineTypes,
  transactionTypes,
  allLineTypeOptions,
  isRowComplete,
  NO_WAREHOUSE_SELECTOR_TYPES,
  PHARMACY_SELECTOR_TYPES,
} from "../types";

export interface UseMappingRowsResult {
  // Filter state
  selectedTxType:      string;
  setSelectedTxType:   (v: string) => void;
  selectedWarehouseId: string;
  setSelectedWarehouseId: (v: string) => void;
  selectedPharmacyId:  string;
  setSelectedPharmacyId: (v: string) => void;

  // Row state
  rows:          MappingRow[];
  hasChanges:    boolean;
  isLoading:     boolean;

  // Derived
  txSpecs:              Record<string, import("../types").LineTypeSpec>;
  usedLineTypes:        Set<string>;
  isWarehouseView:      boolean;
  isPharmacyView:       boolean;
  showWarehouseSelector: boolean;
  showPharmacySelector:  boolean;
  requiredMissing:    MappingRow[];
  conditionalMissing: MappingRow[];
  configured:         MappingRow[];
  setupComplete:      boolean;

  // Data
  warehouses:  Warehouse[];
  pharmacies:  Pharmacy[];

  // Actions
  updateRow: (key: string, field: keyof MappingRow, value: string) => void;
  addRow:    () => void;
  removeRow: (key: string) => void;
  resetChanges: () => void;
}

export function useMappingRows(): UseMappingRowsResult {
  const [selectedTxType,      setSelectedTxTypeRaw]   = useState<string>(transactionTypes[0]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("__generic__");
  const [selectedPharmacyId,  setSelectedPharmacyId]  = useState<string>("__generic__");

  // When switching tx types, reset scope selectors appropriately
  const setSelectedTxType = (v: string) => {
    if (NO_WAREHOUSE_SELECTOR_TYPES.has(v)) setSelectedWarehouseId("__generic__");
    if (!PHARMACY_SELECTOR_TYPES.has(v))    setSelectedPharmacyId("__generic__");
    setSelectedTxTypeRaw(v);
  };
  const [rows,       setRows]       = useState<MappingRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const keyCounter = useRef(0);

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: pharmacies = [] } = useQuery<Pharmacy[]>({
    queryKey: ["/api/pharmacies"],
  });

  const { data: mappings, isLoading: mappingsLoading } = useQuery<AccountMapping[]>({
    queryKey: ["/api/account-mappings", selectedTxType],
    queryFn: async () => {
      const res = await fetch(`/api/account-mappings?transactionType=${selectedTxType}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("فشل في تحميل الإعدادات");
      return res.json();
    },
  });

  // Rebuild rows whenever server data or filter selection changes
  useEffect(() => {
    if (mappingsLoading) return;
    const allMappings = mappings ?? [];

    const effectiveWarehouseId = selectedWarehouseId === "__generic__" ? null : selectedWarehouseId;
    const effectivePharmacyId  = selectedPharmacyId  === "__generic__" ? null : selectedPharmacyId;

    const warehouseMappings = effectiveWarehouseId
      ? allMappings.filter(m => m.warehouseId === effectiveWarehouseId && !m.pharmacyId)
      : [];
    const pharmacyMappings = effectivePharmacyId
      ? allMappings.filter(m => m.pharmacyId === effectivePharmacyId && !m.warehouseId)
      : [];
    const genericMappings = allMappings.filter(m => !m.warehouseId && !m.pharmacyId);

    const suggested   = suggestedLineTypes[selectedTxType] ?? [];
    const allLineTypes = Array.from(new Set([
      ...warehouseMappings.map(m => m.lineType),
      ...pharmacyMappings.map(m => m.lineType),
      ...genericMappings.map(m => m.lineType),
      ...suggested,
    ]));

    const newRows: MappingRow[] = allLineTypes.map(lt => {
      const warehouseRow = warehouseMappings.find(m => m.lineType === lt);
      const pharmacyRow  = pharmacyMappings.find(m => m.lineType === lt);
      const genericRow   = genericMappings.find(m => m.lineType === lt);
      // Priority: warehouse > pharmacy > generic
      const activeRow = warehouseRow ?? pharmacyRow ?? genericRow;
      return {
        key:             `row-${keyCounter.current++}`,
        lineType:        lt,
        debitAccountId:  activeRow?.debitAccountId  ?? "",
        creditAccountId: activeRow?.creditAccountId ?? "",
        source: warehouseRow ? "warehouse" : pharmacyRow ? "pharmacy" : genericRow ? "generic" : "new",
      };
    });

    setRows(newRows);
    setHasChanges(false);
  }, [mappings, mappingsLoading, selectedTxType, selectedWarehouseId, selectedPharmacyId]);

  // ── Row actions ────────────────────────────────────────────────────────────
  const updateRow = (key: string, field: keyof MappingRow, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const updated: MappingRow = { ...r, [field]: value, source: "new" as const };
      if (field === "lineType") {
        updated.debitAccountId  = "";
        updated.creditAccountId = "";
      }
      return updated;
    }));
    setHasChanges(true);
  };

  const addRow = () => {
    const usedTypes = new Set(rows.map(r => r.lineType));
    const nextType  = allLineTypeOptions.find(([k]) => !usedTypes.has(k))?.[0] ?? "";
    setRows(prev => [
      ...prev,
      { key: `row-${keyCounter.current++}`, lineType: nextType, debitAccountId: "", creditAccountId: "", source: "new" },
    ]);
    setHasChanges(true);
  };

  const removeRow = (key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
    setHasChanges(true);
  };

  const resetChanges = () => setHasChanges(false);

  // ── Derived state ──────────────────────────────────────────────────────────
  const txSpecs               = lineTypeSpecs[selectedTxType] ?? {};
  const usedLineTypes         = new Set(rows.map(r => r.lineType));
  const isWarehouseView       = selectedWarehouseId !== "__generic__";
  const isPharmacyView        = selectedPharmacyId  !== "__generic__";
  const showWarehouseSelector = !NO_WAREHOUSE_SELECTOR_TYPES.has(selectedTxType);
  const showPharmacySelector  = PHARMACY_SELECTOR_TYPES.has(selectedTxType);

  const requiredMissing    = rows.filter(r => txSpecs[r.lineType]?.required === true   && !isRowComplete(r, txSpecs[r.lineType], selectedTxType));
  const conditionalMissing = rows.filter(r => txSpecs[r.lineType]?.required === "cond" && !isRowComplete(r, txSpecs[r.lineType], selectedTxType));
  const configured         = rows.filter(r => isRowComplete(r, txSpecs[r.lineType], selectedTxType));
  const setupComplete      = requiredMissing.length === 0;

  return {
    selectedTxType,    setSelectedTxType,
    selectedWarehouseId, setSelectedWarehouseId,
    selectedPharmacyId,  setSelectedPharmacyId,
    rows,       hasChanges,
    isLoading:  mappingsLoading,
    txSpecs,    usedLineTypes, isWarehouseView, isPharmacyView,
    showWarehouseSelector, showPharmacySelector,
    requiredMissing, conditionalMissing, configured, setupComplete,
    warehouses, pharmacies,
    updateRow, addRow, removeRow, resetChanges,
  };
}
