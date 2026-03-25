import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateShort, formatCurrency } from "@/lib/formatters";
import type { InvoiceItem } from "./types";

interface Props {
  invoices:  InvoiceItem[];
  value:     string;
  onChange:  (id: string) => void;
  disabled?: boolean;
  noSupplier?: boolean;
}

function buildInvoiceLabel(inv: InvoiceItem): string {
  const parts: string[] = [];

  if (inv.receivingNumber) {
    parts.push(`استلام #${inv.receivingNumber}`);
  } else {
    parts.push(`فاتورة #${inv.invoiceNumber}`);
  }

  if (inv.supplierInvoiceNo) {
    parts.push(inv.supplierInvoiceNo);
  }

  parts.push(formatDateShort(inv.invoiceDate));

  if (inv.totalReturns && parseFloat(inv.totalReturns) > 0) {
    parts.push(`مرتجع: ${formatCurrency(inv.totalReturns)}`);
  }

  parts.push(inv.warehouseNameAr);

  return parts.join(" — ");
}

function buildSearchKey(inv: InvoiceItem): string {
  return [
    inv.receivingNumber  ? String(inv.receivingNumber)  : "",
    String(inv.invoiceNumber),
    inv.supplierInvoiceNo ?? "",
    formatDateShort(inv.invoiceDate),
    inv.warehouseNameAr,
  ].filter(Boolean).join(" ");
}

export function InvoiceCombobox({ invoices, value, onChange, disabled, noSupplier }: Props) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? invoices.filter(inv =>
        buildSearchKey(inv).includes(search.trim())
      )
    : invoices;

  const selected = invoices.find(inv => inv.id === value);

  const placeholder = noSupplier
    ? "اختر المورد أولاً"
    : invoices.length === 0
      ? "لا توجد فواتير معتمدة"
      : "اختر فاتورة الشراء…";

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={v => { if (!disabled) setOpen(v); }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9 text-sm"
          disabled={disabled}
          data-testid="invoice-combobox"
        >
          <span className="truncate text-start">
            {selected ? buildInvoiceLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[540px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="بحث برقم الاستلام أو رقم فاتورة المورد…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filtered.length === 0 && (
              <CommandEmpty>لا توجد نتائج مطابقة.</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map(inv => (
                <CommandItem
                  key={inv.id}
                  value={inv.id}
                  onSelect={() => {
                    onChange(inv.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "ml-2 h-4 w-4 shrink-0",
                      value === inv.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{buildInvoiceLabel(inv)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
