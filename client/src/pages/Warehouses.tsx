import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Edit2, Trash2, Loader2, Warehouse as WarehouseIcon, Building2, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Warehouse, Department, Account, CostCenter } from "@shared/schema";

interface Pharmacy {
  id: string;
  code: string;
  nameAr: string;
  isActive: boolean;
}

export default function Warehouses() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  const [formData, setFormData] = useState<{
    warehouseCode: string;
    nameAr: string;
    departmentId: string | null;
    pharmacyId: string | null;
    glAccountId: string | null;
    costCenterId: string | null;
    isActive: boolean;
  }>({
    warehouseCode: "",
    nameAr: "",
    departmentId: null,
    pharmacyId: null,
    glAccountId: null,
    costCenterId: null,
    isActive: true,
  });
  const [accountSearch, setAccountSearch] = useState("");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountSearchRef = useRef<HTMLInputElement>(null);

  const { data: warehouses, isLoading } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: pharmacies } = useQuery<Pharmacy[]>({
    queryKey: ["/api/pharmacies"],
  });

  const { data: allAccounts } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["/api/cost-centers"],
  });

  const filteredAccounts = (allAccounts || []).filter((a) => {
    if (!accountSearch.trim()) return true;
    const q = accountSearch.trim().toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  }).slice(0, 20);

  const getAccountLabel = (accountId: string | null) => {
    if (!accountId) return null;
    const acc = (allAccounts || []).find((a) => a.id === accountId);
    return acc ? `${acc.name} - ${acc.code}` : null;
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/warehouses", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "تم إنشاء المستودع بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest("PUT", `/api/warehouses/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "تم تحديث المستودع بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/warehouses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "تم حذف المستودع بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (warehouse?: Warehouse) => {
    if (warehouse) {
      setEditingWarehouse(warehouse);
      setFormData({
        warehouseCode: warehouse.warehouseCode,
        nameAr: warehouse.nameAr,
        departmentId: warehouse.departmentId,
        pharmacyId: warehouse.pharmacyId || null,
        glAccountId: warehouse.glAccountId || null,
        costCenterId: (warehouse as any).costCenterId || null,
        isActive: warehouse.isActive,
      });
      if (warehouse.glAccountId) {
        const acc = (allAccounts || []).find((a) => a.id === warehouse.glAccountId);
        setAccountSearch(acc ? `${acc.name} - ${acc.code}` : "");
      } else {
        setAccountSearch("");
      }
    } else {
      setEditingWarehouse(null);
      setFormData({
        warehouseCode: "",
        nameAr: "",
        departmentId: null,
        pharmacyId: null,
        glAccountId: null,
        costCenterId: null,
        isActive: true,
      });
      setAccountSearch("");
    }
    setAccountDropdownOpen(false);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingWarehouse(null);
    setFormData({
      warehouseCode: "",
      nameAr: "",
      departmentId: null,
      pharmacyId: null,
      glAccountId: null,
      costCenterId: null,
      isActive: true,
    });
    setAccountSearch("");
  };

  const handleSubmit = () => {
    if (!formData.warehouseCode || !formData.nameAr) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    if (editingWarehouse) {
      updateMutation.mutate({ id: editingWarehouse.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredWarehouses = warehouses?.filter((wh) => {
    return (
      searchQuery === "" ||
      wh.warehouseCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wh.nameAr.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }) || [];

  const getDepartmentName = (departmentId: string | null) => {
    if (!departmentId || !departments) return "-";
    const dept = departments.find((d) => d.id === departmentId);
    return dept ? dept.nameAr : "-";
  };

  const getPharmacyName = (pharmacyId: string | null | undefined) => {
    if (!pharmacyId || !pharmacies) return "-";
    const ph = pharmacies.find((p) => p.id === pharmacyId);
    return ph ? ph.nameAr : "-";
  };

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground flex items-center gap-1">
            <WarehouseIcon className="h-4 w-4" />
            المستودعات
          </h1>
          <p className="text-xs text-muted-foreground">
            إدارة المستودعات ({warehouses?.length || 0} مستودع)
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => handleOpenDialog()} data-testid="button-add-warehouse" className="h-7 text-xs px-3">
            <Plus className="h-3 w-3 ml-1" />
            مستودع جديد
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar rounded flex items-center gap-2">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="بحث بكود أو اسم المستودع..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="peachtree-input flex-1 max-w-xs text-xs"
          data-testid="input-search-warehouses"
        />
      </div>

      <div className="peachtree-grid rounded">
        <ScrollArea className="h-[calc(100vh-220px)]">
          <table className="w-full text-xs">
            <thead className="peachtree-grid-header sticky top-0">
              <tr>
                <th className="w-[100px] text-right">الكود</th>
                <th className="text-right">الاسم</th>
                <th className="text-right">الصيدلية</th>
                <th className="text-right">القسم</th>
                <th className="w-[70px] text-center">الحالة</th>
                <th className="w-[80px] text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredWarehouses.length === 0 ? (
                <tr className="peachtree-grid-row">
                  <td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                    لا توجد مستودعات
                  </td>
                </tr>
              ) : (
                filteredWarehouses.map((wh) => (
                  <tr
                    key={wh.id}
                    className={`peachtree-grid-row ${!wh.isActive ? "opacity-50" : ""}`}
                    data-testid={`row-warehouse-${wh.id}`}
                  >
                    <td className="font-mono text-xs font-medium" data-testid={`text-warehouse-code-${wh.id}`}>{wh.warehouseCode}</td>
                    <td className="text-xs font-medium" data-testid={`text-warehouse-name-${wh.id}`}>{wh.nameAr}</td>
                    <td className="text-xs" data-testid={`text-warehouse-pharmacy-${wh.id}`}>
                      {getPharmacyName(wh.pharmacyId) !== "-" ? (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {getPharmacyName(wh.pharmacyId)}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="text-xs" data-testid={`text-warehouse-department-${wh.id}`}>{getDepartmentName(wh.departmentId)}</td>
                    <td className="text-center">
                      <Badge
                        variant={wh.isActive ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                        data-testid={`text-warehouse-status-${wh.id}`}
                      >
                        {wh.isActive ? "نشط" : "غير نشط"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleOpenDialog(wh)}
                          data-testid={`button-edit-warehouse-${wh.id}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من حذف هذا المستودع؟")) {
                              deleteMutation.mutate(wh.id);
                            }
                          }}
                          data-testid={`button-delete-warehouse-${wh.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-sm p-4" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold">
              {editingWarehouse ? "تعديل مستودع" : "إضافة مستودع جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="warehouseCode" className="text-xs">كود المستودع *</Label>
              <input
                id="warehouseCode"
                value={formData.warehouseCode}
                onChange={(e) => setFormData({ ...formData, warehouseCode: e.target.value })}
                placeholder="مثال: WH001"
                className="peachtree-input w-full font-mono text-xs"
                data-testid="input-warehouse-code"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nameAr" className="text-xs">اسم المستودع *</Label>
              <input
                id="nameAr"
                value={formData.nameAr}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                placeholder="اسم المستودع"
                className="peachtree-input w-full text-xs"
                data-testid="input-warehouse-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pharmacyId" className="text-xs">الصيدلية التابع لها</Label>
              <Select
                value={formData.pharmacyId || "none"}
                onValueChange={(value) => setFormData({ ...formData, pharmacyId: value === "none" ? null : value })}
              >
                <SelectTrigger id="pharmacyId" className="h-7 text-xs" data-testid="select-warehouse-pharmacy">
                  <SelectValue placeholder="اختر الصيدلية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">بدون صيدلية</SelectItem>
                  {pharmacies
                    ?.filter((p) => p.isActive)
                    .map((ph) => (
                      <SelectItem key={ph.id} value={ph.id} className="text-xs">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {ph.nameAr}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="departmentId" className="text-xs">القسم</Label>
              <Select
                value={formData.departmentId || "none"}
                onValueChange={(value) => setFormData({ ...formData, departmentId: value === "none" ? null : value })}
              >
                <SelectTrigger id="departmentId" className="h-7 text-xs" data-testid="select-warehouse-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">بدون قسم</SelectItem>
                  {departments
                    ?.filter((d) => d.isActive)
                    .map((dept) => (
                      <SelectItem key={dept.id} value={dept.id} className="text-xs">
                        <span className="font-mono">{dept.code}</span> - {dept.nameAr}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">مركز التكلفة <span className="text-muted-foreground">(اختياري)</span></Label>
              <Select
                value={formData.costCenterId || "none"}
                onValueChange={(v) => setFormData({ ...formData, costCenterId: v === "none" ? null : v })}
                data-testid="select-warehouse-cost-center"
              >
                <SelectTrigger className="peachtree-select text-xs h-7">
                  <SelectValue placeholder="— بدون مركز تكلفة —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs text-muted-foreground">— بدون مركز تكلفة —</SelectItem>
                  {(costCenters || [])
                    .filter((cc) => cc.isActive)
                    .map((cc) => (
                      <SelectItem key={cc.id} value={cc.id} className="text-xs">
                        <span className="font-mono">{cc.code}</span> - {cc.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">حساب المخزون (دليل الحسابات)</Label>
              <div className="relative">
                {formData.glAccountId ? (
                  <div className="flex items-center gap-1 border rounded-md px-2 h-7 text-xs bg-muted/30">
                    <span className="flex-1 truncate" data-testid="text-warehouse-gl-account">
                      {getAccountLabel(formData.glAccountId)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, glAccountId: null });
                        setAccountSearch("");
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      data-testid="button-clear-gl-account"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <input
                        ref={accountSearchRef}
                        value={accountSearch}
                        onChange={(e) => {
                          setAccountSearch(e.target.value);
                          setAccountDropdownOpen(true);
                        }}
                        onFocus={() => setAccountDropdownOpen(true)}
                        placeholder="ابحث بالكود أو الاسم..."
                        className="peachtree-input w-full text-xs pr-7"
                        data-testid="input-warehouse-gl-account-search"
                      />
                    </div>
                    {accountDropdownOpen && accountSearch.trim() && (
                      <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-40 overflow-y-auto">
                        {filteredAccounts.length === 0 ? (
                          <div className="p-2 text-xs text-muted-foreground text-center">لا توجد نتائج</div>
                        ) : (
                          filteredAccounts.map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              className="w-full text-right px-2 py-1.5 text-xs hover-elevate cursor-pointer flex items-center gap-2"
                              onClick={() => {
                                setFormData({ ...formData, glAccountId: acc.id });
                                setAccountSearch(`${acc.name} - ${acc.code}`);
                                setAccountDropdownOpen(false);
                              }}
                              data-testid={`option-gl-account-${acc.id}`}
                            >
                              <span className="font-mono text-muted-foreground">{acc.code}</span>
                              <span>{acc.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked as boolean })
                }
                className="h-3.5 w-3.5"
                data-testid="checkbox-warehouse-active"
              />
              <Label htmlFor="isActive" className="text-xs">مستودع نشط</Label>
            </div>
          </div>
          <DialogFooter className="gap-1 pt-2">
            <Button variant="outline" size="sm" onClick={handleCloseDialog} className="h-7 text-xs px-3" data-testid="button-cancel-warehouse">
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="h-7 text-xs px-3"
              data-testid="button-save-warehouse"
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 ml-1 animate-spin" />
                  جاري الحفظ...
                </>
              ) : editingWarehouse ? (
                "تحديث"
              ) : (
                "إضافة"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
