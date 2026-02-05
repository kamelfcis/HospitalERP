import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Package,
  Search,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, ItemFormType } from "@shared/schema";
import { itemCategoryLabels } from "@shared/schema";

interface ItemsResponse {
  items: (Item & { formType?: ItemFormType })[];
  total: number;
}

export default function ItemsList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [isToxic, setIsToxic] = useState<string>("all");
  const [isActive, setIsActive] = useState<string>("all");
  const [formTypeId, setFormTypeId] = useState<string>("all");
  const limit = 20;

  const { data: formTypes } = useQuery<ItemFormType[]>({
    queryKey: ["/api/form-types"],
  });

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", limit.toString());
    if (search) params.set("search", search);
    if (category !== "all") params.set("category", category);
    if (isToxic !== "all") params.set("isToxic", isToxic);
    if (isActive !== "all") params.set("isActive", isActive);
    if (formTypeId !== "all") params.set("formTypeId", formTypeId);
    return params.toString();
  };

  const { data, isLoading } = useQuery<ItemsResponse>({
    queryKey: ["/api/items", page, search, category, isToxic, isActive, formTypeId],
    queryFn: async () => {
      const response = await fetch(`/api/items?${buildQueryString()}`);
      if (!response.ok) throw new Error("Failed to fetch items");
      return response.json();
    },
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  if (isLoading) {
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
            type="text"
            placeholder="بحث بالكود أو الاسم (استخدم % للبحث المتقدم)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="peachtree-input w-64"
            data-testid="input-search"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSearch}
            data-testid="button-search"
          >
            بحث
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">التصنيف:</span>
        </div>
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
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
        <Select value={formTypeId} onValueChange={(v) => { setFormTypeId(v); setPage(1); }}>
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
        <Select value={isToxic} onValueChange={(v) => { setIsToxic(v); setPage(1); }}>
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
        <Select value={isActive} onValueChange={(v) => { setIsActive(v); setPage(1); }}>
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
                  <td className="text-xs text-muted-foreground">
                    {item.formType?.nameAr || "-"}
                  </td>
                  <td className="text-center">
                    {item.isToxic && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        سموم
                      </Badge>
                    )}
                  </td>
                  <td className="peachtree-amount text-xs">
                    {formatCurrency(item.purchasePriceLast)}
                  </td>
                  <td className="peachtree-amount text-xs">
                    {formatCurrency(item.salePriceCurrent)}
                  </td>
                  <td>
                    {item.isActive ? (
                      <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                        نشط
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                        موقوف
                      </Badge>
                    )}
                  </td>
                  <td>
                    <Link href={`/items/${item.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        data-testid={`button-view-${item.id}`}
                      >
                        <Eye className="h-3 w-3" />
                        عرض
                      </Button>
                    </Link>
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
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              data-testid="button-prev-page"
            >
              <ChevronRight className="h-3 w-3" />
              السابق
            </Button>
            <span className="text-xs font-medium px-2">
              صفحة {page} من {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              data-testid="button-next-page"
            >
              التالي
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
