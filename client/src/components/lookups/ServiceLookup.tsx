import { useState } from "react";
import { BaseLookupCombobox } from "./BaseLookupCombobox";
import { useServicesLookup } from "@/hooks/lookups/useServicesLookup";
import type { LookupItem } from "@/lib/lookupTypes";

export interface ServiceLookupProps {
  value: string;
  onChange: (item: LookupItem | null) => void;
  departmentId?: string;
  active?: boolean;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  "data-testid"?: string;
}

export function ServiceLookup({
  value,
  onChange,
  departmentId,
  active = true,
  placeholder = "ابحث عن خدمة...",
  disabled = false,
  clearable = true,
  "data-testid": testId = "lookup-service",
}: ServiceLookupProps) {
  const [search, setSearch] = useState("");
  const { items, isLoading, resolveById } = useServicesLookup({
    search,
    departmentId,
    active,
    enabled: !disabled,
  });

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
