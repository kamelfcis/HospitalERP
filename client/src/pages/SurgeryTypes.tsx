/**
 * Surgery Types Management Page
 * - CRUD for surgery types (name + category)
 * - Category price configuration (price per category = OR room opening fee)
 * - Clean split layout: price config on top, types table below
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import type { SurgeryType, SurgeryCategoryPrice } from "@shared/schema";
import { SURGERY_CATEGORIES, surgeryCategoryLabels } from "@shared/schema";

// ─── Category Badge Colours ──────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  major:   "bg-red-100 text-red-800 border-red-200",
  medium:  "bg-orange-100 text-orange-800 border-orange-200",
  minor:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  skilled: "bg-blue-100 text-blue-800 border-blue-200",
  simple:  "bg-green-100 text-green-800 border-green-200",
};

// ─── Category Price Card ─────────────────────────────────────────────────────

function CategoryPriceCard({
  cat, price, onSave,
}: {
  cat: string;
  price: string;
  onSave: (cat: string, price: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(price);

  const handleSave = () => {
    onSave(cat, val);
    setEditing(false);
  };

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-lg border ${CATEGORY_COLOURS[cat] ?? ""}`}>
      <span className="text-xs font-semibold">{surgeryCategoryLabels[cat as keyof typeof surgeryCategoryLabels]}</span>
      {editing ? (
        <div className="flex gap-1 items-center">
          <Input
            data-testid={`input-price-${cat}`}
            type="number" min="0" step="0.01"
            className="h-7 text-sm"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSave}>حفظ</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditing(false); setVal(price); }}>
            ✕
          </Button>
        </div>
      ) : (
        <button
          data-testid={`price-display-${cat}`}
          type="button"
          onClick={() => { setVal(price); setEditing(true); }}
          className="text-right text-sm font-bold hover:underline"
        >
          {parseFloat(price || "0").toLocaleString("ar-EG")} ج.م
        </button>
      )}
    </div>
  );
}

// ─── Surgery Type Dialog ─────────────────────────────────────────────────────

interface SurgeryTypeDialogProps {
  open: boolean;
  editing: SurgeryType | null;
  onClose: () => void;
}

function SurgeryTypeDialog({ open, editing, onClose }: SurgeryTypeDialogProps) {
  const { toast } = useToast();
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? "");
  const [category, setCategory] = useState(editing?.category ?? "major");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);

  // Reset when dialog opens with new data
  const [prevEditing, setPrevEditing] = useState(editing);
  if (prevEditing !== editing) {
    setPrevEditing(editing);
    setNameAr(editing?.nameAr ?? "");
    setCategory(editing?.category ?? "major");
    setIsActive(editing?.isActive ?? true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? apiRequest("PUT", `/api/surgery-types/${editing.id}`, { nameAr, category, isActive }).then(r => r.json())
        : apiRequest("POST", `/api/surgery-types`, { nameAr, category, isActive }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surgery-types"] });
      toast({ title: editing ? "تم التعديل" : "تم الإضافة" });
      onClose();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل نوع عملية" : "إضافة نوع عملية"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>اسم العملية <span className="text-destructive">*</span></Label>
            <Input
              data-testid="input-surgery-name"
              placeholder="مثال: استئصال زائدة"
              value={nameAr}
              onChange={e => setNameAr(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>التصنيف <span className="text-destructive">*</span></Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-surgery-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SURGERY_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>
                    <span className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CATEGORY_COLOURS[c]}`}>
                        {surgeryCategoryLabels[c]}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              data-testid="switch-surgery-active"
            />
            <Label htmlFor="is-active">نشط</Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            data-testid="button-save-surgery"
            disabled={!nameAr.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SurgeryTypesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SurgeryType | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const { data: types = [], isLoading } = useQuery<SurgeryType[]>({
    queryKey: ["/api/surgery-types"],
    queryFn: () => apiRequest("GET", "/api/surgery-types").then(r => r.json()),
  });

  const { data: prices = [] } = useQuery<SurgeryCategoryPrice[]>({
    queryKey: ["/api/surgery-category-prices"],
    queryFn: () => apiRequest("GET", "/api/surgery-category-prices").then(r => r.json()),
  });

  const priceMap = Object.fromEntries(prices.map(p => [p.category, p.price]));

  const savePriceMutation = useMutation({
    mutationFn: ({ cat, price }: { cat: string; price: string }) =>
      apiRequest("PUT", `/api/surgery-category-prices/${cat}`, { price }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surgery-category-prices"] });
      toast({ title: "تم حفظ السعر" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/surgery-types/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/surgery-types"] }),
    onError: (e: Error) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/surgery-types/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surgery-types"] });
      toast({ title: "تم الحذف" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  const displayed = types.filter(t => {
    const matchSearch = !search || t.nameAr.includes(search);
    const matchCat = filterCategory === "all" || t.category === filterCategory;
    return matchSearch && matchCat;
  });

  const openAdd = () => { setEditingRow(null); setDialogOpen(true); };
  const openEdit = (t: SurgeryType) => { setEditingRow(t); setDialogOpen(true); };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">أنواع العمليات الجراحية</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة أسماء العمليات وتصنيفاتها — سعر كل تصنيف يُضاف تلقائياً كـ "فتح غرفة عمليات" على فاتورة المريض
          </p>
        </div>
        <Button data-testid="button-add-surgery" onClick={openAdd}>
          <Plus className="h-4 w-4 ml-1" />
          إضافة عملية
        </Button>
      </div>

      {/* Category Prices */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-primary" />
          سعر فتح غرفة العمليات حسب التصنيف
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {SURGERY_CATEGORIES.map(cat => (
            <CategoryPriceCard
              key={cat}
              cat={cat}
              price={priceMap[cat] ?? "0"}
              onSave={(c, p) => savePriceMutation.mutate({ cat: c, price: p })}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          اضغط على السعر لتعديله — يسري على جميع العمليات من نفس التصنيف
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Input
          data-testid="input-search-surgery"
          placeholder="بحث باسم العملية..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40" data-testid="select-filter-category">
            <SelectValue placeholder="كل التصنيفات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {SURGERY_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{surgeryCategoryLabels[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{displayed.length} عملية</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 h-8">
              <TableHead className="py-1 text-xs">اسم العملية</TableHead>
              <TableHead className="py-1 text-xs">التصنيف</TableHead>
              <TableHead className="py-1 text-xs">سعر الغرفة</TableHead>
              <TableHead className="py-1 text-xs">الحالة</TableHead>
              <TableHead className="py-1 w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                  جارٍ التحميل...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && displayed.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                  لا توجد عمليات مسجلة
                </TableCell>
              </TableRow>
            )}
            {displayed.map(t => (
              <TableRow key={t.id} data-testid={`row-surgery-${t.id}`} className="h-8">
                <TableCell className="py-0.5 text-xs font-medium">{t.nameAr}</TableCell>
                <TableCell className="py-0.5">
                  <Badge variant="outline" className={`text-[10px] px-1 py-0 leading-4 ${CATEGORY_COLOURS[t.category]}`}>
                    {surgeryCategoryLabels[t.category as keyof typeof surgeryCategoryLabels] ?? t.category}
                  </Badge>
                </TableCell>
                <TableCell className="py-0.5 text-xs text-muted-foreground">
                  {parseFloat(priceMap[t.category] ?? "0").toLocaleString("ar-EG")} ج.م
                </TableCell>
                <TableCell className="py-0.5">
                  <Switch
                    checked={t.isActive}
                    onCheckedChange={v => toggleActiveMutation.mutate({ id: t.id, isActive: v })}
                    data-testid={`switch-active-${t.id}`}
                    className="scale-75 origin-right"
                  />
                </TableCell>
                <TableCell className="py-0.5">
                  <div className="flex gap-0.5 justify-end">
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6"
                      data-testid={`button-edit-${t.id}`}
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      data-testid={`button-delete-${t.id}`}
                      onClick={() => {
                        if (confirm(`حذف "${t.nameAr}"؟`)) deleteMutation.mutate(t.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      {dialogOpen && (
        <SurgeryTypeDialog
          open={dialogOpen}
          editing={editingRow}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
