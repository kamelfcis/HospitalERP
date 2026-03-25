/**
 * Permission Groups Management — إدارة مجموعات الصلاحيات
 *
 * تخطيط ثنائي الألواح (RTL):
 *  يمين: قائمة المجموعات
 *  يسار: تفاصيل المجموعة المختارة (مصفوفة الشاشات / الأعضاء / عام)
 *        أو لوح صلاحيات مستخدم فردي عند وجود ?userId= في الرابط
 */

import { useState, useEffect } from "react";
import { useQuery }            from "@tanstack/react-query";
import { useAuth }             from "@/hooks/use-auth";
import { useSearch, useLocation } from "wouter";
import { Shield, ShieldCheck, ArrowRight } from "lucide-react";
import { Button }              from "@/components/ui/button";
import { GroupsList }          from "./GroupsList";
import { GroupDetail }         from "./GroupDetail";
import { CreateGroupDialog }   from "./CreateGroupDialog";
import { UserPermissionsPanel } from "./UserPermissionsPanel";
import type { GroupSummary }   from "./types";

export default function PermissionGroupsPage() {
  const { hasPermission } = useAuth();
  const canView   = hasPermission("permission_groups.view");
  const canManage = hasPermission("permission_groups.manage");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [, navigate] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const userIdParam  = searchParams.get("userId");

  const { data: groups = [] } = useQuery<GroupSummary[]>({
    queryKey: ["/api/permission-groups"],
    enabled:  canView,
  });

  useEffect(() => {
    if (!selectedId && groups.length > 0 && !userIdParam) {
      setSelectedId(groups[0].id);
    }
  }, [groups, selectedId, userIdParam]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" dir="rtl">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-1">غير مصرح</h2>
        <p className="text-muted-foreground text-sm">لا تملك صلاحية عرض مجموعات الصلاحيات</p>
      </div>
    );
  }

  // ── وضع صلاحيات مستخدم فردي ─────────────────────────────────────────────
  if (userIdParam) {
    return (
      <div className="flex flex-col h-full overflow-hidden" dir="rtl">
        {/* شريط التنقل العلوي */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={() => navigate("/users")}
            data-testid="button-back-to-users"
          >
            <ArrowRight className="h-4 w-4" />
            العودة لإدارة المستخدمين
          </Button>
          <span className="text-muted-foreground text-xs">|</span>
          <span className="text-xs text-muted-foreground">صلاحيات مستخدم</span>
        </div>

        {/* لوح الصلاحيات */}
        <div className="flex-1 overflow-auto p-4">
          <UserPermissionsPanel userId={userIdParam} />
        </div>
      </div>
    );
  }

  // ── الوضع الاعتيادي: مجموعات الصلاحيات ─────────────────────────────────
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
      <div className="flex-1 min-w-0 overflow-auto p-4">
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

      <CreateGroupDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={id => setSelectedId(id)}
      />
    </div>
  );
}
