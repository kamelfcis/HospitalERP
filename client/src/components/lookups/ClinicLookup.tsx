import { useState } from "react";
import { BaseLookupCombobox } from "./BaseLookupCombobox";
import { useClinicsLookup } from "@/hooks/lookups/useClinicsLookup";
import type { LookupItem } from "@/lib/lookupTypes";

export interface ClinicLookupProps {
  value: string;
  onChange: (item: LookupItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  "data-testid"?: string;
}

export function ClinicLookup({
  value,
  onChange,
  placeholder = "اختر العيادة...",
  disabled = false,
  clearable = true,
  "data-testid": testId = "lookup-clinic",
}: ClinicLookupProps) {
  const [search, setSearch] = useState("");
  const { items, isLoading, resolveById } = useClinicsLookup({ search, enabled: !disabled });

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
