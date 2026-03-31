import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Barcode, CalendarClock, Lock } from "lucide-react";
import { formatDateShort } from "@/lib/formatters";
import type { InsertItem, ItemFormType, ItemBarcode, ItemUom } from "@shared/schema";
import type { ItemWithFormType } from "./types";

interface ItemFormFieldsProps {
  formData: Partial<InsertItem>;
  setFormData: (data: Partial<InsertItem>) => void;
  isEditing: boolean;
  isNew: boolean;
  validationErrors: Record<string, string>;
  uniquenessResult: { codeUnique: boolean; nameArUnique: boolean; nameEnUnique: boolean } | null;
  formTypes: ItemFormType[] | undefined;
  uoms: ItemUom[] | undefined;
  item: ItemWithFormType | undefined;
  isService: boolean;
  hasMediumUnit: boolean;
  hasMinorUnit: boolean;
  isExpiryLocked: boolean;
  activeBarcodes: ItemBarcode[];
  itemId: string | null;
  hasTransactions?: boolean;
  setShowFormTypeDialog: (v: boolean) => void;
  setShowUomDialog: (v: boolean) => void;
  setShowBarcodeDialog: (v: boolean) => void;
  onExpiryToggle: (checked: boolean) => void;
  expiryPending: boolean;
  onDeleteBarcode: (id: string) => void;
  deletingBarcode: boolean;
}

export default function ItemFormFields({
  formData,
  setFormData,
  isEditing,
  isNew,
  validationErrors,
  uniquenessResult,
  formTypes,
  uoms,
  item,
  isService,
  hasMediumUnit,
  hasMinorUnit,
  isExpiryLocked,
  activeBarcodes,
  itemId,
  hasTransactions = false,
  setShowFormTypeDialog,
  setShowUomDialog,
  setShowBarcodeDialog,
  onExpiryToggle,
  expiryPending,
  onDeleteBarcode,
  deletingBarcode,
}: ItemFormFieldsProps) {
  const conversionLocked = !isNew && hasTransactions;
  const profitMargin = () => {
    const purchase = parseFloat(formData.purchasePriceLast || "0");
    const sale = parseFloat(formData.salePriceCurrent || "0");
    if (sale <= 0) return 0;
    return ((sale - purchase) / sale * 100).toFixed(1);
  };

  const conversionExample = () => {
    const major = formData.majorUnitName || "وحدة كبرى";
    const medium = formData.mediumUnitName;
    const minor = formData.minorUnitName;
    const toMedium = formData.majorToMedium;
    const toMinor = formData.majorToMinor;
    if (medium && minor && toMedium && toMinor) {
      return `1 ${major} = ${toMedium} ${medium} = ${toMinor} ${minor}`;
    }
    if (medium && toMedium) {
      return `1 ${major} = ${toMedium} ${medium}`;
    }
    return `وحدة واحدة فقط: ${major}`;
  };

  return (
    <>
      <fieldset className="peachtree-grid p-2 flex-shrink-0">
        <legend className="text-[11px] font-semibold px-1 text-primary">البيانات الأساسية</legend>
        <div className="grid grid-cols-6 gap-x-3 gap-y-1">
          <div className="col-span-1">
            <Label className={`text-[10px] ${validationErrors.itemCode ? "text-destructive" : "text-muted-foreground"}`}>كود الصنف *</Label>
            <Input
              value={formData.itemCode || ""}
              onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
              disabled={!isEditing || (!isNew && !!item)}
              className={`h-6 text-[11px] px-1 ${validationErrors.itemCode ? "border-destructive" : ""}`}
              data-testid="input-item-code"
            />
            {validationErrors.itemCode && <span className="text-[9px] text-destructive">{validationErrors.itemCode}</span>}
            {uniquenessResult && !uniquenessResult.codeUnique && (
              <span className="text-[9px] text-destructive">كود مكرر</span>
            )}
          </div>
          <div className="col-span-1">
            <Label className="text-[10px] text-muted-foreground">التصنيف</Label>
            <Select
              value={formData.category}
              onValueChange={(v: any) => setFormData({ ...formData, category: v })}
              disabled={!isEditing}
            >
              <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="drug">دواء</SelectItem>
                <SelectItem value="supply">مستلزمات</SelectItem>
                <SelectItem value="service">خدمة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className={`text-[10px] ${validationErrors.nameAr ? "text-destructive" : "text-muted-foreground"}`}>الاسم عربي *</Label>
            <Input
              value={formData.nameAr || ""}
              onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
              disabled={!isEditing}
              className={`h-6 text-[11px] px-1 ${validationErrors.nameAr ? "border-destructive" : ""}`}
              data-testid="input-name-ar"
            />
            {validationErrors.nameAr && <span className="text-[9px] text-destructive">{validationErrors.nameAr}</span>}
            {uniquenessResult && !uniquenessResult.nameArUnique && (
              <span className="text-[9px] text-destructive">اسم عربي مكرر</span>
            )}
          </div>
          <div className="col-span-2">
            <Label className={`text-[10px] ${validationErrors.nameEn ? "text-destructive" : "text-muted-foreground"}`}>الاسم إنجليزي *</Label>
            <Input
              value={formData.nameEn || ""}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              disabled={!isEditing}
              className={`h-6 text-[11px] px-1 ${validationErrors.nameEn ? "border-destructive" : ""}`}
              data-testid="input-name-en"
            />
            {validationErrors.nameEn && <span className="text-[9px] text-destructive">{validationErrors.nameEn}</span>}
            {uniquenessResult && !uniquenessResult.nameEnUnique && (
              <span className="text-[9px] text-destructive">اسم إنجليزي مكرر</span>
            )}
          </div>
          <div className="col-span-2">
            <Label className={`text-[10px] ${validationErrors.formTypeId ? "text-destructive" : "text-muted-foreground"}`}>نوع الشكل *</Label>
            <div className="flex gap-1">
              <Select
                value={formData.formTypeId || "none"}
                onValueChange={(v) => setFormData({ ...formData, formTypeId: v === "none" ? null : v })}
                disabled={!isEditing}
              >
                <SelectTrigger className={`h-6 text-[11px] px-1 flex-1 ${validationErrors.formTypeId ? "border-destructive" : ""}`} data-testid="select-form-type">
                  <SelectValue placeholder="اختر..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {formTypes?.map((ft) => (
                    <SelectItem key={ft.id} value={ft.id}>{ft.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEditing && (
                <Button variant="outline" size="icon" onClick={() => setShowFormTypeDialog(true)} data-testid="button-add-form-type">
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          <div className="col-span-2 flex items-end gap-3 pb-1">
            <div className="flex items-center gap-1">
              <Checkbox
                id="isToxic"
                checked={formData.isToxic || false}
                onCheckedChange={(c) => setFormData({ ...formData, isToxic: !!c })}
                disabled={!isEditing}
                className="h-3 w-3"
                data-testid="checkbox-toxic"
              />
              <Label htmlFor="isToxic" className="text-[10px] text-red-600 font-medium">سموم</Label>
            </div>
            <div className="flex items-center gap-1">
              <Checkbox
                id="hasExpiry"
                checked={formData.hasExpiry || false}
                onCheckedChange={(c) => {
                  if (isNew) {
                    setFormData({ ...formData, hasExpiry: !!c });
                  } else if (itemId) {
                    onExpiryToggle(!!c);
                  }
                }}
                disabled={(!isEditing && !itemId) || isExpiryLocked || expiryPending}
                className="h-3 w-3"
                data-testid="checkbox-has-expiry"
              />
              <Label htmlFor="hasExpiry" className="text-[10px] text-orange-600 font-medium flex items-center gap-0.5">
                <CalendarClock className="h-3 w-3" />
                صلاحية
              </Label>
              {isExpiryLocked && (
                <span className="text-[9px] text-muted-foreground">(مقفل)</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Checkbox
                id="isActive"
                checked={formData.isActive || false}
                onCheckedChange={(c) => setFormData({ ...formData, isActive: !!c })}
                disabled={!isEditing}
                className="h-3 w-3"
                data-testid="checkbox-active"
              />
              <Label htmlFor="isActive" className="text-[10px]">نشط</Label>
            </div>
            <div className="flex items-center gap-1">
              <Checkbox
                id="allowFractionalSale"
                checked={formData.allowFractionalSale ?? true}
                onCheckedChange={(c) => setFormData({ ...formData, allowFractionalSale: !!c })}
                disabled={!isEditing}
                className="h-3 w-3"
                data-testid="checkbox-allow-fractional"
              />
              <Label htmlFor="allowFractionalSale" className="text-[10px] text-blue-600 font-medium" title="السماح للكاشير ببيع كميات كسرية مثل 0.5 أو 0.33">يسمح بكسور</Label>
            </div>
          </div>
          <div className="col-span-2">
            <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
            <Input
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={!isEditing}
              className="h-6 text-[11px] px-1"
              data-testid="input-description"
            />
          </div>
        </div>
      </fieldset>

      <div className={`grid ${isService ? "grid-cols-1" : "grid-cols-2"} gap-2 flex-shrink-0`}>
        <fieldset className="peachtree-grid p-2">
          <legend className="text-[11px] font-semibold px-1 text-primary">الأسعار</legend>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">سعر الشراء</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.purchasePriceLast || ""}
                onChange={(e) => setFormData({ ...formData, purchasePriceLast: e.target.value })}
                disabled={!isEditing}
                className="h-6 text-[11px] px-1 font-mono text-left"
                dir="ltr"
                data-testid="input-purchase-price"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">سعر البيع</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.salePriceCurrent || ""}
                onChange={(e) => setFormData({ ...formData, salePriceCurrent: e.target.value })}
                disabled={!isEditing}
                className="h-6 text-[11px] px-1 font-mono text-left"
                dir="ltr"
                data-testid="input-sale-price"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">هامش الربح</Label>
              <div className="h-6 flex items-center justify-center bg-emerald-50 border rounded text-[11px] font-bold text-emerald-700">
                {profitMargin()}%
              </div>
            </div>
          </div>
          {/* ── ضريبة القيمة المضافة — الصيدلية ──────────────────────────── */}
          <div className="border-t pt-1.5 mt-1.5">
            <Label className="text-[9px] text-muted-foreground font-medium block mb-1">ض.ق.م — الصيدلية</Label>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <Label className="text-[10px] text-muted-foreground">نوع الضريبة</Label>
                <Select
                  value={(formData as any).taxType || "exempt"}
                  onValueChange={(v) => setFormData({ ...formData, taxType: v === "exempt" ? null : v } as any)}
                  disabled={!isEditing}
                >
                  <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-tax-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exempt">معفى</SelectItem>
                    <SelectItem value="taxable">خاضع</SelectItem>
                    <SelectItem value="zero_rated">معدل صفر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">نسبة الضريبة %</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={(formData as any).defaultTaxRate || ""}
                  onChange={(e) => setFormData({ ...formData, defaultTaxRate: e.target.value } as any)}
                  disabled={!isEditing || (formData as any).taxType !== "taxable"}
                  className="h-6 text-[11px] px-1 font-mono text-left"
                  dir="ltr"
                  placeholder="14"
                  data-testid="input-tax-rate"
                />
              </div>
              <div className="flex items-center gap-1 pb-0.5">
                <Checkbox
                  id="pharmacyPricesIncludeTax"
                  checked={(formData as any).pharmacyPricesIncludeTax || false}
                  onCheckedChange={(c) => setFormData({ ...formData, pharmacyPricesIncludeTax: !!c } as any)}
                  disabled={!isEditing || (formData as any).taxType !== "taxable"}
                  className="h-3 w-3"
                  data-testid="checkbox-prices-include-tax"
                />
                <Label htmlFor="pharmacyPricesIncludeTax" className="text-[10px] text-blue-600 font-medium" title="هل سعر البيع يشمل الضريبة مسبقاً؟">السعر شامل</Label>
              </div>
            </div>
          </div>
        </fieldset>

        {!isService && <fieldset className="peachtree-grid p-2">
          <legend className="text-[11px] font-semibold px-1 text-primary flex items-center gap-1">
            وحدات القياس
            {isEditing && (
              <Button variant="outline" size="sm" className="text-[9px] gap-0.5 px-1 h-4" onClick={() => setShowUomDialog(true)} data-testid="button-add-uom">
                <Plus className="h-2.5 w-2.5" />
                إضافة وحدة
              </Button>
            )}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className={`text-[10px] ${validationErrors.majorUnitName ? "text-destructive" : "text-muted-foreground"}`}>الكبرى *</Label>
              <Select
                value={formData.majorUnitName || "none"}
                onValueChange={(v) => setFormData({ ...formData, majorUnitName: v === "none" ? "" : v })}
                disabled={!isEditing}
              >
                <SelectTrigger className={`h-6 text-[11px] px-1 ${validationErrors.majorUnitName ? "border-destructive" : ""}`} data-testid="select-major-unit">
                  <SelectValue placeholder="اختر..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {uoms?.map((u) => (
                    <SelectItem key={u.id} value={u.nameAr}>{u.nameAr} ({u.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.majorUnitName && <span className="text-[9px] text-destructive">{validationErrors.majorUnitName}</span>}
            </div>
            <div>
              <Label className={`text-[10px] ${validationErrors.mediumUnitName ? "text-destructive" : "text-muted-foreground"}`}>المتوسطة</Label>
              <Select
                value={formData.mediumUnitName || "none"}
                onValueChange={(v) => {
                  const newMedium = v === "none" ? "" : v;
                  const updates: Partial<typeof formData> = { mediumUnitName: newMedium };
                  if (!newMedium) {
                    updates.majorToMedium = null;
                    updates.mediumToMinor = null;
                    updates.minorUnitName = "";
                    updates.majorToMinor = null;
                  }
                  setFormData({ ...formData, ...updates });
                }}
                disabled={!isEditing}
              >
                <SelectTrigger className={`h-6 text-[11px] px-1 ${validationErrors.mediumUnitName ? "border-destructive" : ""}`} data-testid="select-medium-unit">
                  <SelectValue placeholder="اختر..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {uoms?.map((u) => (
                    <SelectItem key={u.id} value={u.nameAr}>{u.nameAr} ({u.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.mediumUnitName && <span className="text-[9px] text-destructive">{validationErrors.mediumUnitName}</span>}
            </div>
            <div>
              <Label className={`text-[10px] ${validationErrors.minorUnitName ? "text-destructive" : "text-muted-foreground"}`}>الصغرى</Label>
              <Select
                value={formData.minorUnitName || "none"}
                onValueChange={(v) => {
                  const newMinor = v === "none" ? "" : v;
                  const updates: Partial<typeof formData> = { minorUnitName: newMinor };
                  if (!newMinor) {
                    updates.majorToMinor = null;
                    updates.mediumToMinor = null;
                  }
                  setFormData({ ...formData, ...updates });
                }}
                disabled={!isEditing}
              >
                <SelectTrigger className={`h-6 text-[11px] px-1 ${validationErrors.minorUnitName ? "border-destructive" : ""}`} data-testid="select-minor-unit">
                  <SelectValue placeholder="اختر..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {uoms?.map((u) => (
                    <SelectItem key={u.id} value={u.nameAr}>{u.nameAr} ({u.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.minorUnitName && <span className="text-[9px] text-destructive">{validationErrors.minorUnitName}</span>}
            </div>
          </div>
          {validationErrors.unitDuplicate && (
            <div className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1 mt-1">
              {validationErrors.unitDuplicate}
            </div>
          )}
        </fieldset>}
      </div>

      {!isService && (hasMediumUnit || hasMinorUnit) && (
        <fieldset className="peachtree-grid p-2 flex-shrink-0">
          <legend className="text-[11px] font-semibold px-1 text-primary flex items-center gap-1">
            معاملات التحويل
            {conversionLocked && (
              <span
                className="inline-flex items-center gap-0.5 text-[9px] text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded px-1 py-0.5 font-normal"
                title="لا يمكن تعديل معاملات التحويل — يوجد حركات تاريخية على هذا الصنف (دفعات / مشتريات / مبيعات)"
              >
                <Lock className="h-2.5 w-2.5" />
                مقفول — توجد حركات تاريخية
              </span>
            )}
          </legend>
          <div className="grid grid-cols-4 gap-3 items-center">
            {hasMediumUnit && (
              <div>
                <Label className={`text-[10px] ${validationErrors.majorToMedium ? "text-destructive" : "text-muted-foreground"}`}>كبرى ← متوسطة *</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.majorToMedium || ""}
                  onChange={(e) => setFormData({ ...formData, majorToMedium: e.target.value || null })}
                  disabled={!isEditing || conversionLocked}
                  placeholder="3"
                  className={`h-6 text-[11px] px-1 font-mono text-left ${validationErrors.majorToMedium ? "border-destructive" : ""}`}
                  dir="ltr"
                  data-testid="input-major-to-medium"
                />
                {validationErrors.majorToMedium && <span className="text-[9px] text-destructive">{validationErrors.majorToMedium}</span>}
              </div>
            )}
            {hasMediumUnit && hasMinorUnit && (
              <div>
                <Label className="text-[10px] text-muted-foreground">كبرى ← صغرى (تلقائي)</Label>
                <div
                  className="h-6 text-[11px] px-1 font-mono text-left border rounded flex items-center bg-muted/40 text-muted-foreground"
                  dir="ltr"
                  data-testid="text-major-to-minor-auto"
                  title="يُحسب تلقائياً = (كبرى→متوسطة) × (متوسطة→صغرى)"
                >
                  {(() => {
                    const m2med = parseFloat(String(formData.majorToMedium ?? "0"));
                    const med2min = parseFloat(String(formData.mediumToMinor ?? "0"));
                    return (m2med > 0 && med2min > 0) ? (m2med * med2min).toFixed(4).replace(/\.?0+$/, '') : "—";
                  })()}
                </div>
              </div>
            )}
            {!hasMediumUnit && hasMinorUnit && (
              <div>
                <Label className={`text-[10px] ${validationErrors.majorToMinor ? "text-destructive" : "text-muted-foreground"}`}>كبرى ← صغرى *</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.majorToMinor || ""}
                  onChange={(e) => setFormData({ ...formData, majorToMinor: e.target.value || null })}
                  disabled={!isEditing || conversionLocked}
                  placeholder="10"
                  className={`h-6 text-[11px] px-1 font-mono text-left ${validationErrors.majorToMinor ? "border-destructive" : ""}`}
                  dir="ltr"
                  data-testid="input-major-to-minor-direct"
                />
                {validationErrors.majorToMinor && <span className="text-[9px] text-destructive">{validationErrors.majorToMinor}</span>}
              </div>
            )}
            {hasMediumUnit && hasMinorUnit && (
              <div>
                <Label className={`text-[10px] ${validationErrors.mediumToMinor ? "text-destructive" : "text-muted-foreground"}`}>متوسطة ← صغرى *</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.mediumToMinor || ""}
                  onChange={(e) => setFormData({ ...formData, mediumToMinor: e.target.value || null })}
                  disabled={!isEditing || conversionLocked}
                  placeholder="10"
                  className={`h-6 text-[11px] px-1 font-mono text-left ${validationErrors.mediumToMinor ? "border-destructive" : ""}`}
                  dir="ltr"
                  data-testid="input-medium-to-minor"
                />
                {validationErrors.mediumToMinor && <span className="text-[9px] text-destructive">{validationErrors.mediumToMinor}</span>}
              </div>
            )}
            <div className="bg-muted/50 rounded px-2 py-1 text-center">
              <span className="text-[10px] text-muted-foreground block">مثال:</span>
              <span className="text-[11px] font-medium">{conversionExample()}</span>
            </div>
          </div>
        </fieldset>
      )}

      {!isService && !hasMediumUnit && !hasMinorUnit && (
        <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-3 py-2">
          الصنف بوحدة واحدة فقط ({formData.majorUnitName || "الكبرى"}) — يمكنك إضافة وحدة متوسطة أو صغرى اختيارياً
        </div>
      )}
      {isService && (
        <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-3 py-2" data-testid="text-service-no-units">
          صنف خدمة — لا يحتاج وحدات قياس
        </div>
      )}

      <fieldset className="peachtree-grid p-2 flex-shrink-0">
        <legend className="text-[11px] font-semibold px-1 text-primary flex items-center gap-1">
          <Barcode className="h-3.5 w-3.5" />
          الباركود / الكود الدولي
        </legend>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground">
            {isNew ? "احفظ الصنف أولاً ثم أضف الباركود" : activeBarcodes.length > 0 ? `${activeBarcodes.length} باركود مسجل` : "لا يوجد باركود"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="text-[10px] gap-0.5 px-1"
            onClick={() => setShowBarcodeDialog(true)}
            disabled={isNew}
            data-testid="button-add-barcode"
          >
            <Plus className="h-3 w-3" />
            إضافة باركود
          </Button>
        </div>
        {isNew ? (
          <div className="text-[10px] text-muted-foreground text-center py-3 border border-dashed rounded">
            يمكنك إضافة الباركود بعد حفظ الصنف
          </div>
        ) : activeBarcodes.length > 0 ? (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-1 px-1 text-right font-medium">الباركود</th>
                <th className="py-1 px-1 text-right font-medium">النوع</th>
                <th className="py-1 px-1 text-right font-medium">تاريخ الإضافة</th>
                <th className="py-1 px-1 text-center font-medium w-10">حذف</th>
              </tr>
            </thead>
            <tbody>
              {activeBarcodes.map((bc, i) => (
                <tr key={bc.id} className={i < activeBarcodes.length - 1 ? "border-b border-dashed" : ""} data-testid={`row-barcode-${bc.id}`}>
                  <td className="py-1 px-1 font-mono font-medium" dir="ltr">{bc.barcodeValue}</td>
                  <td className="py-1 px-1">
                    {bc.barcodeType ? (
                      <Badge variant="outline" className="text-[9px] h-4">{bc.barcodeType}</Badge>
                    ) : "-"}
                  </td>
                  <td className="py-1 px-1">{formatDateShort(bc.createdAt)}</td>
                  <td className="py-1 px-1 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => onDeleteBarcode(bc.id)}
                      disabled={deletingBarcode}
                      data-testid={`button-delete-barcode-${bc.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-[10px] text-muted-foreground text-center py-3 border border-dashed rounded">
            لم يتم تسجيل أي باركود بعد
          </div>
        )}
      </fieldset>
    </>
  );
}
