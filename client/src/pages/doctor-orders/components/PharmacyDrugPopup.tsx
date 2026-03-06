import { useState } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Pill, ExternalLink, Search, X } from "lucide-react";
import { ItemFastSearch } from "@/components/ItemFastSearch";
import type { ItemSelectedPayload } from "@/components/ItemFastSearch/types";
import type { ClinicOrder } from "../types";

interface Props {
  order: ClinicOrder;
  trigger: React.ReactNode;
}

export function PharmacyDrugPopup({ order, trigger }: Props) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [altSearchOpen, setAltSearchOpen] = useState(false);

  const handleOpenInSalesInvoice = () => {
    const params = new URLSearchParams();
    params.set("clinicOrderId", order.id);
    if (order.targetId) params.set("pharmacyId", order.targetId);
    navigate(`/sales-invoices?${params.toString()}`);
    setOpen(false);
  };

  const handleAltItemSelected = (payload: ItemSelectedPayload) => {
    setAltSearchOpen(false);
    const params = new URLSearchParams();
    params.set("clinicOrderId", order.id);
    params.set("altItemId", payload.item.id);
    if (order.targetId) params.set("pharmacyId", order.targetId);
    navigate(`/sales-invoices?${params.toString()}`);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start" dir="rtl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pill className="h-4 w-4 text-green-600" />
                <span className="text-sm font-bold">{order.drugName}</span>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>

            {(order.dose || order.frequency || order.duration) && (
              <div className="rounded border p-2 bg-muted/40 text-xs space-y-1">
                {order.dose && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الجرعة</span>
                    <span className="font-medium">{order.dose}</span>
                  </div>
                )}
                {order.frequency && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">التكرار</span>
                    <span className="font-medium">{order.frequency}</span>
                  </div>
                )}
                {order.duration && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">المدة</span>
                    <span className="font-medium">{order.duration}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">المريض</span>
              <span>{order.patientName}</span>
            </div>

            <div className="flex flex-col gap-2 pt-1 border-t">
              <Button
                className="w-full gap-2 h-8 text-xs"
                onClick={handleOpenInSalesInvoice}
                data-testid="button-open-sales-invoice"
              >
                <ExternalLink className="h-3 w-3" />
                استدعاء في فاتورة بيع
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 h-8 text-xs"
                onClick={() => { setAltSearchOpen(true); setOpen(false); }}
                data-testid="button-suggest-alternative"
              >
                <Search className="h-3 w-3" />
                اقتراح بديل
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <ItemFastSearch
        open={altSearchOpen}
        onClose={() => setAltSearchOpen(false)}
        warehouseId={order.targetId || ""}
        drugsOnly={true}
        hideStockWarning={!order.targetId}
        onItemSelected={handleAltItemSelected}
        title="اختر دواء بديلاً"
      />
    </>
  );
}
