import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useDebounce } from "./useDebounce";
import { PAYMENT_TYPES } from "./types";
import type { AdmissionSectionProps, DoctorOption } from "./types";

export default function AdmissionSection({ open, values, setters }: AdmissionSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const { data: bedBoard = [] } = useQuery<any[]>({
    queryKey: ["/api/bed-board"],
    enabled: open,
  });

  const floors = useMemo(() =>
    bedBoard.map((f: any) => ({ id: f.id, nameAr: f.nameAr, rooms: f.rooms ?? [] })),
    [bedBoard],
  );

  const rooms = useMemo(() => {
    const floor = floors.find(f => f.id === values.selectedFloor);
    if (!floor) return [];
    return (floor.rooms ?? []).filter((r: any) =>
      (r.beds ?? []).some((b: any) => b.status === "EMPTY"),
    );
  }, [floors, values.selectedFloor]);

  const beds = useMemo(() => {
    if (!values.selectedRoom) return [];
    for (const f of bedBoard) {
      for (const r of (f.rooms ?? [])) {
        if (r.id === values.selectedRoom) {
          return (r.beds ?? []).filter((b: any) => b.status === "EMPTY");
        }
      }
    }
    return [];
  }, [bedBoard, values.selectedRoom]);

  const { data: doctors = [] } = useQuery<DoctorOption[]>({
    queryKey: ["/api/doctors", values.doctorSearch],
    queryFn: () =>
      fetch(`/api/doctors?search=${encodeURIComponent(values.doctorSearch)}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: open && values.doctorSearch.length >= 1,
  });

  const debouncedSurgery = useDebounce(values.surgerySearch, 300);
  const { data: surgeryTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/surgery-types", debouncedSurgery],
    queryFn: async () => {
      const q = debouncedSurgery.trim()
        ? `?search=${encodeURIComponent(debouncedSurgery.trim())}`
        : "";
      const r = await fetch(`/api/surgery-types${q}`, { credentials: "include" });
      const data = await r.json();
      return Array.isArray(data) ? data : data.data ?? [];
    },
    enabled: open && expanded,
  });

  useEffect(() => {
    setters.setSelectedRoom("");
    setters.setSelectedBed("");
  }, [values.selectedFloor]); // eslint-disable-line

  useEffect(() => {
    setters.setSelectedBed("");
  }, [values.selectedRoom]); // eslint-disable-line

  useEffect(() => {
    if (beds.length === 1 && !values.selectedBed) {
      setters.setSelectedBed(beds[0].id);
    }
  }, [beds]); // eslint-disable-line

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 text-xs font-semibold"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-toggle-admission"
      >
        <span>تسكين على سرير (اختياري)</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="px-3 py-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">الدور</Label>
              <Select value={values.selectedFloor} onValueChange={setters.setSelectedFloor}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-floor">
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {floors.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">الغرفة</Label>
              <Select
                value={values.selectedRoom}
                onValueChange={setters.setSelectedRoom}
                disabled={!values.selectedFloor}
              >
                <SelectTrigger className="h-7 text-xs" data-testid="select-room">
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className={`text-xs ${values.selectedRoom && !values.selectedBed ? "text-red-600 font-medium" : ""}`}>
                السرير {values.selectedRoom && !values.selectedBed && <span className="text-red-500">*</span>}
              </Label>
              <Select
                value={values.selectedBed}
                onValueChange={setters.setSelectedBed}
                disabled={!values.selectedRoom}
              >
                <SelectTrigger
                  className={`h-7 text-xs ${values.selectedRoom && !values.selectedBed ? "border-red-400 ring-1 ring-red-400" : ""}`}
                  data-testid="select-bed"
                >
                  <SelectValue placeholder={values.selectedRoom && !values.selectedBed ? "مطلوب ⚠" : "اختر"} />
                </SelectTrigger>
                <SelectContent>
                  {beds.length === 0 && (
                    <SelectItem value="__none__" disabled>لا توجد أسرة فارغة</SelectItem>
                  )}
                  {beds.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">الطبيب المعالج</Label>
            {values.selectedDoctor ? (
              <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 rounded border border-blue-200 text-xs">
                <span className="flex-1 font-medium">د. {values.selectedDoctor.name}</span>
                {values.selectedDoctor.specialty && (
                  <span className="text-muted-foreground">{values.selectedDoctor.specialty}</span>
                )}
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground px-1"
                  onClick={() => { setters.setSelectedDoctor(null); setters.setDoctorSearch(""); }}
                >
                  تغيير
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={values.doctorSearch}
                  onChange={e => { setters.setDoctorSearch(e.target.value); setters.setShowDoctorResults(true); }}
                  onFocus={() => setters.setShowDoctorResults(true)}
                  onBlur={() => setTimeout(() => setters.setShowDoctorResults(false), 200)}
                  placeholder="ابحث باسم الطبيب..."
                  className="h-7 text-xs"
                  data-testid="input-doctor-search"
                />
                {values.showDoctorResults && values.doctorSearch.length >= 1 && (
                  <div className="absolute z-50 w-full mt-0.5 border rounded bg-background shadow-md text-xs overflow-hidden">
                    {doctors.length === 0 ? (
                      <div className="px-2 py-1.5 text-muted-foreground">لا يوجد طبيب بهذا الاسم</div>
                    ) : (
                      doctors.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          className="w-full text-right px-2 py-1.5 hover:bg-muted border-b last:border-b-0"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setters.setSelectedDoctor(d);
                            setters.setDoctorSearch("");
                            setters.setShowDoctorResults(false);
                          }}
                          data-testid={`doctor-option-${d.id}`}
                        >
                          <span className="font-medium">د. {d.name}</span>
                          {d.specialty && <span className="text-muted-foreground mr-2">{d.specialty}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">نوع العملية (اختياري)</Label>
            <Input
              value={values.surgerySearch}
              onChange={e => {
                setters.setSurgerySearch(e.target.value);
                setters.setSelectedSurgery(null);
              }}
              placeholder="ابحث عن عملية..."
              className="h-7 text-xs"
              data-testid="input-surgery-search"
            />
            {values.surgerySearch && !values.selectedSurgery && surgeryTypes.length > 0 && (
              <div className="border rounded bg-background shadow-sm max-h-28 overflow-y-auto">
                {surgeryTypes.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full text-right px-2 py-1 text-xs hover:bg-muted"
                    onClick={() => {
                      setters.setSelectedSurgery(s);
                      setters.setSurgerySearch(s.nameAr);
                    }}
                  >
                    {s.nameAr}
                  </button>
                ))}
              </div>
            )}
            {values.selectedSurgery && (
              <Badge variant="secondary" className="text-xs">
                {values.selectedSurgery.nameAr}
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">نوع الدفع</Label>
            <div className="flex gap-2">
              {PAYMENT_TYPES.map(pt => (
                <button
                  key={pt.value}
                  type="button"
                  className={`flex-1 h-7 rounded text-xs border transition-colors ${
                    values.paymentType === pt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-input hover:bg-muted"
                  }`}
                  onClick={() => setters.setPaymentType(pt.value)}
                  data-testid={`button-payment-${pt.value.toLowerCase()}`}
                >
                  {pt.label}
                </button>
              ))}
            </div>
          </div>

          {values.paymentType === "INSURANCE" && (
            <div className="space-y-1">
              <Label className="text-xs">شركة التأمين</Label>
              <Input
                value={values.insuranceCo}
                onChange={e => setters.setInsuranceCo(e.target.value)}
                placeholder="اسم شركة التأمين"
                className="h-7 text-xs"
                data-testid="input-insurance-company"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
