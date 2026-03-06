import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ServicesGrid, type ServiceLine } from "../components/ServicesGrid";
import { DiscountTotalsPanel } from "../components/DiscountTotalsPanel";
import { useDeptServices, useDoctors, usePatientSearch, useUserTreasury } from "../hooks/useDeptServices";
import { Save, Loader2, Plus, Trash2, Users, CheckCircle2, XCircle } from "lucide-react";

interface PatientEntry {
  patientName: string;
  patientPhone: string;
}

interface Props {
  departmentId: string;
  departmentName: string;
}

export function BatchTab({ departmentId, departmentName }: Props) {
  const { toast } = useToast();
  const { data: services = [], isLoading: loadingServices } = useDeptServices(departmentId);
  const { data: doctors = [] } = useDoctors();
  const { data: treasuryData } = useUserTreasury();

  const [doctorId, setDoctorId] = useState("");
  const [orderType, setOrderType] = useState<string>("cash");
  const [contractName, setContractName] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [patients, setPatients] = useState<PatientEntry[]>([{ patientName: "", patientPhone: "" }]);
  const [batchResults, setBatchResults] = useState<any[] | null>(null);

  const [patientSearchIdx, setPatientSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { data: searchResults = [] } = usePatientSearch(searchTerm);

  const treasury = treasuryData && !Array.isArray(treasuryData) ? treasuryData : (Array.isArray(treasuryData) ? treasuryData[0] : null);
  const selectedDoctor = doctors.find((d: any) => d.id === doctorId);

  const addPatient = () => {
    setPatients([...patients, { patientName: "", patientPhone: "" }]);
  };

  const removePatient = (idx: number) => {
    if (patients.length <= 1) return;
    setPatients(patients.filter((_, i) => i !== idx));
  };

  const updatePatient = (idx: number, field: keyof PatientEntry, value: string) => {
    const updated = [...patients];
    updated[idx] = { ...updated[idx], [field]: value };
    setPatients(updated);
    if (field === "patientName") {
      setPatientSearchIdx(value.length >= 2 ? idx : null);
      setSearchTerm(value);
    }
  };

  const selectSearchResult = (idx: number, p: any) => {
    const updated = [...patients];
    updated[idx] = {
      patientName: p.nameAr || p.name_ar || p.name || "",
      patientPhone: p.phone || p.mobile || "",
    };
    setPatients(updated);
    setPatientSearchIdx(null);
    setSearchTerm("");
  };

  const batchMutation = useMutation({
    mutationFn: async () => {
      const validPatients = patients.filter(p => p.patientName.trim());
      if (!validPatients.length) throw new Error("يرجى إدخال مريض واحد على الأقل");
      if (!serviceLines.length) throw new Error("يرجى إضافة خدمة واحدة على الأقل");

      const res = await apiRequest("POST", "/api/dept-service-orders/batch", {
        patients: validPatients,
        doctorId: doctorId || undefined,
        doctorName: selectedDoctor?.name || undefined,
        departmentId,
        orderType,
        contractName: orderType === "contract" ? contractName : undefined,
        treasuryId: orderType === "cash" && treasury ? treasury.id : undefined,
        services: serviceLines,
        discountPercent,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setBatchResults(data.results);
      const successCount = data.results.filter((r: any) => !r.error).length;
      toast({
        title: "تم الحفظ",
        description: `${successCount} فاتورة من ${data.results.length} تم إنشاؤها بنجاح`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setDoctorId("");
    setOrderType("cash");
    setContractName("");
    setDiscountPercent(0);
    setServiceLines([]);
    setPatients([{ patientName: "", patientPhone: "" }]);
    setBatchResults(null);
  };

  const validCount = patients.filter(p => p.patientName.trim()).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>القسم</Label>
          <Input value={departmentName} disabled className="bg-muted" data-testid="batch-input-department" />
        </div>

        <div className="space-y-2">
          <Label>الطبيب المُحيل</Label>
          <Select value={doctorId || "__none__"} onValueChange={v => setDoctorId(v === "__none__" ? "" : v)}>
            <SelectTrigger data-testid="batch-select-doctor">
              <SelectValue placeholder="اختر طبيب..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">بدون طبيب</SelectItem>
              {doctors.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>نوع الطلب</Label>
          <Select value={orderType} onValueChange={setOrderType}>
            <SelectTrigger data-testid="batch-select-order-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">نقدي</SelectItem>
              <SelectItem value="contract">تعاقد / شركة</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {orderType === "contract" && (
          <div className="space-y-2">
            <Label>اسم الشركة / العقد</Label>
            <Input
              value={contractName}
              onChange={e => setContractName(e.target.value)}
              placeholder="اسم الشركة..."
              data-testid="batch-input-contract"
            />
          </div>
        )}
      </div>

      <div>
        <Label className="text-base font-semibold mb-2 block">الخدمات (مشتركة لكل المرضى)</Label>
        <ServicesGrid
          services={services}
          selectedLines={serviceLines}
          onChange={setServiceLines}
          isLoading={loadingServices}
        />
      </div>

      <DiscountTotalsPanel
        lines={serviceLines}
        discountPercent={discountPercent}
        onDiscountPercentChange={setDiscountPercent}
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            قائمة المرضى ({validCount})
          </Label>
          <Button variant="outline" size="sm" onClick={addPatient} data-testid="btn-add-patient">
            <Plus className="h-4 w-4 ml-1" />
            إضافة مريض
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-right w-8">#</th>
                <th className="p-2 text-right">اسم المريض</th>
                <th className="p-2 text-right w-40">الهاتف</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p, idx) => (
                <tr key={idx} className="border-t relative">
                  <td className="p-2 text-center text-muted-foreground">{idx + 1}</td>
                  <td className="p-2 relative">
                    <Input
                      value={p.patientName}
                      onChange={e => updatePatient(idx, 'patientName', e.target.value)}
                      placeholder="اسم المريض..."
                      className="h-8"
                      onFocus={() => { if (p.patientName.length >= 2) { setPatientSearchIdx(idx); setSearchTerm(p.patientName); } }}
                      onBlur={() => setTimeout(() => setPatientSearchIdx(null), 200)}
                      data-testid={`batch-input-patient-${idx}`}
                    />
                    {patientSearchIdx === idx && searchResults.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 right-2 left-2 border rounded-lg bg-background shadow-lg max-h-40 overflow-auto">
                        {searchResults.map((sr: any) => (
                          <button
                            key={sr.id}
                            type="button"
                            className="w-full text-right px-3 py-2 hover:bg-muted text-sm"
                            onMouseDown={() => selectSearchResult(idx, sr)}
                          >
                            {sr.nameAr || sr.name_ar || sr.name} {sr.phone ? `- ${sr.phone}` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <Input
                      value={p.patientPhone}
                      onChange={e => updatePatient(idx, 'patientPhone', e.target.value)}
                      placeholder="الهاتف"
                      className="h-8"
                      data-testid={`batch-input-phone-${idx}`}
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePatient(idx)}
                      disabled={patients.length <= 1}
                      data-testid={`batch-btn-remove-${idx}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {batchResults && (
        <div className="border rounded-lg p-4 space-y-2">
          <h3 className="font-semibold">نتائج الحفظ</h3>
          {batchResults.map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {r.error ? (
                <XCircle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <span>{r.patientName}</span>
              {r.invoiceNumber && <span className="text-muted-foreground">— فاتورة #{r.invoiceNumber}</span>}
              {r.error && <span className="text-destructive">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={() => batchMutation.mutate()}
          disabled={batchMutation.isPending || !validCount || !serviceLines.length}
          className="min-w-[160px]"
          data-testid="btn-save-batch"
        >
          {batchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
          حفظ ({validCount} مريض)
        </Button>
        <Button variant="outline" onClick={resetForm} data-testid="btn-reset-batch">
          مسح النموذج
        </Button>
      </div>
    </div>
  );
}
