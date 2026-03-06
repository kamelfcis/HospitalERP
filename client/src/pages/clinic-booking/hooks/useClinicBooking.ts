import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ClinicClinic } from "../types";

export function useClinicBooking() {
  const [selectedClinicId, setSelectedClinicId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  const { data: clinics = [], isLoading: clinicsLoading } = useQuery<ClinicClinic[]>({
    queryKey: ["/api/clinic-clinics"],
    queryFn: () => apiRequest("GET", "/api/clinic-clinics").then((r) => r.json()),
  });

  const autoSelected = !selectedClinicId && clinics.length === 1 ? clinics[0].id : selectedClinicId;

  return {
    clinics,
    clinicsLoading,
    selectedClinicId: autoSelected,
    setSelectedClinicId,
    selectedDate,
    setSelectedDate,
  };
}
