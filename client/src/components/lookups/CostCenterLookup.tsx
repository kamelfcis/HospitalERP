import { useState } from "react";
import { BaseLookupCombobox } from "./BaseLookupCombobox";
import { useCostCentersLookup } from "@/hooks/lookups/useCostCentersLookup";
import type { LookupItem } from "@/lib/lookupTypes";

export interface CostCenterLookupProps {
  value: string;
  onChange: (item: LookupItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  "data-testid"?: string;
}

export function CostCenterLookup({
  value,
  onChange,
  placeholder = "مركز التكلفة...",
  disabled = false,
  clearable = true,
  "data-testid": testId = "lookup-cost-center",
}: CostCenterLookupProps) {
  const [search, setSearch] = useState("");
  const { items, isLoading, resolveById } = useCostCentersLookup({
    search,
    enabled: !disabled,
  });

  const resolved = resolveById(value);
  const displayValue = resolved
    ? `${resolved.code} - ${resolved.name}`
    : undefined;

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
      renderItem={item => (
        <span className="flex flex-col items-start">
          <span className="truncate">{item.name}</span>
          {item.code && <span className="text-xs text-muted-foreground">{item.code}</span>}
        </span>
      )}
    />
  );
}
