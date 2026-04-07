/**
 * PermissionsMatrixTab — مصفوفة الصلاحيات بنطاقات قابلة للطي
 *
 * - كل نطاق عمل قسم قابل للطي مع تحديد شامل (indeterminate state)
 * - كل شاشة: صف يحوي اسمها + checkbox الوصول + checkboxes الإجراءات
 * - auto-discovery: أي صلاحية في screen-definitions.ts تظهر تلقائياً
 */

import { useState, useCallback, useMemo, memo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest }  from "@/lib/queryClient";
import { useToast }    from "@/hooks/use-toast";
import {
  SCREEN_MATRIX, ACTION_LABELS, type ScreenCategoryDef,
} from "./screen-definitions";
import { Button }   from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge }    from "@/components/ui/badge";
import {
  Loader2, Save, ChevronDown, ChevronRight,
  ChevronsDownUp, ChevronsUpDown,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  Helper — all perm keys for a category
// ─────────────────────────────────────────────────────────────────────────────
function categoryPermKeys(cat: ScreenCategoryDef): string[] {
  const s = new Set<string>();
  for (const screen of cat.screens) {
    s.add(screen.menuPermKey);
    for (const a of screen.actions) s.add(a.permKey);
  }
  return Array.from(s);
}

// ─────────────────────────────────────────────────────────────────────────────
//  DomainSection — نطاق عمل واحد قابل للطي
// ─────────────────────────────────────────────────────────────────────────────
const DomainSection = memo(function DomainSection({
  category, selected, canEdit, isOpen,
  onToggleOpen, onTogglePerm, onToggleAll,
}: {
  category:     ScreenCategoryDef;
  selected:     Set<string>;
  canEdit:      boolean;
  isOpen:       boolean;
  onToggleOpen: () => void;
  onTogglePerm: (k: string) => void;
  onToggleAll:  (keys: string[], on: boolean) => void;
}) {
  const allKeys       = useMemo(() => categoryPermKeys(category), [category]);
  const selectedCount = allKeys.filter(k => selected.has(k)).length;
  const allSelected   = selectedCount === allKeys.length;
  const someSelected  = selectedCount > 0 && !allSelected;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* رأس القسم */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-muted/50 cursor-pointer select-none hover:bg-muted/70 transition-colors"
        onClick={onToggleOpen}
        data-testid={`domain-header-${category.id}`}
      >
        {isOpen
          ? <ChevronDown  className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        }

        {canEdit && (
          <div onClick={e => { e.stopPropagation(); onToggleAll(allKeys, !allSelected); }}>
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={() => onToggleAll(allKeys, !allSelected)}
              data-testid={`checkbox-domain-all-${category.id}`}
            />
          </div>
        )}

        <span className="font-semibold text-sm flex-1">{category.label}</span>

        <Badge
          variant={selectedCount > 0 ? "default" : "outline"}
          className="text-[10px] shrink-0"
        >
          {selectedCount} / {allKeys.length}
        </Badge>
      </div>

      {/* محتوى القسم */}
      {isOpen && (
        <div className="divide-y">
          {category.screens.map(screen => (
            <div
              key={screen.id}
              className="px-3 py-2 flex items-start gap-4 hover:bg-muted/20 transition-colors"
            >
              {/* اسم الشاشة */}
              <div className="w-40 shrink-0 pt-0.5 text-sm leading-tight">
                {screen.label}
              </div>

              {/* الصلاحيات */}
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 flex-1">
                {/* الوصول */}
                <label
                  className="flex items-center gap-1.5 cursor-pointer"
                  data-testid={`perm-${screen.menuPermKey}`}
                >
                  <Checkbox
                    checked={selected.has(screen.menuPermKey)}
                    onCheckedChange={() => canEdit && onTogglePerm(screen.menuPermKey)}
                    disabled={!canEdit}
                  />
                  <span className="text-xs text-muted-foreground">وصول</span>
                </label>

                {/* الإجراءات */}
                {screen.actions.map(action => (
                  <label
                    key={action.permKey}
                    className="flex items-center gap-1.5 cursor-pointer"
                    data-testid={`perm-${action.permKey}`}
                  >
                    <Checkbox
                      checked={selected.has(action.permKey)}
                      onCheckedChange={() => canEdit && onTogglePerm(action.permKey)}
                      disabled={!canEdit}
                    />
                    <span className="text-xs text-muted-foreground">
                      {ACTION_LABELS[action.type] ?? action.type}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  Main Export
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  groupId:     string;
  permissions: string[];
  canEdit:     boolean;
}

export function PermissionsMatrixTab({ groupId, permissions, canEdit }: Props) {
  const { toast }    = useToast();
  const queryClient  = useQueryClient();

  const [selected, setSelected]     = useState<Set<string>>(() => new Set(permissions));
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(SCREEN_MATRIX.map(c => c.id))
  );

  const totalSelected  = selected.size;
  const allSectionsOpen = openSections.size === SCREEN_MATRIX.length;

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/permission-groups/${groupId}/permissions`, {
        permissions: Array.from(selected),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permission-groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/permission-groups"] });
      toast({ title: "تم حفظ الصلاحيات" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const handleTogglePerm = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((keys: string[], on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const k of keys) { if (on) next.add(k); else next.delete(k); }
      return next;
    });
  }, []);

  const handleToggleSection = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      {/* شريط الأدوات */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-xs">
            {totalSelected} صلاحية مفعّلة
          </Badge>
          <button
            type="button"
            onClick={() =>
              allSectionsOpen
                ? setOpenSections(new Set())
                : setOpenSections(new Set(SCREEN_MATRIX.map(c => c.id)))
            }
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-toggle-all-sections"
          >
            {allSectionsOpen
              ? <><ChevronsDownUp className="h-3.5 w-3.5" />طي الكل</>
              : <><ChevronsUpDown className="h-3.5 w-3.5" />فتح الكل</>
            }
          </button>
        </div>

        {canEdit && (
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-permissions"
          >
            {saveMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
              : <Save    className="h-4 w-4 ml-1" />
            }
            حفظ الصلاحيات
          </Button>
        )}
      </div>

      {/* النطاقات */}
      <div className="space-y-2">
        {SCREEN_MATRIX.map(category => (
          <DomainSection
            key={category.id}
            category={category}
            selected={selected}
            canEdit={canEdit}
            isOpen={openSections.has(category.id)}
            onToggleOpen={() => handleToggleSection(category.id)}
            onTogglePerm={handleTogglePerm}
            onToggleAll={handleToggleAll}
          />
        ))}
      </div>
    </div>
  );
}
