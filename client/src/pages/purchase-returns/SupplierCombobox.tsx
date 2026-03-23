import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SupplierItem } from "./types";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SupplierCombobox({ value, onChange }: Props) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");

  const { data: suppliers = [], isLoading } = useQuery<SupplierItem[]>({
    queryKey: ["/api/suppliers/search", search],
    queryFn: () =>
      fetch(`/api/suppliers/search?q=${encodeURIComponent(search)}&limit=40`).then(r => r.json()),
  });

  const { data: selectedSupplier } = useQuery<SupplierItem>({
    queryKey: ["/api/suppliers", value],
    queryFn: () => fetch(`/api/suppliers/${value}`).then(r => r.json()),
    enabled: !!value && !suppliers.find(s => s.id === value),
  });

  const selected = suppliers.find(s => s.id === value) ?? selectedSupplier;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          data-testid="supplier-combobox"
        >
          {selected ? `${selected.code} — ${selected.nameAr}` : "اختر المورد…"}
          <ChevronsUpDown className="mr-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="بحث بالاسم أو الكود…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading && <CommandEmpty>جارٍ التحميل…</CommandEmpty>}
            {!isLoading && suppliers.length === 0 && <CommandEmpty>لا توجد نتائج.</CommandEmpty>}
            <CommandGroup>
              {suppliers.map(s => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => { onChange(s.id); setOpen(false); setSearch(""); }}
                >
                  <CheckIcon className={cn("ml-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")} />
                  <span>{s.code}</span>
                  <span className="mx-2 text-muted-foreground">—</span>
                  <span>{s.nameAr}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
