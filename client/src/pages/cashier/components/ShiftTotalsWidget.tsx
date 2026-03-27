import { memo, useEffect, useRef, useState } from "react";
import { Wallet, GripVertical } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { useAuth } from "@/hooks/use-auth";
import type { ShiftTotals } from "../types";

interface Props {
  totals: ShiftTotals;
}

export const ShiftTotalsWidget = memo(function ShiftTotalsWidget({ totals }: Props) {
  const { hasPermission } = useAuth();
  const canViewCredit = hasPermission("credit_payment.view");

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging  = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPos({ x: 12, y: window.innerHeight - 220 });
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!pos) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: dragStart.current.px + (e.clientX - dragStart.current.mx),
        y: dragStart.current.py + (e.clientY - dragStart.current.my),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!pos) return null;

  return (
    <div
      ref={widgetRef}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 50 }}
      data-testid="widget-shift-totals"
    >
      <div className="w-52 rounded-xl border border-border/60 shadow-lg bg-background/75 backdrop-blur-md overflow-hidden select-none">
        {/* Header / drag handle */}
        <div
          className="flex items-center justify-between gap-1 px-2.5 py-1.5 bg-muted/40 cursor-grab active:cursor-grabbing border-b border-border/40"
          onMouseDown={onMouseDown}
        >
          <div className="flex items-center gap-1 text-[10px] font-semibold text-foreground/80">
            <Wallet className="h-3 w-3" />
            ملخص الوردية
          </div>
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>

        {/* Body */}
        <div className="px-2.5 py-1.5 space-y-0.5" dir="rtl">
          {/* التحصيل */}
          <Row
            label="التحصيل"
            value={totals.totalCollected}
            count={totals.collectCount}
            testId="text-total-collected"
          />

          {/* الآجل */}
          <Row
            label="الآجل"
            value={totals.totalDeferred}
            count={totals.deferredCount}
            testId="text-total-deferred"
            valueClass="text-amber-600 dark:text-amber-400"
          />

          {/* تحصيل الآجل — يظهر فقط لمن لديه صلاحية credit_payment.view */}
          {canViewCredit && (
            <Row
              label="تحصيل الآجل"
              value={totals.creditCollected ?? "0"}
              count={totals.creditCount ?? 0}
              testId="text-credit-collected"
              valueClass={
                parseFloat(totals.creditCollected ?? "0") > 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-muted-foreground"
              }
            />
          )}

          {/* تحصيل التوصيل — يظهر دائماً */}
          <Row
            label="فى توصيل"
            value={totals.deliveryCollected ?? "0"}
            count={totals.deliveryCollectedCount ?? 0}
            testId="text-delivery-collected"
            valueClass={
              parseFloat(totals.deliveryCollected ?? "0") > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            }
          />

          {/* منصرف موردين */}
          {parseFloat(totals.supplierPaid ?? "0") > 0 && (
            <Row
              label="منصرف موردين"
              value={totals.supplierPaid ?? "0"}
              count={totals.supplierPaidCount ?? 0}
              testId="text-supplier-paid"
              valueClass="text-orange-600 dark:text-orange-400"
              prefix="−"
            />
          )}

          {/* المرتجعات */}
          <Row
            label="المرتجعات"
            value={totals.totalRefunded}
            count={totals.refundCount}
            testId="text-total-refunded"
            valueClass="text-red-600 dark:text-red-400"
            prefix="−"
          />

          {/* الصافي */}
          <div className="border-t border-border/50 mt-0.5 pt-1 flex justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">صافي التحصيل</span>
            <span
              className="font-bold text-primary"
              data-testid="text-net-collected"
            >
              {formatNumber(totals.netCollected)}
            </span>
          </div>

          {/* إجمالي الخزنة */}
          <div className="flex justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">إجمالي الخزنة</span>
            <span className="font-bold" data-testid="text-net-cash">
              {formatNumber(totals.netCash)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

function Row({
  label,
  value,
  count,
  testId,
  valueClass = "",
  prefix = "",
}: {
  label: string;
  value: string;
  count: number;
  testId: string;
  valueClass?: string;
  prefix?: string;
}) {
  return (
    <div className="flex justify-between items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">
        {label}
        {count > 0 && (
          <span className="text-[9px] mr-0.5 text-muted-foreground/70">
            ({count})
          </span>
        )}
      </span>
      <span className={`font-medium tabular-nums ${valueClass}`} data-testid={testId}>
        {prefix}{formatNumber(value)}
      </span>
    </div>
  );
}
