import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Search } from "lucide-react";
import type { Service } from "@shared/schema";

export interface ServiceLine {
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
}

interface Props {
  services: Service[];
  selectedLines: ServiceLine[];
  onChange: (lines: ServiceLine[]) => void;
  isLoading?: boolean;
}

export function ServicesGrid({ services, selectedLines, onChange }: Props) {
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const safeServices = Array.isArray(services) ? services : [];
  const available = safeServices.filter(
    (s) => !selectedLines.some(l => l.serviceId === s.id)
  );
  const filtered = searchText.trim()
    ? available.filter((s) => {
        const name = (s.nameAr || "").toLowerCase();
        const code = (s.code || "").toLowerCase();
        const q = searchText.toLowerCase();
        return name.includes(q) || code.includes(q);
      })
    : available;

  const addService = (svc: Service) => {
    onChange([...selectedLines, {
      serviceId: svc.id,
      serviceName: svc.nameAr || "",
      quantity: 1,
      unitPrice: parseFloat(String(svc.basePrice || 0)),
    }]);
    setSearchText("");
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeLine = (idx: number) => onChange(selectedLines.filter((_, i) => i !== idx));

  const updateLine = (idx: number, field: keyof ServiceLine, value: number) => {
    const updated = [...selectedLines];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="ابحث عن خدمة بالاسم أو الكود..."
            className="h-7 text-sm pr-8"
            data-testid="input-search-service"
          />
        </div>
        {showDropdown && filtered.length > 0 && (
          <div className="absolute z-50 top-full mt-0.5 w-full border rounded-md bg-background shadow-lg max-h-44 overflow-auto">
            {filtered.map((s: any) => (
              <button
                key={s.id}
                type="button"
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted text-sm"
                onMouseDown={() => addService(s)}
                data-testid={`service-option-${s.id}`}
              >
                <span>{s.nameAr || s.name_ar || s.name}</span>
                <span className="text-muted-foreground text-xs">{parseFloat(String(s.basePrice || s.base_price || 0)).toFixed(2)} ج.م</span>
              </button>
            ))}
          </div>
        )}
        {showDropdown && searchText && filtered.length === 0 && (
          <div className="absolute z-50 top-full mt-0.5 w-full border rounded-md bg-background shadow-lg px-3 py-2 text-sm text-muted-foreground">
            لا توجد نتائج
          </div>
        )}
      </div>

      {selectedLines.length > 0 && (
        <div className="space-y-0.5">
          {selectedLines.map((line, idx) => (
            <div key={line.serviceId} className="flex items-center gap-1.5 bg-muted/40 rounded px-2 py-0.5 text-sm">
              <span className="flex-1 truncate font-medium text-xs" data-testid={`text-service-name-${idx}`}>{line.serviceName}</span>
              <Input
                type="number" min={1} value={line.quantity}
                onChange={e => updateLine(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 h-6 text-center text-xs p-0"
                data-testid={`input-qty-${idx}`}
              />
              <span className="text-[10px] text-muted-foreground">×</span>
              <Input
                type="number" min={0} step={0.01} value={line.unitPrice}
                onChange={e => updateLine(idx, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-20 h-6 text-center text-xs p-0"
                data-testid={`input-price-${idx}`}
              />
              <span className="text-[10px] text-muted-foreground">=</span>
              <span className="w-20 text-center font-bold text-xs tabular-nums" data-testid={`text-line-total-${idx}`}>
                {(line.quantity * line.unitPrice).toFixed(2)}
              </span>
              <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="h-6 w-6 p-0" data-testid={`btn-remove-${idx}`}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
