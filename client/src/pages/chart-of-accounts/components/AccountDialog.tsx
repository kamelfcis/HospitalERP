import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { Account, InsertAccount } from "@shared/schema";

interface AccountDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingAccount: Account | null;
  formData: Partial<InsertAccount>;
  setFormData: (data: Partial<InsertAccount>) => void;
  accounts: Account[] | undefined;
  handleSubmit: () => void;
}

export function AccountDialog({
  isOpen,
  onOpenChange,
  editingAccount,
  formData,
  setFormData,
  accounts,
  handleSubmit,
}: AccountDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4" dir="rtl">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm font-bold">
            {editingAccount ? "تعديل حساب" : "إضافة حساب جديد"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="code" className="text-xs">رقم الحساب *</Label>
              <Input
                id="code"
                value={formData.code || ""}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="مثال: 1101"
                className="peachtree-input text-xs font-mono"
                data-testid="input-account-code"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="accountType" className="text-xs">نوع الحساب *</Label>
              <Select
                value={formData.accountType || "asset"}
                onValueChange={(value: any) => {
                  const requiresCostCenter = value === "revenue" || value === "expense";
                  setFormData({ ...formData, accountType: value, requiresCostCenter });
                }}
              >
                <SelectTrigger id="accountType" className="peachtree-select text-xs" data-testid="select-account-type">
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset" className="text-xs">أصول</SelectItem>
                  <SelectItem value="liability" className="text-xs">خصوم</SelectItem>
                  <SelectItem value="equity" className="text-xs">حقوق ملكية</SelectItem>
                  <SelectItem value="revenue" className="text-xs">إيرادات</SelectItem>
                  <SelectItem value="expense" className="text-xs">مصروفات</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs">اسم الحساب *</Label>
            <Input
              id="name"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="اسم الحساب بالعربية"
              className="peachtree-input text-xs"
              data-testid="input-account-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="parentId" className="text-xs">الحساب الرئيسي</Label>
            <Select
              value={formData.parentId || "none"}
              onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? null : value })}
            >
              <SelectTrigger id="parentId" className="peachtree-select text-xs" data-testid="select-parent-account">
                <SelectValue placeholder="اختر الحساب الرئيسي" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">بدون حساب رئيسي</SelectItem>
                {accounts
                  ?.filter((a) => a.id !== editingAccount?.id)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id} className="text-xs">
                      <span className="font-mono">{account.code}</span> - {account.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="openingBalance" className="text-xs">الرصيد الافتتاحي</Label>
            <Input
              id="openingBalance"
              type="number"
              step="0.01"
              value={formData.openingBalance || "0"}
              onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
              placeholder="0.00"
              className="peachtree-input text-xs"
              data-testid="input-account-opening-balance"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description" className="text-xs">الوصف</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="وصف إضافي للحساب..."
              className="peachtree-input text-xs min-h-[60px]"
              data-testid="textarea-account-description"
            />
          </div>
          <div className="flex items-center gap-6 py-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: !!checked })}
                data-testid="checkbox-account-active"
              />
              <Label htmlFor="isActive" className="text-xs">حساب نشط</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="requiresCostCenter"
                checked={formData.requiresCostCenter}
                onCheckedChange={(checked) => setFormData({ ...formData, requiresCostCenter: !!checked })}
                data-testid="checkbox-account-requires-cost-center"
              />
              <Label htmlFor="requiresCostCenter" className="text-xs">يتطلب مركز تكلفة</Label>
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button 
            onClick={handleSubmit} 
            className="h-8 text-xs px-6"
            data-testid="button-save-account"
          >
            حفظ الحساب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
