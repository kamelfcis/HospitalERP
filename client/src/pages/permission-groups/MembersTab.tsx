import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth }    from "@/hooks/use-auth";
import { useToast }   from "@/hooks/use-toast";
import { Button }     from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Users, UserMinus, UserPlus } from "lucide-react";
import type { GroupMember, UserRow } from "./types";

interface Props {
  groupId:   string;
  members:   GroupMember[];
  canManage: boolean;
}

export function MembersTab({ groupId, members, canManage }: Props) {
  const qc    = useQueryClient();
  const { toast } = useToast();
  const { user: me } = useAuth();

  const [addingId, setAddingId] = useState<string>("");

  const { data: allUsers = [], isLoading: usersLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/users"],
  });

  const memberIds = useMemo(() => new Set(members.map(m => m.id)), [members]);

  const availableUsers = useMemo(
    () => allUsers.filter(u => u.isActive && !memberIds.has(u.id)),
    [allUsers, memberIds]
  );

  const assignMutation = useMutation({
    mutationFn: ({ userId, gid }: { userId: string; gid: string | null }) =>
      apiRequest("PUT", `/api/users/${userId}/permission-group`, { groupId: gid }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/permission-groups"] });
      qc.invalidateQueries({ queryKey: ["/api/permission-groups", groupId] });
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setAddingId("");
      toast({ title: "تم تحديث المجموعة" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  function addMember()            { if (addingId) assignMutation.mutate({ userId: addingId, gid: groupId }); }
  function removeMember(id: string) { assignMutation.mutate({ userId: id, gid: null }); }

  return (
    <div className="flex flex-col gap-4 py-1">
      {/* إضافة عضو */}
      {canManage && (
        <div className="flex items-center gap-2 flex-row-reverse">
          {usersLoading ? (
            <div className="flex-1 flex items-center justify-center h-9">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Select value={addingId} onValueChange={setAddingId} dir="rtl">
              <SelectTrigger className="flex-1" data-testid="select-add-member">
                <SelectValue placeholder="اختر مستخدماً للإضافة..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.length === 0 ? (
                  <SelectItem value="__none__" disabled>لا يوجد مستخدمون متاحون</SelectItem>
                ) : (
                  availableUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName} ({u.username})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            onClick={addMember}
            disabled={!addingId || assignMutation.isPending}
            data-testid="button-add-member"
          >
            {assignMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <UserPlus className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {/* ملاحظة الوراثة */}
      <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2 text-right">
        ✦ يرث كل مستخدم في هذه المجموعة صلاحياتها تلقائياً دون الحاجة لإعداد يدوي.
      </p>

      {/* قائمة الأعضاء */}
      <ScrollArea className="flex-1">
        {members.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            لا يوجد أعضاء في هذه المجموعة
          </div>
        ) : (
          <div className="space-y-1.5">
            {members.map(m => (
              <div
                key={m.id}
                data-testid={`member-row-${m.id}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg border bg-card flex-row-reverse"
              >
                <div className="flex flex-col text-right">
                  <span className="text-sm font-medium">{m.fullName}</span>
                  <span className="text-xs text-muted-foreground">{m.username}</span>
                </div>
                {canManage && m.id !== me?.id && (
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => removeMember(m.id)}
                    disabled={assignMutation.isPending}
                    data-testid={`button-remove-member-${m.id}`}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
