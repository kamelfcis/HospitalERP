/**
 * Permission Groups Management — إدارة مجموعات الصلاحيات
 *
 * تخطيط ثنائي الألواح:
 *  يمين: قائمة المجموعات (بحث + إنشاء)
 *  يسار: تفاصيل المجموعة (تبويبات: عام / الأعضاء / الصلاحيات)
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PERMISSION_GROUPS as PERM_MODULES } from "@shared/permissions";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge }    from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Trash2, Shield, ShieldCheck, Users,
  Save, Search, KeyRound, Info, UserMinus, UserPlus,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

interface GroupSummary {
  id:              string;
  name:            string;
  description:     string | null;
  isSystem:        boolean;
  memberCount:     number;
  permissionCount: number;
  createdAt:       string;
}

interface GroupMember {
  id:       string;
  fullName: string;
  username: string;
}

interface GroupDetail extends GroupSummary {
  permissions: string[];
  members:     GroupMember[];
}

interface UserRow {
  id:       string;
  username: string;
  fullName: string;
  role:     string;
  isActive: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  GroupCard — بطاقة المجموعة في القائمة
// ─────────────────────────────────────────────────────────────────────────────

function GroupCard({
  group,
  selected,
  onClick,
}: {
  group: GroupSummary;
  selected: boolean;
  onClick: () => void;
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
            {group.isSystem ? (
              <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            ) : (
              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="font-semibold text-sm truncate">{group.name}</span>
          </div>
          {group.description && (
            <p className="text-xs text-muted-foreground truncate">{group.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {group.isSystem && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 text-amber-600 border-amber-300">
              نظامي
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-row-reverse">
        <span className="flex items-center gap-1 flex-row-reverse">
          <Users className="h-3 w-3" />
          {group.memberCount} مستخدم
        </span>
        <span className="flex items-center gap-1 flex-row-reverse">
          <KeyRound className="h-3 w-3" />
          {group.permissionCount} صلاحية
        </span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PermissionsMatrix — مصفوفة الصلاحيات
// ─────────────────────────────────────────────────────────────────────────────

function PermissionsMatrix({
  groupId,
  isSystem,
  initialPermissions,
  canManage,
}: {
  groupId:            string;
  isSystem:           boolean;
  initialPermissions: string[];
  canManage:          boolean;
}) {
  const qc    = useQueryClient();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Set<string>>(new Set(initialPermissions));
  const [dirty,    setDirty]    = useState(false);

  useEffect(() => {
    setSelected(new Set(initialPermissions));
    setDirty(false);
  }, [groupId, initialPermissions.join(",")]);

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

  function toggle(key: string) {
    if (!canManage || isSystem) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  }

  function toggleModule(keys: string[], forceOn?: boolean) {
    if (!canManage || isSystem) return;
    setSelected(prev => {
      const next = new Set(prev);
      const allOn = keys.every(k => next.has(k));
      keys.forEach(k => {
        if (forceOn === true || (!allOn && forceOn === undefined)) next.add(k);
        else next.delete(k);
      });
      return next;
    });
    setDirty(true);
  }

  const totalSelected = selected.size;
  const totalAll      = PERM_MODULES.reduce((s, m) => s + m.permissions.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* شريط الإحصاء والحفظ */}
      <div className="flex items-center justify-between pb-3 border-b mb-3 flex-row-reverse">
        <div className="text-xs text-muted-foreground">
          {totalSelected} / {totalAll} صلاحية مفعّلة
        </div>
        {canManage && !isSystem && (
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            data-testid="button-save-permissions"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : (
              <Save className="h-4 w-4 ml-2" />
            )}
            حفظ الصلاحيات
          </Button>
        )}
        {isSystem && (
          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
            مجموعة نظامية — للعرض فقط
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1 -ml-1 pl-1">
        <div className="space-y-3">
          {PERM_MODULES.map(module => {
            const moduleKeys     = module.permissions.map(p => p.key);
            const allChecked     = moduleKeys.every(k => selected.has(k));
            const someChecked    = moduleKeys.some(k => selected.has(k));
            const indeterminate  = someChecked && !allChecked;

            return (
              <div key={module.label} className="border rounded-lg overflow-hidden">
                {/* رأس القسم */}
                <div
                  className={`flex items-center justify-between px-3 py-2 bg-muted/50 flex-row-reverse ${
                    !isSystem && canManage ? "cursor-pointer hover:bg-muted" : ""
                  }`}
                  onClick={() => !isSystem && canManage && toggleModule(moduleKeys)}
                >
                  <span className="text-sm font-semibold">{module.label}</span>
                  <div className="flex items-center gap-2 flex-row-reverse">
                    <span className="text-xs text-muted-foreground">
                      {moduleKeys.filter(k => selected.has(k)).length}/{moduleKeys.length}
                    </span>
                    {canManage && !isSystem && (
                      <Checkbox
                        checked={allChecked ? true : indeterminate ? "indeterminate" : false}
                        onCheckedChange={v => toggleModule(moduleKeys, v === true)}
                        onClick={e => e.stopPropagation()}
                        data-testid={`checkbox-module-${module.label}`}
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
                        !isSystem && canManage ? "cursor-pointer" : "cursor-default"
                      }`}
                      data-testid={`label-perm-${perm.key}`}
                    >
                      <Checkbox
                        checked={selected.has(perm.key)}
                        onCheckedChange={() => toggle(perm.key)}
                        disabled={isSystem || !canManage}
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
      </ScrollArea>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MembersTab — إدارة أعضاء المجموعة
// ─────────────────────────────────────────────────────────────────────────────

function MembersTab({
  groupId,
  members,
  canManage,
}: {
  groupId:   string;
  members:   GroupMember[];
  canManage: boolean;
}) {
  const qc    = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

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

  function addMember() {
    if (!addingId) return;
    assignMutation.mutate({ userId: addingId, gid: groupId });
  }

  function removeMember(userId: string) {
    assignMutation.mutate({ userId, gid: null });
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* إضافة عضو */}
      {canManage && (
        <div className="flex items-center gap-2 flex-row-reverse">
          {usersLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
            {assignMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

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
                {canManage && m.id !== currentUser?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
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

// ─────────────────────────────────────────────────────────────────────────────
//  GeneralTab — البيانات الأساسية للمجموعة
// ─────────────────────────────────────────────────────────────────────────────

function GeneralTab({
  group,
  canManage,
  onDeleted,
}: {
  group:     GroupDetail;
  canManage: boolean;
  onDeleted: () => void;
}) {
  const qc    = useQueryClient();
  const { toast } = useToast();

  const [name,        setName]        = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [showDelete,  setShowDelete]  = useState(false);

  useEffect(() => {
    setName(group.name);
    setDescription(group.description ?? "");
  }, [group.id]);

  const dirty =
    name.trim() !== group.name ||
    description.trim() !== (group.description ?? "");

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/permission-groups/${group.id}`, {
        name: name.trim(),
        description: description.trim() || undefined,
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/permission-groups"] });
      qc.invalidateQueries({ queryKey: ["/api/permission-groups", group.id] });
      toast({ title: "تم حفظ التغييرات" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/permission-groups/${group.id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/permission-groups"] });
      toast({ title: "تم حذف المجموعة" });
      onDeleted();
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const canDelete =
    canManage && !group.isSystem && group.memberCount === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* تحذير مجموعة نظامية */}
      {group.isSystem && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex-row-reverse">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>هذه مجموعة نظامية. لا يمكن تغيير اسمها أو حذفها.</span>
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
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={!canManage}
          placeholder="وصف اختياري..."
          rows={3}
          dir="rtl"
          data-testid="input-group-description"
        />
      </div>

      {/* إحصاءات */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-primary">{group.memberCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">مستخدم</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-primary">{group.permissionCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">صلاحية</div>
        </div>
      </div>

      {/* أزرار الحفظ والحذف */}
      {canManage && (
        <div className="flex items-center justify-between flex-row-reverse pt-1">
          {canDelete ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDelete(true)}
              data-testid="button-delete-group"
            >
              <Trash2 className="h-4 w-4 ml-2" />
              حذف المجموعة
            </Button>
          ) : (
            <div />
          )}

          {!group.isSystem && (
            <Button
              size="sm"
              onClick={() => updateMutation.mutate()}
              disabled={!dirty || updateMutation.isPending}
              data-testid="button-save-general"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Save className="h-4 w-4 ml-2" />
              )}
              حفظ
            </Button>
          )}
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
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  GroupDetail — اللوح الأيسر (تفاصيل + تبويبات)
// ─────────────────────────────────────────────────────────────────────────────

function GroupDetail({
  groupId,
  canManage,
  onDeleted,
}: {
  groupId:   string;
  canManage: boolean;
  onDeleted: () => void;
}) {
  const { data: group, isLoading, isError } = useQuery<GroupDetail>({
    queryKey: ["/api/permission-groups", groupId],
    queryFn:  () => fetch(`/api/permission-groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        تعذّر تحميل المجموعة
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* رأس المجموعة */}
      <div className="flex items-center gap-2 pb-3 border-b mb-4 flex-row-reverse">
        {group.isSystem ? (
          <ShieldCheck className="h-5 w-5 text-amber-500" />
        ) : (
          <Shield className="h-5 w-5 text-primary" />
        )}
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
      <Tabs defaultValue="general" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mb-3 w-full justify-start flex-row-reverse">
          <TabsTrigger value="general"     data-testid="tab-general">عام</TabsTrigger>
          <TabsTrigger value="members"     data-testid="tab-members">
            الأعضاء
            {group.memberCount > 0 && (
              <Badge variant="secondary" className="mr-1.5 h-4 px-1 text-[10px]">
                {group.memberCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="permissions" data-testid="tab-permissions">
            الصلاحيات
            <Badge variant="secondary" className="mr-1.5 h-4 px-1 text-[10px]">
              {group.permissionCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-hidden">
          <TabsContent value="general" className="h-full overflow-auto mt-0">
            <GeneralTab
              group={group}
              canManage={canManage}
              onDeleted={onDeleted}
            />
          </TabsContent>

          <TabsContent value="members" className="h-full overflow-hidden mt-0 flex flex-col">
            <MembersTab
              groupId={groupId}
              members={group.members}
              canManage={canManage}
            />
          </TabsContent>

          <TabsContent value="permissions" className="h-full overflow-hidden mt-0 flex flex-col">
            <PermissionsMatrix
              key={groupId}
              groupId={groupId}
              isSystem={group.isSystem}
              initialPermissions={group.permissions}
              canManage={canManage}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CreateGroupDialog — نافذة إنشاء مجموعة جديدة
// ─────────────────────────────────────────────────────────────────────────────

function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  onCreated:    (id: string) => void;
}) {
  const qc    = useQueryClient();
  const { toast } = useToast();

  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");

  function reset() {
    setName("");
    setDescription("");
  }

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/permission-groups", {
        name: name.trim(),
        description: description.trim() || undefined,
      }).then(r => r.json()),
    onSuccess: (data: GroupSummary) => {
      qc.invalidateQueries({ queryKey: ["/api/permission-groups"] });
      toast({ title: `تم إنشاء المجموعة "${data.name}"` });
      reset();
      onOpenChange(false);
      onCreated(data.id);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>مجموعة صلاحيات جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label htmlFor="new-name">اسم المجموعة *</Label>
            <Input
              id="new-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثال: مدير الصيدلية"
              dir="rtl"
              data-testid="input-new-group-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-desc">الوصف (اختياري)</Label>
            <Textarea
              id="new-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="وصف دور هذه المجموعة..."
              rows={2}
              dir="rtl"
              data-testid="input-new-group-description"
            />
          </div>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            data-testid="button-create-group-confirm"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : (
              <Plus className="h-4 w-4 ml-2" />
            )}
            إنشاء
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PermissionGroupsPage — الصفحة الرئيسية
// ─────────────────────────────────────────────────────────────────────────────

export default function PermissionGroupsPage() {
  const { hasPermission } = useAuth();

  const canView   = hasPermission("permission_groups.view");
  const canManage = hasPermission("permission_groups.manage");

  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [showCreate,   setShowCreate]   = useState(false);

  const { data: groups = [], isLoading } = useQuery<GroupSummary[]>({
    queryKey: ["/api/permission-groups"],
    enabled:  canView,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(
      g => g.name.toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q)
    );
  }, [groups, search]);

  // اختر أول مجموعة تلقائياً
  useEffect(() => {
    if (!selectedId && groups.length > 0) {
      setSelectedId(groups[0].id);
    }
  }, [groups, selectedId]);

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
      {/* ── اللوح الأيمن: القائمة ─────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-l flex flex-col bg-muted/10">
        {/* رأس القائمة */}
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-sm">مجموعات الصلاحيات</h1>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setShowCreate(true)}
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
                  onClick={() => setSelectedId(g.id)}
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

      {/* ── اللوح الأيسر: التفاصيل ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden p-4">
        {selectedId ? (
          <GroupDetail
            key={selectedId}
            groupId={selectedId}
            canManage={canManage}
            onDeleted={() => setSelectedId(groups.find(g => g.id !== selectedId)?.id ?? null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <ShieldCheck className="h-10 w-10 opacity-20" />
            اختر مجموعة من القائمة لعرض التفاصيل
          </div>
        )}
      </div>

      {/* نافذة الإنشاء */}
      <CreateGroupDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={id => setSelectedId(id)}
      />
    </div>
  );
}
