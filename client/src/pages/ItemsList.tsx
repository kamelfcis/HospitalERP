import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Package,
  Search,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Eye,
  Trash2,
  Download,
  Upload,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, ItemFormType } from "@shared/schema";
import { itemCategoryLabels } from "@shared/schema";

interface ItemsResponse {
  items: (Item & { formType?: ItemFormType })[];
  total: number;
}

export default function ItemsList() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [isToxic, setIsToxic] = useState<string>("all");
  const [isActive, setIsActive] = useState<string>("all");
  const [formTypeId, setFormTypeId] = useState<string>("all");
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteItemName, setDeleteItemName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchFocused = useRef(false);
  const limit = 20;

  const handleExport = (includeData: boolean) => {
    const url = `/api/items/export-template?includeData=${includeData}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = includeData ? "items-export.xlsx" : "items-template.xlsx";
    a.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/items/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "فشل الاستيراد");
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const errText = data.errors?.length ? `\n${data.errors.slice(0, 5).join("\n")}` : "";
      toast({
        title: `✓ تم الاستيراد — ${data.total} صنف`,
        description: `تم معالجة ${data.total} صنف، تخطي: ${data.skipped}${errText}`,
      });
    } catch (err: unknown) {
      toast({ title: "خطأ في الاستيراد", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const debouncedSearch = useDebounce(searchInput, 400);

  const { data: formTypes } = useQuery<ItemFormType[]>({
    queryKey: ["/api/form-types"],
  });

  const { data, isLoading } = useQuery<ItemsResponse>({
    queryKey: ["/api/items", page, debouncedSearch, category, isToxic, isActive, formTypeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (category !== "all") params.set("category", category);
      if (isToxic !== "all") params.set("isToxic", isToxic);
      if (isActive !== "all") params.set("isActive", isActive);
      if (formTypeId !== "all") params.set("formTypeId", formTypeId);
      const res = await fetch(`/api/items?${params}`);
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
  });

  // يعيد التركيز لحقل البحث بعد كل re-render إذا كان المستخدم كاتب فيه
  useEffect(() => {
    if (searchFocused.current && searchRef.current && document.activeElement !== searchRef.current) {
      searchRef.current.focus();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "تم حذف الصنف بنجاح" });
      setDeleteItemId(null);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  if (isLoading && !data) {
    return (
      <div className="p-2 space-y-2">
        <div className="peachtree-toolbar">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="peachtree-grid">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 border-b">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      <div className="peachtree-toolbar flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">الأصناف</h1>
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground">إدارة الأصناف والأدوية والمستلزمات</span>
        </div>
        <div className="flex items-center gap-2">
          {/* زر التصدير */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" data-testid="button-export-items">
                <Download className="h-3 w-3" />
                تصدير
                <ChevronDown className="h-2.5 w-2.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" dir="rtl" className="text-xs">
              <DropdownMenuItem onClick={() => handleExport(false)}>
                <Download className="h-3.5 w-3.5 ml-2" />
                تحميل نموذج فارغ (هيدر فقط)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport(true)}>
                <Download className="h-3.5 w-3.5 ml-2" />
                تصدير الأصناف الحالية (مع البيانات)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* زر الاستيراد */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportFile}
            data-testid="input-import-file"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            data-testid="button-import-items"
          >
            {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            استيراد
          </Button>

          <Link href="/items/new">
            <Button size="sm" className="h-7 text-xs gap-1" data-testid="button-add-item">
              <Plus className="h-3 w-3" />
              إضافة صنف
            </Button>
          </Link>
        </div>
      </div>

      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="text"
            placeholder="بحث بالكود أو الاسم (استخدم % للبحث المتقدم)"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            onFocus={() => { searchFocused.current = true; }}
            onBlur={() => { searchFocused.current = false; }}
            className="peachtree-input w-64"
            data-testid="input-search"
          />
          {isLoading && debouncedSearch && (
            <span className="text-[10px] text-muted-foreground animate-pulse">جاري البحث…</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">التصنيف:</span>
        </div>
        <Select value={category} onValueChange={handleFilterChange(setCategory)}>
          <SelectTrigger className="peachtree-select w-28" data-testid="select-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="drug">دواء</SelectItem>
            <SelectItem value="supply">مستلزمات</SelectItem>
            <SelectItem value="service">خدمة</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs font-medium">نوع الشكل:</span>
        <Select value={formTypeId} onValueChange={handleFilterChange(setFormTypeId)}>
          <SelectTrigger className="peachtree-select w-28" data-testid="select-form-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {formTypes?.map((ft) => (
              <SelectItem key={ft.id} value={ft.id}>{ft.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs font-medium">سموم:</span>
        <Select value={isToxic} onValueChange={handleFilterChange(setIsToxic)}>
          <SelectTrigger className="peachtree-select w-20" data-testid="select-toxic">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="true">نعم</SelectItem>
            <SelectItem value="false">لا</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs font-medium">الحالة:</span>
        <Select value={isActive} onValueChange={handleFilterChange(setIsActive)}>
          <SelectTrigger className="peachtree-select w-24" data-testid="select-active">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="true">نشط</SelectItem>
            <SelectItem value="false">موقوف</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="peachtree-grid overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="peachtree-grid-header">
              <th className="w-24">كود الصنف</th>
              <th>الاسم عربي</th>
              <th className="w-24">التصنيف</th>
              <th className="w-24">نوع الشكل</th>
              <th className="w-16">سموم</th>
              <th className="w-28">سعر الشراء</th>
              <th className="w-28">سعر البيع</th>
              <th className="w-16">الحالة</th>
              <th className="w-20">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {data?.items && data.items.length > 0 ? (
              data.items.map((item) => (
                <tr key={item.id} className="peachtree-grid-row" data-testid={`row-item-${item.id}`}>
                  <td className="font-mono text-xs">{item.itemCode}</td>
                  <td className="font-medium">{item.nameAr}</td>
                  <td>
                    <Badge variant="outline" className="text-xs">
                      {itemCategoryLabels[item.category] || item.category}
                    </Badge>
                  </td>
                  <td className="text-xs text-muted-foreground">{item.formType?.nameAr || "-"}</td>
                  <td className="text-center">
                    {item.isToxic && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        سموم
                      </Badge>
                    )}
                  </td>
                  <td className="peachtree-amount text-xs">{formatCurrency(item.purchasePriceLast)}</td>
                  <td className="peachtree-amount text-xs">{formatCurrency(item.salePriceCurrent)}</td>
                  <td>
                    {item.isActive ? (
                      <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">نشط</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">موقوف</Badge>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Link href={`/items/${item.id}`}>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" data-testid={`button-view-${item.id}`}>
                          <Eye className="h-3 w-3" />
                          عرض
                        </Button>
                      </Link>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 px-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => { setDeleteItemId(item.id); setDeleteItemName(item.nameAr); }}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  لا توجد أصناف مطابقة للبحث
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="peachtree-toolbar flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            عرض {((page - 1) * limit) + 1} إلى {Math.min(page * limit, data.total)} من {data.total} صنف
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-6 px-2" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
              السابق
              <ChevronRight className="h-3 w-3" />
            </Button>
            <span className="text-xs font-medium px-2">صفحة {page} من {totalPages}</span>
            <Button variant="outline" size="sm" className="h-6 px-2" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
              <ChevronLeft className="h-3 w-3" />
              التالي
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الصنف "{deleteItemName}"؟
              <br />لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItemId && deleteMutation.mutate(deleteItemId)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
