import { formatCurrency } from "@/lib/formatters";

interface Totals {
  totalAmount: number;
  discountAmount: number;
  headerDiscountPercent?: number;
  headerDiscountAmount?: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
  companyShareTotal?: number;
  patientShareTotal?: number;
  doctorCostTotal?: number;
}

interface TotalsSummaryCardProps {
  totals: Totals;
  patientType?: string;
}

export function TotalsSummaryCard({ totals, patientType }: TotalsSummaryCardProps) {
  const hda = totals.headerDiscountAmount ?? 0;
  const hdp = totals.headerDiscountPercent ?? 0;
  const isContract = patientType === "contract" || patientType === "insurance";
  const companyShare = totals.companyShareTotal ?? 0;
  const patientShare = totals.patientShareTotal ?? 0;
  const doctorCost = totals.doctorCostTotal ?? 0;

  return (
    <div className="flex flex-row-reverse flex-wrap items-center gap-3 text-sm flex-1">
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">الإجمالي:</span>
        <span className="font-bold text-xs" data-testid="text-footer-total">{formatCurrency(totals.totalAmount)}</span>
      </div>
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">خصم السطور:</span>
        <span className="font-bold text-xs" data-testid="text-footer-discount">{formatCurrency(totals.discountAmount)}</span>
      </div>
      {hda > 0 && (
        <div className="flex flex-row-reverse items-center gap-1">
          <span className="text-muted-foreground text-xs">
            خصم الفاتورة{hdp > 0 ? ` (${hdp}%)` : ""}:
          </span>
          <span
            className="font-bold text-xs text-orange-600 dark:text-orange-400"
            data-testid="text-footer-header-discount"
          >
            {formatCurrency(hda)}
          </span>
        </div>
      )}
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">الصافي:</span>
        <span className="font-bold text-xs" data-testid="text-footer-net">{formatCurrency(totals.netAmount)}</span>
      </div>
      {isContract && companyShare > 0 && (
        <>
          <div className="flex flex-row-reverse items-center gap-1">
            <span className="text-muted-foreground text-xs">حصة الشركة:</span>
            <span className="font-bold text-xs text-blue-600 dark:text-blue-400" data-testid="text-footer-company-share">
              {formatCurrency(companyShare)}
            </span>
          </div>
          <div className="flex flex-row-reverse items-center gap-1">
            <span className="text-muted-foreground text-xs">على المريض:</span>
            <span className="font-bold text-xs text-amber-600 dark:text-amber-400" data-testid="text-footer-patient-share">
              {formatCurrency(patientShare)}
            </span>
          </div>
        </>
      )}
      {doctorCost > 0 && (
        <div className="flex flex-row-reverse items-center gap-1">
          <span className="text-muted-foreground text-xs">أجر أطباء:</span>
          <span className="font-bold text-xs text-rose-600 dark:text-rose-400" data-testid="text-footer-doctor-cost">
            {formatCurrency(doctorCost)}
          </span>
        </div>
      )}
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">المدفوع:</span>
        <span className="font-bold text-xs" data-testid="text-footer-paid">{formatCurrency(totals.paidAmount)}</span>
      </div>
      <div className="flex flex-row-reverse items-center gap-1">
        <span className="text-muted-foreground text-xs">المتبقي:</span>
        <span
          className={`font-bold text-xs ${totals.remaining > 0 ? "text-destructive" : ""}`}
          data-testid="text-footer-remaining"
        >
          {formatCurrency(totals.remaining)}
        </span>
      </div>
    </div>
  );
}
