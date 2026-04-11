/**
 * useMappingRows
 *
 * Owns all data-fetching and local row-state for the Account Mappings editor.
 * The page-level component only needs to call this hook and pass the result
 * down to child components — no business logic lives in the page.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  type AccountMapping,
  type Warehouse,
  type Pharmacy,
  type Department,
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
  DEPARTMENT_SELECTOR_TYPES,
} from "../types";

export interface UseMappingRowsResult {
  selectedTxType:      string;
  setSelectedTxType:   (v: string) => void;
  selectedWarehouseId: string;
  setSelectedWarehouseId: (v: string) => void;
  selectedPharmacyId:  string;
  setSelectedPharmacyId: (v: string) => void;
  selectedDepartmentId: string;
  setSelectedDepartmentId: (v: string) => void;

  rows:          MappingRow[];
  hasChanges:    boolean;
  isLoading:     boolean;

  txSpecs:              Record<string, import("../types").LineTypeSpec>;
  usedLineTypes:        Set<string>;
  isWarehouseView:      boolean;
  isPharmacyView:       boolean;
  isDepartmentView:     boolean;
  showWarehouseSelector: boolean;
  showPharmacySelector:  boolean;
  showDepartmentSelector: boolean;
  requiredMissing:    MappingRow[];
  conditionalMissing: MappingRow[];
  configured:         MappingRow[];
  setupComplete:      boolean;

  warehouses:  Warehouse[];
  pharmacies:  Pharmacy[];
  departments: Department[];

  updateRow: (key: string, field: keyof MappingRow, value: string) => void;
  addRow:    () => void;
  removeRow: (key: string) => void;
  resetChanges: () => void;
  applyServerData: (savedRows: AccountMapping[]) => void;
}

function buildRows(
  allMappings: AccountMapping[],
  txType: string,
  deptId: string | null,
  whId: string | null,
  phId: string | null,
  keyCounter: { current: number },
): MappingRow[] {
  const departmentMappings = deptId
    ? allMappings.filter(m => m.departmentId === deptId && !m.warehouseId && !m.pharmacyId)
    : [];
  const warehouseMappings = whId
    ? allMappings.filter(m => m.warehouseId === whId && !m.pharmacyId && !m.departmentId)
    : [];
  const pharmacyMappings = phId
    ? allMappings.filter(m => m.pharmacyId === phId && !m.warehouseId && !m.departmentId)
    : [];
  const genericMappings = allMappings.filter(m => !m.warehouseId && !m.pharmacyId && !m.departmentId);

  const suggested   = suggestedLineTypes[txType] ?? [];
  const allLineTypes = Array.from(new Set([
    ...departmentMappings.map(m => m.lineType),
    ...warehouseMappings.map(m => m.lineType),
    ...pharmacyMappings.map(m => m.lineType),
    ...genericMappings.map(m => m.lineType),
    ...suggested,
  ]));

  return allLineTypes.map(lt => {
    const departmentRow = departmentMappings.find(m => m.lineType === lt);
    const warehouseRow  = warehouseMappings.find(m => m.lineType === lt);
    const pharmacyRow   = pharmacyMappings.find(m => m.lineType === lt);
    const genericRow    = genericMappings.find(m => m.lineType === lt);
    const activeRow = departmentRow ?? warehouseRow ?? pharmacyRow ?? genericRow;
    return {
      key:             `row-${keyCounter.current++}`,
      lineType:        lt,
      debitAccountId:  activeRow?.debitAccountId  ?? "",
      creditAccountId: activeRow?.creditAccountId ?? "",
      source: departmentRow ? "department" as const
            : warehouseRow  ? "warehouse" as const
            : pharmacyRow   ? "pharmacy"  as const
            : genericRow    ? "generic"   as const
            : "new" as const,
    };
  });
}

export function useMappingRows(): UseMappingRowsResult {
  const [selectedTxType,      setSelectedTxTypeRaw]   = useState<string>(transactionTypes[0]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("__generic__");
  const [selectedPharmacyId,  setSelectedPharmacyId]  = useState<string>("__generic__");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("__generic__");

  const autoDetectedRef = useRef<string | null>(null);
  const setSelectedTxType = (v: string) => {
    if (NO_WAREHOUSE_SELECTOR_TYPES.has(v)) setSelectedWarehouseId("__generic__");
    if (!PHARMACY_SELECTOR_TYPES.has(v))    setSelectedPharmacyId("__generic__");
    if (!DEPARTMENT_SELECTOR_TYPES.has(v))  setSelectedDepartmentId("__generic__");
    autoDetectedRef.current = null;
    setSelectedTxTypeRaw(v);
  };
  const [rows,       setRows]       = useState<MappingRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const keyCounter = useRef(0);
  const prevFilterRef = useRef({ selectedTxType, selectedWarehouseId, selectedPharmacyId, selectedDepartmentId });
  const saveLockRef = useRef(false);

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: pharmacies = [] } = useQuery<Pharmacy[]>({
    queryKey: ["/api/pharmacies"],
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
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

  useEffect(() => {
    if (mappingsLoading || !mappings || mappings.length === 0) return;
    if (autoDetectedRef.current === selectedTxType) return;
    if (selectedDepartmentId !== "__generic__") {
      autoDetectedRef.current = selectedTxType;
      return;
    }

    const hasGeneric = mappings.some(m => !m.warehouseId && !m.pharmacyId && !m.departmentId);
    if (hasGeneric) {
      autoDetectedRef.current = selectedTxType;
      return;
    }

    if (DEPARTMENT_SELECTOR_TYPES.has(selectedTxType)) {
      const deptId = mappings.find(m => m.departmentId)?.departmentId as string | undefined;
      if (deptId) {
        autoDetectedRef.current = selectedTxType;
        setSelectedDepartmentId(deptId);
        return;
      }
    }

    const whId = mappings.find(m => m.warehouseId)?.warehouseId as string | undefined;
    if (whId) {
      autoDetectedRef.current = selectedTxType;
      setSelectedWarehouseId(whId);
      return;
    }

    const phId = mappings.find(m => m.pharmacyId)?.pharmacyId as string | undefined;
    if (phId) {
      autoDetectedRef.current = selectedTxType;
      setSelectedPharmacyId(phId);
      return;
    }

    autoDetectedRef.current = selectedTxType;
  }, [mappings, mappingsLoading, selectedTxType, selectedDepartmentId]);

  useEffect(() => {
    if (mappingsLoading) return;
    if (saveLockRef.current) return;

    const prev = prevFilterRef.current;
    const filterChanged =
      prev.selectedTxType        !== selectedTxType        ||
      prev.selectedWarehouseId   !== selectedWarehouseId   ||
      prev.selectedPharmacyId    !== selectedPharmacyId    ||
      prev.selectedDepartmentId  !== selectedDepartmentId;
    prevFilterRef.current = { selectedTxType, selectedWarehouseId, selectedPharmacyId, selectedDepartmentId };

    if (!filterChanged && hasChanges) {
      return;
    }

    const effectiveDeptId = selectedDepartmentId === "__generic__" ? null : selectedDepartmentId;
    const effectiveWhId   = selectedWarehouseId  === "__generic__" ? null : selectedWarehouseId;
    const effectivePhId   = selectedPharmacyId   === "__generic__" ? null : selectedPharmacyId;

    const newRows = buildRows(mappings ?? [], selectedTxType, effectiveDeptId, effectiveWhId, effectivePhId, keyCounter);
    setRows(newRows);
    if (filterChanged) setHasChanges(false);
  }, [mappings, mappingsLoading, selectedTxType, selectedWarehouseId, selectedPharmacyId, selectedDepartmentId, hasChanges]);

  const applyServerData = useCallback((savedRows: AccountMapping[]) => {
    saveLockRef.current = true;

    const effectiveDeptId = selectedDepartmentId === "__generic__" ? null : selectedDepartmentId;
    const effectiveWhId   = selectedWarehouseId  === "__generic__" ? null : selectedWarehouseId;
    const effectivePhId   = selectedPharmacyId   === "__generic__" ? null : selectedPharmacyId;

    const newRows = buildRows(savedRows, selectedTxType, effectiveDeptId, effectiveWhId, effectivePhId, keyCounter);
    setRows(newRows);
    setHasChanges(false);

    setTimeout(() => { saveLockRef.current = false; }, 3000);
  }, [selectedTxType, selectedDepartmentId, selectedWarehouseId, selectedPharmacyId]);

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

  const txSpecs               = lineTypeSpecs[selectedTxType] ?? {};
  const usedLineTypes         = new Set(rows.map(r => r.lineType));
  const isWarehouseView       = selectedWarehouseId !== "__generic__";
  const isPharmacyView        = selectedPharmacyId  !== "__generic__";
  const isDepartmentView      = selectedDepartmentId !== "__generic__";
  const showWarehouseSelector = !NO_WAREHOUSE_SELECTOR_TYPES.has(selectedTxType);
  const showPharmacySelector  = PHARMACY_SELECTOR_TYPES.has(selectedTxType);
  const showDepartmentSelector = DEPARTMENT_SELECTOR_TYPES.has(selectedTxType);

  const requiredMissing    = rows.filter(r => txSpecs[r.lineType]?.required === true   && !isRowComplete(r, txSpecs[r.lineType], selectedTxType));
  const conditionalMissing = rows.filter(r => txSpecs[r.lineType]?.required === "cond" && !isRowComplete(r, txSpecs[r.lineType], selectedTxType));
  const configured         = rows.filter(r => isRowComplete(r, txSpecs[r.lineType], selectedTxType));
  const setupComplete      = requiredMissing.length === 0;

  return {
    selectedTxType,    setSelectedTxType,
    selectedWarehouseId, setSelectedWarehouseId,
    selectedPharmacyId,  setSelectedPharmacyId,
    selectedDepartmentId, setSelectedDepartmentId,
    rows,       hasChanges,
    isLoading:  mappingsLoading,
    txSpecs,    usedLineTypes, isWarehouseView, isPharmacyView, isDepartmentView,
    showWarehouseSelector, showPharmacySelector, showDepartmentSelector,
    requiredMissing, conditionalMissing, configured, setupComplete,
    warehouses, pharmacies, departments,
    updateRow, addRow, removeRow, resetChanges, applyServerData,
  };
}
