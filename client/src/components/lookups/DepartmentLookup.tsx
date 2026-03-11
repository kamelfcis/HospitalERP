import { useState } from "react";
import { BaseLookupCombobox } from "./BaseLookupCombobox";
import { useDepartmentsLookup } from "@/hooks/lookups/useDepartmentsLookup";
import type { LookupItem } from "@/lib/lookupTypes";

export interface DepartmentLookupProps {
  value: string;
  onChange: (item: LookupItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  "data-testid"?: string;
}

export function DepartmentLookup({
  value,
  onChange,
  placeholder = "اختر القسم...",
  disabled = false,
  clearable = true,
  "data-testid": testId = "lookup-department",
}: DepartmentLookupProps) {
  const [search, setSearch] = useState("");
  const { items, isLoading, resolveById } = useDepartmentsLookup({ search, enabled: !disabled });

  const displayValue = resolveById(value)?.name;

  return (
    <BaseLookupCombobox
      items={items}
      isLoading={isLoading}
      value={value}
      displayValue={displayValue}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      clearable={clearable}
      data-testid={testId}
    />
  );
}
