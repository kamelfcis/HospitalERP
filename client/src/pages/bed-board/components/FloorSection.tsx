import { Badge } from "@/components/ui/badge";
import { BedDouble, Building2, Tag } from "lucide-react";
import { BedCard } from "./BedCard";
import type { FloorData, RoomData, BedData } from "../types";

// ─── Palette: one color per floor (rotates by index) ───────────────────────
const FLOOR_GRADIENTS = [
  "from-teal-500 to-cyan-600",
  "from-indigo-500 to-violet-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-green-600",
  "from-sky-500 to-blue-600",
  "from-purple-500 to-fuchsia-600",
  "from-slate-500 to-slate-700",
];

function RoomCard({
  room,
  floor,
  onAction,
}: {
  room: RoomData;
  floor: FloorData;
  onAction: (action: string, bed: BedData) => void;
}) {
  const totalBeds = room.beds.length;
  const occupied = room.beds.filter(b => b.status === "OCCUPIED").length;
  const empty = room.beds.filter(b => b.status === "EMPTY").length;

  return (
    <div
      className="bg-white dark:bg-card border border-border rounded-2xl shadow-sm flex flex-col min-w-[160px] max-w-xs"
      data-testid={`room-section-${room.id}`}
    >
      {/* Room header */}
      <div className="px-3 pt-3 pb-2 border-b border-dashed border-border/60">
        <div className="flex items-start justify-between gap-1 flex-wrap">
          <div>
            <p className="font-bold text-sm leading-tight" data-testid={`text-room-name-${room.id}`}>
              {room.nameAr}
              {room.roomNumber ? <span className="font-mono text-xs text-muted-foreground mr-1">({room.roomNumber})</span> : null}
            </p>
            <div className="mt-0.5">
              {room.serviceNameAr ? (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] text-teal-700 dark:text-teal-300 font-medium"
                  data-testid={`room-grade-badge-${room.id}`}
                >
                  <Tag className="h-2.5 w-2.5" />
                  {room.serviceNameAr}
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground" data-testid={`room-no-grade-${room.id}`}>
                  <Tag className="h-2.5 w-2.5" />
                  بدون درجة
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-muted-foreground">{occupied}/{totalBeds}</span>
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: empty > 0 ? "#22c55e" : occupied === totalBeds ? "#3b82f6" : "#f59e0b" }}
            />
          </div>
        </div>
      </div>

      {/* Beds */}
      <div className="p-2 flex flex-row flex-wrap gap-2">
        {room.beds.map((bed) => (
          <BedCard
            key={bed.id}
            bed={{
              ...bed,
              roomServiceId:     room.serviceId,
              roomServiceNameAr: room.serviceNameAr,
              roomServicePrice:  room.servicePrice,
              roomNameAr:        room.nameAr,
              roomNumber:        room.roomNumber ?? null,
              floorNameAr:       floor.nameAr,
            }}
            onAction={onAction}
          />
        ))}
        {room.beds.length === 0 && (
          <p className="text-xs text-muted-foreground py-1">لا يوجد أسرّة</p>
        )}
      </div>
    </div>
  );
}

interface Props {
  floor: FloorData;
  floorIndex: number;
  onAction: (action: string, bed: BedData) => void;
}

export function FloorSection({ floor, floorIndex, onAction }: Props) {
  const gradient = FLOOR_GRADIENTS[floorIndex % FLOOR_GRADIENTS.length];
  const allBeds = floor.rooms.flatMap(r => r.beds);
  const occupied = allBeds.filter(b => b.status === "OCCUPIED").length;
  const empty = allBeds.filter(b => b.status === "EMPTY").length;

  return (
    <div className="rounded-2xl border border-border overflow-hidden shadow-sm" data-testid={`floor-section-${floor.id}`}>
      {/* Floor header */}
      <div className={`bg-gradient-to-l ${gradient} px-4 py-3 flex items-center justify-between gap-3 flex-wrap`}>
        <div className="flex items-center gap-2">
          <BedDouble className="h-5 w-5 text-white/90 shrink-0" />
          <h2 className="text-base font-bold text-white tracking-wide">{floor.nameAr}</h2>
          {floor.departmentName && (
            <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 text-xs px-2 py-0.5">
              <Building2 className="h-3 w-3 ml-1" />
              {floor.departmentName}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-white/90 text-xs">
          <span className="bg-white/20 rounded-full px-2.5 py-0.5 font-medium">{floor.rooms.length} غرفة</span>
          <span className="bg-emerald-700/50 rounded-full px-2.5 py-0.5 font-medium">{empty} فارغ</span>
          <span className="bg-blue-700/50 rounded-full px-2.5 py-0.5 font-medium">{occupied} مشغول</span>
        </div>
      </div>

      {/* Rooms — horizontal wrap */}
      <div className="bg-muted/30 dark:bg-muted/10 p-3 flex flex-row flex-wrap gap-3">
        {floor.rooms.map((room) => (
          <RoomCard key={room.id} room={room} floor={floor} onAction={onAction} />
        ))}
        {floor.rooms.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 w-full text-center">لا توجد غرف مضافة لهذا الطابق</p>
        )}
      </div>
    </div>
  );
}
