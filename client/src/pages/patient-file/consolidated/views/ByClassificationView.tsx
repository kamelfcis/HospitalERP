import { memo } from "react";
import { Tag } from "lucide-react";
import { fmtMoney, LINE_TYPE_LABELS } from "../../shared/formatters";
import type { ClassificationGroup } from "../../shared/types";

const CLASS_COLORS: Record<string, string> = {
  service:    "text-blue-500",
  drug:       "text-green-600",
  consumable: "text-amber-600",
  equipment:  "text-purple-600",
};

interface Props {
  classifications: ClassificationGroup[];
  showPaid: boolean;
}

const ClassRow = memo(function ClassRow({ cls, showPaid }: { cls: ClassificationGroup; showPaid: boolean }) {
  const hasBalance = cls.remaining > 0.01;
  const color = CLASS_COLORS[cls.lineType] ?? "text-gray-600";
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-class-${cls.lineType}`}>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <Tag className={`h-4 w-4 shrink-0 ${color}`} />
          <span className="font-medium text-sm">{LINE_TYPE_LABELS[cls.lineType] ?? cls.lineTypeLabel}</span>
        </div>
      </td>
      <td className="p-3 text-center text-sm">{cls.lineCount}</td>
      <td className="p-3 text-center font-mono text-sm">{fmtMoney(cls.totalAmount)}</td>
      <td className="p-3 text-center font-mono text-sm text-purple-600">
        {cls.discountAmount > 0 ? `(${fmtMoney(cls.discountAmount)})` : "—"}
      </td>
      <td className="p-3 text-center font-mono text-sm font-semibold">{fmtMoney(cls.netAmount)}</td>
      {showPaid && (
        <>
          <td className="p-3 text-center font-mono text-sm text-green-600">{fmtMoney(cls.paidAmount)}</td>
          <td className={`p-3 text-center font-mono text-sm font-semibold ${hasBalance ? "text-red-600" : "text-green-600"}`}>
            {fmtMoney(cls.remaining)}
          </td>
        </>
      )}
    </tr>
  );
});

export const ByClassificationView = memo(function ByClassificationView({ classifications, showPaid }: Props) {
  if (classifications.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">لا توجد بنود</div>;
  }

  const totalNet  = classifications.reduce((s, c) => s + c.netAmount, 0);
  const totalPaid = classifications.reduce((s, c) => s + c.paidAmount, 0);
  const totalRem  = classifications.reduce((s, c) => s + c.remaining, 0);

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm" dir="rtl">
        <thead>
          <tr className="bg-muted/50 text-xs text-muted-foreground border-b">
            <th className="p-3 text-right">التصنيف</th>
            <th className="p-3 text-center">البنود</th>
            <th className="p-3 text-center">الإجمالي</th>
            <th className="p-3 text-center">الخصم</th>
            <th className="p-3 text-center">الصافي</th>
            {showPaid && <><th className="p-3 text-center">المدفوع</th><th className="p-3 text-center">المتبقي</th></>}
          </tr>
        </thead>
        <tbody>
          {classifications.map(c => <ClassRow key={c.lineType} cls={c} showPaid={showPaid} />)}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 font-semibold text-sm border-t-2">
            <td className="p-3" colSpan={2}>الإجمالي</td>
            <td className="p-3 text-center font-mono">{fmtMoney(classifications.reduce((s,c)=>s+c.totalAmount,0))}</td>
            <td className="p-3 text-center font-mono text-purple-600">({fmtMoney(classifications.reduce((s,c)=>s+c.discountAmount,0))})</td>
            <td className="p-3 text-center font-mono">{fmtMoney(totalNet)}</td>
            {showPaid && (
              <>
                <td className="p-3 text-center font-mono text-green-600">{fmtMoney(totalPaid)}</td>
                <td className={`p-3 text-center font-mono ${totalRem > 0.01 ? "text-red-600" : "text-green-600"}`}>{fmtMoney(totalRem)}</td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
});
