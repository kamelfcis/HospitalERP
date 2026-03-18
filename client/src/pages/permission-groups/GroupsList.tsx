import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button }       from "@/components/ui/button";
import { Input }        from "@/components/ui/input";
import { Badge }        from "@/components/ui/badge";
import { ScrollArea }   from "@/components/ui/scroll-area";
import { Loader2, Plus, Search, Shield, ShieldCheck, Users, KeyRound } from "lucide-react";
import type { GroupSummary } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
//  GroupCard
// ─────────────────────────────────────────────────────────────────────────────

function GroupCard({
  group,
  selected,
  onClick,
}: {
  group:    GroupSummary;
  selected: boolean;
  onClick:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`group-card-${group.id}`}
      className={`w-full text-right p-3 rounded-lg border transition-all hover:bg-accent/50 ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1 text-right">
          <div className="flex items-center gap-1.5 flex-row-reverse">
            {group.isSystem
              ? <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              : <Shield      className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span className="font-semibold text-sm truncate">{group.name}</span>
          </div>
          {group.description && (
            <p className="text-xs text-muted-foreground truncate">{group.description}</p>
          )}
        </div>
        {group.isSystem && (
          <Badge variant="outline" className="text-[10px] h-4 px-1 text-amber-600 border-amber-300 shrink-0">
            نظامي
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-row-reverse">
        <span className="flex items-center gap-1 flex-row-reverse">
          <Users    className="h-3 w-3" />{group.memberCount} مستخدم
        </span>
        <span className="flex items-center gap-1 flex-row-reverse">
          <KeyRound className="h-3 w-3" />{group.permissionCount} صلاحية
        </span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  GroupsList
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  selectedId:    string | null;
  onSelect:      (id: string) => void;
  onCreateClick: () => void;
  canManage:     boolean;
}

export function GroupsList({ selectedId, onSelect, onCreateClick, canManage }: Props) {
  const [search, setSearch] = useState("");

  const { data: groups = [], isLoading } = useQuery<GroupSummary[]>({
    queryKey: ["/api/permission-groups"],
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      g => g.name.toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q)
    );
  }, [groups, search]);

  return (
    <div className="flex flex-col h-full">
      {/* رأس القائمة */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-sm">مجموعات الصلاحيات</h1>
          {canManage && (
            <Button
              size="sm" variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onCreateClick}
              data-testid="button-create-group"
            >
              <Plus className="h-3.5 w-3.5 ml-1" />
              جديد
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث..."
            className="h-7 pr-8 text-xs"
            dir="rtl"
            data-testid="input-search-groups"
          />
        </div>
      </div>

      {/* القائمة */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1.5">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد مجموعات</p>
          ) : (
            filtered.map(g => (
              <GroupCard
                key={g.id}
                group={g}
                selected={selectedId === g.id}
                onClick={() => onSelect(g.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* إحصاء سريع */}
      <div className="border-t p-2 text-center text-xs text-muted-foreground">
        {groups.length} مجموعة ({groups.filter(g => g.isSystem).length} نظامية)
      </div>
    </div>
  );
}
