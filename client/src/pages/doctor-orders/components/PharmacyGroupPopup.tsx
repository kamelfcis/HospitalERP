import { useState } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Pill, ExternalLink, X } from "lucide-react";
import type { ClinicOrder } from "../types";

interface Props {
  orders: ClinicOrder[];
  pendingOrders: ClinicOrder[];
  patientName: string;
  trigger: React.ReactNode;
}

export function PharmacyGroupPopup({ orders, pendingOrders, patientName, trigger }: Props) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const handleOpenInSalesInvoice = () => {
    const params = new URLSearchParams();
    const orderIds = pendingOrders.map(o => o.id);
    params.set("clinicOrderIds", orderIds.join(","));
    const firstOrder = pendingOrders[0];
    if (firstOrder?.targetId) params.set("pharmacyId", firstOrder.targetId);
    navigate(`/sales-invoices?${params.toString()}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start" dir="rtl">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-green-600" />
              <span className="text-sm font-bold">روشتة {patientName}</span>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="rounded border p-2 bg-muted/30 space-y-1.5 max-h-48 overflow-y-auto">
            {orders.map((o, i) => (
              <div key={o.id} className={`flex items-center justify-between text-xs ${o.status === "cancelled" ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground w-4">{i + 1}.</span>
                  <span className={`font-medium ${o.status === "cancelled" ? "line-through" : ""}`}>{o.drugName}</span>
                  {o.dose && <span className="text-muted-foreground">({o.dose})</span>}
                </div>
                {o.status === "executed"  && <span className="text-green-600 text-[10px]">✓ منفذ</span>}
                {o.status === "pending"   && <span className="text-yellow-600 text-[10px]">معلق</span>}
                {o.status === "cancelled" && <span className="text-red-500 text-[10px]">ملغي — مستثنى من العدد</span>}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-1 border-t">
            <Button
              className="w-full gap-2 h-8 text-xs"
              onClick={handleOpenInSalesInvoice}
              data-testid="button-open-group-sales-invoice"
            >
              <ExternalLink className="h-3 w-3" />
              صرف الكل في فاتورة بيع ({pendingOrders.length} صنف)
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
