import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface ServiceLine {
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
}

interface Props {
  services: any[];
  selectedLines: ServiceLine[];
  onChange: (lines: ServiceLine[]) => void;
  isLoading?: boolean;
}

export function ServicesGrid({ services, selectedLines, onChange, isLoading }: Props) {
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");

  const addService = () => {
    if (!selectedServiceId) return;
    const svc = services.find((s: any) => s.id === selectedServiceId);
    if (!svc) return;
    if (selectedLines.some(l => l.serviceId === selectedServiceId)) return;
    onChange([...selectedLines, {
      serviceId: svc.id,
      serviceName: svc.nameAr || svc.name_ar || svc.name || "",
      quantity: 1,
      unitPrice: parseFloat(String(svc.basePrice || svc.base_price || 0)),
    }]);
    setSelectedServiceId("");
  };

  const removeLine = (idx: number) => {
    onChange(selectedLines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof ServiceLine, value: number) => {
    const updated = [...selectedLines];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  const availableServices = services.filter(
    (s: any) => !selectedLines.some(l => l.serviceId === s.id)
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
          <SelectTrigger className="flex-1" data-testid="select-service">
            <SelectValue placeholder="اختر خدمة..." />
          </SelectTrigger>
          <SelectContent>
            {availableServices.map((s: any) => (
              <SelectItem key={s.id} value={s.id} data-testid={`service-option-${s.id}`}>
                {s.nameAr || s.name_ar || s.name} — {parseFloat(String(s.basePrice || s.base_price || 0)).toFixed(2)} ج.م
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={addService} disabled={!selectedServiceId} size="sm" data-testid="btn-add-service">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {selectedLines.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-right">الخدمة</th>
                <th className="p-2 text-center w-20">الكمية</th>
                <th className="p-2 text-center w-28">السعر</th>
                <th className="p-2 text-center w-28">الإجمالي</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {selectedLines.map((line, idx) => (
                <tr key={line.serviceId} className="border-t">
                  <td className="p-2 text-right" data-testid={`text-service-name-${idx}`}>{line.serviceName}</td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={e => updateLine(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                      className="text-center h-8"
                      data-testid={`input-qty-${idx}`}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unitPrice}
                      onChange={e => updateLine(idx, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                      className="text-center h-8"
                      data-testid={`input-price-${idx}`}
                    />
                  </td>
                  <td className="p-2 text-center font-medium" data-testid={`text-line-total-${idx}`}>
                    {(line.quantity * line.unitPrice).toFixed(2)}
                  </td>
                  <td className="p-2">
                    <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} data-testid={`btn-remove-${idx}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
