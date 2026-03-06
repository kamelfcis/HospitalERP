import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Lock, AlertTriangle } from "lucide-react";
import { QuadrantCard } from "./QuadrantCard";
import type { ServiceOrder, Service } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  serviceOrders: ServiceOrder[];
  onAdd: (svc: ServiceOrder) => void;
  onRemove: (idx: number) => void;
  hasConsultationServiceConfig?: boolean;
}

export function ServicesQuadrant({ serviceOrders, onAdd, onRemove, hasConsultationServiceConfig }: Props) {
  const [selectedId, setSelectedId] = useState("");

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/services");
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? json.services ?? []);
    },
  });

  const handleAdd = () => {
    const svc = services.find((s) => s.id === selectedId);
    if (!svc) return;
    onAdd({
      serviceId: svc.id,
      serviceNameManual: svc.nameAr,
      unitPrice: svc.basePrice ? parseFloat(String(svc.basePrice)) : 0,
    });
    setSelectedId("");
  };

  return (
    <QuadrantCard label="الخدمات المطلوبة">
      <div className="flex gap-1 mb-2">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="h-7 text-xs flex-1" data-testid="select-service">
            <SelectValue placeholder="اختر خدمة..." />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id} data-testid={`service-option-${s.id}`}>
                {s.nameAr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7 shrink-0"
          onClick={handleAdd}
          disabled={!selectedId}
          data-testid="button-add-service"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {hasConsultationServiceConfig === false && (
        <Alert variant="destructive" className="mb-2 py-1.5 px-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <AlertDescription className="text-[11px] leading-tight">
            لم يتم ربط خدمة كشف بهذه العيادة. اذهب لإعدادات العيادة واختر "خدمة الكشف" حتى تظهر تلقائياً.
          </AlertDescription>
        </Alert>
      )}

      {serviceOrders.length === 0 ? (
        <div className="text-center text-muted-foreground text-xs py-4">
          لا توجد خدمات مضافة
        </div>
      ) : (
        <div className="space-y-1">
          {serviceOrders.map((svc, i) => {
            const isConsultation = svc.isConsultationService;
            return (
              <div
                key={i}
                className={`flex items-center justify-between rounded border px-2 py-1 text-sm ${
                  isConsultation
                    ? "bg-green-50/70 border-green-200"
                    : "bg-blue-50/50 border-blue-100"
                }`}
                data-testid={`service-order-${i}`}
              >
                <span className={`text-xs truncate flex items-center gap-1 ${isConsultation ? "text-green-800" : "text-blue-800"}`}>
                  {svc.serviceNameManual || svc.serviceId}
                  {svc.unitPrice != null && parseFloat(String(svc.unitPrice)) > 0 && (
                    <span className="font-semibold whitespace-nowrap">
                      ({parseFloat(String(svc.unitPrice)).toFixed(2)} ج.م)
                    </span>
                  )}
                  {isConsultation && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-300 text-green-700">
                      <Lock className="h-2.5 w-2.5 ml-0.5" />
                      كشف
                    </Badge>
                  )}
                </span>
                {!isConsultation && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 text-destructive hover:text-destructive shrink-0"
                    onClick={() => onRemove(i)}
                    data-testid={`button-remove-service-${i}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </QuadrantCard>
  );
}
