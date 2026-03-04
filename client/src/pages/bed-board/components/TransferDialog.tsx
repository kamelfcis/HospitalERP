import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowRightLeft, BedDouble, Tag, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { AvailableBed, BedData } from "../types";

interface Props {
  open: boolean;
  sourceBed: BedData | null;
  onClose: () => void;
}

// ─── Grouped available beds (floor → room → beds) ────────────────────────────
interface RoomGroup {
  roomId: string;
  roomNameAr: string;
  floorNameAr: string;
  serviceId: string | null;
  serviceNameAr: string | null;
  servicePrice: string | null;
  beds: AvailableBed[];
}

function groupByRoom(beds: AvailableBed[]): RoomGroup[] {
  const map = new Map<string, RoomGroup>();
  for (const b of beds) {
    if (!map.has(b.roomId)) {
      map.set(b.roomId, {
        roomId: b.roomId,
        roomNameAr: b.roomNameAr,
        floorNameAr: b.floorNameAr,
        serviceId: b.roomServiceId,
        serviceNameAr: b.roomServiceNameAr,
        servicePrice: b.roomServicePrice,
        beds: [],
      });
    }
    map.get(b.roomId)!.beds.push(b);
  }
  return Array.from(map.values());
}

// ─── Grade change indicator ───────────────────────────────────────────────────
function GradeChangeIndicator({
  oldPrice,
  newPrice,
  newName,
}: {
  oldPrice: string | null;
  newPrice: string | null;
  newName: string | null;
}) {
  if (!newPrice || parseFloat(newPrice) === 0) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>الغرفة المختارة بدون درجة إقامة — لن يُضاف بند إقامة فوراً</span>
      </div>
    );
  }

  const oldVal = oldPrice ? parseFloat(oldPrice) : 0;
  const newVal = parseFloat(newPrice);
  const diff = newVal - oldVal;

  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800">
      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-600" />
      <div>
        <p className="font-medium">سيُضاف سطر إقامة فوري للفاتورة</p>
        <p className="mt-0.5">
          <span className="font-semibold">{newName}</span>
          {" — "}
          <span className="font-semibold">{newVal.toLocaleString("ar-EG")} ج.م</span>
          {diff !== 0 && (
            <span className={`mr-1.5 ${diff > 0 ? "text-red-600" : "text-green-600"}`}>
              ({diff > 0 ? "+" : ""}{diff.toLocaleString("ar-EG")} ج.م عن الدرجة الحالية)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Bed selection button ─────────────────────────────────────────────────────
function BedOption({
  bed,
  selected,
  onSelect,
}: {
  bed: AvailableBed;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`target-bed-option-${bed.id}`}
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors w-full text-right ${
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border hover:bg-muted"
      }`}
    >
      <BedDouble className="h-4 w-4 shrink-0" />
      <span className="font-medium">سرير {bed.bedNumber}</span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TransferDialog({ open, sourceBed, onClose }: Props) {
  const { toast } = useToast();
  const [targetBedId, setTargetBedId] = useState<string>("");

  const { data: availableBeds = [], isLoading } = useQuery<AvailableBed[]>({
    queryKey: ["/api/beds/available"],
    queryFn: () => apiRequest("GET", "/api/beds/available").then((r) => r.json()),
    enabled: open,
    // re-fetch every time dialog opens (data from SSE stays fresh)
    staleTime: 0,
  });

  // exclude the source bed's own room from available list (already occupied by this patient)
  const filteredBeds = useMemo(
    () => availableBeds.filter((b) => b.id !== sourceBed?.id),
    [availableBeds, sourceBed],
  );

  const roomGroups = useMemo(() => groupByRoom(filteredBeds), [filteredBeds]);

  // find selected bed's grade info for preview
  const selectedBed = filteredBeds.find((b) => b.id === targetBedId) ?? null;

  const transferMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/beds/${sourceBed!.id}/transfer`, {
        targetBedId,
      }).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/beds/available"] });
      const hasLine = data?.ratePerDay && parseFloat(data.ratePerDay) > 0;
      toast({
        title: "تم التحويل بنجاح",
        description: hasLine
          ? "تم نقل المريض وإضافة سطر الإقامة الجديدة فوراً للفاتورة"
          : "تم نقل المريض — السرير الجديد بدون درجة إقامة",
      });
      handleClose();
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "فشل التحويل",
        description: err.message || "حدث خطأ غير متوقع",
      });
    },
  });

  function handleClose() {
    setTargetBedId("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            تحويل المريض لسرير آخر
          </DialogTitle>
          <DialogDescription>
            {sourceBed
              ? `${sourceBed.patientName} — سرير ${sourceBed.bedNumber}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable bed list */}
        <div className="flex-1 overflow-y-auto space-y-4 py-1 min-h-0">
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تحميل السراير المتاحة...
            </div>
          )}

          {!isLoading && roomGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <BedDouble className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                لا توجد سراير فارغة متاحة حالياً
              </p>
            </div>
          )}

          {roomGroups.map((group) => (
            <div key={group.roomId} className="space-y-2">
              {/* Room header with grade badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.floorNameAr} — {group.roomNameAr}
                </p>
                {group.serviceNameAr ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 border-green-300 text-green-700 dark:text-green-400 dark:border-green-700"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {group.serviceNameAr}
                    {group.servicePrice &&
                      ` — ${parseFloat(group.servicePrice).toLocaleString("ar-EG")} ج.م`}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 border-amber-300 text-amber-600 dark:text-amber-400"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    بدون درجة
                  </Badge>
                )}
              </div>

              {/* Beds in this room */}
              <div className="grid grid-cols-2 gap-2">
                {group.beds.map((bed) => (
                  <BedOption
                    key={bed.id}
                    bed={bed}
                    selected={bed.id === targetBedId}
                    onSelect={() => setTargetBedId(bed.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Grade change preview — shown after selection */}
        {targetBedId && selectedBed && (
          <div className="pt-2 border-t">
            <GradeChangeIndicator
              oldPrice={sourceBed?.roomServicePrice ?? null}
              newPrice={selectedBed.roomServicePrice}
              newName={selectedBed.roomServiceNameAr}
            />
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-transfer-cancel"
          >
            إلغاء
          </Button>
          <Button
            data-testid="button-transfer-confirm"
            disabled={!targetBedId || transferMutation.isPending}
            onClick={() => transferMutation.mutate()}
          >
            {transferMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                جارٍ التحويل...
              </>
            ) : (
              "تأكيد التحويل"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
