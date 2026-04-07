import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast }   from "@/hooks/use-toast";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Label }      from "@/components/ui/label";
import { Textarea }   from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Save, Trash2, Info } from "lucide-react";
import type { GroupDetail } from "./types";

// قائمة الشاشات المتاحة كشاشة افتتاحية
const ROUTE_OPTIONS = [
  { label: "لوحة التحكم",              value: "/" },
  { label: "فواتير البيع",             value: "/sales-invoices" },
  { label: "شاشة تحصيل الكاشير",      value: "/cashier-collection" },
  { label: "تقرير تسليم الدرج",        value: "/cashier-handover" },
  { label: "فاتورة مريض",             value: "/patient-invoices" },
  { label: "حجز العيادات",            value: "/clinic-booking" },
  { label: "لوحة الأسرّة",            value: "/bed-board" },
  { label: "أوامر الطبيب",            value: "/doctor-orders" },
  { label: "تحويل مخزني",             value: "/store-transfers" },
  { label: "إعداد إذن تحويل",         value: "/transfer-preparation" },
  { label: "استلام من مورد",          value: "/supplier-receiving" },
  { label: "فواتير الشراء",           value: "/purchase-invoices" },
  { label: "الأصناف",                 value: "/items" },
  { label: "تحصيل الآجل",            value: "/customer-payments" },
  { label: "سداد الموردين",           value: "/supplier-payments" },
  { label: "تحصيل التوصيل",          value: "/delivery-payments" },
  { label: "جرد الأصناف",            value: "/stock-count" },
  { label: "كشكول النواقص",          value: "/shortage-notebook" },
  { label: "القيود اليومية",          value: "/journal-entries" },
  { label: "دليل الحسابات",           value: "/chart-of-accounts" },
  { label: "ميزان المراجعة",          value: "/reports/trial-balance" },
  { label: "خدمات المعمل",            value: "/dept-services/LAB" },
  { label: "خدمات الأشعة",           value: "/dept-services/RAD" },
  { label: "مردودات المبيعات",        value: "/sales-returns" },
  { label: "حالات دخول المستشفى",    value: "/patients" },
  { label: "استعلام المرضى",         value: "/patient-inquiry" },
  { label: "تسوية مستحقات الأطباء",   value: "/doctor-settlements" },
  { label: "إعدادات النظام",          value: "/system-settings" },
];

interface Props {
  group:     GroupDetail;
  canManage: boolean;
  onDeleted: () => void;
}

export function GeneralTab({ group, canManage, onDeleted }: Props) {
  const qc    = useQueryClient();
  const { toast } = useToast();

  const [name,             setName]             = useState(group.name);
  const [desc,             setDesc]             = useState(group.description ?? "");
  const [maxDiscountPct,   setMaxDiscountPct]   = useState(group.maxDiscountPct   ?? "");
  const [maxDiscountValue, setMaxDiscountValue] = useState(group.maxDiscountValue ?? "");
  const [defaultRoute,     setDefaultRoute]     = useState(group.defaultRoute     ?? "__none__");
  const [showDelete,       setShowDelete]       = useState(false);

  useEffect(() => {
    setName(group.name);
    setDesc(group.description ?? "");
    setMaxDiscountPct(group.maxDiscountPct   ?? "");
    setMaxDiscountValue(group.maxDiscountValue ?? "");
    setDefaultRoute(group.defaultRoute ?? "__none__");
  }, [group.id]);

  const dirty =
    name.trim() !== group.name ||
    desc.trim() !== (group.description ?? "") ||
    maxDiscountPct.trim()   !== (group.maxDiscountPct   ?? "") ||
    maxDiscountValue.trim() !== (group.maxDiscountValue ?? "") ||
    (defaultRoute === "__none__" ? null : defaultRoute) !== (group.defaultRoute ?? null);

  const buildPayload = () => {
    const payload: Record<string, unknown> = {};
    if (!group.isSystem) {
      payload.name = name.trim();
      payload.description = desc.trim() || undefined;
    } else {
      if (desc.trim() !== (group.description ?? "")) payload.description = desc.trim() || undefined;
    }
    payload.maxDiscountPct   = maxDiscountPct.trim()   !== "" ? parseFloat(maxDiscountPct)   : null;
    payload.maxDiscountValue = maxDiscountValue.trim() !== "" ? parseFloat(maxDiscountValue) : null;
    payload.defaultRoute = defaultRoute === "__none__" ? null : defaultRoute;
    return payload;
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/permission-groups/${group.id}`, buildPayload()).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/permission-groups"] });
      qc.invalidateQueries({ queryKey: ["/api/permission-groups", group.id] });
      toast({ title: "تم حفظ التغييرات" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/permission-groups/${group.id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/permission-groups"] });
      toast({ title: "تم حذف المجموعة" });
      onDeleted();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const canDelete = canManage && !group.isSystem && group.memberCount === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* تنبيه مجموعة نظامية */}
      {group.isSystem && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex-row-reverse">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>هذه مجموعة نظامية. لا يمكن تغيير اسمها أو حذفها. يمكن تعديل الوصف وحدود الخصم والشاشة الافتتاحية وصلاحيات المصفوفة.</span>
        </div>
      )}

      {/* تنبيه لا يمكن الحذف (بسبب الأعضاء) */}
      {!group.isSystem && group.memberCount > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm flex-row-reverse">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>لا يمكن حذف هذه المجموعة لأن بها {group.memberCount} مستخدم. قم بإزالة الأعضاء أولاً.</span>
        </div>
      )}

      {/* الاسم */}
      <div className="space-y-1.5">
        <Label htmlFor="group-name">اسم المجموعة</Label>
        <Input
          id="group-name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={group.isSystem || !canManage}
          placeholder="اسم المجموعة..."
          dir="rtl"
          data-testid="input-group-name"
        />
      </div>

      {/* الوصف */}
      <div className="space-y-1.5">
        <Label htmlFor="group-desc">الوصف</Label>
        <Textarea
          id="group-desc"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          disabled={!canManage}
          placeholder="وصف اختياري..."
          rows={3}
          dir="rtl"
          data-testid="input-group-description"
        />
      </div>

      {/* ────── حدود الخصم ────── */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="text-sm font-semibold text-foreground flex items-center gap-1.5 flex-row-reverse">
          <span>حدود الخصم</span>
          <span className="text-xs text-muted-foreground font-normal">(تركه فارغاً = لا حد)</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="max-discount-pct">أقصى نسبة خصم (%)</Label>
            <Input
              id="max-discount-pct"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={maxDiscountPct}
              onChange={e => setMaxDiscountPct(e.target.value)}
              disabled={!canManage}
              placeholder="مثال: 10"
              dir="ltr"
              className="text-left"
              data-testid="input-max-discount-pct"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max-discount-value">أقصى قيمة خصم (ج.م)</Label>
            <Input
              id="max-discount-value"
              type="number"
              min={0}
              step={0.01}
              value={maxDiscountValue}
              onChange={e => setMaxDiscountValue(e.target.value)}
              disabled={!canManage}
              placeholder="مثال: 500"
              dir="ltr"
              className="text-left"
              data-testid="input-max-discount-value"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground" dir="rtl">
          يُطبَّق الحد الأشد تقييداً بين إعداد المجموعة وإعداد المستخدم. يُفرض عند اعتماد الفاتورة.
        </p>
      </div>

      {/* ────── الشاشة الافتتاحية ────── */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="text-sm font-semibold text-foreground">الشاشة الافتتاحية بعد تسجيل الدخول</div>
        <Select
          value={defaultRoute}
          onValueChange={setDefaultRoute}
          disabled={!canManage}
          dir="rtl"
        >
          <SelectTrigger data-testid="select-default-route">
            <SelectValue placeholder="لوحة التحكم (افتراضي)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">لوحة التحكم (افتراضي)</SelectItem>
            {ROUTE_OPTIONS.filter(r => r.value !== "/").map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground" dir="rtl">
          عند فتح التطبيق، يُوجَّه المستخدم تلقائياً إلى هذه الشاشة بدلاً من لوحة التحكم.
        </p>
      </div>

      {/* إحصاءات */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-primary">{group.memberCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">مستخدم نشط</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-primary">{group.permissionCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">صلاحية مفعّلة</div>
        </div>
      </div>

      {/* أزرار */}
      {canManage && (
        <div className="flex items-center justify-between flex-row-reverse pt-1">
          {canDelete ? (
            <Button
              variant="destructive" size="sm"
              onClick={() => setShowDelete(true)}
              data-testid="button-delete-group"
            >
              <Trash2 className="h-4 w-4 ml-2" />
              حذف المجموعة
            </Button>
          ) : (
            <div />
          )}

          <Button
            size="sm"
            onClick={() => updateMutation.mutate()}
            disabled={!dirty || updateMutation.isPending}
            data-testid="button-save-general"
          >
            {updateMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin ml-2" />
              : <Save    className="h-4 w-4 ml-2" />}
            حفظ
          </Button>
        </div>
      )}

      {/* تأكيد الحذف */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المجموعة</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف مجموعة &quot;{group.name}&quot;؟ لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => deleteMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
