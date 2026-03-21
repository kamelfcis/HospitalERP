/**
 * SettlementSummary
 *
 * AR summary panel: shows total claimed / approved / settled / outstanding.
 * Used in the batch detail header.
 */

interface SettlementSummaryProps {
  totalClaimed:     string | number;
  totalApproved:    string | number;
  totalRejected:    string | number;
  totalSettled?:    string | number;
  totalOutstanding?: string | number;
}

function fmt(v: string | number | undefined) {
  if (v === undefined || v === null) return "٠.٠٠";
  return parseFloat(String(v)).toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

export function SettlementSummary({
  totalClaimed, totalApproved, totalRejected, totalSettled, totalOutstanding,
}: SettlementSummaryProps) {
  const hasSettlement = totalSettled !== undefined;

  return (
    <div className={`grid divide-x-reverse divide-x border-b text-center ${hasSettlement ? "grid-cols-5" : "grid-cols-3"}`}>
      <div className="p-3">
        <div className="text-xs text-muted-foreground mb-1">إجمالي المطالبة</div>
        <div className="font-bold text-sm">{fmt(totalClaimed)} <span className="text-xs font-normal">ج.م</span></div>
      </div>
      <div className="p-3">
        <div className="text-xs text-muted-foreground mb-1">المقبول</div>
        <div className="font-bold text-sm text-green-700">{fmt(totalApproved)} <span className="text-xs font-normal">ج.م</span></div>
      </div>
      <div className="p-3">
        <div className="text-xs text-muted-foreground mb-1">المرفوض</div>
        <div className="font-bold text-sm text-red-600">{fmt(totalRejected)} <span className="text-xs font-normal">ج.م</span></div>
      </div>
      {hasSettlement && (
        <>
          <div className="p-3">
            <div className="text-xs text-muted-foreground mb-1">المُسوَّى</div>
            <div className="font-bold text-sm text-blue-700">{fmt(totalSettled)} <span className="text-xs font-normal">ج.م</span></div>
          </div>
          <div className="p-3">
            <div className="text-xs text-muted-foreground mb-1">المتبقي</div>
            <div className={`font-bold text-sm ${parseFloat(String(totalOutstanding ?? "0")) > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
              {fmt(totalOutstanding)} <span className="text-xs font-normal">ج.م</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
