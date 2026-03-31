import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

// ─── أنواع ─────────────────────────────────────────────────────────────────────
export interface PriceListFormState {
  code: string;
  name: string;
  currency: string;
  priceListType: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  notes: string;
}

export const defaultPriceListForm: PriceListFormState = {
  code: "", name: "", currency: "EGP", priceListType: "service",
  validFrom: "", validTo: "", isActive: true, notes: "",
};

export const priceListTypeLabels: Record<string, string> = {
  service:  "خدمات",
  pharmacy: "صيدلية",
  mixed:    "مختلط",
};

interface Props {
  open: boolean;
  onClose: () => void;
  form: PriceListFormState;
  setForm: (fn: (prev: PriceListFormState) => PriceListFormState) => void;
  onSave: () => void;
  saving: boolean;
  isEdit: boolean;
}

// ─── PriceListModal ────────────────────────────────────────────────────────────
export default function PriceListModal({ open, onClose, form, setForm, onSave, saving, isEdit }: Props) {
  const canSave = !!(form.code && form.name);

  const set = (key: keyof PriceListFormState, value: string | boolean) =>
    setForm(f => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل قائمة أسعار" : "إضافة قائمة أسعار"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>الكود *</Label>
            <Input data-testid="input-pl-code" value={form.code}
              onChange={e => set("code", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>الاسم *</Label>
            <Input data-testid="input-pl-name" value={form.name}
              onChange={e => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>نوع القائمة</Label>
            <Select value={form.priceListType} onValueChange={v => set("priceListType", v)}>
              <SelectTrigger className="h-9" data-testid="select-pl-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="service">خدمات</SelectItem>
                <SelectItem value="pharmacy">صيدلية</SelectItem>
                <SelectItem value="mixed">مختلط</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>العملة</Label>
            <Input data-testid="input-pl-currency" value={form.currency}
              onChange={e => set("currency", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>صالح من</Label>
            <Input data-testid="input-pl-validFrom" type="date" value={form.validFrom}
              onChange={e => set("validFrom", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>صالح حتى</Label>
            <Input data-testid="input-pl-validTo" type="date" value={form.validTo}
              onChange={e => set("validTo", e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="pl-active" checked={form.isActive}
              onCheckedChange={v => set("isActive", !!v)}
              data-testid="checkbox-pl-active" />
            <Label htmlFor="pl-active">نشط</Label>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>ملاحظات</Label>
            <Textarea data-testid="input-pl-notes" value={form.notes}
              onChange={e => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-pl">إلغاء</Button>
          <Button onClick={onSave} disabled={saving || !canSave} data-testid="button-save-pl">
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
