/*
 * CreditCustomerCombobox — بحث عملاء الآجل مع إضافة سريعة
 *
 * مُعاد استخدامه في:
 *   - شاشة تحصيل الآجل (customer-payments)
 *   - فاتورة المبيعات (InvoiceHeaderBar) عند اختيار آجل
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import { Input }   from "@/components/ui/input";
import { Button }  from "@/components/ui/button";
import { Label }   from "@/components/ui/label";
import {
  Command, CommandInput, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChevronsUpDown, Check, Plus, Loader2, User } from "lucide-react";

export interface CreditCustomer {
  id:    string;
  name:  string;
  phone: string | null;
}

interface Props {
  value:       string;
  onChange:    (id: string, customer: CreditCustomer) => void;
  pharmacyId?: string | null;
  disabled?:   boolean;
  showAddBtn?: boolean;
}

// ─── QuickAddDialog ────────────────────────────────────────────────────────────
function QuickAddDialog({
  open, onClose, pharmacyId, onCreated,
}: {
  open:       boolean;
  onClose:    () => void;
  pharmacyId?: string | null;
  onCreated:  (c: CreditCustomer) => void;
}) {
  const { toast } = useToast();
  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiRequestJson<CreditCustomer>("POST", "/api/credit-customers", {
      name: name.trim(), phone: phone.trim() || null, pharmacyId: pharmacyId ?? null,
    }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/credit-customers"] });
      toast({ title: "تم إضافة العميل بنجاح" });
      onCreated(customer);
      setName(""); setPhone("");
      onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            إضافة عميل آجل جديد
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <div>
            <Label className="text-xs mb-1 block">الاسم *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم العميل"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && name.trim() && mutation.mutate()}
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">رقم الهاتف</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="اختياري"
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && name.trim() && mutation.mutate()}
            />
          </div>
          <div className="flex gap-2 justify-end mt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>إلغاء</Button>
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={!name.trim() || mutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Plus className="h-3 w-3 ml-1" />}
              إضافة
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CreditCustomerCombobox ────────────────────────────────────────────────────
export function CreditCustomerCombobox({ value, onChange, pharmacyId, disabled, showAddBtn = true }: Props) {
  const [open,     setOpen]     = useState(false);
  const [search,   setSearch]   = useState("");
  const [addOpen,  setAddOpen]  = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ customers: CreditCustomer[] }>({
    queryKey: ["/api/credit-customers", search, pharmacyId],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search)     qs.set("search", search);
      if (pharmacyId) qs.set("pharmacyId", pharmacyId);
      const r = await fetch(`/api/credit-customers?${qs}`, { credentials: "include" });
      return r.json();
    },
  });

  const customers = data?.customers ?? [];
  const selected  = customers.find((c) => c.id === value);

  return (
    <>
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              disabled={disabled}
              className="h-7 min-w-[180px] justify-between text-[12px] font-normal"
              data-testid="combo-credit-customer"
            >
              <span className="truncate">
                {selected ? selected.name : "اختر عميلاً..."}
              </span>
              <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0 mr-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0" align="start" dir="rtl">
            <Command>
              <CommandInput
                placeholder="ابحث بالاسم أو الهاتف..."
                value={search}
                onValueChange={setSearch}
                className="h-8 text-sm"
              />
              {isLoading
                ? <div className="py-4 text-center text-xs text-muted-foreground">جاري البحث...</div>
                : (
                  <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                    لا توجد نتائج
                  </CommandEmpty>
                )
              }
              <CommandGroup>
                {customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => { onChange(c.id, c); setOpen(false); setSearch(""); }}
                    className="text-sm"
                  >
                    <Check className={`ml-2 h-3 w-3 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                    <div>
                      <p className="font-medium">{c.name}</p>
                      {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>

        {showAddBtn && !disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            onClick={() => setAddOpen(true)}
            title="إضافة عميل جديد"
            data-testid="button-add-credit-customer"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <QuickAddDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        pharmacyId={pharmacyId}
        onCreated={(c) => { onChange(c.id, c); }}
      />
    </>
  );
}
