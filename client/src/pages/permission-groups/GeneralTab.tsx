import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast }   from "@/hooks/use-toast";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Label }      from "@/components/ui/label";
import { Textarea }   from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Save, Trash2, Info } from "lucide-react";
import type { GroupDetail } from "./types";

interface Props {
  group:     GroupDetail;
  canManage: boolean;
  onDeleted: () => void;
}

export function GeneralTab({ group, canManage, onDeleted }: Props) {
  const qc    = useQueryClient();
  const { toast } = useToast();

  const [name,       setName]       = useState(group.name);
  const [desc,       setDesc]       = useState(group.description ?? "");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    setName(group.name);
    setDesc(group.description ?? "");
  }, [group.id]);

  const dirty =
    name.trim() !== group.name ||
    desc.trim() !== (group.description ?? "");

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/permission-groups/${group.id}`, {
        name:        name.trim(),
        description: desc.trim() || undefined,
      }).then(r => r.json()),
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
          <span>هذه مجموعة نظامية. لا يمكن تغيير اسمها أو حذفها. يمكن تعديل الوصف فقط.</span>
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

          {!group.isSystem && (
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
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
