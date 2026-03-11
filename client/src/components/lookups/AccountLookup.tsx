import { useState } from "react";
import { BaseLookupCombobox } from "./BaseLookupCombobox";
import { useAccountsLookup } from "@/hooks/lookups/useAccountsLookup";
import type { LookupItem } from "@/lib/lookupTypes";

export interface AccountLookupProps {
  value: string;
  onChange: (item: LookupItem | null) => void;
  filter?: string;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  "data-testid"?: string;
}

export function AccountLookup({
  value,
  onChange,
  filter,
  placeholder = "ابحث عن حساب...",
  disabled = false,
  clearable = true,
  "data-testid": testId = "lookup-account",
}: AccountLookupProps) {
  const [search, setSearch] = useState("");
  const { items, isLoading, resolveById } = useAccountsLookup({
    search,
    filter,
    enabled: !disabled,
  });

  const displayValue = resolveById(value)
    ? `${resolveById(value)!.code} - ${resolveById(value)!.name}`
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
