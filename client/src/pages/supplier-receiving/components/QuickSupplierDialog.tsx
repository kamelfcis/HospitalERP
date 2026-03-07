/**
 * QuickSupplierDialog — نافذة إضافة مورد سريع
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Supplier } from "@shared/schema";

interface Props {
  open: boolean;
  onClose: () => void;
  onSupplierCreated: (supplier: Supplier) => void;
  supplierCacheRef: React.MutableRefObject<Map<string, Supplier[]>>;
}

export function QuickSupplierDialog({ open, onClose, onSupplierCreated, supplierCacheRef }: Props) {
  const { toast } = useToast();
  const [code, setCode]     = useState("");
  const [nameAr, setNameAr] = useState("");
  const [phone, setPhone]   = useState("");
  const [type, setType]     = useState("drugs");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!code.trim() || !nameAr.trim()) {
        throw new Error("كود المورد والاسم مطلوبان");
      }
      const res = await apiRequest("POST", "/api/suppliers", {
        code: code.trim(),
        nameAr: nameAr.trim(),
        phone: phone.trim() || undefined,
        supplierType: type,
      });
      return res.json();
    },
    onSuccess: (supplier: Supplier) => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      supplierCacheRef.current.clear();
      onSupplierCreated(supplier);
      toast({ title: "تم إضافة المورد بنجاح" });
      setCode(""); setNameAr(""); setPhone(""); setType("drugs");
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message || "فشل إضافة المورد", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm">إضافة مورد سريع</DialogTitle>
          <DialogDescription className="text-[10px]">أدخل بيانات المورد الأساسية</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[10px]">كود المورد *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="مثال: SUP001" className="h-7 text-[11px] px-1" dir="ltr"
              data-testid="input-quick-supplier-code" />
          </div>
          <div>
            <Label className="text-[10px]">اسم المورد *</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)}
              placeholder="اسم المورد بالعربي" className="h-7 text-[11px] px-1"
              data-testid="input-quick-supplier-name" />
          </div>
          <div>
            <Label className="text-[10px]">الهاتف</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="اختياري" className="h-7 text-[11px] px-1" dir="ltr"
              data-testid="input-quick-supplier-phone" />
          </div>
          <div>
            <Label className="text-[10px]">نوع المورد *</Label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full h-7 text-[11px] px-1 border rounded-md bg-background"
              data-testid="select-quick-supplier-type">
              <option value="drugs">أدوية</option>
              <option value="consumables">مستلزمات</option>
            </select>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-quick-supplier">إلغاء</Button>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-quick-supplier">
            {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
