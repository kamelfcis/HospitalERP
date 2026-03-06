import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import type { ClinicClinic } from "../types";

interface Props {
  clinics: ClinicClinic[];
  selectedClinicId: string;
  onSelect: (id: string) => void;
  onManage?: () => void;
}

export function ClinicHeader({ clinics, selectedClinicId, onSelect, onManage }: Props) {
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission("clinic.view_all");
  const canManage = hasPermission("clinic.manage");
  const selected = clinics.find((c) => c.id === selectedClinicId);

  if (!isAdmin && selected) {
    return (
      <div className="flex items-center gap-3 pb-2 border-b">
        <h1 className="text-xl font-bold text-foreground">{selected.nameAr}</h1>
        {selected.departmentName && (
          <span className="text-sm text-muted-foreground">({selected.departmentName})</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 pb-2 border-b">
      <h1 className="text-xl font-bold text-foreground ml-4">حجز العيادات</h1>
      <Select value={selectedClinicId} onValueChange={onSelect}>
        <SelectTrigger className="w-64" data-testid="select-clinic">
          <SelectValue placeholder="اختر العيادة..." />
        </SelectTrigger>
        <SelectContent>
          {clinics.filter((c) => c.isActive).map((c) => (
            <SelectItem key={c.id} value={c.id} data-testid={`clinic-option-${c.id}`}>
              {c.nameAr}
              {c.departmentName ? ` — ${c.departmentName}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canManage && onManage && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1 h-8 text-xs mr-auto"
          onClick={onManage}
          data-testid="button-manage-clinics"
        >
          <Settings className="h-3.5 w-3.5" />
          إدارة العيادات
        </Button>
      )}
    </div>
  );
}
