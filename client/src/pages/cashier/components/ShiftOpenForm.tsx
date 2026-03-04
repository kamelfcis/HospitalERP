import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnitType } from "../hooks/useCashierShift";

interface ShiftOpenFormProps {
  unitType: UnitType;
  unitName: string;
  staffList: { id: string; username: string; fullName: string }[] | undefined;
  cashierName: string;
  setCashierName: (v: string) => void;
  openingCash: string;
  setOpeningCash: (v: string) => void;
  filteredGlAccounts: { glAccountId: string; code: string; name: string; hasPassword: boolean }[];
  shiftGlAccountId: string;
  setShiftGlAccountId: (v: string) => void;
  glAccountSearch: string;
  setGlAccountSearch: (v: string) => void;
  selectedDrawerHasPassword: boolean;
  drawerPassword: string;
  setDrawerPassword: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
  canSubmit: boolean;
}

export function ShiftOpenForm({
  unitType, unitName, staffList, cashierName, setCashierName,
  openingCash, setOpeningCash, filteredGlAccounts, shiftGlAccountId,
  setShiftGlAccountId, glAccountSearch, setGlAccountSearch,
  selectedDrawerHasPassword, drawerPassword, setDrawerPassword,
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
        <label className="text-sm font-medium block">اسم الكاشير</label>
        <Select value={cashierName} onValueChange={setCashierName} data-testid="select-cashier-name">
          <SelectTrigger className="text-right" data-testid="select-cashier-name-trigger">
            <SelectValue placeholder="اختر اسمك من القائمة..." />
          </SelectTrigger>
          <SelectContent>
            {(staffList || []).map(u => (
              <SelectItem key={u.id} value={u.fullName || u.username} data-testid={`select-cashier-option-${u.id}`}>
                {u.fullName || u.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <div className="space-y-2">
        <label className="text-sm font-medium block">حساب الخزنة (GL)</label>
        <Select value={shiftGlAccountId} onValueChange={(v) => { setShiftGlAccountId(v); setDrawerPassword(""); }}>
          <SelectTrigger className="text-right" data-testid="select-gl-account-trigger">
            <SelectValue placeholder="اختر حساب الخزنة..." />
          </SelectTrigger>
          <SelectContent>
            <div className="p-2">
              <Input
                placeholder="بحث بالكود أو الاسم..."
                value={glAccountSearch}
                onChange={(e) => setGlAccountSearch(e.target.value)}
                className="text-right"
                data-testid="input-gl-account-search"
              />
            </div>
            {filteredGlAccounts.map(a => (
              <SelectItem key={a.glAccountId} value={a.glAccountId} data-testid={`select-gl-account-option-${a.glAccountId}`}>
                <span className="flex items-center gap-1.5">
                  {a.code} - {a.name}
                  {a.hasPassword && <span className="text-[9px] text-amber-600 bg-amber-100 dark:bg-amber-900/40 rounded px-1">محمية</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedDrawerHasPassword && (
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
        disabled={!canSubmit || isPending}
        className="w-full"
        data-testid="button-open-shift"
      >
        {isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <LogIn className="ml-2 h-4 w-4" />}
        فتح وردية جديدة
      </Button>
    </div>
  );
}
