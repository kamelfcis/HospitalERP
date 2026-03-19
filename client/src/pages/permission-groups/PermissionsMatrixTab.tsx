/**
 * PermissionsMatrixTab — مصفوفة الشاشات والإجراءات
 *
 * عرضان بينهما زر تبديل:
 *  1. مصفوفة الشاشات   — جدول: الشاشة | الوصول | الإجراءات المتاحة
 *  2. صلاحيات تفصيلية — قائمة بـ checkboxes مقسّمة بالموديول (عرض متقدم)
 *
 * كلا العرضين يعملان على نفس state (Set<string>)
 * فتغيير في أحدهما ينعكس فوراً على الآخر.
 */

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast }   from "@/hooks/use-toast";
import { PERMISSION_GROUPS as PERM_MODULES } from "@shared/permissions";
import {
  SCREEN_MATRIX, ACTION_LABELS, type ScreenCategoryDef, type ActionType,
} from "./screen-definitions";

import { Button }     from "@/components/ui/button";
import { Checkbox }   from "@/components/ui/checkbox";
import { Badge }      from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, LayoutGrid, List, Monitor, CheckSquare } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  ScreenMatrixView — الجدول الرئيسي
// ─────────────────────────────────────────────────────────────────────────────

function ScreenMatrixView({
  category,
  selected,
  canEdit,
  onToggle,
}: {
  category: ScreenCategoryDef;
  selected: Set<string>;
  canEdit:  boolean;
  onToggle: (permKey: string) => void;
}) {
  const hasActions = category.actionColumns.length > 0;

  return (
    <div className="mb-5 border rounded-lg overflow-hidden">
      {/* رأس الفئة */}
      <div className="bg-muted/60 px-3 py-2 border-b">
        <span className="font-semibold text-sm">{category.label}</span>
      </div>

      {/* الجدول */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground w-44">
                الشاشة
              </th>
              <th className="text-center px-2 py-2 font-medium text-xs text-muted-foreground w-20">
                <div className="flex flex-col items-center gap-0.5">
                  <Monitor className="h-3 w-3" />
                  <span>الوصول</span>
                </div>
              </th>
              {hasActions && category.actionColumns.map(col => (
                <th
                  key={col}
                  className="text-center px-2 py-2 font-medium text-xs text-muted-foreground"
                >
                  {ACTION_LABELS[col]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {category.screens.map((screen, idx) => {
              const menuGranted = selected.has(screen.menuPermKey);
              const rowClass = idx % 2 === 0 ? "bg-card" : "bg-muted/10";

              return (
                <tr key={screen.id} className={`border-b last:border-0 ${rowClass}`}>
                  {/* اسم الشاشة */}
                  <td className="px-3 py-2 text-right font-medium text-xs">
                    {screen.label}
                  </td>

                  {/* عمود الوصول (يُظهر الشاشة في القائمة ويسمح بفتحها) */}
                  <td className="px-2 py-2 text-center">
                    <Checkbox
                      checked={menuGranted}
                      onCheckedChange={() => canEdit && onToggle(screen.menuPermKey)}
                      disabled={!canEdit}
                      data-testid={`matrix-access-${screen.id}`}
                      className="mx-auto"
                    />
                  </td>

                  {/* أعمدة الإجراءات */}
                  {hasActions && category.actionColumns.map(col => {
                    const actionDef = screen.actions.find(a => a.type === col);

                    if (!actionDef) {
                      return (
                        <td key={col} className="px-2 py-2 text-center text-muted-foreground/30 text-xs">
                          —
                        </td>
                      );
                    }

                    const granted = selected.has(actionDef.permKey);
                    return (
                      <td key={col} className="px-2 py-2 text-center">
                        <Checkbox
                          checked={granted}
                          onCheckedChange={() => canEdit && onToggle(actionDef.permKey)}
                          disabled={!canEdit}
                          data-testid={`matrix-${screen.id}-${col}`}
                          className="mx-auto"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ModuleCheckboxView — العرض التفصيلي بـ checkboxes (متقدم)
// ─────────────────────────────────────────────────────────────────────────────

function ModuleCheckboxView({
  selected,
  canEdit,
  onToggle,
  onToggleModule,
}: {
  selected:       Set<string>;
  canEdit:        boolean;
  onToggle:       (key: string) => void;
  onToggleModule: (keys: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      {PERM_MODULES.map(module => {
        const moduleKeys  = module.permissions.map(p => p.key);
        const allChecked  = moduleKeys.every(k => selected.has(k));
        const someChecked = moduleKeys.some(k => selected.has(k));
        const indeterminate = someChecked && !allChecked;

        return (
          <div key={module.label} className="border rounded-lg overflow-hidden">
            {/* رأس القسم */}
            <div
              className={`flex items-center justify-between px-3 py-2 bg-muted/50 flex-row-reverse ${
                canEdit ? "cursor-pointer hover:bg-muted" : ""
              }`}
              onClick={() => canEdit && onToggleModule(moduleKeys)}
            >
              <span className="text-sm font-semibold">{module.label}</span>
              <div className="flex items-center gap-2 flex-row-reverse">
                <span className="text-xs text-muted-foreground">
                  {moduleKeys.filter(k => selected.has(k)).length}/{moduleKeys.length}
                </span>
                {canEdit && (
                  <Checkbox
                    checked={allChecked ? true : indeterminate ? "indeterminate" : false}
                    onCheckedChange={() => onToggleModule(moduleKeys)}
                    onClick={e => e.stopPropagation()}
                    data-testid={`module-all-${module.label}`}
                  />
                )}
              </div>
            </div>

            {/* الصلاحيات الفردية */}
            <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {module.permissions.map(perm => (
                <label
                  key={perm.key}
                  className={`flex items-center gap-2 flex-row-reverse text-sm ${
                    canEdit ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <Checkbox
                    checked={selected.has(perm.key)}
                    onCheckedChange={() => canEdit && onToggle(perm.key)}
                    disabled={!canEdit}
                    data-testid={`checkbox-perm-${perm.key}`}
                  />
                  <span className={selected.has(perm.key) ? "" : "text-muted-foreground"}>
                    {perm.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PermissionsMatrixTab — المكوّن الرئيسي
// ─────────────────────────────────────────────────────────────────────────────

type ViewMode = "matrix" | "detail";

interface Props {
  groupId:            string;
  isSystem:           boolean;
  initialPermissions: string[];
  canManage:          boolean;
}

export function PermissionsMatrixTab({
  groupId, isSystem, initialPermissions, canManage,
}: Props) {
  const qc    = useQueryClient();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set(initialPermissions));
  const [dirty,    setDirty]    = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("matrix");

  // إعادة التعيين عند تغيير المجموعة
  useEffect(() => {
    setSelected(new Set(initialPermissions));
    setDirty(false);
  }, [groupId, initialPermissions.join(",")]);

  // المجموعات النظامية: الاسم والوصف محميان، لكن الصلاحيات قابلة للتعديل من الأدمن
  const canEdit = canManage;

  // ── مساعدات التعديل ────────────────────────────────────────────────────────

  function toggle(key: string) {
    if (!canEdit) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  }

  function toggleModule(keys: string[]) {
    if (!canEdit) return;
    setSelected(prev => {
      const next    = new Set(prev);
      const allOn   = keys.every(k => next.has(k));
      if (allOn) keys.forEach(k => next.delete(k));
      else       keys.forEach(k => next.add(k));
      return next;
    });
    setDirty(true);
  }

  // ── حفظ ────────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/permission-groups/${groupId}/permissions`, {
        permissions: [...selected],
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/permission-groups"] });
      qc.invalidateQueries({ queryKey: ["/api/permission-groups", groupId] });
      toast({ title: "تم حفظ الصلاحيات" });
      setDirty(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  // ── إحصاء ──────────────────────────────────────────────────────────────────
  const totalAll = PERM_MODULES.reduce((s, m) => s + m.permissions.length, 0);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 200px)" }}>
      {/* شريط الأدوات */}
      <div className="flex items-center justify-between pb-3 border-b mb-3 flex-row-reverse gap-2 flex-wrap">
        {/* إحصاء + حالة */}
        <div className="flex items-center gap-2 flex-row-reverse">
          <Badge variant="secondary" className="font-mono text-xs">
            {selected.size} / {totalAll}
          </Badge>
          <span className="text-xs text-muted-foreground">صلاحية مفعّلة</span>
          {!canManage && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
              للعرض فقط
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* تبديل العرض */}
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("matrix")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                viewMode === "matrix"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              data-testid="view-mode-matrix"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              مصفوفة الشاشات
            </button>
            <button
              onClick={() => setViewMode("detail")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                viewMode === "detail"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              data-testid="view-mode-detail"
            >
              <List className="h-3.5 w-3.5" />
              عرض تفصيلي
            </button>
          </div>

          {/* زر الحفظ */}
          {canEdit && (
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
              data-testid="button-save-permissions"
            >
              {saveMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin ml-2" />
                : <Save    className="h-4 w-4 ml-2" />}
              حفظ الصلاحيات
            </Button>
          )}
        </div>
      </div>

      {/* شرح مصطلحات (يظهر فقط في وضع المصفوفة) */}
      {viewMode === "matrix" && (
        <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground flex-row-reverse flex-wrap">
          <span className="flex items-center gap-1 flex-row-reverse">
            <Monitor      className="h-3 w-3 text-primary" />
            الوصول = ظهور في القائمة + إمكانية فتح الشاشة
          </span>
          <span className="flex items-center gap-1 flex-row-reverse">
            <CheckSquare  className="h-3 w-3 text-green-600" />
            ✓ مفعّل &nbsp;|&nbsp; — غير متاح لهذه الشاشة
          </span>
        </div>
      )}

      {/* المحتوى */}
      <ScrollArea className="flex-1 -ml-1 pl-1">
        {viewMode === "matrix" ? (
          <div>
            {SCREEN_MATRIX.map(category => (
              <ScreenMatrixView
                key={category.id}
                category={category}
                selected={selected}
                canEdit={canEdit}
                onToggle={toggle}
              />
            ))}
          </div>
        ) : (
          <ModuleCheckboxView
            selected={selected}
            canEdit={canEdit}
            onToggle={toggle}
            onToggleModule={toggleModule}
          />
        )}
      </ScrollArea>
    </div>
  );
}
