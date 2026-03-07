import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BedDouble, RefreshCw } from "lucide-react";

import { BedCard } from "./components/BedCard";
import { FloorSection } from "./components/FloorSection";
import { ReceptionSheet } from "./components/ReceptionSheet";
import { TransferDialog } from "./components/TransferDialog";
import { DischargeDialog } from "./components/DischargeDialog";
import type { BedData, FloorData, BedStatus } from "./types";
import { STATUS_CONFIG } from "./types";

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({ board }: { board: FloorData[] }) {
  const allBeds = board.flatMap((f) => f.rooms.flatMap((r) => r.beds));
  const stats = allBeds.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {(Object.entries(STATUS_CONFIG) as [BedStatus, (typeof STATUS_CONFIG)[BedStatus]][]).map(
        ([st, cfg]) => (
          <Badge key={st} variant="outline" className={`gap-1 ${cfg.badge}`}>
            {cfg.label}: {stats[st] ?? 0}
          </Badge>
        ),
      )}
      <span className="text-xs text-muted-foreground">
        ({allBeds.length} سرير إجمالاً)
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BedBoard() {
  const { toast } = useToast();

  const { data: board = [], isLoading, refetch } = useQuery<FloorData[]>({
    queryKey: ["/api/bed-board"],
    queryFn: () => apiRequest("GET", "/api/bed-board").then((r) => r.json()),
    // SSE will invalidate; this is the safety-net fallback every 2 min
    refetchInterval: 120_000,
    staleTime: 10_000,
  });

  // ── SSE: instant update on any bed state change ───────────────────────────
  const sseRef = useRef<EventSource | null>(null);
  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/bed-board/events");
      sseRef.current = es;

      es.addEventListener("bed-board-update", () => {
        queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      });

      es.onerror = () => {
        es.close();
        sseRef.current = null;
        // reconnect after 5 s
        setTimeout(connect, 5_000);
      };
    }

    connect();
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, []);

  // ── Dialog / Sheet state ──────────────────────────────────────────────────
  const [admitBed, setAdmitBed] = useState<BedData | null>(null);
  const [transferBed, setTransferBed] = useState<BedData | null>(null);
  const [dischargeBed, setDischargeBed] = useState<BedData | null>(null);

  // ── Status mutations (clean / maintenance) ────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ bedId, status }: { bedId: string; status: string }) =>
      apiRequest("POST", `/api/beds/${bedId}/status`, { status }).then((r) => r.json()),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bed-board"] });
      const label = vars.status === "EMPTY" ? "فارغ / نظيف" : "صيانة";
      toast({ title: "تم التحديث", description: `حالة السرير: ${label}` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطأ", description: err.message || "فشل التحديث" });
    },
  });

  const handleAction = useCallback(
    (action: string, bed: BedData) => {
      switch (action) {
        case "admit":       setAdmitBed(bed); break;
        case "transfer":    setTransferBed(bed); break;
        case "discharge":   setDischargeBed(bed); break;
        case "invoice":
          window.open(`/patient-invoice?admissionId=${bed.currentAdmissionId}`, "_blank");
          break;
        case "clean":
          statusMutation.mutate({ bedId: bed.id, status: "EMPTY" });
          break;
        case "maintenance":
          statusMutation.mutate({ bedId: bed.id, status: "MAINTENANCE" });
          break;
      }
    },
    [statusMutation],
  );

  return (
    <div className="p-4 space-y-6" dir="rtl">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BedDouble className="h-6 w-6" />
            لوحة الأسرّة
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <StatsBar board={board} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-board"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          جارٍ تحميل لوحة الأسرّة...
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!isLoading && board.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <BedDouble className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">لم يتم إعداد أي طوابق أو غرف بعد</p>
        </div>
      )}

      {/* ── Floor sections ────────────────────────────────────────────────── */}
      {board.map((floor) => (
        <FloorSection key={floor.id} floor={floor} onAction={handleAction} />
      ))}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
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
    </div>
  );
}
