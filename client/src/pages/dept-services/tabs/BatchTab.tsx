import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ServicesGrid, type ServiceLine } from "../components/ServicesGrid";
import { ConsumablesPanel } from "../components/ConsumablesPanel";
import { useDeptServices, useDoctors, usePatientSearch, useUserTreasury } from "../hooks/useDeptServices";
import { Save, Loader2, Plus, Trash2, Users, CheckCircle2, XCircle } from "lucide-react";
import type { Patient } from "@shared/schema";

interface PatientEntry {
  patientName: string;
  patientPhone: string;
}

interface BatchResult {
  patientName: string;
  error?: string;
  invoiceNumber?: string;
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
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null);

  const [patientSearchIdx, setPatientSearchIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { data: searchResults = [] } = usePatientSearch(searchTerm);

  const treasury = treasuryData && !Array.isArray(treasuryData) ? treasuryData : (Array.isArray(treasuryData) ? treasuryData[0] : null);
  const selectedDoctor = doctors.find((d: any) => d.id === doctorId);

  const subtotal = serviceLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discountAmount = subtotal * discountPercent / 100;
  const netAmount = Math.max(subtotal - discountAmount, 0);

  const addPatient = () => setPatients([...patients, { patientName: "", patientPhone: "" }]);

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

  const selectSearchResult = (idx: number, p: Patient) => {
    const updated = [...patients];
    updated[idx] = { patientName: p.fullName || "", patientPhone: p.phone || "" };
    setPatients(updated);
    setPatientSearchIdx(null); setSearchTerm("");
  };

  const batchMutation = useMutation({
    mutationFn: async () => {
      const validPatients = patients.filter(p => p.patientName.trim());
      if (!validPatients.length) throw new Error("يرجى إدخال مريض واحد على الأقل");
      if (!serviceLines.length) throw new Error("يرجى إضافة خدمة واحدة على الأقل");
      const res = await apiRequest("POST", "/api/dept-service-orders/batch", {
        patients: validPatients, doctorId: doctorId || undefined,
        doctorName: selectedDoctor?.name || undefined, departmentId, orderType,
        contractName: orderType === "contract" ? contractName : undefined,
        treasuryId: orderType === "cash" && treasury ? treasury.id : undefined,
        services: serviceLines, discountPercent,
      });
      return res.json();
    },
    onSuccess: (data: { results: BatchResult[] }) => {
      setBatchResults(data.results);
      const successCount = data.results.filter((r) => !r.error).length;
      toast({ title: "تم الحفظ", description: `${successCount} فاتورة من ${data.results.length} تم إنشؤها بنجاح` });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setDoctorId(""); setOrderType("cash"); setContractName("");
    setDiscountPercent(0); setServiceLines([]);
    setPatients([{ patientName: "", patientPhone: "" }]);
    setBatchResults(null);
  };

  const validCount = patients.filter(p => p.patientName.trim()).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div>
          <Label className="text-xs">القسم</Label>
          <Input value={departmentName} disabled className="h-8 text-sm bg-muted" data-testid="batch-input-department" />
        </div>
        <div>
          <Label className="text-xs">الطبيب</Label>
          <Select value={doctorId || "__none__"} onValueChange={v => setDoctorId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm" data-testid="batch-select-doctor"><SelectValue placeholder="طبيب..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">بدون</SelectItem>
              {doctors.map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">النوع</Label>
          <Select value={orderType} onValueChange={setOrderType}>
            <SelectTrigger className="h-8 text-sm" data-testid="batch-select-order-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">نقدي</SelectItem>
              <SelectItem value="contract">تعاقد</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {orderType === "contract" && (
          <div>
            <Label className="text-xs">الشركة</Label>
            <Input value={contractName} onChange={e => setContractName(e.target.value)} placeholder="الشركة" className="h-8 text-sm" data-testid="batch-input-contract" />
          </div>
        )}
        <div>
          <Label className="text-xs">خصم %</Label>
          <Input type="number" min={0} max={100} value={discountPercent} onChange={e => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} className="h-8 text-sm text-center" data-testid="batch-input-discount" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3" style={{ minHeight: 180 }}>
        <div className="lg:col-span-2">
          <Label className="text-xs font-semibold mb-1 block">الخدمات (مشتركة لكل المرضى)</Label>
          <ServicesGrid services={services} selectedLines={serviceLines} onChange={setServiceLines} isLoading={loadingServices} />
        </div>
        <div className="border rounded-lg p-2 bg-muted/20">
          <ConsumablesPanel serviceLines={serviceLines} />
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm border rounded-lg px-3 py-2 bg-muted/30">
        <span className="text-muted-foreground">إجمالي/مريض:</span>
        <span className="font-bold">{subtotal.toFixed(2)}</span>
        {discountPercent > 0 && (
          <>
            <span className="text-muted-foreground">خصم:</span>
            <span>{discountAmount.toFixed(2)}</span>
          </>
        )}
        <span className="text-muted-foreground">صافي/مريض:</span>
        <span className="font-bold text-primary">{netAmount.toFixed(2)} ج.م</span>
        <span className="text-muted-foreground mr-auto">× {validCount} مريض =</span>
        <span className="font-bold text-lg text-primary">{(netAmount * validCount).toFixed(2)} ج.م</span>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs font-semibold flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            المرضى ({validCount})
          </Label>
          <Button variant="outline" size="sm" onClick={addPatient} className="h-7 text-xs" data-testid="btn-add-patient">
            <Plus className="h-3 w-3 ml-1" />
            إضافة
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden max-h-[220px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-right w-8 text-xs">#</th>
                <th className="px-2 py-1 text-right text-xs">اسم المريض</th>
                <th className="px-2 py-1 text-right w-36 text-xs">الهاتف</th>
                <th className="px-2 py-1 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p, idx) => (
                <tr key={idx} className="border-t relative">
                  <td className="px-2 py-1 text-center text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="px-2 py-1 relative">
                    <Input
                      value={p.patientName}
                      onChange={e => updatePatient(idx, 'patientName', e.target.value)}
                      placeholder="اسم المريض..."
                      className="h-7 text-sm"
                      onFocus={() => { if (p.patientName.length >= 2) { setPatientSearchIdx(idx); setSearchTerm(p.patientName); } }}
                      onBlur={() => setTimeout(() => setPatientSearchIdx(null), 200)}
                      data-testid={`batch-input-patient-${idx}`}
                    />
                    {patientSearchIdx === idx && searchResults.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 right-2 left-2 border rounded-lg bg-background shadow-lg max-h-36 overflow-auto">
                        {searchResults.map((sr) => (
                          <button key={sr.id} type="button" className="w-full text-right px-3 py-1.5 hover:bg-muted text-sm" onMouseDown={() => selectSearchResult(idx, sr)}>
                            {sr.fullName} {sr.phone ? `- ${sr.phone}` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Input value={p.patientPhone} onChange={e => updatePatient(idx, 'patientPhone', e.target.value)} placeholder="الهاتف" className="h-7 text-sm" data-testid={`batch-input-phone-${idx}`} />
                  </td>
                  <td className="px-2 py-1">
                    <Button variant="ghost" size="sm" onClick={() => removePatient(idx)} disabled={patients.length <= 1} className="h-7 w-7 p-0" data-testid={`batch-btn-remove-${idx}`}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {batchResults && (
        <div className="border rounded-lg p-3 space-y-1 text-sm">
          <h3 className="font-semibold text-xs">نتائج الحفظ</h3>
          {batchResults.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.error ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
              <span>{r.patientName}</span>
              {r.invoiceNumber && <span className="text-muted-foreground">— #{r.invoiceNumber}</span>}
              {r.error && <span className="text-destructive">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={() => batchMutation.mutate()} disabled={batchMutation.isPending || !validCount || !serviceLines.length} className="min-w-[140px]" data-testid="btn-save-batch">
          {batchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Save className="h-4 w-4 ml-1" />}
          حفظ ({validCount} مريض)
        </Button>
        <Button variant="outline" onClick={resetForm} size="sm" data-testid="btn-reset-batch">مسح</Button>
      </div>
    </div>
  );
}
