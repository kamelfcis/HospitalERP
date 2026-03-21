// ============================================================
//  InvoiceWorkArea — منطقة العمل لتاب واحد (مبيعات أو مرتجعات)
//
//  compound component يجمع:
//    ┌── InvoiceTable     ── قائمة + بحث + اختيار ─┐
//    │                                               │ flex row-reverse
//    └── InvoiceDetailsPanel ── التفاصيل جانباً ───┘
//    └── ActionBar ─── زر التحصيل/الصرف + اختصار ───
//
//  📌 لماذا compound؟ تاب المبيعات وتاب المرتجعات كانا
//     كوداً متطابقاً تقريباً — هذا يلغي التكرار بالكامل.
// ============================================================
import { ReactNode } from "react";
import { Search, Warehouse } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salesInvoiceStatusLabels } from "@shared/schema";
import { formatNumber, formatDateShort, formatDateTime } from "@/lib/formatters";
import type { PendingInvoice, InvoiceDetails, SelectionAggregated } from "../types";

// ── ألوان حالة الفاتورة ──────────────────────────────────────
const STATUS_CLASS: Record<string, string> = {
  finalized: "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate",
  collected: "bg-blue-600  text-white no-default-hover-elevate no-default-active-elevate",
  cancelled: "bg-red-600   text-white no-default-hover-elevate no-default-active-elevate",
  draft:     "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate",
};

// ============================================================
//  Props للـ InvoiceWorkArea الرئيسي
// ============================================================
interface InvoiceWorkAreaProps {
  /** قائمة الفواتير (مفلترة بالفعل أو غير مفلترة) */
  invoices: PendingInvoice[];
  /** هل يتم تحميل البيانات؟ */
  loading: boolean;
  /** نص البحث */
  search: string;
  setSearch: (v: string) => void;
  /** حالة الاختيار */
  selected: Set<string>;
  toggleOne: (id: string) => void;
  toggleAll: () => void;
  /** معرّف الوحدة الحالية (للتمييز بين الفواتير الخارجية) */
  shiftUnitId: string;
  /** تفاصيل الفاتورة (عند اختيار واحدة) */
  details: InvoiceDetails | undefined;
  detailsLoading: boolean;
  /** إجمالي اختيار متعدد */
  aggregated: SelectionAggregated | null;
  /** شريط الأحداث: زر الإجراء + نص المبلغ + اختصار */
  actionBar: ReactNode;
  /** بادئة testid لتمييز تاب المبيعات عن تاب المرتجعات */
  testPrefix: "sales" | "returns";
}

export function InvoiceWorkArea({
  invoices, loading, search, setSearch,
  selected, toggleOne, toggleAll,
  shiftUnitId,
  details, detailsLoading, aggregated,
  actionBar,
  testPrefix,
}: InvoiceWorkAreaProps) {
  return (
    <div className="flex flex-row-reverse gap-3 overflow-hidden">

      {/* ── عمود القائمة (60%) ── */}
      <div className="w-[60%] min-w-0 overflow-hidden space-y-2">
        <InvoiceTable
          invoices={invoices}
          loading={loading}
          search={search}
          setSearch={setSearch}
          selected={selected}
          toggleOne={toggleOne}
          toggleAll={toggleAll}
          shiftUnitId={shiftUnitId}
          testPrefix={testPrefix}
        />
        {/* شريط الإجراء: يمرّره الـ parent (زر تحصيل أو صرف) */}
        <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
          {actionBar}
        </div>
      </div>

      {/* ── عمود التفاصيل (40%) ── */}
      <div className="w-[40%] min-w-0">
        <InvoiceDetailsPanel
          selected={selected}
          details={details}
          detailsLoading={detailsLoading}
          aggregated={aggregated}
          testPrefix={testPrefix}
        />
      </div>
    </div>
  );
}

// ============================================================
//  جدول الفواتير
// ============================================================
interface InvoiceTableProps {
  invoices: PendingInvoice[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  selected: Set<string>;
  toggleOne: (id: string) => void;
  toggleAll: () => void;
  shiftUnitId: string;
  testPrefix: string;
}

function InvoiceTable({
  invoices, loading, search, setSearch,
  selected, toggleOne, toggleAll,
  shiftUnitId, testPrefix,
}: InvoiceTableProps) {
  const allChecked = invoices.length > 0 && selected.size === invoices.length;

  return (
    <div className="space-y-2">
      {/* حقل البحث */}
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث برقم الفاتورة أو اسم العميل..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-8 text-right"
          data-testid={`input-${testPrefix}-search`}
        />
      </div>

      {/* جدول أو skeleton */}
      {loading ? (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table dir="rtl" className="text-xs">
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-right w-8 py-1 px-2">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleAll}
                    data-testid={`checkbox-${testPrefix}-select-all`}
                  />
                </TableHead>
                <TableHead className="text-right py-1 px-2">رقم الفاتورة</TableHead>
                <TableHead className="text-right py-1 px-2">الإجمالي</TableHead>
                <TableHead className="text-right py-1 px-2">الصافي</TableHead>
                <TableHead className="text-right py-1 px-2">بواسطة</TableHead>
                <TableHead className="text-right py-1 px-2">التاريخ</TableHead>
                <TableHead className="text-right py-1 px-2">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-xs">
                    لا توجد فواتير معلّقة
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    isSelected={selected.has(inv.id)}
                    shiftUnitId={shiftUnitId}
                    onToggle={() => toggleOne(inv.id)}
                    testPrefix={testPrefix}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── صف واحد في الجدول ────────────────────────────────────────
function InvoiceRow({
  inv, isSelected, shiftUnitId, onToggle, testPrefix,
}: {
  inv: PendingInvoice;
  isSelected: boolean;
  shiftUnitId: string;
  onToggle: () => void;
  testPrefix: string;
}) {
  const isExternal = !inv.warehousePharmacyId || inv.warehousePharmacyId !== shiftUnitId;

  return (
    <TableRow
      className={`h-7 cursor-pointer ${
        isSelected ? "bg-muted"
        : isExternal ? "bg-amber-50 dark:bg-amber-950/30"
        : ""
      }`}
      onClick={onToggle}
      data-testid={`row-${testPrefix}-${inv.id}`}
    >
      <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggle}
          data-testid={`checkbox-${testPrefix}-${inv.id}`}
        />
      </TableCell>
      <TableCell className="text-right font-medium py-1 px-2">
        <span className="flex items-center gap-1 justify-end flex-wrap">
          {inv.invoiceNumber}
          {isExternal && inv.warehouseName && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 no-default-hover-elevate no-default-active-elevate"
            >
              <Warehouse className="h-2.5 w-2.5 ml-0.5" />
              {inv.warehouseName}
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className="text-right py-1 px-2">{formatNumber(inv.subtotal)}</TableCell>
      <TableCell className="text-right font-medium py-1 px-2">{formatNumber(inv.netTotal)}</TableCell>
      <TableCell className="text-right py-1 px-2 text-muted-foreground">{inv.pharmacistName || inv.createdBy || "—"}</TableCell>
      <TableCell className="text-right py-1 px-2">{formatDateShort(inv.createdAt)}</TableCell>
      <TableCell className="text-right py-1 px-2">
        <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_CLASS[inv.status] || ""}`}>
          {salesInvoiceStatusLabels[inv.status] || inv.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

// ============================================================
//  لوحة تفاصيل الفاتورة (يمين)
// ============================================================
interface InvoiceDetailsPanelProps {
  selected: Set<string>;
  details: InvoiceDetails | undefined;
  detailsLoading: boolean;
  aggregated: SelectionAggregated | null;
  testPrefix: string;
}

function InvoiceDetailsPanel({
  selected, details, detailsLoading, aggregated, testPrefix,
}: InvoiceDetailsPanelProps) {
  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs">تفاصيل الفاتورة</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {/* لا يوجد اختيار */}
        {selected.size === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            اختر فاتورة لعرض التفاصيل
          </p>
        )}

        {/* اختيار واحد — جاري التحميل */}
        {selected.size === 1 && detailsLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* اختيار واحد — البيانات جاهزة */}
        {selected.size === 1 && !detailsLoading && details && (
          <SingleInvoiceDetails details={details} testPrefix={testPrefix} />
        )}

        {/* اختيار متعدد — الإجماليات */}
        {selected.size > 1 && aggregated && (
          <MultiSelectionSummary aggregated={aggregated} testPrefix={testPrefix} />
        )}
      </CardContent>
    </Card>
  );
}

// ── تفاصيل فاتورة واحدة ──────────────────────────────────────
function SingleInvoiceDetails({
  details, testPrefix,
}: {
  details: InvoiceDetails;
  testPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs" dir="rtl">
        <span className="text-muted-foreground">رقم الفاتورة:</span>
        <span data-testid={`text-${testPrefix}-detail-number`}>{details.invoiceNumber}</span>
        <span className="text-muted-foreground">الإجمالي:</span>
        <span>{formatNumber(details.subtotal)}</span>
        <span className="text-muted-foreground">الصافي:</span>
        <span className="font-medium">{formatNumber(details.netTotal)}</span>
        <span className="text-muted-foreground">الصيدلي:</span>
        <span data-testid={`text-${testPrefix}-detail-pharmacist`}>{details.pharmacistName || details.createdBy || "—"}</span>
        <span className="text-muted-foreground">التاريخ والوقت:</span>
        <span data-testid={`text-${testPrefix}-detail-datetime`}>{details.invoiceDateTime ? formatDateTime(details.invoiceDateTime) : formatDateShort(details.createdAt)}</span>
      </div>

      {details.lines?.length > 0 && (
        <div className="border rounded-md overflow-auto">
          <Table dir="rtl" className="text-[11px]">
            <TableHeader>
              <TableRow className="h-7">
                <TableHead className="text-right py-1 px-1.5">#</TableHead>
                <TableHead className="text-right py-1 px-1.5">الكود</TableHead>
                <TableHead className="text-right py-1 px-1.5">الصنف</TableHead>
                <TableHead className="text-right py-1 px-1.5">الكمية</TableHead>
                <TableHead className="text-right py-1 px-1.5">السعر</TableHead>
                <TableHead className="text-right py-1 px-1.5">الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details.lines.map((line, idx) => (
                <TableRow key={line.id} className="h-6" data-testid={`row-${testPrefix}-detail-line-${idx}`}>
                  <TableCell className="text-right py-0.5 px-1.5">{line.lineNo || idx + 1}</TableCell>
                  <TableCell className="text-right py-0.5 px-1.5">{line.itemCode}</TableCell>
                  <TableCell className="text-right py-0.5 px-1.5">{line.itemName}</TableCell>
                  <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.qty)}</TableCell>
                  <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.salePrice)}</TableCell>
                  <TableCell className="text-right py-0.5 px-1.5">{formatNumber(line.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── ملخص اختيار متعدد ────────────────────────────────────────
function MultiSelectionSummary({
  aggregated, testPrefix,
}: {
  aggregated: SelectionAggregated;
  testPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs" dir="rtl">
      <span className="text-muted-foreground">عدد الفواتير:</span>
      <span className="font-medium" data-testid={`text-${testPrefix}-agg-count`}>
        {aggregated.count}
      </span>
      <span className="text-muted-foreground">إجمالي قبل الخصم:</span>
      <span>{formatNumber(aggregated.subtotal)}</span>
      <span className="text-muted-foreground">الصافي الكلي:</span>
      <span className="font-medium">{formatNumber(aggregated.netTotal)}</span>
    </div>
  );
}
