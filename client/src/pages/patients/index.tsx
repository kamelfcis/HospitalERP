import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Users } from "lucide-react";
import type { Patient } from "@shared/schema";
import type { PatientStats } from "./types";
import { useDebounce } from "./useDebounce";
import PatientGrid from "./PatientGrid";
import PatientFormDialog from "./PatientFormDialog";

const todayISO = new Date().toISOString().slice(0, 10);

export default function Patients() {
  const [, navigate]      = useLocation();
  const { hasPermission } = useAuth();
  const { toast }         = useToast();

  const canCreate      = hasPermission("patients.create");
  const canEdit        = hasPermission("patients.edit");
  const canViewInvoice = hasPermission("patient_invoices.view");

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom,    setDateFrom]    = useState(todayISO);
  const [dateTo,      setDateTo]      = useState(todayISO);
  const [deptId,      setDeptId]      = useState("");

  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 350);

  const { data: departments = [] } = useQuery<{ id: string; nameAr: string }[]>({
    queryKey: ["/api/departments"],
  });

  const statsParams = new URLSearchParams();
  if (debouncedSearch.trim()) statsParams.set("search", debouncedSearch.trim());
  if (dateFrom) statsParams.set("dateFrom", dateFrom);
  if (dateTo)   statsParams.set("dateTo",   dateTo);
  if (deptId)   statsParams.set("deptId",   deptId);

  const { data: rows = [], isLoading } = useQuery<PatientStats[]>({
    queryKey: ["/api/patients/stats", debouncedSearch, dateFrom, dateTo, deptId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/stats?${statsParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل في جلب بيانات المرضى");
      return res.json();
    },
  });

  const hasFilter = !!(dateFrom || dateTo || deptId);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/patients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
    },
    onError: (e: Error) => toast({ title: "خطأ في الحذف", description: e.message, variant: "destructive" }),
  });

  function handleAddNew()    { setEditingPatient(null); setDialogOpen(true); }
  function handleEdit(p: PatientStats) {
    setEditingPatient(p as unknown as Patient);
    setDialogOpen(true);
  }
  function handleDelete(p: PatientStats) {
    if (confirm(`هل تريد حذف المريض "${p.fullName}"؟`)) {
      deleteMutation.mutate(p.id);
    }
  }
  function handleOpenInvoice(invoiceId: string) {
    navigate(`/patient-invoices?loadId=${invoiceId}`);
  }
  function handleViewFile(patientId: string) {
    navigate(`/patients/${patientId}/file`);
  }
  function handleCloseDialog() {
    setDialogOpen(false);
    setEditingPatient(null);
  }
  function handleClearFilters() {
    setDateFrom(""); setDateTo(""); setDeptId("");
  }

  return (
    <div className="p-3 space-y-2 h-full flex flex-col">

      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1">
            <Users className="h-4 w-4" />
            سجل المرضى
          </h1>
          <p className="text-xs text-muted-foreground">
            إدارة بيانات المرضى ({rows.length} مريض)
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm" onClick={handleAddNew}
            className="h-7 text-xs px-3"
            data-testid="button-add-patient"
          >
            <Plus className="h-3 w-3 ml-1" />
            إضافة مريض
          </Button>
        )}
      </div>

      <div className="peachtree-toolbar rounded flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالاسم أو التليفون أو الطبيب..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="peachtree-input text-xs w-48"
            data-testid="input-search-patients"
          />
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">من:</Label>
          <input
            type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="peachtree-input text-xs w-32"
            data-testid="input-date-from"
          />
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">إلى:</Label>
          <input
            type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="peachtree-input text-xs w-32"
            data-testid="input-date-to"
          />
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">القسم:</Label>
          <Select value={deptId || "all"} onValueChange={v => setDeptId(v === "all" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs w-36" data-testid="select-dept-filter">
              <SelectValue placeholder="كل الأقسام" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilter && (
          <>
            <Button
              variant="outline" size="sm"
              className="h-7 text-xs px-2"
              onClick={handleClearFilters}
              data-testid="button-clear-filters"
            >
              مسح الفلاتر
            </Button>
            <span className="text-xs text-amber-600 font-medium">
              ● يعرض مرضى الفترة / القسم المحدد فقط
            </span>
          </>
        )}
      </div>

      <div className="peachtree-grid rounded flex-1 overflow-hidden">
        <PatientGrid
          rows={rows}
          isLoading={isLoading}
          hasDeptFilter={!!deptId}
          canViewInvoice={canViewInvoice}
          canEdit={canEdit}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onOpenInvoice={handleOpenInvoice}
          onViewFile={handleViewFile}
        />
      </div>

      <PatientFormDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        editingPatient={editingPatient}
      />

    </div>
  );
}
