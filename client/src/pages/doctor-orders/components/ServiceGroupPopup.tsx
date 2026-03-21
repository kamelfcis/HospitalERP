import { useState } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Beaker, ExternalLink, X } from "lucide-react";
import type { ClinicOrder } from "../types";

interface Props {
  orders: ClinicOrder[];
  pendingOrders: ClinicOrder[];
  patientName: string;
  trigger: React.ReactNode;
}

export function ServiceGroupPopup({ orders, pendingOrders, patientName, trigger }: Props) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const handleExecuteAll = () => {
    const first = pendingOrders[0];
    const deptCode = first?.departmentCode || "LAB";
    const params = new URLSearchParams();
    params.set("clinicOrderIds", pendingOrders.map(o => o.id).join(","));
    params.set("patientName", first?.apptPatientName || first?.patientName || "");
    if (first?.doctorId) params.set("doctorId", first.doctorId);
    if (first?.doctorName) params.set("doctorName", first.doctorName);
    const servicesJson = pendingOrders.map(o => ({
      serviceId: o.serviceId,
      serviceName: o.serviceNameAr || o.serviceNameManual || "",
      unitPrice: o.servicePrice || "0",
    }));
    params.set("services", JSON.stringify(servicesJson));
    navigate(`/dept-services/${deptCode}?${params.toString()}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start" dir="rtl">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Beaker className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-bold">خدمات {patientName}</span>
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
                  <span className={`font-medium ${o.status === "cancelled" ? "line-through" : ""}`}>
                    {o.serviceNameAr || o.serviceNameManual || o.serviceId}
                  </span>
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
              onClick={handleExecuteAll}
              data-testid="button-execute-group-services"
            >
              <ExternalLink className="h-3 w-3" />
              تنفيذ الكل ({pendingOrders.length} خدمة)
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
