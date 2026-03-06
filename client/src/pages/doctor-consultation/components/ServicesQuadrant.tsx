import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { QuadrantCard } from "./QuadrantCard";
import type { ServiceOrder, Service } from "../types";

interface Props {
  serviceOrders: ServiceOrder[];
  onAdd: (svc: ServiceOrder) => void;
  onRemove: (idx: number) => void;
}

export function ServicesQuadrant({ serviceOrders, onAdd, onRemove }: Props) {
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

      {serviceOrders.length === 0 ? (
        <div className="text-center text-muted-foreground text-xs py-4">
          لا توجد خدمات مضافة
        </div>
      ) : (
        <div className="space-y-1">
          {serviceOrders.map((svc, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded border px-2 py-1 text-sm bg-blue-50/50 border-blue-100"
              data-testid={`service-order-${i}`}
            >
              <span className="text-blue-800 text-xs truncate">
                {svc.serviceNameManual || svc.serviceId}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 text-destructive hover:text-destructive shrink-0"
                onClick={() => onRemove(i)}
                data-testid={`button-remove-service-${i}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </QuadrantCard>
  );
}
