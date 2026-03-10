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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Users, FolderOpen, ArrowRight } from "lucide-react";
import type { Patient } from "@shared/schema";
import type { PatientStats, PrefilledPatient } from "./types";
import { useDebounce } from "./useDebounce";
import PatientGrid from "./PatientGrid";
import PatientFormDialog from "./PatientFormDialog";
import { PatientFilePanel } from "./components/PatientFilePanel";

export default function Patients() {
  const [, navigate]      = useLocation();
  const { hasPermission } = useAuth();
  const { toast }         = useToast();

  const canCreate      = hasPermission("patients.create");
  const canEdit        = hasPermission("patients.edit");
  const canViewInvoice = hasPermission("patient_invoices.view");

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [deptId,      setDeptId]      = useState("");

  const [dialogOpen,        setDialogOpen]        = useState(false);
  const [editingPatient,    setEditingPatient]     = useState<Patient | null>(null);
  const [prefilledPatient,  setPrefilledPatient]   = useState<PrefilledPatient | null>(null);

  const [activeTab,          setActiveTab]          = useState("list");
  const [selectedPatientId,  setSelectedPatientId]  = useState<string | null>(null);
  const [selectedPatientRow, setSelectedPatientRow] = useState<PatientStats | null>(null);

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

  function handleAddNew() {
    setEditingPatient(null);
    setPrefilledPatient(null);
    setDialogOpen(true);
  }
  function handleEdit(p: PatientStats) {
    setPrefilledPatient(null);
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
    const row = rows.find(r => r.id === patientId) ?? null;
    setSelectedPatientId(patientId);
    setSelectedPatientRow(row);
    setActiveTab("file");
  }
  function handleNewVisit(patient: PatientStats) {
    setEditingPatient(null);
    setPrefilledPatient({
      id:          patient.id,
      fullName:    patient.fullName,
      phone:       patient.phone,
      age:         patient.age,
      nationalId:  patient.nationalId,
      patientCode: patient.patientCode,
    });
    setDialogOpen(true);
  }
  function handleCloseDialog() {
    setDialogOpen(false);
    setEditingPatient(null);
    setPrefilledPatient(null);
  }
  function handleClearFilters() {
    setDateFrom(""); setDateTo(""); setDeptId("");
  }
  function handleBackToList() {
    setActiveTab("list");
    setSelectedPatientId(null);
    setSelectedPatientRow(null);
  }

  return (
    <div className="p-3 space-y-2 h-full flex flex-col">

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">

        {/* شريط العنوان مع التابات */}
        <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-sm font-bold text-foreground flex items-center gap-1">
                <Users className="h-4 w-4" />
                سجل المرضى
              </h1>
              <p className="text-xs text-muted-foreground">
                إدارة بيانات المرضى ({rows.length} مريض)
              </p>
            </div>
            <TabsList className="h-7 text-xs">
              <TabsTrigger value="list" className="h-6 text-xs px-3" data-testid="tab-patients-list">
                القائمة
              </TabsTrigger>
              <TabsTrigger
                value="file"
                className="h-6 text-xs px-3"
                disabled={!selectedPatientId}
                data-testid="tab-patient-file"
              >
                <FolderOpen className="h-3 w-3 ml-1" />
                {selectedPatientRow ? selectedPatientRow.fullName : "ملف المريض"}
              </TabsTrigger>
            </TabsList>
          </div>
          {canCreate && (
            <Button
              size="sm" onClick={handleAddNew}
              className="h-7 text-xs px-3"
              data-testid="button-add-patient"
            >
              <Plus className="h-3 w-3 ml-1" />
              استقبال مريض
            </Button>
          )}
        </div>

        {/* محتوى تاب القائمة */}
        <TabsContent value="list" className="flex-1 flex flex-col min-h-0 mt-1 space-y-2">

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
              onNewVisit={handleNewVisit}
            />
          </div>

        </TabsContent>

        {/* محتوى تاب ملف المريض */}
        <TabsContent value="file" className="flex-1 overflow-auto mt-1 px-1">
          {selectedPatientId ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 print:hidden">
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs gap-1"
                  onClick={handleBackToList}
                  data-testid="button-back-to-list"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  العودة للقائمة
                </Button>
                {selectedPatientRow && (
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs gap-1 text-emerald-700 border-emerald-300"
                    onClick={() => handleNewVisit(selectedPatientRow)}
                    data-testid="button-new-visit-from-file"
                  >
                    <Plus className="h-3 w-3" />
                    تذكرة جديدة
                  </Button>
                )}
              </div>
              <PatientFilePanel patientId={selectedPatientId} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <FolderOpen className="h-8 w-8 opacity-30" />
              <p className="text-sm">اختر مريضاً من القائمة لعرض ملفه</p>
            </div>
          )}
        </TabsContent>

      </Tabs>

      <PatientFormDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        editingPatient={editingPatient}
        prefilledPatient={prefilledPatient}
      />

    </div>
  );
}
