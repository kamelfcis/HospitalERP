import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BedDouble, RefreshCw, MoreVertical, UserPlus, FileText,
  ArrowRightLeft, LogOut, Sparkles, Wrench, Pencil, Tag,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type BedStatus = "EMPTY" | "OCCUPIED" | "NEEDS_CLEANING" | "MAINTENANCE";

interface BedData {
  id: string;
  bedNumber: string;
  status: BedStatus;
  currentAdmissionId?: string;
  patientName?: string;
  admissionNumber?: string;
  roomId: string;
  roomServiceId?: string | null;
  roomServiceNameAr?: string | null;
  roomServicePrice?: string | null;
}

interface RoomData {
  id: string;
  nameAr: string;
  roomNumber?: string;
  serviceId?: string | null;
  serviceNameAr?: string | null;
  servicePrice?: string | null;
  beds: BedData[];
}

interface FloorData {
  id: string;
  nameAr: string;
  sortOrder: number;
  rooms: RoomData[];
}

interface AvailableBed {
  id: string;
  bedNumber: string;
  roomNameAr: string;
  floorNameAr: string;
}

interface Patient { id: string; fullName: string; phone?: string; }
interface Department { id: string; nameAr: string; }
interface Service { id: string; nameAr: string; basePrice: string; }

// ─── Status configuration ────────────────────────────────────────────────────
const STATUS_CONFIG: Record<BedStatus, { label: string; card: string; badge: string }> = {
  EMPTY:          { label: "فارغ",          card: "bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700",   badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  OCCUPIED:       { label: "مشغول",         card: "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700",       badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  NEEDS_CLEANING: { label: "يحتاج تنظيف",  card: "bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700",   badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  MAINTENANCE:    { label: "صيانة",         card: "bg-red-50 border-red-300 dark:bg-red-950 dark:border-red-700",           badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

// ─── Bed Card ─────────────────────────────────────────────────────────────────
function BedCard({
  bed, onAction,
}: {
  bed: BedData;
  onAction: (action: string, bed: BedData) => void;
}) {
  const cfg = STATUS_CONFIG[bed.status];
  return (
    <div className={`relative border-2 rounded-xl p-3 w-44 ${cfg.card}`} data-testid={`bed-card-${bed.id}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-sm">سرير {bed.bedNumber}</p>
          <Badge variant="outline" className={`text-xs mt-0.5 ${cfg.badge}`}>{cfg.label}</Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1 -ml-1"
              data-testid={`bed-menu-${bed.id}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {bed.status === "EMPTY" && (
              <DropdownMenuItem
                data-testid={`bed-action-admit-${bed.id}`}
                onClick={() => onAction("admit", bed)}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" />
                استقبال مريض
              </DropdownMenuItem>
            )}
            {bed.status === "OCCUPIED" && (<>
              <DropdownMenuItem
                data-testid={`bed-action-invoice-${bed.id}`}
                onClick={() => onAction("invoice", bed)}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                فتح الفاتورة
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid={`bed-action-transfer-${bed.id}`}
                onClick={() => onAction("transfer", bed)}
                className="gap-2"
              >
                <ArrowRightLeft className="h-4 w-4" />
                تحويل لسرير آخر
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid={`bed-action-discharge-${bed.id}`}
                onClick={() => onAction("discharge", bed)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                خروج المريض
              </DropdownMenuItem>
            </>)}
            {bed.status === "NEEDS_CLEANING" && (
              <DropdownMenuItem
                data-testid={`bed-action-clean-${bed.id}`}
                onClick={() => onAction("clean", bed)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                تعليم كنظيف
              </DropdownMenuItem>
            )}
            {(bed.status === "EMPTY" || bed.status === "NEEDS_CLEANING") && (
              <DropdownMenuItem
                data-testid={`bed-action-maintenance-${bed.id}`}
                onClick={() => onAction("maintenance", bed)}
                className="gap-2"
              >
                <Wrench className="h-4 w-4" />
                وضع في صيانة
              </DropdownMenuItem>
            )}
            {bed.status === "MAINTENANCE" && (
              <DropdownMenuItem
                data-testid={`bed-action-clear-maintenance-${bed.id}`}
                onClick={() => onAction("clean", bed)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                إنهاء الصيانة
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {bed.patientName && (
        <p className="text-xs mt-2 font-medium truncate">{bed.patientName}</p>
      )}
      {bed.admissionNumber && (
        <p className="text-xs text-muted-foreground">{bed.admissionNumber}</p>
      )}
    </div>
  );
}

// ─── Reception Sheet ──────────────────────────────────────────────────────────
function ReceptionSheet({
  open, bed, onClose,
}: {
  open: boolean;
  bed: BedData | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [patientSearch, setPatientSearch] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", patientSearch],
    queryFn: () => apiRequest("GET", `/api/patients?search=${encodeURIComponent(patientSearch)}&limit=10`).then(r => r.json()),
    enabled: patientSearch.length >= 2,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    queryFn: () => apiRequest("GET", "/api/departments").then(r => r.json()),
  });

  const admitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/beds/${bed!.id}/admit`, {
        patientName: selectedPatient?.fullName || patientName,
        patientPhone: selectedPatient?.phone || patientPhone || undefined,
        departmentId: departmentId || undefined,
        doctorName: doctorName || undefined,
        notes: notes || undefined,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      toast({ title: "تم الاستقبال", description: "تمت إضافة بند الإقامة فوراً للفاتورة" });
      handleClose();
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "خطأ", description: err.message || "فشل الاستقبال" });
    },
  });

  const handleClose = useCallback(() => {
    setPatientSearch(""); setPatientName(""); setPatientPhone("");
    setSelectedPatient(null); setDepartmentId("");
    setDoctorName(""); setNotes("");
    onClose();
  }, [onClose]);

  const effectiveName = selectedPatient?.fullName || patientName;
  const hasRoomService = !!(bed?.roomServiceId);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>استقبال مريض</SheetTitle>
          <SheetDescription>
            {bed ? `سرير ${bed.bedNumber}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          {/* Room grade info */}
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
              <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50 shrink-0">
                يضاف لحظياً
              </Badge>
            </div>
          ) : (
            <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              هذه الغرفة لا تحتوي على درجة إقامة محددة — لن يُضاف بند إقامة تلقائياً
            </div>
          )}

          {/* Patient search */}
          <div className="space-y-2">
            <Label>بحث عن مريض (اختياري)</Label>
            <Input
              data-testid="input-patient-search"
              placeholder="اكتب اسم المريض للبحث..."
              value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)}
            />
            {patientSearch.length >= 2 && patients.length > 0 && (
              <div className="border rounded-lg overflow-hidden shadow-sm">
                {patients.map(p => (
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
                    {p.phone && <span className="text-muted-foreground mr-2">{p.phone}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedPatient && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <span className="text-sm font-medium flex-1">{selectedPatient.fullName}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => setSelectedPatient(null)}>تغيير</Button>
              </div>
            )}
          </div>

          {!selectedPatient && (
            <div className="space-y-2">
              <Label htmlFor="patientName">اسم المريض <span className="text-destructive">*</span></Label>
              <Input
                id="patientName"
                data-testid="input-patient-name"
                placeholder="الاسم الكامل"
                value={patientName}
                onChange={e => setPatientName(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="patientPhone">رقم الهاتف</Label>
            <Input
              id="patientPhone"
              data-testid="input-patient-phone"
              placeholder="01XXXXXXXXX"
              value={patientPhone}
              onChange={e => setPatientPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>القسم</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger data-testid="select-department">
                <SelectValue placeholder="اختر القسم (اختياري)" />
              </SelectTrigger>
              <SelectContent>
                {departments.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doctorName">اسم الطبيب</Label>
            <Input
              id="doctorName"
              data-testid="input-doctor-name"
              placeholder="د. ..."
              value={doctorName}
              onChange={e => setDoctorName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Input
              id="notes"
              data-testid="input-notes"
              placeholder="ملاحظات اختيارية"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              data-testid="button-admit-submit"
              className="flex-1"
              disabled={!effectiveName.trim() || admitMutation.isPending}
              onClick={() => admitMutation.mutate()}
            >
              {admitMutation.isPending ? "جارٍ الاستقبال..." : "استقبال المريض"}
            </Button>
            <Button variant="outline" onClick={handleClose} data-testid="button-admit-cancel">
              إلغاء
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Room Grade Dialog ────────────────────────────────────────────────────────
function RoomGradeDialog({
  open, room, onClose,
}: {
  open: boolean;
  room: RoomData | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedServiceId, setSelectedServiceId] = useState<string>(room?.serviceId || "");

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    queryFn: () => apiRequest("GET", "/api/services").then(r => r.json()).then(d => d?.data ?? d ?? []),
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/rooms/${room!.id}`, {
        serviceId: selectedServiceId || null,
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      toast({ title: "تم الحفظ", description: "تم تحديد درجة الغرفة بنجاح" });
      onClose();
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>درجة الغرفة</DialogTitle>
          <DialogDescription>
            {room ? `${room.nameAr}${room.roomNumber ? ` (${room.roomNumber})` : ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label>خدمة الإقامة (سعر اليوم)</Label>
          <Select
            value={selectedServiceId || "__none__"}
            onValueChange={v => setSelectedServiceId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger data-testid="select-room-service">
              <SelectValue placeholder="بدون درجة محددة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— بدون درجة محددة —</SelectItem>
              {services.map(s => (
                <SelectItem key={s.id} value={s.id} data-testid={`room-service-option-${s.id}`}>
                  {s.nameAr} — {parseFloat(s.basePrice).toLocaleString("ar-EG")} ج.م/يوم
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            الخدمة المختارة ستُضاف تلقائياً لفاتورة أي مريض يُستقبل في هذه الغرفة
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-room-grade-cancel">إلغاء</Button>
          <Button
            data-testid="button-room-grade-save"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transfer Dialog ──────────────────────────────────────────────────────────
function TransferDialog({
  open, sourceBed, onClose,
}: {
  open: boolean;
  sourceBed: BedData | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [targetBedId, setTargetBedId] = useState("");

  const { data: availableBeds = [], isLoading } = useQuery<AvailableBed[]>({
    queryKey: ["/api/beds/available"],
    queryFn: () => apiRequest("GET", "/api/beds/available").then(r => r.json()),
    enabled: open,
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/beds/${sourceBed!.id}/transfer`, { targetBedId }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/beds/available"] });
      toast({ title: "تم التحويل", description: "تم نقل المريض بنجاح" });
      setTargetBedId("");
      onClose();
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "خطأ", description: err.message || "فشل التحويل" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setTargetBedId(""); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>تحويل المريض</DialogTitle>
          <DialogDescription>
            {sourceBed ? `تحويل من سرير ${sourceBed.bedNumber} — ${sourceBed.patientName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label>السرير الهدف</Label>
          <Select value={targetBedId} onValueChange={setTargetBedId}>
            <SelectTrigger data-testid="select-target-bed">
              <SelectValue placeholder={isLoading ? "تحميل..." : "اختر سريراً فارغاً"} />
            </SelectTrigger>
            <SelectContent>
              {availableBeds
                .filter(b => b.id !== sourceBed?.id)
                .map(b => (
                  <SelectItem key={b.id} value={b.id} data-testid={`target-bed-option-${b.id}`}>
                    {b.floorNameAr} — {b.roomNameAr} — سرير {b.bedNumber}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setTargetBedId(""); onClose(); }}
            data-testid="button-transfer-cancel">إلغاء</Button>
          <Button
            data-testid="button-transfer-confirm"
            disabled={!targetBedId || transferMutation.isPending}
            onClick={() => transferMutation.mutate()}
          >
            {transferMutation.isPending ? "جارٍ التحويل..." : "تأكيد التحويل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Discharge confirm dialog ─────────────────────────────────────────────────
function DischargeDialog({
  open, bed, onClose,
}: {
  open: boolean;
  bed: BedData | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [canForce, setCanForce] = useState(false);

  const dischargeMutation = useMutation({
    mutationFn: async (force?: boolean) => {
      const res = await fetch(`/api/beds/${bed!.id}/discharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: !!force }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw { ...data, _httpError: true };
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      toast({ title: "تم تسجيل الخروج", description: "تم خروج المريض وتحديث حالة السرير" });
      setBlockReason(null);
      setCanForce(false);
      onClose();
    },
    onError: (err: any) => {
      const code = err?.code;
      const msg = err?.message || "فشل تسجيل الخروج";

      if (code === "NO_INVOICE" || code === "INVOICE_NOT_FINALIZED") {
        setBlockReason(msg);
        setCanForce(true);
      } else {
        toast({ variant: "destructive", title: "خطأ", description: msg });
      }
    },
  });

  const handleClose = useCallback(() => {
    setBlockReason(null);
    setCanForce(false);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>تأكيد خروج المريض</DialogTitle>
          <DialogDescription>
            {bed?.patientName
              ? `هل تريد تسجيل خروج ${bed.patientName} من سرير ${bed.bedNumber}؟`
              : "تأكيد خروج المريض"}
          </DialogDescription>
        </DialogHeader>

        {blockReason && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 space-y-2">
            <p>{blockReason}</p>
            {canForce && (
              <p className="text-xs text-amber-600">
                يمكنك تجاوز هذا الشرط بصلاحية المسؤول بالضغط على "تجاوز وخروج"
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-discharge-cancel">إلغاء</Button>
          {canForce && blockReason ? (
            <Button
              variant="destructive"
              data-testid="button-discharge-force"
              disabled={dischargeMutation.isPending}
              onClick={() => dischargeMutation.mutate(true)}
            >
              {dischargeMutation.isPending ? "جارٍ التسجيل..." : "تجاوز وخروج"}
            </Button>
          ) : (
            <Button
              variant="destructive"
              data-testid="button-discharge-confirm"
              disabled={dischargeMutation.isPending}
              onClick={() => dischargeMutation.mutate(false)}
            >
              {dischargeMutation.isPending ? "جارٍ التسجيل..." : "تأكيد الخروج"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main BedBoard page ───────────────────────────────────────────────────────
export default function BedBoard() {
  const { toast } = useToast();

  const { data: board = [], isLoading, refetch } = useQuery<FloorData[]>({
    queryKey: ["/api/bed-board"],
    queryFn: () => apiRequest("GET", "/api/bed-board").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const [admitBed, setAdmitBed] = useState<BedData | null>(null);
  const [transferBed, setTransferBed] = useState<BedData | null>(null);
  const [dischargeBed, setDischargeBed] = useState<BedData | null>(null);
  const [editRoom, setEditRoom] = useState<RoomData | null>(null);

  const statusMutation = useMutation({
    mutationFn: ({ bedId, status }: { bedId: string; status: string }) =>
      apiRequest("POST", `/api/beds/${bedId}/status`, { status }).then(r => r.json()),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      const label = vars.status === "EMPTY" ? "فارغ / نظيف" : "صيانة";
      toast({ title: "تم التحديث", description: `حالة السرير: ${label}` });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "خطأ", description: err.message || "فشل التحديث" });
    },
  });

  const handleAction = useCallback((action: string, bed: BedData) => {
    switch (action) {
      case "admit":    setAdmitBed(bed); break;
      case "transfer": setTransferBed(bed); break;
      case "discharge": setDischargeBed(bed); break;
      case "clean":    statusMutation.mutate({ bedId: bed.id, status: "EMPTY" }); break;
      case "maintenance": statusMutation.mutate({ bedId: bed.id, status: "MAINTENANCE" }); break;
    }
  }, [statusMutation]);

  const allBeds = board.flatMap(f => f.rooms.flatMap(r => r.beds));
  const stats = allBeds.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BedDouble className="h-6 w-6" />
            لوحة الأسرّة
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{allBeds.length} سرير إجمالاً</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {(Object.entries(STATUS_CONFIG) as [BedStatus, typeof STATUS_CONFIG[BedStatus]][]).map(([st, cfg]) => (
            <Badge key={st} variant="outline" className={`gap-1 ${cfg.badge}`}>
              {cfg.label}: {stats[st] ?? 0}
            </Badge>
          ))}
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-board">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          جارٍ تحميل لوحة الأسرّة...
        </div>
      )}

      {/* Floor sections */}
      {board.map(floor => (
        <div key={floor.id} data-testid={`floor-section-${floor.id}`}>
          <h2 className="text-lg font-semibold mb-3 pb-1 border-b">{floor.nameAr}</h2>
          <div className="space-y-5">
            {floor.rooms.map(room => (
              <div key={room.id} data-testid={`room-section-${room.id}`}>
                {/* Room header with grade badge */}
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {room.nameAr}{room.roomNumber ? ` (${room.roomNumber})` : ""}
                  </p>
                  {room.serviceNameAr ? (
                    <Badge
                      variant="outline"
                      className="text-xs gap-1 cursor-pointer hover:bg-muted/60 transition-colors border-primary/30 text-primary"
                      onClick={() => setEditRoom(room)}
                      data-testid={`room-grade-badge-${room.id}`}
                    >
                      <Tag className="h-3 w-3" />
                      {room.serviceNameAr}
                      {room.servicePrice && ` — ${parseFloat(room.servicePrice).toLocaleString("ar-EG")} ج.م`}
                      <Pencil className="h-3 w-3 opacity-60" />
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground gap-1"
                      onClick={() => setEditRoom(room)}
                      data-testid={`room-set-grade-${room.id}`}
                    >
                      <Tag className="h-3 w-3" />
                      تحديد درجة الغرفة
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {room.beds.map(bed => (
                    <BedCard
                      key={bed.id}
                      bed={{
                        ...bed,
                        roomServiceId: room.serviceId,
                        roomServiceNameAr: room.serviceNameAr,
                        roomServicePrice: room.servicePrice,
                      }}
                      onAction={handleAction}
                    />
                  ))}
                  {room.beds.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">لا يوجد أسرّة في هذه الغرفة</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!isLoading && board.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <BedDouble className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">لم يتم إعداد أي طوابق أو غرف بعد</p>
        </div>
      )}

      {/* Modals */}
      <ReceptionSheet
        open={!!admitBed}
        bed={admitBed}
        onClose={() => setAdmitBed(null)}
      />
      <TransferDialog
        open={!!transferBed}
        sourceBed={transferBed}
        onClose={() => setTransferBed(null)}
      />
      <DischargeDialog
        open={!!dischargeBed}
        bed={dischargeBed}
        onClose={() => setDischargeBed(null)}
      />
      <RoomGradeDialog
        open={!!editRoom}
        room={editRoom}
        onClose={() => setEditRoom(null)}
      />
    </div>
  );
}
