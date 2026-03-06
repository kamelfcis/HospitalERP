import { Loader2, LogIn, Wallet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { UnitType, UserGlAccount } from "../types";

interface ShiftOpenFormProps {
  unitType: UnitType;
  unitName: string;
  cashierName: string;
  userGlAccount: UserGlAccount | null | undefined;
  openingCash: string;
  setOpeningCash: (v: string) => void;
  drawerPassword: string;
  setDrawerPassword: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
  canSubmit: boolean;
}

export function ShiftOpenForm({
  unitType, unitName, cashierName, userGlAccount,
  openingCash, setOpeningCash,
  drawerPassword, setDrawerPassword,
  onBack, onSubmit, isPending, canSubmit,
}: ShiftOpenFormProps) {
  return (
    <div className="space-y-4 max-w-sm mx-auto" dir="rtl">
      <div className="text-right space-y-0.5">
        <button onClick={onBack} className="text-xs text-primary underline-offset-2 hover:underline" data-testid="btn-back-unit">
          ← تغيير الوحدة
        </button>
        <p className="text-sm font-medium">{unitType === "pharmacy" ? "صيدلية" : "قسم"}: {unitName}</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium block">الكاشير</label>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-right flex items-center gap-2" data-testid="display-cashier-name">
          <Wallet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium">{cashierName || "—"}</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium block">حساب الخزنة (GL)</label>
        {userGlAccount ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-right flex items-center justify-between" data-testid="display-gl-account">
            <Badge variant="outline" className="text-xs font-mono">{userGlAccount.code}</Badge>
            <span className="font-medium">{userGlAccount.name}</span>
          </div>
        ) : (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-right flex items-center gap-2" data-testid="display-no-gl-account">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            <span className="text-destructive text-xs">لم يتم تحديد حساب خزنة لهذا المستخدم — تواصل مع المدير</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium block">رصيد الافتتاح (ج.م)</label>
        <Input
          type="number"
          placeholder="المبلغ النقدي الموجود في الخزنة"
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          className="text-right"
          data-testid="input-opening-cash"
        />
        <p className="text-xs text-muted-foreground">المبلغ الفعلي في درج الكاشير عند بداية الوردية</p>
      </div>

      {userGlAccount?.hasPassword && (
        <div className="space-y-2">
          <label className="text-sm font-medium block">كلمة سر الخزنة</label>
          <Input
            type="password"
            placeholder="أدخل كلمة سر الخزنة..."
            value={drawerPassword}
            onChange={(e) => setDrawerPassword(e.target.value)}
            className="text-right"
            data-testid="input-drawer-password"
          />
          <p className="text-xs text-amber-600 dark:text-amber-400">هذه الخزنة محمية بكلمة سر</p>
        </div>
      )}

      <Button
        onClick={onSubmit}
        disabled={!canSubmit || isPending || !userGlAccount}
        className="w-full"
        data-testid="button-open-shift"
      >
        {isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <LogIn className="ml-2 h-4 w-4" />}
        فتح وردية جديدة
      </Button>
    </div>
  );
}
