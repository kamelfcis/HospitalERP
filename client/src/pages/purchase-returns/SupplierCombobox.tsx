import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckIcon, ChevronsUpDown, Loader2 } from "lucide-react";
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
      fetch(`/api/suppliers/search?q=${encodeURIComponent(search)}&limit=40`, { credentials: "include" }).then(r => r.json()),
    enabled: open,
    staleTime: search ? 0 : 60_000,
  });

  const { data: selectedSupplier } = useQuery<SupplierItem>({
    queryKey: ["/api/suppliers", value],
    queryFn: () => fetch(`/api/suppliers/${value}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!value && !suppliers.find(s => s.id === value),
    staleTime: 5 * 60_000,
  });

  const selected = suppliers.find(s => s.id === value) ?? selectedSupplier;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-8 text-xs"
          data-testid="supplier-combobox"
        >
          <span className="truncate">
            {selected ? `${selected.code} — ${selected.nameAr}` : "اختر المورد…"}
          </span>
          <ChevronsUpDown className="mr-2 h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="بحث بالاسم أو الكود أو الهاتف…"
            value={search}
            onValueChange={setSearch}
            className="text-xs"
          />
          <CommandList>
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                جارٍ التحميل…
              </div>
            )}
            {!isLoading && suppliers.length === 0 && (
              <CommandEmpty className="text-xs">لا توجد نتائج.</CommandEmpty>
            )}
            {!isLoading && suppliers.length > 0 && (
              <CommandGroup>
                {suppliers.map(s => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={() => { onChange(s.id); setOpen(false); setSearch(""); }}
                    className="text-xs gap-1"
                  >
                    <CheckIcon className={cn("h-3.5 w-3.5 shrink-0", value === s.id ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-muted-foreground">{s.code}</span>
                    <span className="mx-1">—</span>
                    <span className="flex-1">{s.nameAr}</span>
                    {s.phone && <span className="text-muted-foreground text-[10px]">{s.phone}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
