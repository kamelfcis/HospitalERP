import { Badge } from "@/components/ui/badge";
import { BedDouble, Building2, Tag } from "lucide-react";
import { BedCard } from "./BedCard";
import type { FloorData, RoomData, BedData } from "../types";

const FLOOR_THEMES = [
  { header: "bg-slate-600 dark:bg-slate-700",   stat: "bg-slate-500/40" },
  { header: "bg-blue-700/90 dark:bg-blue-800",  stat: "bg-blue-600/40" },
  { header: "bg-teal-700/85 dark:bg-teal-800",  stat: "bg-teal-600/40" },
  { header: "bg-indigo-700/85 dark:bg-indigo-800", stat: "bg-indigo-600/40" },
  { header: "bg-cyan-700/85 dark:bg-cyan-800",  stat: "bg-cyan-600/40" },
  { header: "bg-stone-600 dark:bg-stone-700",   stat: "bg-stone-500/40" },
  { header: "bg-zinc-600 dark:bg-zinc-700",     stat: "bg-zinc-500/40" },
  { header: "bg-sky-700/85 dark:bg-sky-800",    stat: "bg-sky-600/40" },
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
      className="bg-white dark:bg-card border border-border rounded-xl shadow-sm flex flex-col min-w-[160px] max-w-xs"
      data-testid={`room-section-${room.id}`}
    >
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
                  className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 font-medium"
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
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-muted-foreground font-mono">{occupied}/{totalBeds}</span>
            <div
              className={`w-2 h-2 rounded-full ring-1 ring-white dark:ring-gray-800 ${
                empty > 0
                  ? "bg-emerald-500 dark:bg-emerald-600"
                  : occupied === totalBeds
                    ? "bg-blue-500 dark:bg-blue-600"
                    : "bg-amber-400 dark:bg-amber-500"
              }`}
            />
          </div>
        </div>
      </div>

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
  const theme = FLOOR_THEMES[floorIndex % FLOOR_THEMES.length];
  const allBeds = floor.rooms.flatMap(r => r.beds);
  const occupied = allBeds.filter(b => b.status === "OCCUPIED").length;
  const empty = allBeds.filter(b => b.status === "EMPTY").length;

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm" data-testid={`floor-section-${floor.id}`}>
      <div className={`${theme.header} px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap`}>
        <div className="flex items-center gap-2">
          <BedDouble className="h-[18px] w-[18px] text-white/80 shrink-0" />
          <h2 className="text-sm font-bold text-white">{floor.nameAr}</h2>
          {floor.departmentName && (
            <Badge className="bg-white/15 hover:bg-white/20 text-white/90 border-0 text-[11px] px-2 py-0 font-normal">
              <Building2 className="h-3 w-3 ml-1 opacity-70" />
              {floor.departmentName}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-white/90 text-[11px]">
          <span className={`${theme.stat} rounded-full px-2 py-0.5 font-medium`}>{floor.rooms.length} غرفة</span>
          <span className="bg-emerald-600/30 rounded-full px-2 py-0.5 font-medium">{empty} فارغ</span>
          <span className="bg-blue-500/30 rounded-full px-2 py-0.5 font-medium">{occupied} مشغول</span>
        </div>
      </div>

      <div className="bg-muted/20 dark:bg-muted/10 p-3 flex flex-row flex-wrap gap-3">
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
