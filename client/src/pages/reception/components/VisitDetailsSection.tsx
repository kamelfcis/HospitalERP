import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Stethoscope, Bed, FlaskConical, Radiation } from "lucide-react";
import { ClinicLookup, DoctorLookup } from "@/components/lookups";
import type { LookupItem } from "@/lib/lookupTypes";
import type {
  VisitReason, ScheduleOption, FloorOption, RoomOption, BedOption, SurgeryType,
} from "./types";
import { VISIT_TYPES, SectionLabel } from "./types";

interface VisitDetailsSectionProps {
  visitReason: VisitReason;
  setVisitReason: (v: VisitReason) => void;
  selectedClinic: LookupItem | null;
  setSelectedClinic: (v: LookupItem | null) => void;
  selectedDoctor: LookupItem | null;
  setSelectedDoctor: (v: LookupItem | null) => void;
  consultDate: string;
  setConsultDate: (v: string) => void;
  consultTime: string;
  setConsultTime: (v: string) => void;
  schedules: ScheduleOption[];
  selectedFloor: string;
  setSelectedFloor: (v: string) => void;
  selectedRoom: string;
  setSelectedRoom: (v: string) => void;
  selectedBed: string;
  setSelectedBed: (v: string) => void;
  floors: FloorOption[];
  rooms: RoomOption[];
  beds: BedOption[];
  admDoctor: LookupItem | null;
  setAdmDoctor: (v: LookupItem | null) => void;
  surgerySearch: string;
  setSurgerySearch: (v: string) => void;
  selectedSurgery: SurgeryType | null;
  setSelectedSurgery: (v: SurgeryType | null) => void;
  isPackage: boolean;
  setIsPackage: (v: boolean) => void;
  showSurgeryDrop: boolean;
  setShowSurgeryDrop: (v: boolean) => void;
  highlightedSurgery: number;
  setHighlightedSurgery: (v: number | ((prev: number) => number)) => void;
  surgeryTypesRaw: SurgeryType[];
  surgeryItemsRef: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  handleSurgeryKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  serviceNotes: string;
  setServiceNotes: (v: string) => void;
}

export function VisitDetailsSection(props: VisitDetailsSectionProps) {
  const {
    visitReason, setVisitReason,
    selectedClinic, setSelectedClinic,
    selectedDoctor, setSelectedDoctor,
    consultDate, setConsultDate, consultTime, setConsultTime,
    schedules,
    selectedFloor, setSelectedFloor,
    selectedRoom, setSelectedRoom,
    selectedBed, setSelectedBed,
    floors, rooms, beds,
    admDoctor, setAdmDoctor,
    surgerySearch, setSurgerySearch,
    selectedSurgery, setSelectedSurgery,
    isPackage, setIsPackage,
    showSurgeryDrop, setShowSurgeryDrop,
    highlightedSurgery, setHighlightedSurgery,
    surgeryTypesRaw, surgeryItemsRef, handleSurgeryKeyDown,
    serviceNotes, setServiceNotes,
  } = props;

  return (
    <>
      <section className="space-y-2">
        <SectionLabel>سبب الزيارة *</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {VISIT_TYPES.map(vt => {
            const active = visitReason === vt.value;
            return (
              <button
                key={vt.value} type="button"
                onClick={() => { setVisitReason(vt.value as VisitReason); if (vt.value !== "consultation") { setSelectedClinic(null); setSelectedDoctor(null); } if (vt.value !== "admission") { setSelectedFloor(""); setSelectedRoom(""); setSelectedBed(""); setAdmDoctor(null); setSurgerySearch(""); setSelectedSurgery(null); } }}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-right transition-all focus:outline-none focus-visible:ring-2 ${active ? `${vt.bg} ${vt.border} ${vt.color} ring-2 ${vt.activeRing} shadow-sm` : "bg-background border-input hover:bg-muted/50 text-muted-foreground"}`}
                data-testid={`button-visit-${vt.value}`}
              >
                <vt.Icon className={`h-5 w-5 shrink-0 ${active ? vt.color : ""}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold">{vt.label}</div>
                  <div className="text-[10px] opacity-70">{vt.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {visitReason === "consultation" && (
        <ConsultationDetails
          selectedClinic={selectedClinic} setSelectedClinic={setSelectedClinic}
          selectedDoctor={selectedDoctor} setSelectedDoctor={setSelectedDoctor}
          consultDate={consultDate} setConsultDate={setConsultDate}
          consultTime={consultTime} setConsultTime={setConsultTime}
          schedules={schedules}
        />
      )}

      {visitReason === "admission" && (
        <AdmissionDetails
          selectedFloor={selectedFloor} setSelectedFloor={setSelectedFloor}
          selectedRoom={selectedRoom} setSelectedRoom={setSelectedRoom}
          selectedBed={selectedBed} setSelectedBed={setSelectedBed}
          floors={floors} rooms={rooms} beds={beds}
          admDoctor={admDoctor} setAdmDoctor={setAdmDoctor}
          surgerySearch={surgerySearch} setSurgerySearch={setSurgerySearch}
          selectedSurgery={selectedSurgery} setSelectedSurgery={setSelectedSurgery}
          isPackage={isPackage} setIsPackage={setIsPackage}
          showSurgeryDrop={showSurgeryDrop} setShowSurgeryDrop={setShowSurgeryDrop}
          highlightedSurgery={highlightedSurgery} setHighlightedSurgery={setHighlightedSurgery}
          surgeryTypesRaw={surgeryTypesRaw} surgeryItemsRef={surgeryItemsRef}
          handleSurgeryKeyDown={handleSurgeryKeyDown}
        />
      )}

      {(visitReason === "lab" || visitReason === "radiology") && (
        <LabRadiologyDetails
          visitReason={visitReason}
          serviceNotes={serviceNotes} setServiceNotes={setServiceNotes}
        />
      )}
    </>
  );
}

function ConsultationDetails({
  selectedClinic, setSelectedClinic,
  selectedDoctor, setSelectedDoctor,
  consultDate, setConsultDate,
  consultTime, setConsultTime,
  schedules,
}: {
  selectedClinic: LookupItem | null;
  setSelectedClinic: (v: LookupItem | null) => void;
  selectedDoctor: LookupItem | null;
  setSelectedDoctor: (v: LookupItem | null) => void;
  consultDate: string;
  setConsultDate: (v: string) => void;
  consultTime: string;
  setConsultTime: (v: string) => void;
  schedules: ScheduleOption[];
}) {
  return (
    <section className="border border-blue-200 rounded-lg p-3 bg-blue-50/30 space-y-2">
      <p className="text-xs font-medium text-blue-800 flex items-center gap-1">
        <Stethoscope className="h-3.5 w-3.5" /> تفاصيل حجز الكشف
      </p>
      <div className="space-y-1">
        <Label className="text-xs">العيادة *</Label>
        <ClinicLookup
          value={selectedClinic?.id || ""}
          onChange={item => { setSelectedClinic(item); setSelectedDoctor(null); }}
          data-testid="lookup-clinic"
        />
      </div>
      {selectedClinic && (
        <div className="space-y-1">
          <Label className="text-xs">الطبيب *</Label>
          {schedules.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              <span className="text-xs text-muted-foreground self-center">أطباء العيادة:</span>
              {schedules.map(s => (
                <button
                  key={s.doctorId} type="button"
                  onClick={() => setSelectedDoctor({ id: s.doctorId, name: s.doctorName })}
                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 rounded px-2 py-0.5 transition-colors"
                  data-testid={`schedule-doctor-${s.doctorId}`}
                >
                  د. {s.doctorName}
                </button>
              ))}
            </div>
          )}
          <DoctorLookup value={selectedDoctor?.id || ""} displayValue={selectedDoctor?.name || ""} onChange={setSelectedDoctor} data-testid="lookup-consult-doctor" />
        </div>
      )}
      {selectedClinic && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">تاريخ الكشف</Label>
            <Input type="date" value={consultDate} onChange={e => setConsultDate(e.target.value)} className="h-7 text-xs" data-testid="input-consult-date" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الوقت</Label>
            <Input type="time" value={consultTime} onChange={e => setConsultTime(e.target.value)} className="h-7 text-xs" data-testid="input-consult-time" />
          </div>
        </div>
      )}
      {selectedClinic && (() => {
        const fee = (selectedClinic.meta as any)?.consultationServiceBasePrice;
        if (!fee) return null;
        const feeNum = parseFloat(String(fee));
        if (isNaN(feeNum) || feeNum <= 0) return null;
        return (
          <div className="flex items-center justify-between bg-white/80 border border-blue-200 rounded px-2 py-1.5">
            <span className="text-xs text-blue-700 font-medium">رسوم الكشف</span>
            <span className="text-xs font-bold text-blue-900" data-testid="text-consult-fee">
              {feeNum.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م
            </span>
          </div>
        );
      })()}
    </section>
  );
}

function AdmissionDetails({
  selectedFloor, setSelectedFloor,
  selectedRoom, setSelectedRoom,
  selectedBed, setSelectedBed,
  floors, rooms, beds,
  admDoctor, setAdmDoctor,
  surgerySearch, setSurgerySearch,
  selectedSurgery, setSelectedSurgery,
  isPackage, setIsPackage,
  showSurgeryDrop, setShowSurgeryDrop,
  highlightedSurgery, setHighlightedSurgery,
  surgeryTypesRaw, surgeryItemsRef, handleSurgeryKeyDown,
}: {
  selectedFloor: string;
  setSelectedFloor: (v: string) => void;
  selectedRoom: string;
  setSelectedRoom: (v: string) => void;
  selectedBed: string;
  setSelectedBed: (v: string) => void;
  floors: FloorOption[];
  rooms: RoomOption[];
  beds: BedOption[];
  admDoctor: LookupItem | null;
  setAdmDoctor: (v: LookupItem | null) => void;
  surgerySearch: string;
  setSurgerySearch: (v: string) => void;
  selectedSurgery: SurgeryType | null;
  setSelectedSurgery: (v: SurgeryType | null) => void;
  isPackage: boolean;
  setIsPackage: (v: boolean) => void;
  showSurgeryDrop: boolean;
  setShowSurgeryDrop: (v: boolean) => void;
  highlightedSurgery: number;
  setHighlightedSurgery: (v: number | ((prev: number) => number)) => void;
  surgeryTypesRaw: SurgeryType[];
  surgeryItemsRef: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  handleSurgeryKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="border border-green-200 rounded-lg p-3 bg-green-50/30 space-y-2">
      <p className="text-xs font-medium text-green-800 flex items-center gap-1">
        <Bed className="h-3.5 w-3.5" /> تفاصيل التسكين
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">الدور</Label>
          <Select value={selectedFloor} onValueChange={setSelectedFloor}>
            <SelectTrigger className="h-7 text-xs" data-testid="select-floor"><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>{floors.map(f => <SelectItem key={f.id} value={f.id}>{f.nameAr}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الغرفة</Label>
          <Select value={selectedRoom} onValueChange={setSelectedRoom} disabled={!selectedFloor}>
            <SelectTrigger className="h-7 text-xs" data-testid="select-room"><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>{rooms.map(r => <SelectItem key={r.id} value={r.id}>{r.nameAr}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className={`text-xs ${selectedRoom && !selectedBed ? "text-red-600 font-medium" : ""}`}>
            السرير {selectedRoom && !selectedBed && <span className="text-red-500">*</span>}
          </Label>
          <Select value={selectedBed} onValueChange={setSelectedBed} disabled={!selectedRoom}>
            <SelectTrigger className={`h-7 text-xs ${selectedRoom && !selectedBed ? "border-red-400 ring-1 ring-red-400" : ""}`} data-testid="select-bed">
              <SelectValue placeholder={selectedRoom && !selectedBed ? "مطلوب ⚠" : "اختر"} />
            </SelectTrigger>
            <SelectContent>
              {beds.length === 0 && <SelectItem value="__none__" disabled>لا توجد أسرة فارغة</SelectItem>}
              {beds.map(b => <SelectItem key={b.id} value={b.id}>{b.nameAr}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">الطبيب المعالج</Label>
        <DoctorLookup value={admDoctor?.id || ""} displayValue={admDoctor?.name || ""} onChange={setAdmDoctor} data-testid="lookup-adm-doctor" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">نوع العملية (اختياري)</Label>
        <div className="relative">
          <Input
            value={surgerySearch}
            onChange={e => { setSurgerySearch(e.target.value); setSelectedSurgery(null); setHighlightedSurgery(0); setShowSurgeryDrop(true); }}
            onFocus={() => setShowSurgeryDrop(true)}
            onBlur={() => setTimeout(() => setShowSurgeryDrop(false), 150)}
            onKeyDown={handleSurgeryKeyDown}
            placeholder="ابحث عن عملية..."
            autoComplete="off" className="h-7 text-xs"
            data-testid="input-surgery-search"
          />
          {showSurgeryDrop && surgerySearch.length >= 1 && surgeryTypesRaw.length > 0 && (
            <div className="absolute z-50 w-full mt-0.5 border rounded bg-background shadow-md max-h-28 overflow-y-auto">
              {surgeryTypesRaw.map((s, idx) => {
                const isActive = highlightedSurgery === idx;
                return (
                  <button
                    key={s.id}
                    ref={el => { surgeryItemsRef.current[idx] = el; }}
                    role="option" aria-selected={isActive} type="button"
                    className={`w-full text-right px-2 py-1 text-xs transition-colors ${isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    onMouseEnter={() => setHighlightedSurgery(idx)}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setSelectedSurgery(s); setSurgerySearch(s.nameAr); setShowSurgeryDrop(false); }}
                  >
                    {s.nameAr}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {selectedSurgery && (
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">{selectedSurgery.nameAr}</Badge>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isPackage}
                onChange={e => setIsPackage(e.target.checked)}
                className="rounded border-primary"
                data-testid="checkbox-is-package"
              />
              <span className="text-xs font-medium text-purple-700">باكدج</span>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}

function LabRadiologyDetails({
  visitReason, serviceNotes, setServiceNotes,
}: {
  visitReason: "lab" | "radiology";
  serviceNotes: string;
  setServiceNotes: (v: string) => void;
}) {
  return (
    <section className={`border rounded-lg p-3 space-y-2 ${visitReason === "lab" ? "border-purple-200 bg-purple-50/30" : "border-amber-200 bg-amber-50/30"}`}>
      <p className={`text-xs font-medium flex items-center gap-1 ${visitReason === "lab" ? "text-purple-800" : "text-amber-800"}`}>
        {visitReason === "lab"
          ? <><FlaskConical className="h-3.5 w-3.5" /> تفاصيل طلب التحاليل</>
          : <><Radiation className="h-3.5 w-3.5" /> تفاصيل طلب الأشعة</>}
      </p>
      <div className="space-y-1">
        <Label className="text-xs">{visitReason === "lab" ? "التحاليل المطلوبة" : "الأشعة المطلوبة"}</Label>
        <textarea
          value={serviceNotes} onChange={e => setServiceNotes(e.target.value)}
          placeholder={visitReason === "lab" ? "مثال: صورة دم كاملة، وظائف كبد..." : "مثال: أشعة صدر، سونار بطن..."}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          data-testid="textarea-service-notes"
        />
      </div>
    </section>
  );
}
