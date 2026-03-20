import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AccountLookup } from "@/components/lookups/AccountLookup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Settings, Save, Loader2, Plus, Trash2,
  CheckCircle2, AlertCircle, AlertTriangle, Info, Building2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  transactionTypeLabels,
  mappingLineTypeLabels,
  type AccountMapping,
  type Warehouse,
} from "@shared/schema";

// ─── Line type specification ──────────────────────────────────────────────────
// required: true       → blocks posting if missing (no exception)
// required: "cond"     → only required when its business condition is met
// debitSide / creditSide: which account field the posting logic actually reads
// For purchase_invoice, each line type maps only ONE side.
// For all other transaction types (generic path), BOTH sides are read.
interface LineTypeSpec {
  required: true | "cond";
  condition?: string;
  debitSide: boolean;
  creditSide: boolean;
}

const lineTypeSpecs: Record<string, Record<string, LineTypeSpec>> = {
  purchase_invoice: {
    inventory:            { required: true,   debitSide: true,  creditSide: false },
    vat_input:            { required: "cond", condition: "عند وجود ضريبة",         debitSide: true,  creditSide: false },
    discount_earned:      { required: "cond", condition: "عند وجود خصم رأسي",      debitSide: false, creditSide: true  },
    payables_drugs:       { required: "cond", condition: "لموردي الأدوية",          debitSide: false, creditSide: true  },
    payables_consumables: { required: "cond", condition: "لموردي المستلزمات",       debitSide: false, creditSide: true  },
  },
  sales_invoice: {
    revenue_drugs:       { required: true,   debitSide: true, creditSide: true },
    revenue_consumables: { required: true,   debitSide: true, creditSide: true },
    revenue_general:     { required: "cond", condition: "للبنود العامة",            debitSide: true, creditSide: true },
    cogs_drugs:          { required: "cond", condition: "عند احتساب التكلفة",       debitSide: true, creditSide: true },
    cogs_supplies:       { required: "cond", condition: "عند احتساب التكلفة",       debitSide: true, creditSide: true },
    discount_allowed:    { required: "cond", condition: "عند وجود خصم",             debitSide: true, creditSide: true },
    vat_output:          { required: "cond", condition: "عند وجود ضريبة",           debitSide: true, creditSide: true },
    returns:             { required: "cond", condition: "عند وجود مرتجع",           debitSide: true, creditSide: true },
  },
  patient_invoice: {
    cash:              { required: "cond", condition: "للمرضى النقديين",            debitSide: true, creditSide: true },
    receivables:       { required: "cond", condition: "للمرضى الآجلين",             debitSide: true, creditSide: true },
    revenue_services:  { required: "cond", condition: "عند وجود خدمات",            debitSide: true, creditSide: true },
    revenue_drugs:     { required: "cond", condition: "عند وجود أدوية",             debitSide: true, creditSide: true },
    revenue_consumables: { required: "cond", condition: "عند وجود مستلزمات",        debitSide: true, creditSide: true },
    revenue_equipment: { required: "cond", condition: "عند وجود معدات",             debitSide: true, creditSide: true },
  },
  receiving: {
    inventory: { required: true,   debitSide: true, creditSide: true },
    payables:  { required: true,   debitSide: true, creditSide: true },
  },
  cashier_collection: {
    cash: {
      required: true,
      condition: "مدين = الخزنة / دائن = مقاصة المدينين — يفعّل قيد التحصيل المستقل",
      debitSide: true, creditSide: true,
    },
  },
  cashier_refund: {
    cash:          { required: true,   debitSide: true, creditSide: true },
    returns:       { required: "cond", condition: "عند وجود مرتجع",                 debitSide: true, creditSide: true },
    revenue_drugs: { required: "cond", condition: "عند وجود أدوية",                 debitSide: true, creditSide: true },
    inventory:     { required: "cond", condition: "عند استعادة مخزون",              debitSide: true, creditSide: true },
  },
  warehouse_transfer: {
    inventory: { required: true, debitSide: true, creditSide: true },
  },
  doctor_payable_settlement: {
    doctor_payable:   { required: true,   debitSide: true, creditSide: true },
    cash:             { required: "cond", condition: "عند الدفع نقداً",        debitSide: true, creditSide: true },
    receivable_clear: { required: "cond", condition: "لتصفية الذمم",            debitSide: true, creditSide: true },
  },
};

const suggestedLineTypes: Record<string, string[]> = {
  sales_invoice:       ["revenue_drugs", "revenue_consumables", "revenue_general", "cogs_drugs", "cogs_supplies", "discount_allowed", "vat_output", "returns"],
  patient_invoice:     ["cash", "receivables", "revenue_services", "revenue_drugs", "revenue_consumables", "revenue_equipment"],
  receiving:           ["inventory", "payables"],
  purchase_invoice:    ["inventory", "vat_input", "discount_earned", "payables_drugs", "payables_consumables"],
  cashier_collection:  ["cash"],
  cashier_refund:      ["cash", "returns", "revenue_drugs", "inventory"],
  warehouse_transfer:        ["inventory"],
  doctor_payable_settlement: ["doctor_payable", "cash", "receivable_clear"],
};

const transactionTypes = Object.keys(transactionTypeLabels);
const allLineTypeOptions = Object.entries(mappingLineTypeLabels);

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface MappingRow {
  key: string;
  lineType: string;
  debitAccountId: string;
  creditAccountId: string;
  source: "warehouse" | "generic" | "new";
}

function isRowComplete(row: MappingRow, spec: LineTypeSpec | undefined): boolean {
  if (!spec) return !!(row.debitAccountId && row.creditAccountId);
  const needsDebit  = spec.debitSide  ? !!row.debitAccountId  : true;
  const needsCredit = spec.creditSide ? !!row.creditAccountId : true;
  return needsDebit && needsCredit;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccountMappings() {
  const { toast } = useToast();
  const [selectedTxType, setSelectedTxType]     = useState<string>(transactionTypes[0]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("__generic__");
  const [rows, setRows]         = useState<MappingRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const keyCounter = useRef(0);

  const { data: warehouses } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });

  const { data: mappings, isLoading: mappingsLoading } = useQuery<AccountMapping[]>({
    queryKey: ["/api/account-mappings", selectedTxType],
    queryFn: async () => {
      const res = await fetch(`/api/account-mappings?transactionType=${selectedTxType}`);
      if (!res.ok) throw new Error("فشل في تحميل الإعدادات");
      return res.json();
    },
  });

  useEffect(() => {
    if (mappingsLoading) return;
    const allMappings = mappings || [];
    const effectiveWarehouseId = selectedWarehouseId === "__generic__" ? null : selectedWarehouseId;

    const warehouseMappings = effectiveWarehouseId
      ? allMappings.filter(m => m.warehouseId === effectiveWarehouseId)
      : [];
    const genericMappings = allMappings.filter(m => !m.warehouseId);

    const coveredByWarehouse = new Set(warehouseMappings.map(m => m.lineType));

    const suggested = suggestedLineTypes[selectedTxType] || [];
    const allLineTypes = Array.from(new Set([
      ...warehouseMappings.map(m => m.lineType),
      ...genericMappings.map(m => m.lineType),
      ...suggested,
    ]));

    const newRows: MappingRow[] = allLineTypes.map(lt => {
      const warehouseRow = warehouseMappings.find(m => m.lineType === lt);
      const genericRow   = genericMappings.find(m => m.lineType === lt);
      const activeRow    = warehouseRow || genericRow;
      return {
        key:             `row-${keyCounter.current++}`,
        lineType:        lt,
        debitAccountId:  activeRow?.debitAccountId  || "",
        creditAccountId: activeRow?.creditAccountId || "",
        source: warehouseRow ? "warehouse" : genericRow ? "generic" : "new",
      };
    });

    setRows(newRows);
    setHasChanges(false);
  }, [mappings, mappingsLoading, selectedTxType, selectedWarehouseId]);

  const saveMutation = useMutation({
    mutationFn: async (data: any[]) => apiRequest("POST", "/api/account-mappings/bulk", { mappings: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account-mappings", selectedTxType] });
      toast({ title: "تم حفظ إعدادات ربط الحسابات بنجاح" });
      setHasChanges(false);
    },
    onError: (error: Error) => toast({ title: "خطأ", description: error.message, variant: "destructive" }),
  });

  const updateRow = (key: string, field: keyof MappingRow, value: string) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value, source: "new" as const } : r));
    setHasChanges(true);
  };

  const addRow = () => {
    const usedTypes = new Set(rows.map(r => r.lineType));
    const nextType  = allLineTypeOptions.find(([k]) => !usedTypes.has(k))?.[0] || "";
    setRows(prev => [...prev, { key: `row-${keyCounter.current++}`, lineType: nextType, debitAccountId: "", creditAccountId: "", source: "new" }]);
    setHasChanges(true);
  };

  const removeRow = (key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
    setHasChanges(true);
  };

  const handleSave = () => {
    const effectiveWarehouseId = selectedWarehouseId === "__generic__" ? null : (selectedWarehouseId || null);
    const validRows = rows.filter(r => r.lineType && (r.debitAccountId || r.creditAccountId));
    if (validRows.length === 0) {
      toast({ title: "لا توجد إعدادات للحفظ", variant: "destructive" });
      return;
    }
    const toSave = validRows.map(r => ({
      transactionType: selectedTxType,
      lineType:        r.lineType,
      debitAccountId:  r.debitAccountId  || null,
      creditAccountId: r.creditAccountId || null,
      warehouseId:     effectiveWarehouseId,
      isActive:        true,
    }));
    saveMutation.mutate(toSave);
  };

  const isLoading      = mappingsLoading;
  const txSpecs        = lineTypeSpecs[selectedTxType] || {};
  const usedLineTypes  = new Set(rows.map(r => r.lineType));
  const isWarehouseView = selectedWarehouseId !== "__generic__";

  // ── Status summary computation ──
  const requiredMissing   = rows.filter(r => txSpecs[r.lineType]?.required === true  && !isRowComplete(r, txSpecs[r.lineType]));
  const conditionalMissing = rows.filter(r => txSpecs[r.lineType]?.required === "cond" && !isRowComplete(r, txSpecs[r.lineType]));
  const configured        = rows.filter(r => isRowComplete(r, txSpecs[r.lineType]));
  const setupComplete     = requiredMissing.length === 0;

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">ربط الحسابات بالعمليات</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={addRow} data-testid="button-add-row">
            <Plus className="h-4 w-4" /><span className="mr-1">إضافة سطر</span>
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending} data-testid="button-save-mappings">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="mr-1">حفظ</span>
          </Button>
        </div>
      </div>

      {/* ── Selectors ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <CardTitle className="text-base">نوع العملية</CardTitle>
            <Select value={selectedTxType} onValueChange={v => { setSelectedTxType(v); }}>
              <SelectTrigger className="w-[250px]" data-testid="select-transaction-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {transactionTypes.map(t => (
                  <SelectItem key={t} value={t} data-testid={`option-tx-type-${t}`}>
                    {transactionTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">المستودع</span>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger className="w-[220px]" data-testid="select-warehouse-filter">
                  <SelectValue placeholder="عام (لجميع المستودعات)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__generic__" data-testid="option-warehouse-generic">عام (لجميع المستودعات)</SelectItem>
                  {(warehouses || []).map(w => (
                    <SelectItem key={w.id} value={w.id} data-testid={`option-warehouse-${w.id}`}>{w.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        {/* ── Notice: warehouse_transfer uses glAccountId on warehouse, not account_mappings ── */}
        {selectedTxType === "warehouse_transfer" && !isLoading && (
          <div className="mx-6 mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-2 text-sm" data-testid="notice-warehouse-transfer">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-blue-800">
              <span className="font-semibold block">التحويلات المخزنية — آلية ربط خاصة</span>
              <span className="text-xs leading-relaxed">
                حساب المخزون لكل مستودع يُحدَّد مباشرةً في{" "}
                <strong>إعدادات المستودع → حقل "حساب المخزون"</strong>
                {" "}— ولا يمر عبر جدول ربط الحسابات هنا.
                <br />
                <strong>سياسة التحكم المحاسبي:</strong>
                <ul className="mt-1 space-y-0.5 list-none">
                  <li>• كلا المستودعين <strong>بدون</strong> حساب GL → التحويل يكتمل بدون قيد (مقبول)</li>
                  <li>• أحدهما فقط له حساب GL → <strong className="text-red-700">يُوقَف الترحيل</strong> (إعداد ناقص)</li>
                  <li>• كلاهما له حساب GL → قيد إلزامي — <strong className="text-red-700">يُوقَف إذا لا توجد فترة مفتوحة</strong></li>
                </ul>
                القيد: <strong>مدين ← مخزن الوجهة</strong> / <strong>دائن ← مخزن المصدر</strong> بقيمة تكلفة الدفعات.
              </span>
            </div>
          </div>
        )}

        {/* ── Status bar ── */}
        {!isLoading && selectedTxType !== "warehouse_transfer" && (
          <div className={`mx-6 mb-4 rounded-lg border p-3 flex flex-wrap items-center gap-3 text-sm ${setupComplete ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`} data-testid="status-bar">
            {setupComplete ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <span className={`font-medium ${setupComplete ? "text-green-700" : "text-amber-700"}`}>
              {setupComplete ? "الإعداد مكتمل للسطور الإلزامية" : `${requiredMissing.length} سطر إلزامي غير مكتمل`}
            </span>
            <span className="text-muted-foreground text-xs">|</span>
            <span className="text-xs text-muted-foreground">{configured.length} مكتمل</span>
            {conditionalMissing.length > 0 && (
              <span className="text-xs text-amber-600">{conditionalMissing.length} شرطي غير مضبوط</span>
            )}
            {isWarehouseView && (
              <Badge variant="outline" className="text-[10px] mr-auto">
                إعداد خاص بالمستودع — السطور غير المحددة هنا تستخدم الإعداد العام تلقائياً
              </Badge>
            )}
          </div>
        )}

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="space-y-1">
              {/* Table header */}
              <div className="grid grid-cols-[auto_1fr_2fr_2fr_auto] gap-2 px-2 py-2 bg-muted/50 rounded-md text-xs font-medium text-muted-foreground">
                <div className="w-20">الحالة</div>
                <div>نوع البند</div>
                <div className="flex items-center gap-1">
                  <span className="text-blue-600 font-bold text-[10px]">مد</span> حساب المدين
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-purple-600 font-bold text-[10px]">دا</span> حساب الدائن
                </div>
                <div className="w-9"></div>
              </div>

              {/* Rows */}
              {rows.map(row => {
                const spec      = txSpecs[row.lineType] as LineTypeSpec | undefined;
                const complete  = isRowComplete(row, spec);
                const required  = spec?.required === true;
                const cond      = spec?.required === "cond";
                const unknown   = !spec;

                // Which sides does this line type actually use?
                const useDebit  = spec ? spec.debitSide  : true;
                const useCredit = spec ? spec.creditSide : true;

                // Source badge (warehouse-specific vs generic fallback)
                const showFallback = isWarehouseView && row.source === "generic";

                const rowBg = !complete && required
                  ? "bg-red-50/60 border-red-100"
                  : !complete && cond
                  ? "bg-amber-50/40"
                  : complete
                  ? ""
                  : "";

                return (
                  <div
                    key={row.key}
                    className={`grid grid-cols-[auto_1fr_2fr_2fr_auto] gap-2 px-2 py-2 border-b last:border-b-0 items-center rounded-sm ${rowBg}`}
                    data-testid={`mapping-row-${row.lineType || row.key}`}
                  >
                    {/* Status cell */}
                    <div className="w-20 flex flex-col gap-0.5">
                      {complete ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-green-600"><CheckCircle2 className="h-3 w-3" />مكتمل</span>
                      ) : required ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-red-600"><AlertCircle className="h-3 w-3" />إلزامي</span>
                      ) : cond ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-600"><AlertTriangle className="h-3 w-3" />شرطي</span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Info className="h-3 w-3" />اختياري</span>
                      )}
                      {cond && spec?.condition && (
                        <span className="text-[9px] text-muted-foreground leading-tight">{spec.condition}</span>
                      )}
                      {showFallback && (
                        <span className="text-[9px] text-blue-500 leading-tight">↳ من الإعداد العام</span>
                      )}
                      {isWarehouseView && row.source === "warehouse" && (
                        <span className="text-[9px] text-indigo-500 leading-tight">↳ مستودع محدد</span>
                      )}
                    </div>

                    {/* Line type selector */}
                    <div>
                      {unknown ? (
                        <Select value={row.lineType} onValueChange={v => updateRow(row.key, "lineType", v)}>
                          <SelectTrigger className="h-9 text-xs" data-testid={`select-linetype-${row.key}`}>
                            <SelectValue placeholder="اختر نوع البند" />
                          </SelectTrigger>
                          <SelectContent>
                            {allLineTypeOptions.map(([k, label]) => (
                              <SelectItem key={k} value={k}>
                                {label}{usedLineTypes.has(k) && k !== row.lineType ? " (مستخدم)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="text-xs font-medium py-2">
                          {mappingLineTypeLabels[row.lineType] || row.lineType}
                          <span className="text-[10px] font-mono text-muted-foreground mr-1">({row.lineType})</span>
                        </div>
                      )}
                    </div>

                    {/* Debit account */}
                    {!useDebit ? (
                      <div className="flex items-center h-9 w-full rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-2 py-1 text-xs text-muted-foreground/50 select-none" data-testid={`select-debit-${row.lineType || row.key}`}>
                        غير مستخدم في هذا النوع
                      </div>
                    ) : (
                      <AccountLookup
                        value={row.debitAccountId}
                        onChange={item => updateRow(row.key, "debitAccountId", item?.id ?? "")}
                        placeholder="اختر حساب المدين"
                        data-testid={`select-debit-${row.lineType || row.key}`}
                      />
                    )}

                    {/* Credit account */}
                    {!useCredit ? (
                      <div className="flex items-center h-9 w-full rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-2 py-1 text-xs text-muted-foreground/50 select-none" data-testid={`select-credit-${row.lineType || row.key}`}>
                        غير مستخدم في هذا النوع
                      </div>
                    ) : (
                      <AccountLookup
                        value={row.creditAccountId}
                        onChange={item => updateRow(row.key, "creditAccountId", item?.id ?? "")}
                        placeholder="اختر حساب الدائن"
                        data-testid={`select-credit-${row.lineType || row.key}`}
                      />
                    )}

                    {/* Remove */}
                    <Button size="icon" variant="ghost" onClick={() => removeRow(row.key)} data-testid={`button-remove-${row.key}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}

              {rows.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  لا توجد سطور — اضغط "إضافة سطر" لإضافة ربط حسابات
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Legend card ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">دليل الحقول والحالات</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-red-500" /><strong>إلزامي</strong> — يمنع الترحيل إذا كان غير مضبوط</p>
              <p className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /><strong>شرطي</strong> — مطلوب فقط عند وجود شرطه (ضريبة / خصم / نوع المورد)</p>
              <p className="flex items-center gap-1"><Info className="h-3 w-3 text-muted-foreground" /><strong>اختياري</strong> — لا يؤثر على الترحيل إذا غاب</p>
            </div>
            <div className="space-y-1">
              <p><span className="text-blue-600 font-bold">مد</span> = حساب المدين (Debit) — <span className="text-purple-600 font-bold">دا</span> = حساب الدائن (Credit)</p>
              <p>"غير مستخدم في هذا النوع" = الحقل لا يُقرأ في منطق القيد لهذا البند</p>
              <p>"↳ من الإعداد العام" = المستودع المختار ليس له إعداد خاص، يستخدم الإعداد العام تلقائياً</p>
            </div>
          </div>
          <hr className="border-border" />
          <p>تغيير الإعدادات يؤثر على القيود المستقبلية فقط. القيود المُرحَّلة سابقاً لا تتغير.</p>
        </CardContent>
      </Card>
    </div>
  );
}
