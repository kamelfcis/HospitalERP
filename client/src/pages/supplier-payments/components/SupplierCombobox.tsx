import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Command, CommandInput, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
import type { Supplier } from "@shared/schema/purchasing";

export function SupplierCombobox({
  value, onChange,
}: { value: string; onChange: (id: string) => void }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery<{ suppliers: Supplier[]; total: number }>({
    queryKey: ["/api/suppliers", search],
    queryFn:  async () => {
      const qs = search ? `search=${encodeURIComponent(search)}&` : "";
      const r = await fetch(`/api/suppliers?${qs}pageSize=30`, { credentials: "include" });
      return r.json();
    },
    staleTime: 30_000,
  });

  const suppliers = data?.suppliers ?? [];
  const selected  = suppliers.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline" role="combobox" aria-expanded={open}
          className="w-[280px] justify-between text-right gap-2"
          data-testid="supplier-combobox"
        >
          <span className="truncate text-sm">
            {selected ? `${selected.nameAr} (${selected.code})` : "ابحث باسم المورد أو الكود..."}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="اسم أو كود..."
            value={search} onValueChange={setSearch}
            className="text-right"
          />
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup className="max-h-56 overflow-y-auto">
            {suppliers.map((s) => (
              <CommandItem
                key={s.id} value={s.id}
                onSelect={() => { onChange(s.id); setOpen(false); setSearch(""); }}
                className="flex justify-between gap-2"
                data-testid={`supplier-opt-${s.id}`}
              >
                <span className="text-muted-foreground text-xs">{s.code}</span>
                <span className="flex-1 text-right">{s.nameAr}</span>
                {value === s.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
