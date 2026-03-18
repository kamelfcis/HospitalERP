import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast }   from "@/hooks/use-toast";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Label }      from "@/components/ui/label";
import { Textarea }   from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import type { GroupSummary } from "./types";

interface Props {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  onCreated:    (id: string) => void;
}

export function CreateGroupDialog({ open, onOpenChange, onCreated }: Props) {
  const qc    = useQueryClient();
  const { toast } = useToast();

  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");

  function reset() { setName(""); setDescription(""); }

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/permission-groups", {
        name:        name.trim(),
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
              onKeyDown={e => e.key === "Enter" && name.trim() && createMutation.mutate()}
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
            {createMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin ml-2" />
              : <Plus    className="h-4 w-4 ml-2" />}
            إنشاء
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
