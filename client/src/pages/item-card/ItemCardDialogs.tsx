import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Barcode } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ItemDepartmentPriceWithDepartment, Department } from "@shared/schema";
import type { ItemWithFormType } from "./types";

interface ItemCardDialogsProps {
  showFormTypeDialog: boolean;
  setShowFormTypeDialog: (v: boolean) => void;
  newFormTypeName: string;
  setNewFormTypeName: (v: string) => void;
  createFormTypeMutation: UseMutationResult<any, any, string, any>;

  showDeptPriceDialog: boolean;
  setShowDeptPriceDialog: (v: boolean) => void;
  selectedDeptPrice: ItemDepartmentPriceWithDepartment | null;
  setSelectedDeptPrice: (v: ItemDepartmentPriceWithDepartment | null) => void;
  newDeptPrice: { departmentId: string; salePrice: string };
  setNewDeptPrice: (v: { departmentId: string; salePrice: string }) => void;
  handleSaveDeptPrice: () => void;
  createDeptPriceMutation: UseMutationResult<any, any, any, any>;
  updateDeptPriceMutation: UseMutationResult<any, any, any, any>;
  availableDepartments: Department[];
  item: ItemWithFormType | undefined;

  showBarcodeDialog: boolean;
  setShowBarcodeDialog: (v: boolean) => void;
  newBarcodeValue: string;
  setNewBarcodeValue: (v: string) => void;
  newBarcodeType: string;
  setNewBarcodeType: (v: string) => void;
  handleAddBarcode: () => void;
  addBarcodeMutation: UseMutationResult<any, any, any, any>;

  showUomDialog: boolean;
  setShowUomDialog: (v: boolean) => void;
  newUomCode: string;
  setNewUomCode: (v: string) => void;
  newUomNameAr: string;
  setNewUomNameAr: (v: string) => void;
  newUomNameEn: string;
  setNewUomNameEn: (v: string) => void;
  createUomMutation: UseMutationResult<any, any, any, any>;
}

export default function ItemCardDialogs({
  showFormTypeDialog,
  setShowFormTypeDialog,
  newFormTypeName,
  setNewFormTypeName,
  createFormTypeMutation,

  showDeptPriceDialog,
  setShowDeptPriceDialog,
  selectedDeptPrice,
  setSelectedDeptPrice,
  newDeptPrice,
  setNewDeptPrice,
  handleSaveDeptPrice,
  createDeptPriceMutation,
  updateDeptPriceMutation,
  availableDepartments,
  item,

  showBarcodeDialog,
  setShowBarcodeDialog,
  newBarcodeValue,
  setNewBarcodeValue,
  newBarcodeType,
  setNewBarcodeType,
  handleAddBarcode,
  addBarcodeMutation,

  showUomDialog,
  setShowUomDialog,
  newUomCode,
  setNewUomCode,
  newUomNameAr,
  setNewUomNameAr,
  newUomNameEn,
  setNewUomNameEn,
  createUomMutation,
}: ItemCardDialogsProps) {
  return (
    <>
      <Dialog open={showFormTypeDialog} onOpenChange={setShowFormTypeDialog}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle className="text-sm">إضافة نوع شكل جديد</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs">اسم نوع الشكل</Label>
            <Input
              value={newFormTypeName}
              onChange={(e) => setNewFormTypeName(e.target.value)}
              placeholder="مثال: أقراص"
              className="mt-1 h-7 text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowFormTypeDialog(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => createFormTypeMutation.mutate(newFormTypeName)}
              disabled={!newFormTypeName || createFormTypeMutation.isPending}
            >
              {createFormTypeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeptPriceDialog} onOpenChange={setShowDeptPriceDialog}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {selectedDeptPrice ? "تعديل سعر القسم" : "إضافة سعر لقسم"} ({item?.majorUnitName || "الوحدة الكبرى"})
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">القسم</Label>
              {selectedDeptPrice ? (
                <div className="h-6 flex items-center text-[11px] px-1 bg-muted rounded">
                  {selectedDeptPrice.department?.nameAr}
                </div>
              ) : (
                <Select
                  value={newDeptPrice.departmentId}
                  onValueChange={(v) => setNewDeptPrice({ ...newDeptPrice, departmentId: v })}
                >
                  <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-department">
                    <SelectValue placeholder="اختر القسم..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDepartments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">سعر البيع</Label>
              <Input
                type="number"
                step="0.01"
                value={newDeptPrice.salePrice}
                onChange={(e) => setNewDeptPrice({ ...newDeptPrice, salePrice: e.target.value })}
                placeholder="0.00"
                className="h-6 text-[11px] px-1 font-mono text-left"
                dir="ltr"
                data-testid="input-dept-sale-price"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px]"
              onClick={() => {
                setShowDeptPriceDialog(false);
                setSelectedDeptPrice(null);
                setNewDeptPrice({ departmentId: "", salePrice: "" });
              }}
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              className="text-[10px]"
              onClick={handleSaveDeptPrice}
              disabled={createDeptPriceMutation.isPending || updateDeptPriceMutation.isPending}
            >
              {(createDeptPriceMutation.isPending || updateDeptPriceMutation.isPending) ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "حفظ"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBarcodeDialog} onOpenChange={setShowBarcodeDialog}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1">
              <Barcode className="h-4 w-4" />
              إضافة باركود جديد
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">قيمة الباركود</Label>
              <Input
                value={newBarcodeValue}
                onChange={(e) => setNewBarcodeValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddBarcode();
                  }
                }}
                placeholder="مثال: 6221234567890"
                className="h-7 text-xs font-mono text-left"
                dir="ltr"
                autoFocus
                data-testid="input-barcode-value"
              />
              <p className="text-[9px] text-muted-foreground mt-1">يمكنك استخدام الاسكنر مباشرة أو كتابة الباركود يدوياً</p>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">نوع الباركود (اختياري)</Label>
              <Select value={newBarcodeType} onValueChange={setNewBarcodeType}>
                <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-barcode-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EAN-13">EAN-13</SelectItem>
                  <SelectItem value="EAN-8">EAN-8</SelectItem>
                  <SelectItem value="Code128">Code 128</SelectItem>
                  <SelectItem value="Code39">Code 39</SelectItem>
                  <SelectItem value="UPC-A">UPC-A</SelectItem>
                  <SelectItem value="QR">QR Code</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px]"
              onClick={() => {
                setShowBarcodeDialog(false);
                setNewBarcodeValue("");
                setNewBarcodeType("EAN-13");
              }}
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              className="text-[10px]"
              onClick={handleAddBarcode}
              disabled={addBarcodeMutation.isPending || !newBarcodeValue.trim()}
              data-testid="button-save-barcode"
            >
              {addBarcodeMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "إضافة"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUomDialog} onOpenChange={setShowUomDialog}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle className="text-sm">إضافة وحدة قياس جديدة</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div>
              <Label className="text-xs">الكود</Label>
              <Input
                value={newUomCode}
                onChange={(e) => setNewUomCode(e.target.value)}
                placeholder="مثال: BOX"
                className="mt-1 h-7 text-xs font-mono text-left"
                dir="ltr"
                data-testid="input-uom-code"
              />
            </div>
            <div>
              <Label className="text-xs">الاسم عربي</Label>
              <Input
                value={newUomNameAr}
                onChange={(e) => setNewUomNameAr(e.target.value)}
                placeholder="مثال: علبة"
                className="mt-1 h-7 text-xs"
                data-testid="input-uom-name-ar"
              />
            </div>
            <div>
              <Label className="text-xs">الاسم إنجليزي</Label>
              <Input
                value={newUomNameEn}
                onChange={(e) => setNewUomNameEn(e.target.value)}
                placeholder="مثال: Box"
                className="mt-1 h-7 text-xs"
                data-testid="input-uom-name-en"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowUomDialog(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => createUomMutation.mutate({ code: newUomCode, nameAr: newUomNameAr, nameEn: newUomNameEn || undefined })}
              disabled={!newUomCode || !newUomNameAr || createUomMutation.isPending}
            >
              {createUomMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
