import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeftRight,
  Loader2,
  AlertTriangle,
  Check,
  Search,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { Warehouse, Item, StoreTransferWithDetails } from "@shared/schema";
import { transferStatusLabels, itemCategoryLabels } from "@shared/schema";

interface ItemsResponse {
  items: Item[];
  total: string;
}

interface FefoAllocation {
  lotId: string;
  expiryDate: string | null;
  availableQty: string;
  allocatedQty: string;
  unitCost: string;
}

interface FefoPreviewResponse {
  fulfilled: boolean;
  shortfall?: string;
  allocations: FefoAllocation[];
}

export default function StoreTransfers() {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [transferDate, setTransferDate] = useState(today);
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");

  const [itemSearchText, setItemSearchText] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowItemDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const { data: itemsData } = useQuery<ItemsResponse>({
    queryKey: ["/api/items", itemSearchText],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "10");
      if (itemSearchText) params.set("search", itemSearchText);
      const res = await fetch(`/api/items?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    enabled: itemSearchText.length > 0,
  });

  const handleBarcodeResolve = async (value: string) => {
    try {
      const res = await fetch(`/api/barcode/resolve?value=${encodeURIComponent(value)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.itemId) {
          const itemRes = await fetch(`/api/items/${data.itemId}`);
          if (itemRes.ok) {
            const item = await itemRes.json();
            selectItem(item);
            return;
          }
        }
      }
    } catch {
      // barcode not found, continue with text search
    }
  };

  const handleItemSearchChange = (value: string) => {
    setItemSearchText(value);
    setShowItemDropdown(true);
    if (selectedItem) {
      setSelectedItem(null);
      setSelectedItemId("");
    }
  };

  const handleItemSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && itemSearchText) {
      handleBarcodeResolve(itemSearchText);
    }
  };

  const selectItem = (item: Item) => {
    setSelectedItem(item);
    setSelectedItemId(item.id);
    setItemSearchText(item.nameAr);
    setShowItemDropdown(false);
  };

  const qtyNum = parseFloat(qty) || 0;
  const canPreviewFefo = !!selectedItemId && !!sourceWarehouseId && qtyNum > 0;

  const { data: fefoPreview, isLoading: fefoLoading } = useQuery<FefoPreviewResponse>({
    queryKey: ["/api/transfer/fefo-preview", selectedItemId, sourceWarehouseId, qty, transferDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        itemId: selectedItemId,
        warehouseId: sourceWarehouseId,
        requiredQtyInMinor: qty,
        asOfDate: transferDate,
      });
      const res = await fetch(`/api/transfer/fefo-preview?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch FEFO preview");
      return res.json();
    },
    enabled: canPreviewFefo,
  });

  const { data: transfers, isLoading: transfersLoading } = useQuery<StoreTransferWithDetails[]>({
    queryKey: ["/api/transfers"],
  });

  const canExecute =
    !!transferDate &&
    !!sourceWarehouseId &&
    !!destWarehouseId &&
    sourceWarehouseId !== destWarehouseId &&
    !!selectedItemId &&
    qtyNum > 0 &&
    fefoPreview?.fulfilled === true;

  const executeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/transfers", {
        transferDate,
        sourceWarehouseId,
        destinationWarehouseId: destWarehouseId,
        itemId: selectedItemId,
        qtyInMinor: qty,
        notes: notes || undefined,
        status: "executed",
      });
    },
    onSuccess: () => {
      toast({ title: "تم تنفيذ التحويل بنجاح" });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transfer/fefo-preview"] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في تنفيذ التحويل",
        description: error.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setTransferDate(today);
    setSourceWarehouseId("");
    setDestWarehouseId("");
    setSelectedItemId("");
    setSelectedItem(null);
    setItemSearchText("");
    setQty("");
    setNotes("");
  };

  return (
    <div className="p-2 space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">تحويل مخزني بين الأقسام</h1>
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground">حركة مخزنية فقط - بدون تسعير</span>
        </div>
      </div>

      <fieldset className="peachtree-grid p-2">
        <legend className="text-xs font-semibold px-1">بيانات التحويل</legend>

        <div className="grid grid-cols-3 gap-3 mb-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">تاريخ التحويل</Label>
            <Input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="h-6 text-[11px] px-1"
              data-testid="input-transfer-date"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">مخزن المصدر</Label>
            <Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId}>
              <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-source-warehouse">
                <SelectValue placeholder="اختر المخزن" />
              </SelectTrigger>
              <SelectContent>
                {warehouses?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.warehouseCode} - {w.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">مخزن الوجهة</Label>
            <Select value={destWarehouseId} onValueChange={setDestWarehouseId}>
              <SelectTrigger className="h-6 text-[11px] px-1" data-testid="select-dest-warehouse">
                <SelectValue placeholder="اختر المخزن" />
              </SelectTrigger>
              <SelectContent>
                {warehouses
                  ?.filter((w) => w.id !== sourceWarehouseId)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.warehouseCode} - {w.nameAr}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-2">
          <div className="space-y-1 relative" ref={dropdownRef}>
            <Label className="text-[10px] text-muted-foreground">الصنف</Label>
            <div className="relative">
              <Search className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                type="text"
                value={itemSearchText}
                onChange={(e) => handleItemSearchChange(e.target.value)}
                onKeyDown={handleItemSearchKeyDown}
                onFocus={() => itemSearchText && setShowItemDropdown(true)}
                placeholder="بحث بالكود أو الاسم أو الباركود"
                className="h-6 text-[11px] px-1 pr-5"
                data-testid="input-item-search"
              />
            </div>
            {showItemDropdown && itemsData?.items && itemsData.items.length > 0 && (
              <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                {itemsData.items.map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-right px-2 py-1 text-[11px] hover-elevate cursor-pointer flex items-center gap-2"
                    onClick={() => selectItem(item)}
                    data-testid={`item-option-${item.id}`}
                  >
                    <span className="font-mono text-muted-foreground">{item.itemCode}</span>
                    <span>{item.nameAr}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedItem && (
              <div className="flex items-center gap-2 mt-1">
                <Package className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-medium">{selectedItem.nameAr}</span>
                <Badge variant="outline" className="text-[9px]">
                  {itemCategoryLabels[selectedItem.category] || selectedItem.category}
                </Badge>
                {selectedItem.hasExpiry && (
                  <Badge variant="secondary" className="text-[9px]">
                    له صلاحية
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">الكمية (بالوحدة الصغرى)</Label>
            <Input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="h-6 text-[11px] px-1"
              data-testid="input-transfer-qty"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
              className="h-6 text-[11px] px-1"
              data-testid="input-transfer-notes"
            />
          </div>
        </div>

        {canPreviewFefo && (
          <div className="mt-2">
            <Label className="text-[10px] text-muted-foreground mb-1 block">
              معاينة FEFO (أول انتهاء أول صرف)
            </Label>
            {fefoLoading ? (
              <div className="space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : fefoPreview ? (
              <div>
                <table className="w-full text-[10px] border">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="py-1 px-1 text-right font-medium">اللوت</th>
                      <th className="py-1 px-1 text-right font-medium">تاريخ الصلاحية</th>
                      <th className="py-1 px-1 text-right font-medium">الكمية المتاحة</th>
                      <th className="py-1 px-1 text-right font-medium">الكمية المخصومة</th>
                      <th className="py-1 px-1 text-right font-medium">التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fefoPreview.allocations.map((alloc, i) => (
                      <tr key={alloc.lotId || i} className="border-t">
                        <td className="py-1 px-1 font-mono">{alloc.lotId?.slice(0, 8) || "-"}</td>
                        <td className="py-1 px-1">{alloc.expiryDate ? formatDateShort(alloc.expiryDate) : "بدون صلاحية"}</td>
                        <td className="py-1 px-1">{alloc.availableQty}</td>
                        <td className="py-1 px-1">{alloc.allocatedQty}</td>
                        <td className="py-1 px-1">{formatCurrency(alloc.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-1" data-testid="text-fefo-status">
                  {fefoPreview.fulfilled ? (
                    <span className="text-[11px] text-green-700 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      الكمية متوفرة
                    </span>
                  ) : (
                    <span className="text-[11px] text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      الكمية المتاحة غير كافية (ينقص {fefoPreview.shortfall})
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] gap-1 px-2"
            disabled={!canExecute || executeMutation.isPending}
            onClick={() => executeMutation.mutate()}
            data-testid="button-execute-transfer"
          >
            {executeMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowLeftRight className="h-3 w-3" />
            )}
            تنفيذ التحويل
          </Button>
        </div>
      </fieldset>

      <fieldset className="peachtree-grid p-2">
        <legend className="text-xs font-semibold px-1">سجل التحويلات</legend>
        {transfersLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-[10px]" data-testid="table-transfer-history">
            <thead>
              <tr className="bg-muted/50">
                <th className="py-1 px-1 text-right font-medium">رقم التحويل</th>
                <th className="py-1 px-1 text-right font-medium">التاريخ</th>
                <th className="py-1 px-1 text-right font-medium">من مخزن</th>
                <th className="py-1 px-1 text-right font-medium">إلى مخزن</th>
                <th className="py-1 px-1 text-right font-medium">الصنف</th>
                <th className="py-1 px-1 text-right font-medium">الكمية</th>
                <th className="py-1 px-1 text-right font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {transfers && transfers.length > 0 ? (
                transfers.map((t) => (
                  <tr key={t.id} className="border-t" data-testid={`row-transfer-${t.id}`}>
                    <td className="py-1 px-1 font-mono">{t.transferNumber}</td>
                    <td className="py-1 px-1">{formatDateShort(t.transferDate)}</td>
                    <td className="py-1 px-1">{t.sourceWarehouse?.nameAr || "-"}</td>
                    <td className="py-1 px-1">{t.destinationWarehouse?.nameAr || "-"}</td>
                    <td className="py-1 px-1">{t.item?.nameAr || "-"}</td>
                    <td className="py-1 px-1">{t.qtyInMinor}</td>
                    <td className="py-1 px-1">
                      {t.status === "executed" ? (
                        <Badge variant="default" className="text-[9px] bg-green-600">
                          {transferStatusLabels[t.status] || t.status}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">
                          {transferStatusLabels[t.status] || t.status}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted-foreground">
                    لا توجد تحويلات مسجلة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </fieldset>
    </div>
  );
}
