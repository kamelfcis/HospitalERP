import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import {
  Plus,
  Search,
  ArrowRight,
  Printer,
  FileText,
  LogOut,
  Loader2,
  BedDouble,
  Layers,
} from "lucide-react";
import type { Admission, InsertAdmission, Patient, Department } from "@shared/schema";

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const admissionStatusLabels: Record<string, string> = {
  active: "\u0646\u0634\u0637\u0629",
  discharged: "\u062e\u0631\u062c",
  cancelled: "\u0645\u0644\u063a\u0627\u0629",
};

function getStatusBadgeClass(status: string) {
  if (status === "active")
    return "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "discharged")
    return "bg-blue-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "cancelled")
    return "bg-red-600 text-white no-default-hover-elevate no-default-active-elevate";
  return "";
}

export default function Admissions() {
  const { toast } = useToast();
  const [selectedAdmission, setSelectedAdmission] = useState<Admission | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const debouncedPatientSearch = useDebounce(patientSearch, 200);
  const patientSearchRef = useRef<HTMLInputElement>(null);
  const patientDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    patientName: "",
    patientPhone: "",
    patientId: "",
    admissionDate: new Date().toISOString().split("T")[0],
    doctorName: "",
    notes: "",
    admissionNumber: "",
  });

  const [printDeptId, setPrintDeptId] = useState("all");
  const printRef = useRef<HTMLDivElement>(null);

  const admissionsQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    return params.toString();
  }, [statusFilter, debouncedSearch]);

  const { data: admissions, isLoading: admissionsLoading } = useQuery<Admission[]>({
    queryKey: ["/api/admissions", admissionsQueryParams],
    queryFn: async () => {
      const qs = admissionsQueryParams ? `?${admissionsQueryParams}` : "";
      const res = await fetch(`/api/admissions${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admissions");
      return res.json();
    },
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: admissionDetail, isLoading: detailLoading } = useQuery<Admission>({
    queryKey: ["/api/admissions", selectedAdmission?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admissions/${selectedAdmission!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admission detail");
      return res.json();
    },
    enabled: !!selectedAdmission,
  });

  const { data: admissionInvoices, isLoading: invoicesLoading } = useQuery<any[]>({
    queryKey: ["/api/admissions", selectedAdmission?.id, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/admissions/${selectedAdmission!.id}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admission invoices");
      return res.json();
    },
    enabled: !!selectedAdmission,
  });

  const { data: reportData, isLoading: reportLoading } = useQuery<any>({
    queryKey: ["/api/admissions", selectedAdmission?.id, "report"],
    queryFn: async () => {
      const res = await fetch(`/api/admissions/${selectedAdmission!.id}/report`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch admission report");
      return res.json();
    },
    enabled: !!selectedAdmission,
  });

  useEffect(() => {
    if (!debouncedPatientSearch || debouncedPatientSearch.length < 1) {
      setPatientResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchingPatients(true);
    fetch(`/api/patients?search=${encodeURIComponent(debouncedPatientSearch)}`, {
      signal: controller.signal,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        setPatientResults(Array.isArray(data) ? data : []);
        setSearchingPatients(false);
      })
      .catch(() => setSearchingPatients(false));
    return () => controller.abort();
  }, [debouncedPatientSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        patientDropdownRef.current &&
        !patientDropdownRef.current.contains(e.target as Node) &&
        patientSearchRef.current &&
        !patientSearchRef.current.contains(e.target as Node)
      ) {
        setShowPatientDropdown(false);
      }
    }
    if (showPatientDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPatientDropdown]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admissions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions"] });
      toast({ title: "\u062a\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0625\u0642\u0627\u0645\u0629 \u0628\u0646\u062c\u0627\u062d" });
      handleCloseCreate();
    },
    onError: (error: Error) => {
      toast({ title: "\u062e\u0637\u0623", description: error.message, variant: "destructive" });
    },
  });

  const dischargeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admissions/${id}/discharge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions"] });
      toast({ title: "\u062a\u0645 \u062e\u0631\u0648\u062c \u0627\u0644\u0645\u0631\u064a\u0636 \u0628\u0646\u062c\u0627\u062d" });
      if (selectedAdmission) {
        setSelectedAdmission({ ...selectedAdmission, status: "discharged" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "\u062e\u0637\u0623", description: error.message, variant: "destructive" });
    },
  });

  const consolidateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admissions/${id}/consolidate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions"] });
      toast({ title: "\u062a\u0645 \u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631 \u0628\u0646\u062c\u0627\u062d" });
    },
    onError: (error: Error) => {
      toast({ title: "\u062e\u0637\u0623", description: error.message, variant: "destructive" });
    },
  });

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    setFormData({
      patientName: "",
      patientPhone: "",
      patientId: "",
      admissionDate: new Date().toISOString().split("T")[0],
      doctorName: "",
      notes: "",
      admissionNumber: "",
    });
    setPatientSearch("");
    setPatientResults([]);
    setShowPatientDropdown(false);
  };

  const handleSelectPatient = (patient: Patient) => {
    setFormData({
      ...formData,
      patientName: patient.fullName,
      patientPhone: patient.phone || "",
      patientId: patient.id,
    });
    setPatientSearch(patient.fullName);
    setShowPatientDropdown(false);
    setPatientResults([]);
  };

  const handleCreateSubmit = () => {
    if (!formData.patientName.trim()) {
      toast({ title: "\u062e\u0637\u0623", description: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0631\u064a\u0636 \u0645\u0637\u0644\u0648\u0628", variant: "destructive" });
      return;
    }
    if (!formData.admissionNumber.trim()) {
      toast({ title: "\u062e\u0637\u0623", description: "\u0631\u0642\u0645 \u0627\u0644\u0625\u0642\u0627\u0645\u0629 \u0645\u0637\u0644\u0648\u0628", variant: "destructive" });
      return;
    }
    if (!formData.admissionDate) {
      toast({ title: "\u062e\u0637\u0623", description: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0642\u0627\u0645\u0629 \u0645\u0637\u0644\u0648\u0628", variant: "destructive" });
      return;
    }
    const body: any = {
      patientName: formData.patientName.trim(),
      patientPhone: formData.patientPhone || null,
      admissionDate: formData.admissionDate,
      admissionNumber: formData.admissionNumber.trim(),
      doctorName: formData.doctorName.trim() || null,
      notes: formData.notes.trim() || null,
    };
    if (formData.patientId) body.patientId = formData.patientId;
    createMutation.mutate(body);
  };

  const handlePrint = () => {
    window.print();
  };

  const invoicesByDepartment = useMemo(() => {
    if (!reportData?.invoices) return {};
    const grouped: Record<string, any[]> = {};
    for (const inv of reportData.invoices) {
      const deptName = inv.departmentName || "\u0628\u062f\u0648\u0646 \u0642\u0633\u0645";
      if (!grouped[deptName]) grouped[deptName] = [];
      grouped[deptName].push(inv);
    }
    return grouped;
  }, [reportData]);

  const filteredPrintInvoices = useMemo(() => {
    if (printDeptId === "all") return invoicesByDepartment;
    const filtered: Record<string, any[]> = {};
    for (const [dept, invs] of Object.entries(invoicesByDepartment)) {
      const matchingInvs = (invs as any[]).filter((inv: any) => {
        if (printDeptId === "none") return !inv.departmentId;
        return inv.departmentId === printDeptId;
      });
      if (matchingInvs.length > 0) {
        filtered[dept] = matchingInvs;
      }
    }
    return filtered;
  }, [invoicesByDepartment, printDeptId]);

  const totalAllInvoices = useMemo(() => {
    if (!reportData?.invoices) return 0;
    return reportData.invoices.reduce(
      (sum: number, inv: any) => sum + parseFloat(inv.netAmount || inv.totalAmount || "0"),
      0
    );
  }, [reportData]);

  if (selectedAdmission) {
    const adm = admissionDetail || selectedAdmission;
    return (
      <div className="p-3 space-y-3" dir="rtl">
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #print-area, #print-area * { visibility: visible !important; }
            #print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 210mm !important;
              padding: 10mm !important;
              font-size: 11pt !important;
              direction: rtl !important;
            }
            #print-area table {
              width: 100% !important;
              border-collapse: collapse !important;
            }
            #print-area th, #print-area td {
              border: 1px solid #333 !important;
              padding: 4px 8px !important;
              text-align: right !important;
              font-size: 10pt !important;
            }
            #print-area th {
              background: #eee !important;
              font-weight: bold !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #print-area h2, #print-area h3, #print-area h4 {
              margin: 8px 0 !important;
            }
            .no-print { display: none !important; }
          }
        `}</style>

        <div className="no-print peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedAdmission(null)}
              data-testid="button-back-to-list"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-sm font-bold text-foreground flex items-center gap-1">
                <BedDouble className="h-4 w-4" />
                {"\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0625\u0642\u0627\u0645\u0629"} - {adm.admissionNumber}
              </h1>
              <p className="text-xs text-muted-foreground">{adm.patientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {adm.status === "active" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (confirm("\u0647\u0644 \u0623\u0646\u062a \u0645\u062a\u0623\u0643\u062f \u0645\u0646 \u062e\u0631\u0648\u062c \u0627\u0644\u0645\u0631\u064a\u0636\u061f"))
                    dischargeMutation.mutate(adm.id);
                }}
                disabled={dischargeMutation.isPending}
                data-testid="button-discharge"
              >
                <LogOut className="h-3 w-3 ml-1" />
                {"\u062e\u0631\u0648\u062c \u0627\u0644\u0645\u0631\u064a\u0636"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => consolidateMutation.mutate(adm.id)}
              disabled={consolidateMutation.isPending}
              data-testid="button-consolidate"
            >
              <Layers className="h-3 w-3 ml-1" />
              {"\u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631"}
            </Button>
          </div>
        </div>

        <Card className="no-print">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{"\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">{"\u0631\u0642\u0645 \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}:</span>
                <p className="font-medium" data-testid="text-admission-number">{adm.admissionNumber}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{"\u0627\u0633\u0645 \u0627\u0644\u0645\u0631\u064a\u0636"}:</span>
                <p className="font-medium" data-testid="text-patient-name">{adm.patientName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{"\u0627\u0644\u062a\u0644\u064a\u0641\u0648\u0646"}:</span>
                <p className="font-medium" data-testid="text-patient-phone">{adm.patientPhone || "\u2014"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{"\u0627\u0644\u062d\u0627\u0644\u0629"}:</span>
                <Badge className={getStatusBadgeClass(adm.status)} data-testid="badge-status">
                  {admissionStatusLabels[adm.status] || adm.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">{"\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}:</span>
                <p className="font-medium" data-testid="text-admission-date">{formatDateShort(adm.admissionDate)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{"\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062e\u0631\u0648\u062c"}:</span>
                <p className="font-medium" data-testid="text-discharge-date">{adm.dischargeDate ? formatDateShort(adm.dischargeDate) : "\u2014"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{"\u0627\u0644\u0637\u0628\u064a\u0628"}:</span>
                <p className="font-medium" data-testid="text-doctor-name">{adm.doctorName || "\u2014"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{"\u0645\u0644\u0627\u062d\u0638\u0627\u062a"}:</span>
                <p className="font-medium" data-testid="text-notes">{adm.notes || "\u2014"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="no-print">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm">{"\u0641\u0648\u0627\u062a\u064a\u0631 \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}</CardTitle>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : !admissionInvoices || admissionInvoices.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{"\u0644\u0627 \u062a\u0648\u062c\u062f \u0641\u0648\u0627\u062a\u064a\u0631"}</p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{"\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629"}</TableHead>
                      <TableHead className="text-right">{"\u0627\u0644\u0642\u0633\u0645"}</TableHead>
                      <TableHead className="text-right">{"\u0627\u0644\u062a\u0627\u0631\u064a\u062e"}</TableHead>
                      <TableHead className="text-right">{"\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a"}</TableHead>
                      <TableHead className="text-right">{"\u0627\u0644\u062d\u0627\u0644\u0629"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admissionInvoices.map((inv: any) => (
                      <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                        <TableCell className="text-xs" data-testid={`text-invoice-number-${inv.id}`}>
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-xs">{inv.departmentName || "\u2014"}</TableCell>
                        <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                        <TableCell className="text-xs">
                          {formatCurrency(inv.netAmount || inv.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            inv.status === "draft"
                              ? "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate"
                              : inv.status === "finalized"
                              ? "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate"
                              : "bg-red-600 text-white no-default-hover-elevate no-default-active-elevate"
                          }>
                            {inv.status === "draft" ? "\u0645\u0633\u0648\u062f\u0629" : inv.status === "finalized" ? "\u0646\u0647\u0627\u0626\u064a" : "\u0645\u0644\u063a\u064a"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="no-print">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {"\u062a\u0642\u0631\u064a\u0631 \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={printDeptId} onValueChange={setPrintDeptId}>
                <SelectTrigger className="w-[180px]" data-testid="select-print-department">
                  <SelectValue placeholder={"\u0627\u062e\u062a\u0631 \u0627\u0644\u0642\u0633\u0645"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{"\u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0642\u0633\u0627\u0645"}</SelectItem>
                  {departments?.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.nameAr}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">{"\u0628\u062f\u0648\u0646 \u0642\u0633\u0645"}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={handlePrint} data-testid="button-print-all">
                <Printer className="h-3 w-3 ml-1" />
                {printDeptId === "all" ? "\u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0643\u0644" : "\u0637\u0628\u0627\u0639\u0629 \u0642\u0633\u0645"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {reportLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : !reportData?.invoices || reportData.invoices.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{"\u0644\u0627 \u062a\u0648\u062c\u062f \u0641\u0648\u0627\u062a\u064a\u0631 \u0644\u0644\u062a\u0642\u0631\u064a\u0631"}</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(invoicesByDepartment).map(([deptName, invs]) => (
                  <div key={deptName} className="space-y-1">
                    <h4 className="text-xs font-bold text-foreground">{deptName}</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">{"\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629"}</TableHead>
                          <TableHead className="text-right">{"\u0627\u0644\u062a\u0627\u0631\u064a\u062e"}</TableHead>
                          <TableHead className="text-right">{"\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(invs as any[]).map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-xs">{inv.invoiceNumber}</TableCell>
                            <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                            <TableCell className="text-xs">
                              {formatCurrency(inv.netAmount || inv.totalAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-xs font-medium text-left">
                      {"\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0642\u0633\u0645"}: {formatCurrency(
                        (invs as any[]).reduce((s: number, inv: any) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0)
                      )}
                    </p>
                  </div>
                ))}
                <div className="border-t pt-2">
                  <p className="text-sm font-bold">
                    {"\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0643\u0644\u064a"}: {formatCurrency(totalAllInvoices)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div id="print-area" ref={printRef} style={{ display: "none" }} dir="rtl">
          <div style={{ visibility: "visible" }}>
            <h2 style={{ textAlign: "center", marginBottom: "10px" }}>{"\u062a\u0642\u0631\u064a\u0631 \u0625\u0642\u0627\u0645\u0629 \u0645\u0631\u064a\u0636"}</h2>
            <table style={{ width: "100%", marginBottom: "15px" }}>
              <tbody>
                <tr>
                  <td style={{ border: "none", padding: "2px 8px" }}><strong>{"\u0631\u0642\u0645 \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}:</strong> {adm.admissionNumber}</td>
                  <td style={{ border: "none", padding: "2px 8px" }}><strong>{"\u0627\u0633\u0645 \u0627\u0644\u0645\u0631\u064a\u0636"}:</strong> {adm.patientName}</td>
                </tr>
                <tr>
                  <td style={{ border: "none", padding: "2px 8px" }}><strong>{"\u0627\u0644\u062a\u0644\u064a\u0641\u0648\u0646"}:</strong> {adm.patientPhone || "\u2014"}</td>
                  <td style={{ border: "none", padding: "2px 8px" }}><strong>{"\u0627\u0644\u0637\u0628\u064a\u0628"}:</strong> {adm.doctorName || "\u2014"}</td>
                </tr>
                <tr>
                  <td style={{ border: "none", padding: "2px 8px" }}><strong>{"\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}:</strong> {adm.admissionDate}</td>
                  <td style={{ border: "none", padding: "2px 8px" }}><strong>{"\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062e\u0631\u0648\u062c"}:</strong> {adm.dischargeDate || "\u2014"}</td>
                </tr>
              </tbody>
            </table>

            {Object.entries(filteredPrintInvoices).map(([deptName, invs]) => (
              <div key={deptName} style={{ marginBottom: "15px" }}>
                <h3 style={{ borderBottom: "2px solid #333", paddingBottom: "3px" }}>{deptName}</h3>
                {(invs as any[]).map((inv: any) => (
                  <div key={inv.id} style={{ marginBottom: "10px" }}>
                    <p style={{ fontSize: "10pt", marginBottom: "4px" }}>
                      <strong>{"\u0641\u0627\u062a\u0648\u0631\u0629 \u0631\u0642\u0645"}:</strong> {inv.invoiceNumber} | <strong>{"\u0627\u0644\u062a\u0627\u0631\u064a\u062e"}:</strong> {inv.invoiceDate}
                    </p>
                    {inv.lines && inv.lines.length > 0 && (
                      <table>
                        <thead>
                          <tr>
                            <th>{"\u0627\u0644\u0628\u064a\u0627\u0646"}</th>
                            <th>{"\u0627\u0644\u0643\u0645\u064a\u0629"}</th>
                            <th>{"\u0627\u0644\u0633\u0639\u0631"}</th>
                            <th>{"\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.lines.map((line: any, idx: number) => (
                            <tr key={idx}>
                              <td>{line.description}</td>
                              <td>{line.quantity}</td>
                              <td>{line.unitPrice}</td>
                              <td>{line.totalPrice}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p style={{ textAlign: "left", fontSize: "10pt", fontWeight: "bold" }}>
                      {"\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629"}: {inv.netAmount || inv.totalAmount}
                    </p>
                  </div>
                ))}
                <p style={{ textAlign: "left", fontSize: "11pt", fontWeight: "bold", borderTop: "1px solid #999", paddingTop: "3px" }}>
                  {"\u0625\u062c\u0645\u0627\u0644\u064a"} {deptName}: {
                    (invs as any[]).reduce((s: number, inv: any) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0).toFixed(2)
                  }
                </p>
              </div>
            ))}

            <div style={{ borderTop: "3px double #333", paddingTop: "8px", marginTop: "10px" }}>
              <h3 style={{ textAlign: "left" }}>
                {"\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0643\u0644\u064a"}: {
                  Object.values(filteredPrintInvoices).flat().reduce(
                    (s: number, inv: any) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"),
                    0
                  ).toFixed(2)
                }
              </h3>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3" dir="rtl">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1" data-testid="text-page-title">
            <BedDouble className="h-4 w-4" />
            {"\u0625\u0642\u0627\u0645\u0627\u062a \u0627\u0644\u0645\u0631\u0636\u0649"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {"\u0625\u062f\u0627\u0631\u0629 \u0625\u0642\u0627\u0645\u0627\u062a \u0627\u0644\u0645\u0631\u0636\u0649"} ({admissions?.length || 0})
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            data-testid="button-add-admission"
          >
            <Plus className="h-3 w-3 ml-1" />
            {"\u0625\u0642\u0627\u0645\u0629 \u062c\u062f\u064a\u062f\u0629"}
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar rounded flex items-center gap-2 flex-wrap">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          placeholder={"\u0628\u062d\u062b \u0639\u0646 \u0625\u0642\u0627\u0645\u0629..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="peachtree-input flex-1 max-w-xs text-xs"
          data-testid="input-search-admissions"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder={"\u0627\u0644\u062d\u0627\u0644\u0629"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{"\u0627\u0644\u0643\u0644"}</SelectItem>
            <SelectItem value="active">{"\u0646\u0634\u0637\u0629"}</SelectItem>
            <SelectItem value="discharged">{"\u062e\u0631\u062c"}</SelectItem>
            <SelectItem value="cancelled">{"\u0645\u0644\u063a\u0627\u0629"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="peachtree-grid rounded">
        {admissionsLoading ? (
          <div className="p-3 space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-220px)]">
            <table className="w-full text-xs">
              <thead className="peachtree-grid-header sticky top-0">
                <tr>
                  <th className="text-right">{"\u0631\u0642\u0645 \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}</th>
                  <th className="text-right">{"\u0627\u0633\u0645 \u0627\u0644\u0645\u0631\u064a\u0636"}</th>
                  <th className="text-right">{"\u0627\u0644\u062a\u0644\u064a\u0641\u0648\u0646"}</th>
                  <th className="text-right">{"\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}</th>
                  <th className="text-right">{"\u0627\u0644\u0637\u0628\u064a\u0628"}</th>
                  <th className="text-center">{"\u0627\u0644\u062d\u0627\u0644\u0629"}</th>
                </tr>
              </thead>
              <tbody>
                {!admissions || admissions.length === 0 ? (
                  <tr className="peachtree-grid-row">
                    <td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                      {"\u0644\u0627 \u062a\u0648\u062c\u062f \u0625\u0642\u0627\u0645\u0627\u062a"}
                    </td>
                  </tr>
                ) : (
                  admissions.map((adm) => (
                    <tr
                      key={adm.id}
                      className="peachtree-grid-row cursor-pointer"
                      onClick={() => setSelectedAdmission(adm)}
                      data-testid={`row-admission-${adm.id}`}
                    >
                      <td className="text-xs font-medium" data-testid={`text-adm-number-${adm.id}`}>
                        {adm.admissionNumber}
                      </td>
                      <td className="text-xs" data-testid={`text-patient-${adm.id}`}>
                        {adm.patientName}
                      </td>
                      <td className="text-xs font-mono">{adm.patientPhone || "\u2014"}</td>
                      <td className="text-xs">{formatDateShort(adm.admissionDate)}</td>
                      <td className="text-xs">{adm.doctorName || "\u2014"}</td>
                      <td className="text-center">
                        <Badge className={getStatusBadgeClass(adm.status)} data-testid={`badge-status-${adm.id}`}>
                          {admissionStatusLabels[adm.status] || adm.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md p-4" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold">{"\u0625\u0642\u0627\u0645\u0629 \u062c\u062f\u064a\u062f\u0629"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1 relative">
              <Label className="text-xs">{"\u0627\u0633\u0645 \u0627\u0644\u0645\u0631\u064a\u0636"} *</Label>
              <input
                ref={patientSearchRef}
                type="text"
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  setShowPatientDropdown(true);
                  setFormData({ ...formData, patientName: e.target.value, patientId: "" });
                }}
                onFocus={() => {
                  if (patientSearch.length > 0) setShowPatientDropdown(true);
                }}
                placeholder={"\u0627\u0628\u062d\u062b \u0639\u0646 \u0645\u0631\u064a\u0636..."}
                className="peachtree-input w-full text-xs"
                data-testid="input-patient-search"
              />
              {showPatientDropdown && (patientResults.length > 0 || searchingPatients) && (
                <div
                  ref={patientDropdownRef}
                  className="absolute z-50 w-full bg-popover border rounded-md shadow-md mt-1 max-h-[200px] overflow-y-auto"
                >
                  {searchingPatients && (
                    <div className="p-2 text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {"\u062c\u0627\u0631\u064a \u0627\u0644\u0628\u062d\u062b..."}
                    </div>
                  )}
                  {patientResults.map((patient) => (
                    <div
                      key={patient.id}
                      className="p-2 text-xs cursor-pointer hover-elevate"
                      onClick={() => handleSelectPatient(patient)}
                      data-testid={`option-patient-${patient.id}`}
                    >
                      <span className="font-medium">{patient.fullName}</span>
                      {patient.phone && (
                        <span className="text-muted-foreground mr-2 font-mono">{patient.phone}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{"\u0631\u0642\u0645 \u0627\u0644\u0625\u0642\u0627\u0645\u0629"} *</Label>
              <input
                type="text"
                value={formData.admissionNumber}
                onChange={(e) => setFormData({ ...formData, admissionNumber: e.target.value })}
                placeholder={"\u0631\u0642\u0645 \u0627\u0644\u0625\u0642\u0627\u0645\u0629"}
                className="peachtree-input w-full text-xs"
                data-testid="input-admission-number"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{"\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0642\u0627\u0645\u0629"} *</Label>
              <input
                type="date"
                value={formData.admissionDate}
                onChange={(e) => setFormData({ ...formData, admissionDate: e.target.value })}
                className="peachtree-input w-full text-xs"
                data-testid="input-admission-date"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{"\u0627\u0644\u0637\u0628\u064a\u0628"}</Label>
              <input
                type="text"
                value={formData.doctorName}
                onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                placeholder={"\u0627\u0633\u0645 \u0627\u0644\u0637\u0628\u064a\u0628 (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)"}
                className="peachtree-input w-full text-xs"
                data-testid="input-doctor-name"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{"\u0645\u0644\u0627\u062d\u0638\u0627\u062a"}</Label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={"\u0645\u0644\u0627\u062d\u0638\u0627\u062a (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)"}
                className="peachtree-input w-full text-xs"
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-1 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseCreate}
              data-testid="button-cancel"
            >
              {"\u0625\u0644\u063a\u0627\u0621"}
            </Button>
            <Button
              size="sm"
              onClick={handleCreateSubmit}
              disabled={createMutation.isPending}
              data-testid="button-save-admission"
            >
              {createMutation.isPending ? "\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0641\u0638..." : "\u0625\u0646\u0634\u0627\u0621"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
