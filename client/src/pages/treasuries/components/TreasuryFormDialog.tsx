import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import { useAccountsForForm } from "../hooks/useTreasuries";
import type { TreasuryForm } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: string | null;
  form: TreasuryForm;
  onFormChange: (patch: Partial<TreasuryForm>) => void;
  onSubmit: () => void;
  isSaving: boolean;
}

export function TreasuryFormDialog({ open, onOpenChange, editId, form, onFormChange, onSubmit, isSaving }: Props) {
  const { data: accounts = [] } = useAccountsForForm(open);
  const selectedAccount = accounts.find(a => a.id === form.glAccountId);

  return (
    <Dialog open={open} onOpenChange={o => { if (!isSaving) onOpenChange(o); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {editId ? "تعديل الخزنة" : "إضافة خزنة جديدة"}
          </DialogTitle>
          {editId && (
            <DialogDescription className="text-right">
              التغييرات تُطبَّق فوراً بعد الحفظ
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium block">اسم الخزنة *</label>
            <Input
              value={form.name}
              onChange={e => onFormChange({ name: e.target.value })}
              placeholder="مثال: خزنة الاستقبال الرئيسية"
              data-testid="input-treasury-name"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium block">الحساب في دليل الحسابات *</label>
            <AccountSearchSelect
              accounts={accounts.filter(a => a.isActive)}
              value={form.glAccountId}
              onChange={v => onFormChange({ glAccountId: v })}
              placeholder="ابحث عن الحساب بالكود أو الاسم..."
              data-testid="select-treasury-account"
            />
            {selectedAccount && (
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{selectedAccount.code}</span> — {selectedAccount.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium block">ملاحظات</label>
            <Input
              value={form.notes}
              onChange={e => onFormChange({ notes: e.target.value })}
              placeholder="اختياري..."
              data-testid="input-treasury-notes"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => onFormChange({ isActive: e.target.checked })}
              data-testid="checkbox-treasury-active"
            />
            <span className="text-sm">خزنة نشطة</span>
          </label>
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
          <Button onClick={onSubmit} disabled={isSaving} data-testid="button-save-treasury">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            {editId ? "تحديث" : "إضافة"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
