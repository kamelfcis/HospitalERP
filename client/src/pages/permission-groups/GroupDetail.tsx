import { useQuery } from "@tanstack/react-query";
import { Badge }       from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Shield, ShieldCheck } from "lucide-react";
import { GeneralTab }          from "./GeneralTab";
import { MembersTab }          from "./MembersTab";
import { PermissionsMatrixTab } from "./PermissionsMatrixTab";
import type { GroupDetail as GroupDetailType } from "./types";

interface Props {
  groupId:   string;
  canManage: boolean;
  onDeleted: () => void;
}

export function GroupDetail({ groupId, canManage, onDeleted }: Props) {
  const { data: group, isLoading, isError } = useQuery<GroupDetailType>({
    queryKey: ["/api/permission-groups", groupId],
    queryFn:  () =>
      fetch(`/api/permission-groups/${groupId}`, { credentials: "include" })
        .then(r => r.json()),
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        تعذّر تحميل بيانات المجموعة
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* رأس المجموعة */}
      <div className="flex items-center gap-2 pb-3 border-b flex-row-reverse">
        {group.isSystem
          ? <ShieldCheck className="h-5 w-5 text-amber-500" />
          : <Shield      className="h-5 w-5 text-primary" />}
        <div className="flex-1 text-right">
          <h2 className="text-base font-bold">{group.name}</h2>
          {group.description && (
            <p className="text-xs text-muted-foreground">{group.description}</p>
          )}
        </div>
        {group.isSystem && (
          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
            نظامي
          </Badge>
        )}
      </div>

      {/* التبويبات */}
      <Tabs defaultValue="matrix">
        <TabsList className="mb-1 w-full justify-start flex-row-reverse">
          <TabsTrigger value="matrix" data-testid="tab-matrix">
            مصفوفة الشاشات
          </TabsTrigger>
          <TabsTrigger value="members" data-testid="tab-members">
            الأعضاء
            {(group.memberCount ?? group.members.length) > 0 && (
              <Badge variant="secondary" className="mr-1.5 h-4 px-1 text-[10px]">
                {group.memberCount ?? group.members.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="general" data-testid="tab-general">
            عام
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-0">
          <PermissionsMatrixTab
            key={groupId}
            groupId={groupId}
            isSystem={group.isSystem}
            initialPermissions={group.permissions}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="members" className="mt-0">
          <MembersTab
            groupId={groupId}
            members={group.members}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="general" className="mt-0">
          <GeneralTab
            group={group}
            canManage={canManage}
            onDeleted={onDeleted}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
