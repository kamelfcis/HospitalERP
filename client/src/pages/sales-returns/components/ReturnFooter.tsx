// ============================================================
//  ReturnFooter — الجزء السفلي: ملاحظات + الإجماليات + زر التسجيل
//  دمجنا ReturnTotals وزر الإرسال في مكوّن واحد متماسك
// ============================================================
import { Undo2, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  // الإجماليات
  subtotal: number;
  computedDiscount: number;
  netTotal: number;
  // الخصم
  discountType: "percent" | "value";
  setDiscountType: (t: "percent" | "value") => void;
  discountPercent: string;
  setDiscountPercent: (v: string) => void;
  discountValue: string;
  setDiscountValue: (v: string) => void;
  /** هل الخصم تم تعبئته تلقائياً من الفاتورة الأصلية؟ */
  discountAutoApplied?: boolean;
  // الملاحظات
  notes: string;
  setNotes: (v: string) => void;
  // زر التسجيل
  onSubmit: () => void;
  isSubmitting: boolean;
  canSubmit: boolean;
}

// ============================================================
export function ReturnFooter({
  subtotal, computedDiscount, netTotal,
  discountType, setDiscountType,
  discountPercent, setDiscountPercent,
  discountValue, setDiscountValue,
  discountAutoApplied,
  notes, setNotes,
  onSubmit, isSubmitting, canSubmit,
}: Props) {
  return (
    <div className="space-y-3" dir="rtl" data-testid="section-footer">

      {/* ── الصف الأول: ملاحظات + إجماليات ── */}
      <div className="flex flex-col md:flex-row gap-4 items-start">

        {/* ملاحظات */}
        <div className="flex-1">
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">ملاحظات</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border rounded px-3 py-2 text-sm bg-background text-foreground resize-none"
            placeholder="سبب الإرجاع أو ملاحظات أخرى..."
            data-testid="textarea-notes"
          />
        </div>

        {/* بطاقة الإجماليات */}
        <TotalsCard
          subtotal={subtotal}
          discountType={discountType}
          setDiscountType={setDiscountType}
          discountPercent={discountPercent}
          setDiscountPercent={setDiscountPercent}
          discountValue={discountValue}
          setDiscountValue={setDiscountValue}
          computedDiscount={computedDiscount}
          netTotal={netTotal}
          discountAutoApplied={discountAutoApplied}
        />
      </div>

      {/* ── زر التسجيل ── */}
      <div className="flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !canSubmit}
          className="min-w-[180px]"
          data-testid="button-submit-return"
        >
          {isSubmitting
            ? <Loader2 className="h-4 w-4 animate-spin ml-2" />
            : <Undo2 className="h-4 w-4 ml-2" />}
          تسجيل المرتجع
        </Button>
      </div>
    </div>
  );
}

// ============================================================
//  Sub-component: بطاقة الإجماليات والخصم
// ============================================================
interface TotalsCardProps {
  subtotal: number;
  computedDiscount: number;
  netTotal: number;
  discountType: "percent" | "value";
  setDiscountType: (t: "percent" | "value") => void;
  discountPercent: string;
  setDiscountPercent: (v: string) => void;
  discountValue: string;
  setDiscountValue: (v: string) => void;
  discountAutoApplied?: boolean;
}

function TotalsCard({
  subtotal, computedDiscount, netTotal,
  discountType, setDiscountType,
  discountPercent, setDiscountPercent,
  discountValue, setDiscountValue,
  discountAutoApplied,
}: TotalsCardProps) {
  return (
    <div className="w-72 space-y-2 border rounded-lg p-3 bg-muted/30">

      {/* إجمالي المرتجع */}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">إجمالي المرتجع</span>
        <span className="font-mono font-bold">{subtotal.toFixed(2)}</span>
      </div>

      {/* تنبيه: الخصم مُطبَّق تلقائياً */}
      {discountAutoApplied && computedDiscount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 rounded px-2 py-1">
          <Info className="h-3 w-3 flex-shrink-0" />
          <span>خصم الفاتورة الأصلية مُطبَّق تلقائياً — يمكنك تعديله</span>
        </div>
      )}

      {/* خصم: نوع + قيمة */}
      <div className="flex items-center gap-2">
        <select
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "percent" | "value")}
          className="h-7 text-xs border rounded px-1 bg-background text-foreground w-20"
          data-testid="select-discount-type"
        >
          <option value="percent">نسبة %</option>
          <option value="value">قيمة</option>
        </select>

        {discountType === "percent" ? (
          <Input
            type="number" min="0" max="100" step="0.01"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            className="h-7 text-center text-xs flex-1"
            data-testid="input-discount-percent"
          />
        ) : (
          <Input
            type="number" min="0" step="0.01"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className="h-7 text-center text-xs flex-1"
            data-testid="input-discount-value"
          />
        )}
      </div>

      {/* قيمة الخصم (تظهر فقط لو في خصم) */}
      {computedDiscount > 0 && (
        <div className="flex justify-between text-sm text-orange-600">
          <span>الخصم</span>
          <span className="font-mono">-{computedDiscount.toFixed(2)}</span>
        </div>
      )}

      {/* صافي المرتجع */}
      <div className="border-t pt-2 flex justify-between text-base font-bold">
        <span>صافي المرتجع</span>
        <span className="font-mono text-green-700 dark:text-green-400">{netTotal.toFixed(2)} ج.م</span>
      </div>
    </div>
  );
}
