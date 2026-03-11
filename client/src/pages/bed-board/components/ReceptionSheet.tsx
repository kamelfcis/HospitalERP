import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { DoctorLookup, DepartmentLookup } from "@/components/lookups";
import { Tag } from "lucide-react";
import type { SurgeryType } from "@shared/schema";
import { surgeryCategoryLabels } from "@shared/schema";
import type { BedData, Patient } from "../types";
import type { LookupItem } from "@/lib/lookupTypes";

interface Props {
  open: boolean;
  bed: BedData | null;
  onClose: () => void;
}

// ─── Payment type toggle ──────────────────────────────────────────────────────
function PaymentToggle({
  value,
  onChange,
}: {
  value: "cash" | "contract";
  onChange: (v: "cash" | "contract") => void;
}) {
  const base =
    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors";
  const active = "bg-primary text-primary-foreground border-primary";
  const inactive = "bg-background text-foreground border-border hover:bg-muted";
  return (
    <div className="flex gap-2" data-testid="payment-type-toggle">
      <button
        type="button"
        data-testid="payment-type-cash"
        onClick={() => onChange("cash")}
        className={`${base} ${value === "cash" ? active : inactive}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
        نقدي
      </button>
      <button
        type="button"
        data-testid="payment-type-insurance"
        onClick={() => onChange("contract")}
        className={`${base} ${value === "contract" ? active : inactive}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        تأمين
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ReceptionSheet({ open, bed, onClose }: Props) {
  const { toast } = useToast();

  // form state
  const [patientSearch, setPatientSearch] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<LookupItem | null>(null);
  const [surgerySearch, setSurgerySearch] = useState("");
  const [selectedSurgery, setSelectedSurgery] = useState<SurgeryType | null>(null);
  const [showSurgeryResults, setShowSurgeryResults] = useState(false);
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState<"cash" | "contract">("cash");
  const [insuranceCompany, setInsuranceCompany] = useState("");

  // queries
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", patientSearch],
    queryFn: () =>
      apiRequest("GET", `/api/patients?search=${encodeURIComponent(patientSearch)}&limit=10`).then(
        (r) => r.json(),
      ),
    enabled: patientSearch.length >= 2,
  });

  const { data: surgeries = [] } = useQuery<SurgeryType[]>({
    queryKey: ["/api/surgery-types", surgerySearch],
    queryFn: () =>
      apiRequest("GET", `/api/surgery-types?search=${encodeURIComponent(surgerySearch)}`).then(
        (r) => r.json(),
      ),
    enabled: surgerySearch.length >= 1,
  });

  const admitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/beds/${bed!.id}/admit`, {
        patientName: selectedPatient?.fullName || patientName,
        patientPhone: selectedPatient?.phone || patientPhone || undefined,
        departmentId: departmentId || undefined,
        doctorName: selectedDoctor?.name || undefined,
        notes: notes || undefined,
        paymentType,
        insuranceCompany:
          paymentType === "contract" ? insuranceCompany || undefined : undefined,
        surgeryTypeId: selectedSurgery?.id || undefined,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      const desc = selectedSurgery
        ? "تمت إضافة بند الإقامة وفتح غرفة العمليات فوراً"
        : "تمت إضافة بند الإقامة فوراً للفاتورة";
      toast({ title: "تم الاستقبال", description: desc });
      handleClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطأ", description: err.message || "فشل الاستقبال" });
    },
  });

  const handleClose = useCallback(() => {
    setPatientSearch("");
    setPatientName("");
    setPatientPhone("");
    setSelectedPatient(null);
    setDepartmentId("");
    setSelectedDoctor(null);
    setSurgerySearch("");
    setSelectedSurgery(null);
    setShowSurgeryResults(false);
    setNotes("");
    setPaymentType("cash");
    setInsuranceCompany("");
    onClose();
  }, [onClose]);

  const effectiveName = selectedPatient?.fullName || patientName;
  const hasRoomService = !!(bed?.roomServiceId);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>استقبال مريض</SheetTitle>
          <SheetDescription>{bed ? `سرير ${bed.bedNumber}` : ""}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          {/* ── Room grade info ────────────────────────────────────────── */}
          {hasRoomService ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/8 border border-primary/20">
              <Tag className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">درجة الغرفة</p>
                <p className="text-sm font-semibold">
                  {bed?.roomServiceNameAr}
                  {bed?.roomServicePrice && (
                    <span className="text-muted-foreground font-normal mr-2">
                      {parseFloat(bed.roomServicePrice).toLocaleString("ar-EG")} ج.م/يوم
                    </span>
                  )}
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-xs text-green-700 border-green-300 bg-green-50 shrink-0"
              >
                يضاف لحظياً
              </Badge>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              هذه الغرفة لا تحتوي على درجة إقامة محددة — لن يُضاف بند إقامة تلقائياً
            </div>
          )}

          {/* ── Patient search ────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>بحث عن مريض (اختياري)</Label>
            <Input
              data-testid="input-patient-search"
              placeholder="اكتب اسم المريض للبحث..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
            {patientSearch.length >= 2 && patients.length > 0 && (
              <div className="border rounded-lg overflow-hidden shadow-sm">
                {patients.map((p) => (
                  <button
                    key={p.id}
                    data-testid={`patient-option-${p.id}`}
                    type="button"
                    className="w-full text-right px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-b-0"
                    onClick={() => {
                      setSelectedPatient(p);
                      setPatientSearch("");
                    }}
                  >
                    <span className="font-medium">{p.fullName}</span>
                    {p.phone && (
                      <span className="text-muted-foreground mr-2">{p.phone}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedPatient && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <span className="text-sm font-medium flex-1">{selectedPatient.fullName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setSelectedPatient(null)}
                >
                  تغيير
                </Button>
              </div>
            )}
          </div>

          {/* ── Manual name (when no patient selected) ────────────────── */}
          {!selectedPatient && (
            <div className="space-y-2">
              <Label htmlFor="patientName">
                اسم المريض <span className="text-destructive">*</span>
              </Label>
              <Input
                id="patientName"
                data-testid="input-patient-name"
                placeholder="الاسم الكامل"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
            </div>
          )}

          {/* ── Phone ─────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="patientPhone">رقم الهاتف</Label>
            <Input
              id="patientPhone"
              data-testid="input-patient-phone"
              placeholder="01XXXXXXXXX"
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
            />
          </div>

          {/* ── Department ────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>القسم</Label>
            <DepartmentLookup
              value={departmentId}
              onChange={(item) => setDepartmentId(item?.id || "")}
              data-testid="lookup-department"
            />
          </div>

          {/* ── Doctor ────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>اسم الطبيب</Label>
            <DoctorLookup
              value={selectedDoctor?.id || ""}
              onChange={setSelectedDoctor}
              data-testid="lookup-doctor"
            />
          </div>

          {/* ── Surgery type searchable ────────────────────────────────── */}
          <div className="space-y-2">
            <Label>نوع العملية (اختياري)</Label>
            {selectedSurgery ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium block">{selectedSurgery.nameAr}</span>
                  <span className="text-xs text-muted-foreground">
                    {surgeryCategoryLabels[
                      selectedSurgery.category as keyof typeof surgeryCategoryLabels
                    ]}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs shrink-0"
                  onClick={() => {
                    setSelectedSurgery(null);
                    setSurgerySearch("");
                  }}
                >
                  تغيير
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  data-testid="input-surgery-search"
                  placeholder="ابحث باسم العملية..."
                  value={surgerySearch}
                  onChange={(e) => {
                    setSurgerySearch(e.target.value);
                    setShowSurgeryResults(true);
                  }}
                  onFocus={() => setShowSurgeryResults(true)}
                  onBlur={() => setTimeout(() => setShowSurgeryResults(false), 200)}
                />
                {showSurgeryResults && surgerySearch.length >= 1 && surgeries.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-md overflow-hidden max-h-48 overflow-y-auto">
                    {surgeries
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <button
                          key={s.id}
                          data-testid={`surgery-option-${s.id}`}
                          type="button"
                          className="w-full text-right px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-b-0 flex items-center justify-between"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedSurgery(s);
                            setSurgerySearch("");
                            setShowSurgeryResults(false);
                          }}
                        >
                          <span className="font-medium">{s.nameAr}</span>
                          <Badge variant="outline" className="text-xs mr-2">
                            {surgeryCategoryLabels[
                              s.category as keyof typeof surgeryCategoryLabels
                            ]}
                          </Badge>
                        </button>
                      ))}
                  </div>
                )}
                {showSurgeryResults && surgerySearch.length >= 1 && surgeries.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-md px-3 py-2 text-sm text-muted-foreground">
                    لا توجد عملية بهذا الاسم
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Payment type ───────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>نوع الدفع</Label>
            <PaymentToggle
              value={paymentType}
              onChange={(v) => {
                setPaymentType(v);
                if (v === "cash") setInsuranceCompany("");
              }}
            />
          </div>

          {paymentType === "contract" && (
            <div className="space-y-2">
              <Label htmlFor="insuranceCompany">
                شركة التأمين / الجهة المتعاقدة{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="insuranceCompany"
                data-testid="input-insurance-company"
                placeholder="اسم الشركة أو الجهة المتعاقدة"
                value={insuranceCompany}
                onChange={(e) => setInsuranceCompany(e.target.value)}
              />
            </div>
          )}

          {/* ── Notes ─────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Input
              id="notes"
              data-testid="input-notes"
              placeholder="ملاحظات اختيارية"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* ── Submit ────────────────────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            <Button
              data-testid="button-admit-submit"
              className="flex-1"
              disabled={
                !effectiveName.trim() ||
                admitMutation.isPending ||
                (paymentType === "contract" && !insuranceCompany.trim())
              }
              onClick={() => admitMutation.mutate()}
            >
              {admitMutation.isPending ? "جارٍ الاستقبال..." : "استقبال المريض"}
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              data-testid="button-admit-cancel"
            >
              إلغاء
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
