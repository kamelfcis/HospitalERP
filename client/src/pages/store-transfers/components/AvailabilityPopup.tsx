import { Loader2, Package } from "lucide-react";

interface Props {
  availPopupItemId: string | null;
  availPopupPosition: { top: number; left: number } | null;
  availPopupLoading: boolean;
  availPopupData: any[] | null;
  onClose: () => void;
}

export function AvailabilityPopup({
  availPopupItemId,
  availPopupPosition,
  availPopupLoading,
  availPopupData,
  onClose,
}: Props) {
  if (!availPopupItemId || !availPopupPosition) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />
      <div
        className="fixed z-50 bg-popover border rounded-md shadow-lg p-3 min-w-[220px] max-w-[320px]"
        style={{ top: availPopupPosition.top, left: availPopupPosition.left }}
        dir="rtl"
        data-testid="popup-availability"
      >
        <div className="flex items-center gap-1 mb-2 text-[11px] font-semibold border-b pb-1">
          <Package className="h-3 w-3" />
          <span>تواجد الصنف - إحصائي</span>
        </div>
        {availPopupLoading ? (
          <div className="flex items-center gap-2 py-2 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>جاري التحميل...</span>
          </div>
        ) : availPopupData && availPopupData.length > 0 ? (
          <div className="space-y-1">
            {availPopupData.map((row: any, i: number) => {
              const minorQty = parseFloat(row.qtyMinor);
              const factor = row.majorToMinor ? parseFloat(row.majorToMinor) : 0;
              const majorQty = factor > 0 ? Math.floor(minorQty / factor) : minorQty;
              const unitLabel = row.majorUnitName || "وحدة";
              return (
                <div key={i} className="flex items-center justify-between text-[10px] py-0.5">
                  <span className="text-foreground">{row.warehouseNameAr}</span>
                  <span className="font-mono text-foreground font-medium">
                    {majorQty} {unitLabel}
                  </span>
                </div>
              );
            })}
            <div className="border-t pt-1 mt-1 text-[9px] text-muted-foreground text-center">
              الوحدة: {availPopupData[0]?.majorUnitName || "وحدة"} | إرشادي فقط
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground py-2 text-center">لا يوجد رصيد</div>
        )}
      </div>
    </>
  );
}
