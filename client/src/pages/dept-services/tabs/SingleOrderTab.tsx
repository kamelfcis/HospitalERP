import { useState, useCallback, useEffect, useRef } from "react";
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
import { Save, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  departmentId: string;
  departmentName: string;
}

export function SingleOrderTab({ departmentId, departmentName }: Props) {
  const { toast } = useToast();
  const { data: services = [], isLoading: loadingServices } = useDeptServices(departmentId);
  const { data: doctors = [] } = useDoctors();
  const { data: treasuryData } = useUserTreasury();

  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const { data: patientResults = [] } = usePatientSearch(patientSearch);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  const [doctorId, setDoctorId] = useState("");
  const [orderType, setOrderType] = useState<string>("cash");
  const [contractName, setContractName] = useState("");
  const [notes, setNotes] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<any[]>([]);
  const [clinicOrderIds, setClinicOrderIds] = useState<string[]>([]);
  const prefillDone = useRef(false);

  useEffect(() => {
    if (prefillDone.current) return;
    const params = new URLSearchParams(window.location.search);
    const pName = params.get("patientName");
    if (!pName) return;
    prefillDone.current = true;
    setPatientName(pName);
    const oId = params.get("orderId");
    if (oId) setClinicOrderIds([oId]);
    const dId = params.get("doctorId");
    if (dId) setDoctorId(dId);
    const sId = params.get("serviceId");
    const sName = params.get("serviceName");
    const sPrice = params.get("servicePrice");
    if (sId && sName) {
      setServiceLines([{
        serviceId: sId,
        serviceName: sName,
        quantity: 1,
        unitPrice: parseFloat(sPrice || "0"),
      }]);
    }
  }, []);

  const treasury = treasuryData && !Array.isArray(treasuryData) ? treasuryData : (Array.isArray(treasuryData) ? treasuryData[0] : null);
  const selectedDoctor = doctors.find((d: any) => d.id === doctorId);

  const subtotal = serviceLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discountAmount = subtotal * discountPercent / 100;
  const netAmount = Math.max(subtotal - discountAmount, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        patientName, patientPhone: patientPhone || undefined,
        doctorId: doctorId || undefined, doctorName: selectedDoctor?.name || undefined,
        departmentId, orderType,
        contractName: orderType === "contract" ? contractName : undefined,
        treasuryId: orderType === "cash" && treasury ? treasury.id : undefined,
        services: serviceLines, discountPercent, notes: notes || undefined,
        clinicOrderIds: clinicOrderIds.length ? clinicOrderIds : undefined,
      };
      const res = await apiRequest("POST", "/api/dept-service-orders", body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "تم الحفظ بنجاح", description: `فاتورة رقم ${data.invoiceNumber}` });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clinic-orders"] });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const checkDuplicateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dept-service-orders/check-duplicate", {
        patientName, serviceIds: serviceLines.map(l => l.serviceId),
        date: new Date().toISOString().slice(0, 10),
      });
      return res.json();
    },
  });

  const handleSave = useCallback(async () => {
    if (!patientName.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم المريض", variant: "destructive" });
      return;
    }
    if (!serviceLines.length) {
      toast({ title: "خطأ", description: "يرجى إضافة خدمة واحدة على الأقل", variant: "destructive" });
      return;
    }
    try {
      const dupes = await checkDuplicateMutation.mutateAsync();
      if (dupes.length > 0) { setDuplicateWarning(dupes); return; }
    } catch {}
    saveMutation.mutate();
  }, [patientName, serviceLines, saveMutation, checkDuplicateMutation]);

  const confirmSave = () => { setDuplicateWarning([]); saveMutation.mutate(); };

  const resetForm = () => {
    setPatientName(""); setPatientPhone(""); setPatientSearch("");
    setDoctorId(""); setOrderType("cash"); setContractName("");
    setNotes(""); setDiscountPercent(0); setServiceLines([]);
    setDuplicateWarning([]); setClinicOrderIds([]);
  };

  const handlePatientSearchChange = (val: string) => {
    setPatientSearch(val); setPatientName(val);
    setShowPatientDropdown(val.length >= 2);
  };

  const selectPatient = (p: any) => {
    setPatientName(p.nameAr || p.name_ar || p.name || "");
    setPatientPhone(p.phone || p.mobile || "");
    setPatientSearch(""); setShowPatientDropdown(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <div className="col-span-2 relative">
          <Label className="text-xs">المريض *</Label>
          <Input
            value={patientName}
            onChange={e => handlePatientSearchChange(e.target.value)}
            onFocus={() => patientName.length >= 2 && setShowPatientDropdown(true)}
            onBlur={() => setTimeout(() => setShowPatientDropdown(false), 200)}
            placeholder="ابحث أو اكتب الاسم..."
            className="h-8 text-sm"
            data-testid="input-patient-name"
          />
          {showPatientDropdown && patientResults.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full border rounded-lg bg-background shadow-lg max-h-40 overflow-auto">
              {patientResults.map((p: any) => (
                <button key={p.id} type="button" className="w-full text-right px-3 py-1.5 hover:bg-muted text-sm" onMouseDown={() => selectPatient(p)} data-testid={`patient-option-${p.id}`}>
                  {p.nameAr || p.name_ar || p.name} {p.phone ? `- ${p.phone}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-xs">الهاتف</Label>
          <Input value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="الهاتف" className="h-8 text-sm" data-testid="input-patient-phone" />
        </div>

        <div>
          <Label className="text-xs">الطبيب</Label>
          <Select value={doctorId || "__none__"} onValueChange={v => setDoctorId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-doctor"><SelectValue placeholder="طبيب..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">بدون</SelectItem>
              {doctors.map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">النوع</Label>
          <Select value={orderType} onValueChange={setOrderType}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-order-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">نقدي</SelectItem>
              <SelectItem value="contract">تعاقد</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          {orderType === "contract" ? (
            <>
              <Label className="text-xs">الشركة</Label>
              <Input value={contractName} onChange={e => setContractName(e.target.value)} placeholder="اسم الشركة" className="h-8 text-sm" data-testid="input-contract-name" />
            </>
          ) : treasury ? (
            <>
              <Label className="text-xs">الخزنة</Label>
              <Input value={treasury.name || treasury.nameAr || "الخزنة"} disabled className="h-8 text-sm bg-muted" data-testid="input-treasury" />
            </>
          ) : (
            <>
              <Label className="text-xs">القسم</Label>
              <Input value={departmentName} disabled className="h-8 text-sm bg-muted" data-testid="input-department" />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3" style={{ minHeight: 200 }}>
        <div className="lg:col-span-2">
          <ServicesGrid services={services} selectedLines={serviceLines} onChange={setServiceLines} isLoading={loadingServices} />
        </div>
        <div className="border rounded-lg p-2 bg-muted/20">
          <ConsumablesPanel serviceLines={serviceLines} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2 bg-muted/30 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">الإجمالي:</span>
          <span className="font-bold" data-testid="text-subtotal">{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">خصم%:</span>
          <Input type="number" min={0} max={100} value={discountPercent} onChange={e => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} className="w-16 h-7 text-center text-sm" data-testid="input-discount-percent" />
          <span className="text-muted-foreground text-xs" data-testid="text-discount-amount">({discountAmount.toFixed(2)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">الصافي:</span>
          <span className="font-bold text-primary text-base" data-testid="text-net-amount">{netAmount.toFixed(2)} ج.م</span>
        </div>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات..." className="h-7 text-sm flex-1 min-w-[120px]" data-testid="input-notes" />
      </div>

      {duplicateWarning.length > 0 && (
        <div className="border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-sm space-y-2">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-semibold">تنبيه: نفس الخدمات مسجلة اليوم</span>
          </div>
          <ul className="list-disc list-inside text-muted-foreground text-xs">
            {duplicateWarning.map((d: any, i: number) => (
              <li key={i}>{d.serviceName} — فاتورة #{d.invoiceNumber}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={confirmSave} size="sm" data-testid="btn-confirm-save">حفظ على أي حال</Button>
            <Button onClick={() => setDuplicateWarning([])} variant="outline" size="sm" data-testid="btn-cancel-save">إلغاء</Button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saveMutation.isPending || !patientName.trim() || !serviceLines.length} className="min-w-[140px]" data-testid="btn-save-order">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Save className="h-4 w-4 ml-1" />}
          حفظ الطلب
        </Button>
        <Button variant="outline" onClick={resetForm} size="sm" data-testid="btn-reset-form">مسح</Button>
      </div>
    </div>
  );
}
