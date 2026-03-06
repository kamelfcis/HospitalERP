import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useClinicPermissions } from "../hooks/useClinicPermissions";
import type { ClinicClinic, ClinicAppointment } from "../types";

interface Props {
  clinics: ClinicClinic[];
  selectedDate: string;
  onSelect: (id: string) => void;
}

function ClinicCard({ clinic, date, onSelect }: { clinic: ClinicClinic; date: string; onSelect: () => void }) {
  const { data: apts = [] } = useQuery<ClinicAppointment[]>({
    queryKey: ["/api/clinic-clinics", clinic.id, "appointments", date],
    queryFn: () =>
      apiRequest("GET", `/api/clinic-clinics/${clinic.id}/appointments?date=${date}`)
        .then((r) => r.json()),
    enabled: !!date,
    refetchInterval: 30_000,
  });

  const waiting = apts.filter((a) => a.status === "waiting").length;
  const inConsultation = apts.filter((a) => a.status === "in_consultation").length;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/50"
      onClick={onSelect}
      data-testid={`clinic-card-${clinic.id}`}
    >
      <CardContent className="pt-4 space-y-2 text-right">
        <p className="font-semibold text-base text-foreground">{clinic.nameAr}</p>
        {clinic.departmentName && (
          <p className="text-xs text-muted-foreground">{clinic.departmentName}</p>
        )}
        <div className="flex gap-2 justify-end flex-wrap">
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            انتظار: {waiting}
          </Badge>
          {inConsultation > 0 && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              داخل: {inConsultation}
            </Badge>
          )}
          <Badge variant="outline" className="text-muted-foreground">
            إجمالي: {apts.length}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminSummaryCards({ clinics, selectedDate, onSelect }: Props) {
  const { isAdmin } = useClinicPermissions();
  if (!isAdmin) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {clinics.filter((c) => c.isActive).map((clinic) => (
        <ClinicCard
          key={clinic.id}
          clinic={clinic}
          date={selectedDate}
          onSelect={() => onSelect(clinic.id)}
        />
      ))}
    </div>
  );
}
