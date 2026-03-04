import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";
import { BedCard } from "./BedCard";
import type { FloorData, BedData } from "../types";

interface Props {
  floor: FloorData;
  onAction: (action: string, bed: BedData) => void;
}

export function FloorSection({ floor, onAction }: Props) {
  return (
    <div data-testid={`floor-section-${floor.id}`}>
      <h2 className="text-lg font-semibold mb-3 pb-1 border-b">{floor.nameAr}</h2>
      <div className="space-y-5">
        {floor.rooms.map((room) => (
          <div
            key={room.id}
            className="rounded-lg border bg-card p-3"
            data-testid={`room-section-${room.id}`}
          >
            {/* Room header */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <p
                className="text-sm font-semibold"
                data-testid={`text-room-name-${room.id}`}
              >
                {room.nameAr}
                {room.roomNumber ? ` (${room.roomNumber})` : ""}
              </p>

              {room.serviceNameAr ? (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 border-green-300 text-green-700 dark:text-green-400 dark:border-green-700"
                  data-testid={`room-grade-badge-${room.id}`}
                >
                  <Tag className="h-3 w-3" />
                  {room.serviceNameAr}
                  {room.servicePrice &&
                    ` — ${parseFloat(room.servicePrice).toLocaleString("ar-EG")} ج.م`}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 border-amber-300 text-amber-600 dark:text-amber-400 dark:border-amber-700"
                  data-testid={`room-no-grade-${room.id}`}
                >
                  <Tag className="h-3 w-3" />
                  بدون درجة
                </Badge>
              )}
            </div>

            {/* Beds grid */}
            <div className="flex flex-wrap gap-3">
              {room.beds.map((bed) => (
                <BedCard
                  key={bed.id}
                  bed={{
                    ...bed,
                    roomServiceId: room.serviceId,
                    roomServiceNameAr: room.serviceNameAr,
                    roomServicePrice: room.servicePrice,
                  }}
                  onAction={onAction}
                />
              ))}
              {room.beds.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  لا يوجد أسرّة في هذه الغرفة
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
