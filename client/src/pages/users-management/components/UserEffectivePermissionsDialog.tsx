import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, ShieldOff, Search, ChevronDown, ChevronRight } from "lucide-react";
import { ROLE_LABELS } from "@shared/permissions";
import {
  SCREEN_MATRIX, ACTION_LABELS,
  type ScreenCategoryDef, type ScreenDef,
} from "../../permission-groups/screen-definitions";

interface PermEntry {
  permission: string;
  source: "group" | "role_default";
  active: boolean;
}

interface EffectiveResponse {
  userId: string;
  role: string | null;
  groupId: string | null;
  permissions: PermEntry[];
}

interface Props {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function findPermInMatrix(permKey: string): { category?: ScreenCategoryDef; screen?: ScreenDef; actionLabel?: string } {
  for (const cat of SCREEN_MATRIX) {
    for (const screen of cat.screens) {
      if (screen.menuPermKey === permKey) {
        return { category: cat, screen, actionLabel: "وصول" };
      }
      for (const action of screen.actions) {
        if (action.permKey === permKey) {
          return { category: cat, screen, actionLabel: ACTION_LABELS[action.type] ?? action.type };
        }
      }
    }
  }
  return {};
}

export function UserEffectivePermissionsDialog({ userId, userName, open, onOpenChange }: Props) {
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<EffectiveResponse>({
    queryKey: ["/api/users", userId, "effective-permissions"],
    queryFn: async () => {
      const r = await fetch(`/api/users/${userId}/effective-permissions`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "فشل تحميل الصلاحيات");
      return r.json();
    },
    enabled: open && !!userId,
  });

  const perms = data?.permissions ?? [];

  const grouped = useMemo(() => {
    const permMap = new Map<string, PermEntry>();
    for (const p of perms) permMap.set(p.permission, p);

    const sections: {
      catId: string;
      catLabel: string;
      items: { permKey: string; screenLabel: string; actionLabel: string; active: boolean; source: string }[];
    }[] = [];

    for (const cat of SCREEN_MATRIX) {
      const items: typeof sections[0]["items"] = [];
      for (const screen of cat.screens) {
        const allScreenPerms = [screen.menuPermKey, ...screen.actions.map(a => a.permKey)];
        for (const pk of allScreenPerms) {
          const entry = permMap.get(pk);
          if (!entry) continue;
          const { actionLabel } = findPermInMatrix(pk);
          items.push({
            permKey: pk,
            screenLabel: screen.label,
            actionLabel: actionLabel ?? "وصول",
            active: entry.active,
            source: entry.source,
          });
          permMap.delete(pk);
        }
      }
      if (items.length > 0) {
        sections.push({ catId: cat.id, catLabel: cat.label, items });
      }
    }

    if (permMap.size > 0) {
      const uncoveredItems: typeof sections[0]["items"] = [];
      for (const [pk, entry] of permMap) {
        uncoveredItems.push({
          permKey: pk,
          screenLabel: pk,
          actionLabel: "",
          active: entry.active,
          source: entry.source,
        });
      }
      sections.push({ catId: "__uncovered__", catLabel: "صلاحيات أخرى", items: uncoveredItems });
    }

    return sections;
  }, [perms]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.trim().toLowerCase();
    return grouped.map(sec => ({
      ...sec,
      items: sec.items.filter(
        it => it.permKey.toLowerCase().includes(q) || it.screenLabel.includes(q) || it.actionLabel.includes(q)
      ),
    })).filter(sec => sec.items.length > 0);
  }, [grouped, search]);

  const activeCnt   = perms.filter(p => p.active).length;
  const inactiveCnt = perms.filter(p => !p.active).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" dir="rtl" data-testid="dialog-effective-permissions">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            الصلاحيات الفعّالة — {userName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {data?.role && (
                <Badge variant="outline" className="text-xs gap-1">
                  الدور: {ROLE_LABELS[data.role] ?? data.role}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs gap-1">
                <ShieldCheck className="h-3 w-3" />
                {activeCnt} مفعّلة
              </Badge>
              {inactiveCnt > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 dark:text-amber-400 dark:border-amber-700 gap-0.5">
                  <ShieldOff className="h-3 w-3" />
                  {inactiveCnt} غير مفعّلة (متاحة من الدور)
                </Badge>
              )}
            </div>

            <div className="relative">
              <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث في الصلاحيات..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9 text-sm"
                data-testid="input-search-effective-perms"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {filtered.map(sec => {
                const isOpen = openSections.has(sec.catId) || search.trim().length > 0;
                const activeInSection = sec.items.filter(i => i.active).length;
                return (
                  <div key={sec.catId} className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted/70 transition-colors text-right"
                      onClick={() => setOpenSections(prev => {
                        const next = new Set(prev);
                        if (next.has(sec.catId)) next.delete(sec.catId); else next.add(sec.catId);
                        return next;
                      })}
                      data-testid={`section-${sec.catId}`}
                    >
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <span className="font-semibold text-sm flex-1">{sec.catLabel}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {activeInSection} / {sec.items.length}
                      </Badge>
                    </button>

                    {isOpen && (
                      <div className="divide-y">
                        {sec.items.map(it => (
                          <div
                            key={it.permKey}
                            className={`px-3 py-1.5 flex items-center gap-3 transition-colors text-sm ${
                              it.active ? "hover:bg-muted/20" : "opacity-50 bg-muted/10"
                            }`}
                            data-testid={`perm-row-${it.permKey}`}
                          >
                            {it.active
                              ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                              : <ShieldOff className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            }
                            <span className="flex-1 min-w-0">
                              <span className={it.active ? "font-medium" : "line-through"}>{it.screenLabel}</span>
                              {it.actionLabel && (
                                <span className="text-muted-foreground text-xs mr-1.5">({it.actionLabel})</span>
                              )}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 ${
                                it.active
                                  ? "border-green-300 text-green-700 dark:text-green-400 dark:border-green-700"
                                  : "border-amber-300 text-amber-600 dark:text-amber-400 dark:border-amber-700"
                              }`}
                            >
                              {it.active ? "مفعّلة" : "غير مفعّلة"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  لا توجد صلاحيات مطابقة
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
