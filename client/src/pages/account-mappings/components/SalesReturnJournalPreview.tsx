/**
 * SalesReturnJournalPreview
 *
 * يعرض هيكل القيد المتوقع لمردود المبيعات.
 *
 * reverse_original (الافتراضي): النظام يعكس نفس حسابات فاتورة البيع تلقائياً —
 *   يعرض الحسابات الفعلية من ربط sales_invoice مع توضيح الدور المعكوس.
 *
 * separate_accounts: يستخدم ربط sales_return المنفصل (إن وُجد).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, BookOpen, Banknote, AlertCircle, Info } from "lucide-react";
import { mappingLineTypeLabels } from "@shared/schema";
import type { MappingRow } from "../types";

interface Props {
  rows:        MappingRow[];
  returnsMode?: string;
  siRows?:     MappingRow[];
}

interface JournalLine {
  side:    "debit" | "credit";
  label:   string;
  account: string;
  note?:   string;
}

function AccountTag({ name }: { name: string }) {
  return (
    <span className="inline-block bg-primary/10 text-primary text-xs px-2 py-0.5 rounded font-mono">
      {name}
    </span>
  );
}

function LineRow({ side, label, account, note }: JournalLine) {
  const isDebit = side === "debit";
  return (
    <div className={`flex items-center gap-3 py-1.5 border-b last:border-0 text-sm ${isDebit ? "" : "pr-6"}`}>
      <Badge
        variant={isDebit ? "default" : "outline"}
        className={`w-14 justify-center text-xs shrink-0 ${
          isDebit ? "bg-blue-600 hover:bg-blue-600" : "border-orange-400 text-orange-600"
        }`}
      >
        {isDebit ? "مدين" : "دائن"}
      </Badge>
      <span className="text-muted-foreground min-w-[130px]">{label}</span>
      {account ? (
        <AccountTag name={account} />
      ) : (
        <span className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          غير مُعرَّف
        </span>
      )}
      {note && <span className="text-xs text-muted-foreground mr-auto">{note}</span>}
    </div>
  );
}

function Phase({
  phase, icon: Icon, title, subtitle, lines,
}: {
  phase:    string;
  icon:     React.ElementType;
  title:    string;
  subtitle: string;
  lines:    JournalLine[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">{phase}</span>
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-muted-foreground">— {subtitle}</span>
      </div>
      <div className="border rounded-lg divide-y bg-muted/20 px-3">
        {lines.map((l, i) => (
          <LineRow key={i} {...l} />
        ))}
      </div>
    </div>
  );
}

export function SalesReturnJournalPreview({ rows, returnsMode = "reverse_original", siRows = [] }: Props) {
  const label = (lt: string) => mappingLineTypeLabels[lt] || lt;

  // ── وضع عكس الأصل: نستخدم حسابات sales_invoice معكوسة ──────────────
  if (returnsMode === "reverse_original") {
    const si = (lt: string) => siRows.find(r => r.lineType === lt);

    // الحسابات الفعلية المستخدمة في القيد (من sales_invoice، معكوسة الأدوار)
    const receivablesAcc  = si("receivables")?.debitAccountId   || "";  // مدين في البيع → دائن في المرتجع
    const revDrugsAcc     = si("revenue_drugs")?.creditAccountId || si("revenue_general")?.creditAccountId || "";
    const revSuppAcc      = si("revenue_consumables")?.creditAccountId || si("revenue_general")?.creditAccountId || "";
    const cogsDrugsAcc    = si("cogs_drugs")?.debitAccountId     || "";
    const cogsSupplAcc    = si("cogs_supplies")?.debitAccountId  || si("cogs_drugs")?.debitAccountId || "";
    const inventoryAcc    = "(GL المخزن — من الحساب الافتراضي للمخزن)";

    const hasSiData = siRows.length > 0;

    const phase1Lines: JournalLine[] = [
      { side: "debit",  label: label("revenue_drugs"),       account: revDrugsAcc,    note: "عكس إيراد أدوية (= Cr في البيع)" },
      { side: "debit",  label: label("revenue_consumables"), account: revSuppAcc,     note: "عكس إيراد مستلزمات" },
      { side: "debit",  label: label("inventory"),           account: inventoryAcc,   note: "بضاعة راجعة للمخزن" },
      { side: "credit", label: label("receivables"),         account: receivablesAcc, note: "وسيط — يُستبدل بالخزنة عند الصرف" },
      { side: "credit", label: label("cogs_drugs"),          account: cogsDrugsAcc,   note: "عكس تكلفة الأدوية" },
      { side: "credit", label: label("cogs_supplies"),       account: cogsSupplAcc,   note: "عكس تكلفة المستلزمات" },
    ];

    const phase2Lines: JournalLine[] = [
      { side: "debit",  label: label("receivables"),  account: receivablesAcc,          note: "تصفية الوسيط" },
      { side: "credit", label: "خزنة (GL الوردية)",   account: "(تلقائي من الكاشير)",   note: "فلوس خارجة" },
    ];

    return (
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            معاينة بنود القيد المحاسبي — مردود المبيعات
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            يعكس النظام فاتورة البيع على مرحلتين — عند الإنشاء وعند صرف الكاشير
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pb-4">

          {/* بانر وضع عكس الأصل */}
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2.5">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">وضع عكس الأصل مُفعَّل (reverse_original)</span>
              <br />
              النظام يستخدم تلقائياً نفس حسابات <strong>فاتورة البيع</strong> مع عكس الأدوار — لا يحتاج ضبط حسابات مردود منفصلة في هذه الصفحة.
              الحسابات أدناه مُستمَدة من ربط <code className="bg-blue-100 px-1 rounded">sales_invoice</code>.
            </div>
          </div>

          {!hasSiData && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              ربط حسابات فاتورة البيع (sales_invoice) غير مُعرَّف بعد — يرجى ضبطها أولاً لتفعيل قيود المردود.
            </div>
          )}

          <Phase
            phase="م١"
            icon={BookOpen}
            title="قيد عكس البيع"
            subtitle="يُنشأ فور تسجيل المرتجع"
            lines={phase1Lines}
          />

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowLeftRight className="h-3 w-3" />
            عند صرف الكاشير: يُستبدل حساب المدينون الدائن بحساب الخزنة تلقائياً ويُرحَّل القيد
          </div>

          <Phase
            phase="م٢"
            icon={Banknote}
            title="قيد صرف الخزنة"
            subtitle="يُكتمل عند استلام الكاشير للمرتجع"
            lines={phase2Lines}
          />

          <p className="text-[11px] text-muted-foreground border-t pt-2">
            ملاحظة: سطور المخزون والخزنة تُحدد تلقائياً من حساب GL المخزن ووردية الكاشير — لا تحتاج ضبطاً يدوياً.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── وضع حسابات منفصلة: نستخدم ربط sales_return ─────────────────────
  const get = (lt: string) => rows.find(r => r.lineType === lt);

  const receivablesAcc  = get("receivables")?.creditAccountId  || "";
  const revDrugsAcc     = get("revenue_drugs")?.debitAccountId || get("revenue_general")?.debitAccountId || "";
  const revSuppAcc      = get("revenue_consumables")?.debitAccountId || get("revenue_general")?.debitAccountId || "";
  const cogsDrugsAcc    = get("cogs_drugs")?.creditAccountId   || "";
  const cogsSupplAcc    = get("cogs_supplies")?.creditAccountId || get("cogs_drugs")?.creditAccountId || "";
  const inventoryAcc    = "(GL المخزن — تلقائي)";

  const phase1Lines: JournalLine[] = [
    { side: "debit",  label: label("revenue_drugs"),       account: revDrugsAcc,    note: "عكس الإيراد" },
    { side: "debit",  label: label("revenue_consumables"), account: revSuppAcc,     note: "عكس الإيراد" },
    { side: "debit",  label: label("inventory"),           account: inventoryAcc,   note: "بضاعة راجعة" },
    { side: "credit", label: label("receivables"),         account: receivablesAcc, note: "وسيط — يُستبدل بالخزنة عند الصرف" },
    { side: "credit", label: label("cogs_drugs"),          account: cogsDrugsAcc,   note: "عكس التكلفة" },
    { side: "credit", label: label("cogs_supplies"),       account: cogsSupplAcc,   note: "عكس التكلفة" },
  ];

  const phase2Lines: JournalLine[] = [
    { side: "debit",  label: label("receivables"),  account: receivablesAcc,         note: "تصفية الوسيط" },
    { side: "credit", label: "خزنة (GL الوردية)",   account: "(تلقائي من الكاشير)",  note: "فلوس خارجة" },
  ];

  const missingRequired = !receivablesAcc;

  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          معاينة بنود القيد المحاسبي — مردود المبيعات
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          يعكس النظام فاتورة البيع على مرحلتين — عند الإنشاء وعند صرف الكاشير
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pb-4">
        {missingRequired && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            حساب المدينون غير مُعرَّف — القيد لن يُنشأ حتى يتم ضبطه أعلاه
          </div>
        )}

        <Phase
          phase="م١"
          icon={BookOpen}
          title="قيد عكس البيع"
          subtitle="يُنشأ فور تسجيل المرتجع"
          lines={phase1Lines}
        />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowLeftRight className="h-3 w-3" />
          عند صرف الكاشير: يُستبدل حساب المدينون الدائن بحساب الخزنة تلقائياً ويُرحَّل القيد
        </div>

        <Phase
          phase="م٢"
          icon={Banknote}
          title="قيد صرف الخزنة"
          subtitle="يُكتمل عند استلام الكاشير للمرتجع"
          lines={phase2Lines}
        />

        <p className="text-[11px] text-muted-foreground border-t pt-2">
          ملاحظة: سطور المخزون والخزنة تُحدد تلقائياً من حساب GL المخزن ووردية الكاشير — لا تحتاج ضبطاً يدوياً.
        </p>
      </CardContent>
    </Card>
  );
}
