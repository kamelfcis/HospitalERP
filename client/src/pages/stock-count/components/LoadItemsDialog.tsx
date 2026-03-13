/**
 * LoadItemsDialog — نافذة تحميل أصناف المستودع للجرد
 *
 * فلاتر:
 *  • اسم الصنف (بحث جزئي)
 *  • كود الصنف (prefix)
 *  • باركود (مطابقة دقيقة)
 *  • الفئة (drug / supply / service)
 *  • رصيد صفر
 *  • غير مُجرَد في نطاق التاريخ
 *
 * السلوك:
 *  • فلترة server-side + debounce 350ms
 *  • تحديد مفرد أو كل النتائج
 *  • bulk add
 *  • LIMIT 200 server-side
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, CheckCircle2, Search, ScanBarcode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";

interface LoadedItem {
  itemId:         string;
  itemCode:       string;
  itemNameAr:     string;
  itemCategory:   string;
  lotId:          string | null;
  expiryDate:     string | null;
  systemQtyMinor: string;
  unitCost:       string;
  alreadyCounted: boolean;
}

interface Props {
  open:       boolean;
  onClose:    () => void;
  sessionId:  string;
  onLoaded:   () => void;
}

function fmtQty(v: string | number) {
  return (Number(v) / 1000).toLocaleString("ar-EG", { minimumFractionDigits: 3 });
}

const CATEGORY_LABELS: Record<string, string> = {
  drug:    "دواء",
  supply:  "مستلزم",
  service: "خدمة",
};

export function LoadItemsDialog({ open, onClose, sessionId, onLoaded }: Props) {
  const { toast }   = useToast();
  const queryClient = useQueryClient();

  // ── filters ──────────────────────────────────────────────────────────────
  const [nameQ,       setNameQ]       = useState("");
  const [codeQ,       setCodeQ]       = useState("");
  const [barcodeQ,    setBarcodeQ]    = useState("");
  const [category,    setCategory]    = useState("all");
  const [includeAll,  setIncludeAll]  = useState(false);
  const [acrossDate,  setAcrossDate]  = useState(false);

  // debounced values
  const [debouncedName,    setDebouncedName]    = useState("");
  const [debouncedCode,    setDebouncedCode]    = useState("");
  const [debouncedBarcode, setDebouncedBarcode] = useState("");

  const nameTimer    = useRef<ReturnType<typeof setTimeout>>();
  const codeTimer    = useRef<ReturnType<typeof setTimeout>>();
  const barcodeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => setDebouncedName(nameQ), 350);
    return () => clearTimeout(nameTimer.current);
  }, [nameQ]);
  useEffect(() => {
    clearTimeout(codeTimer.current);
    codeTimer.current = setTimeout(() => setDebouncedCode(codeQ), 350);
    return () => clearTimeout(codeTimer.current);
  }, [codeQ]);
  useEffect(() => {
    clearTimeout(barcodeTimer.current);
    barcodeTimer.current = setTimeout(() => setDebouncedBarcode(barcodeQ), 350);
    return () => clearTimeout(barcodeTimer.current);
  }, [barcodeQ]);

  // ── selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── server query ─────────────────────────────────────────────────────────
  const { data: items = [], isFetching } = useQuery<LoadedItem[]>({
    queryKey: [
      "/api/stock-count/load-items", sessionId,
      debouncedName, debouncedCode, debouncedBarcode, category, includeAll, acrossDate,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedName)    params.set("q",                debouncedName);
      if (debouncedCode)    params.set("code",             debouncedCode);
      if (debouncedBarcode) params.set("barcode",          debouncedBarcode);
      if (category !== "all") params.set("category",       category);
      if (includeAll)       params.set("includeAll",       "true");
      if (acrossDate)       params.set("acrossSessionsOnDate", "true");
      const res = await fetch(`/api/stock-count/sessions/${sessionId}/load-items?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open,
    staleTime: 30_000,
  });

  // Auto-select uncounted when items change
  const itemKeys = items.map(i => `${i.itemId}|${i.lotId ?? ""}`);
  useEffect(() => {
    if (!open) return;
    const uncounted = items.filter(i => !i.alreadyCounted);
    setSelected(new Set(uncounted.map(i => `${i.itemId}|${i.lotId ?? ""}`)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(itemKeys), open]);

  const key = (i: LoadedItem) => `${i.itemId}|${i.lotId ?? ""}`;
  const isSelected = (i: LoadedItem) => selected.has(key(i));
  const toggle = (i: LoadedItem) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key(i)) ? next.delete(key(i)) : next.add(key(i));
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(key)));
    }
  };
  const allChecked = items.length > 0 && selected.size === items.length;

  // ── save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      const selectedItems = items.filter(i => isSelected(i));
      const lines = selectedItems.map(i => ({
        itemId:          i.itemId,
        lotId:           i.lotId,
        expiryDate:      i.expiryDate,
        systemQtyMinor:  i.systemQtyMinor,
        countedQtyMinor: i.systemQtyMinor, // default = system qty (user changes inline)
        unitCost:        i.unitCost,
      }));
      return apiRequest("POST", `/api/stock-count/sessions/${sessionId}/lines`, lines);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
      toast({ title: "تم", description: `تم إضافة ${selected.size} صنف بنجاح` });
      onLoaded();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setNameQ(""); setCodeQ(""); setBarcodeQ(""); setCategory("all");
    setIncludeAll(false); setAcrossDate(false); setSelected(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-3" dir="rtl">
        <DialogHeader>
          <DialogTitle>تحميل أصناف المستودع</DialogTitle>
        </DialogHeader>

        {/* ── Filters ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-muted/30 p-3 rounded-lg">
          {/* Name */}
          <div className="relative col-span-2 md:col-span-1">
            <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pr-8 h-8 text-sm"
              placeholder="اسم الصنف..."
              value={nameQ}
              onChange={e => setNameQ(e.target.value)}
              data-testid="input-load-name"
            />
          </div>
          {/* Code */}
          <Input
            className="h-8 text-sm font-mono"
            placeholder="كود الصنف..."
            value={codeQ}
            onChange={e => setCodeQ(e.target.value)}
            data-testid="input-load-code"
          />
          {/* Barcode */}
          <div className="relative">
            <ScanBarcode className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pr-8 h-8 text-sm font-mono"
              placeholder="باركود..."
              value={barcodeQ}
              onChange={e => setBarcodeQ(e.target.value)}
              data-testid="input-load-barcode"
            />
          </div>
          {/* Category */}
          <Select value={category} onValueChange={setCategory} dir="rtl">
            <SelectTrigger className="h-8 text-sm" data-testid="select-load-category">
              <SelectValue placeholder="الفئة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              <SelectItem value="drug">دواء</SelectItem>
              <SelectItem value="supply">مستلزم</SelectItem>
              <SelectItem value="service">خدمة</SelectItem>
            </SelectContent>
          </Select>
          {/* Toggles */}
          <label className="flex items-center gap-1.5 text-sm cursor-pointer col-span-2 md:col-span-1">
            <input
              type="checkbox"
              checked={includeAll}
              onChange={e => setIncludeAll(e.target.checked)}
              data-testid="chk-include-all"
            />
            عرض الصفري الرصيد أيضاً
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer col-span-2 md:col-span-1">
            <input
              type="checkbox"
              checked={acrossDate}
              onChange={e => setAcrossDate(e.target.checked)}
              data-testid="chk-across-date"
            />
            غير مُجرَد في نطاق التاريخ
          </label>
          {isFetching && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground col-span-2">
              <Loader2 className="h-3 w-3 animate-spin" /> جاري البحث...
            </div>
          )}
        </div>

        {/* ── Results table ── */}
        <div className="flex-1 overflow-auto rounded border min-h-0">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-8 p-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    data-testid="chk-select-all-items"
                  />
                </TableHead>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead className="text-center">الفئة</TableHead>
                <TableHead className="text-center">انتهاء الصلاحية</TableHead>
                <TableHead className="text-center">الرصيد</TableHead>
                <TableHead className="text-center w-16">جُرد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && !isFetching ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    لا توجد أصناف مطابقة
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item, idx) => (
                  <TableRow
                    key={`${item.itemId}-${item.lotId ?? idx}`}
                    className={`cursor-pointer hover:bg-muted/40 ${item.alreadyCounted ? "opacity-50" : ""}`}
                    onClick={() => toggle(item)}
                    data-testid={`row-load-${item.itemId}-${idx}`}
                  >
                    <TableCell className="p-2" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected(item)}
                        onChange={() => toggle(item)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.itemCode}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-tight">{item.itemNameAr}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs">
                        {CATEGORY_LABELS[item.itemCategory] ?? item.itemCategory}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {item.expiryDate ? formatDate(item.expiryDate) : "—"}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {fmtQty(item.systemQtyMinor)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.alreadyCounted
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="flex items-center gap-3 pt-1">
          <span className="text-sm text-muted-foreground mr-auto">
            {items.length} نتيجة · {selected.size} محدد
          </span>
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={selected.size === 0 || saveMutation.isPending}
            data-testid="button-load-confirm"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            تحميل {selected.size} صنف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
