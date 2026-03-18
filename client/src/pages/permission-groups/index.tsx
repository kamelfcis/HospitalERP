/**
 * Permission Groups Management — إدارة مجموعات الصلاحيات
 *
 * تخطيط ثنائي الألواح (RTL):
 *  يمين: قائمة المجموعات
 *  يسار: تفاصيل المجموعة المختارة (مصفوفة الشاشات / الأعضاء / عام)
 */

import { useState, useEffect } from "react";
import { useQuery }            from "@tanstack/react-query";
import { useAuth }             from "@/hooks/use-auth";
import { Shield, ShieldCheck } from "lucide-react";
import { GroupsList }          from "./GroupsList";
import { GroupDetail }         from "./GroupDetail";
import { CreateGroupDialog }   from "./CreateGroupDialog";
import type { GroupSummary }   from "./types";

export default function PermissionGroupsPage() {
  const { hasPermission } = useAuth();
  const canView   = hasPermission("permission_groups.view");
  const canManage = hasPermission("permission_groups.manage");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: groups = [] } = useQuery<GroupSummary[]>({
    queryKey: ["/api/permission-groups"],
    enabled:  canView,
  });

  // اختر أول مجموعة تلقائياً عند التحميل
  useEffect(() => {
    if (!selectedId && groups.length > 0) {
      setSelectedId(groups[0].id);
    }
  }, [groups, selectedId]);

  // عرض رسالة رفض الوصول
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" dir="rtl">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-1">غير مصرح</h2>
        <p className="text-muted-foreground text-sm">لا تملك صلاحية عرض مجموعات الصلاحيات</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden" dir="rtl">
      {/* ── اللوح الأيمن: قائمة المجموعات ──────────────────────────────── */}
      <div className="w-72 shrink-0 border-l flex flex-col bg-muted/10">
        <GroupsList
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreateClick={() => setShowCreate(true)}
          canManage={canManage}
        />
      </div>

      {/* ── اللوح الأيسر: تفاصيل المجموعة ──────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden p-4">
        {selectedId ? (
          <GroupDetail
            key={selectedId}
            groupId={selectedId}
            canManage={canManage}
            onDeleted={() =>
              setSelectedId(groups.find(g => g.id !== selectedId)?.id ?? null)
            }
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <ShieldCheck className="h-10 w-10 opacity-20" />
            اختر مجموعة من القائمة لعرض التفاصيل
          </div>
        )}
      </div>

      {/* نافذة إنشاء مجموعة جديدة */}
      <CreateGroupDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={id => setSelectedId(id)}
      />
    </div>
  );
}
