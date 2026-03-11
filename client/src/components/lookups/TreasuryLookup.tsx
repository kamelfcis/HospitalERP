import { useState } from "react";
import { BaseLookupCombobox } from "./BaseLookupCombobox";
import { useTreasuriesLookup } from "@/hooks/lookups/useTreasuriesLookup";
import type { LookupItem } from "@/lib/lookupTypes";

export interface TreasuryLookupProps {
  value: string;
  onChange: (item: LookupItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  "data-testid"?: string;
}

export function TreasuryLookup({
  value,
  onChange,
  placeholder = "اختر الخزينة...",
  disabled = false,
  clearable = true,
  "data-testid": testId = "lookup-treasury",
}: TreasuryLookupProps) {
  const [search, setSearch] = useState("");
  const { items, isLoading, resolveById } = useTreasuriesLookup({ search, enabled: !disabled });

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
