import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TreasurySummary } from "../types";

interface Props {
  treasury: TreasurySummary | null;
  onClose: () => void;
  onSetPassword: (params: { glAccountId: string; password: string }) => void;
  onRemovePassword: (glAccountId: string) => void;
  isSetting: boolean;
  isRemoving: boolean;
}

export function PasswordDialog({ treasury, onClose, onSetPassword, onRemovePassword, isSetting, isRemoving }: Props) {
  const { toast } = useToast();
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");

  const reset = () => { setPwdNew(""); setPwdConfirm(""); };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = () => {
    if (pwdNew.length < 4) {
      toast({ title: "كلمة السر يجب أن تكون 4 أحرف على الأقل", variant: "destructive" }); return;
    }
    if (pwdNew !== pwdConfirm) {
      toast({ title: "كلمتا السر غير متطابقتين", variant: "destructive" }); return;
    }
    onSetPassword({ glAccountId: treasury!.glAccountId, password: pwdNew });
    reset();
  };

  return (
    <Dialog open={!!treasury} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {treasury?.hasPassword ? "تغيير كلمة سر الخزنة" : "تعيين كلمة سر الخزنة"}
          </DialogTitle>
          <DialogDescription className="text-right">
            {treasury?.name} —{" "}
            <span className="font-mono text-xs">{treasury?.glAccountCode}</span>{" "}
            {treasury?.glAccountName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium block">كلمة السر الجديدة</label>
            <Input
              type="password"
              value={pwdNew}
              onChange={e => setPwdNew(e.target.value)}
              placeholder="أدخل كلمة السر (4 أحرف على الأقل)..."
              data-testid="input-pwd-new"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium block">تأكيد كلمة السر</label>
            <Input
              type="password"
              value={pwdConfirm}
              onChange={e => setPwdConfirm(e.target.value)}
              placeholder="أعد إدخال كلمة السر..."
              data-testid="input-pwd-confirm"
            />
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
          <Button
            onClick={handleSave}
            disabled={isSetting || !pwdNew || !pwdConfirm}
            data-testid="button-save-pwd"
          >
            {isSetting ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Lock className="h-4 w-4 ml-1" />}
            حفظ كلمة السر
          </Button>
          {treasury?.hasPassword && (
            <Button
              variant="destructive"
              onClick={() => treasury && onRemovePassword(treasury.glAccountId)}
              disabled={isRemoving}
              data-testid="button-remove-pwd"
            >
              {isRemoving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Trash2 className="h-4 w-4 ml-1" />}
              إزالة السر
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
