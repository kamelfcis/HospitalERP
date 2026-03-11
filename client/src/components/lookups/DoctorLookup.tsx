import { useState } from "react";
import { BaseLookupCombobox } from "./BaseLookupCombobox";
import { useDoctorsLookup } from "@/hooks/lookups/useDoctorsLookup";
import type { LookupItem } from "@/lib/lookupTypes";

export interface DoctorLookupProps {
  value: string;
  onChange: (item: LookupItem | null) => void;
  onChangeName?: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  "data-testid"?: string;
}

export function DoctorLookup({
  value,
  onChange,
  onChangeName,
  placeholder = "ابحث عن طبيب...",
  disabled = false,
  clearable = true,
  "data-testid": testId = "lookup-doctor",
}: DoctorLookupProps) {
  const [search, setSearch] = useState("");
  const { items, isLoading, resolveById } = useDoctorsLookup({ search, enabled: !disabled });

  const displayValue = resolveById(value)?.name;

  function handleChange(item: LookupItem | null) {
    onChange(item);
    onChangeName?.(item?.name ?? "");
  }

  return (
    <BaseLookupCombobox
      items={items}
      isLoading={isLoading}
      value={value}
      displayValue={displayValue}
      onChange={handleChange}
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
