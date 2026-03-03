import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

export function useRegistry(mainTab: string) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [regPage, setRegPage] = useState(1);
  const [regDateFrom, setRegDateFrom] = useState(thirtyDaysAgo);
  const [regDateTo, setRegDateTo] = useState(todayStr);
  const [regPatientName, setRegPatientName] = useState("");
  const [regDoctorName, setRegDoctorName] = useState("");
  const [regStatus, setRegStatus] = useState("all");
  const regPageSize = 20;

  const regQp = useMemo(() => {
    const qp = new URLSearchParams();
    if (regStatus !== "all") qp.set("status", regStatus);
    if (regDateFrom) qp.set("dateFrom", regDateFrom);
    if (regDateTo) qp.set("dateTo", regDateTo);
    if (regPatientName) qp.set("patientName", regPatientName);
    if (regDoctorName) qp.set("doctorName", regDoctorName);
    qp.set("page", String(regPage));
    qp.set("pageSize", String(regPageSize));
    return qp.toString();
  }, [regStatus, regDateFrom, regDateTo, regPatientName, regDoctorName, regPage]);

  const { data: registryData, isLoading: regLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: [`/api/patient-invoices?${regQp}`],
    enabled: mainTab === "registry",
  });

  const regTotalPages = Math.ceil((registryData?.total || 0) / regPageSize);

  return {
    regPage, setRegPage,
    regDateFrom, setRegDateFrom,
    regDateTo, setRegDateTo,
    regPatientName, setRegPatientName,
    regDoctorName, setRegDoctorName,
    regStatus, setRegStatus,
    regPageSize,
    regTotalPages,
    regLoading,
    registryData,
  };
}
