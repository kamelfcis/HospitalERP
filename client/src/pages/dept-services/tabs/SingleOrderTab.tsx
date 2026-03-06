import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ServicesGrid, type ServiceLine } from "../components/ServicesGrid";
import { DiscountTotalsPanel } from "../components/DiscountTotalsPanel";
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

  const treasury = treasuryData && !Array.isArray(treasuryData) ? treasuryData : (Array.isArray(treasuryData) ? treasuryData[0] : null);

  const selectedDoctor = doctors.find((d: any) => d.id === doctorId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        patientName,
        patientPhone: patientPhone || undefined,
        doctorId: doctorId || undefined,
        doctorName: selectedDoctor?.name || undefined,
        departmentId,
        orderType,
        contractName: orderType === "contract" ? contractName : undefined,
        treasuryId: orderType === "cash" && treasury ? treasury.id : undefined,
        services: serviceLines,
        discountPercent,
        notes: notes || undefined,
      };
      const res = await apiRequest("POST", "/api/dept-service-orders", body);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "تم الحفظ بنجاح", description: `فاتورة رقم ${data.invoiceNumber}` });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const checkDuplicateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dept-service-orders/check-duplicate", {
        patientName,
        serviceIds: serviceLines.map(l => l.serviceId),
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
      if (dupes.length > 0) {
        setDuplicateWarning(dupes);
        return;
      }
    } catch {}

    saveMutation.mutate();
  }, [patientName, serviceLines, saveMutation, checkDuplicateMutation]);

  const confirmSave = () => {
    setDuplicateWarning([]);
    saveMutation.mutate();
  };

  const resetForm = () => {
    setPatientName("");
    setPatientPhone("");
    setPatientSearch("");
    setDoctorId("");
    setOrderType("cash");
    setContractName("");
    setNotes("");
    setDiscountPercent(0);
    setServiceLines([]);
    setDuplicateWarning([]);
  };

  const handlePatientSearchChange = (val: string) => {
    setPatientSearch(val);
    setPatientName(val);
    setShowPatientDropdown(val.length >= 2);
  };

  const selectPatient = (p: any) => {
    setPatientName(p.nameAr || p.name_ar || p.name || "");
    setPatientPhone(p.phone || p.mobile || "");
    setPatientSearch("");
    setShowPatientDropdown(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 relative">
          <Label>اسم المريض *</Label>
          <Input
            value={patientName}
            onChange={e => handlePatientSearchChange(e.target.value)}
            onFocus={() => patientName.length >= 2 && setShowPatientDropdown(true)}
            onBlur={() => setTimeout(() => setShowPatientDropdown(false), 200)}
            placeholder="ابحث عن مريض أو اكتب الاسم..."
            data-testid="input-patient-name"
          />
          {showPatientDropdown && patientResults.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full border rounded-lg bg-background shadow-lg max-h-48 overflow-auto">
              {patientResults.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-right px-3 py-2 hover:bg-muted text-sm"
                  onMouseDown={() => selectPatient(p)}
                  data-testid={`patient-option-${p.id}`}
                >
                  {p.nameAr || p.name_ar || p.name} {p.phone ? `- ${p.phone}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>هاتف المريض</Label>
          <Input
            value={patientPhone}
            onChange={e => setPatientPhone(e.target.value)}
            placeholder="رقم الهاتف"
            data-testid="input-patient-phone"
          />
        </div>

        <div className="space-y-2">
          <Label>الطبيب المُحيل</Label>
          <Select value={doctorId || "__none__"} onValueChange={v => setDoctorId(v === "__none__" ? "" : v)}>
            <SelectTrigger data-testid="select-doctor">
              <SelectValue placeholder="اختر طبيب..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">بدون طبيب</SelectItem>
              {doctors.map((d: any) => (
                <SelectItem key={d.id} value={d.id} data-testid={`doctor-option-${d.id}`}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>القسم</Label>
          <Input value={departmentName} disabled className="bg-muted" data-testid="input-department" />
        </div>

        <div className="space-y-2">
          <Label>نوع الطلب</Label>
          <Select value={orderType} onValueChange={setOrderType}>
            <SelectTrigger data-testid="select-order-type">
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
              data-testid="input-contract-name"
            />
          </div>
        )}

        {orderType === "cash" && treasury && (
          <div className="space-y-2">
            <Label>الخزنة</Label>
            <Input value={treasury.name || treasury.nameAr || "الخزنة"} disabled className="bg-muted" data-testid="input-treasury" />
          </div>
        )}
      </div>

      <div>
        <Label className="text-base font-semibold mb-2 block">الخدمات</Label>
        <ServicesGrid
          services={services}
          selectedLines={serviceLines}
          onChange={setServiceLines}
          isLoading={loadingServices}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DiscountTotalsPanel
          lines={serviceLines}
          discountPercent={discountPercent}
          onDiscountPercentChange={setDiscountPercent}
        />

        <div className="space-y-2">
          <Label>ملاحظات</Label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="ملاحظات إضافية..."
            rows={3}
            data-testid="input-notes"
          />
        </div>
      </div>

      {duplicateWarning.length > 0 && (
        <div className="border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">تنبيه: تم طلب نفس الخدمات لهذا المريض اليوم</span>
          </div>
          <ul className="text-sm list-disc list-inside text-muted-foreground">
            {duplicateWarning.map((d: any, i: number) => (
              <li key={i}>{d.serviceName} — فاتورة #{d.invoiceNumber}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={confirmSave} variant="default" size="sm" data-testid="btn-confirm-save">
              حفظ على أي حال
            </Button>
            <Button onClick={() => setDuplicateWarning([])} variant="outline" size="sm" data-testid="btn-cancel-save">
              إلغاء
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending || !patientName.trim() || !serviceLines.length}
          className="min-w-[160px]"
          data-testid="btn-save-order"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
          حفظ الطلب
        </Button>
        <Button variant="outline" onClick={resetForm} data-testid="btn-reset-form">
          مسح النموذج
        </Button>
      </div>
    </div>
  );
}
