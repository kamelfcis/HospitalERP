/**
 * LoadItemsDialog — نافذة تحميل أصناف المستودع للجرد
 *
 * فلاتر:
 *  • اسم الصنف (بحث جزئي — عربي أو English)  → q
 *  • كود الصنف (prefix)                       → code
 *  • باركود (مطابقة دقيقة)                    → barcode
 *  • الفئة (drug / supply / service)
 *  • تضمين الصفري الرصيد                      → includeAll
 *  • استثناء المجرود منذ تاريخ                → excludeCountedSinceDate
 *
 * لوحة المفاتيح:
 *  • ArrowDown/Up  → تنقل التمييز بين الصفوف
 *  • Space         → تبديل تحديد الصف الممُيَّز
 *  • Enter         → تأكيد تحميل الأصناف المحددة
 *  • Ctrl+A        → تحديد الكل / إلغاء الكل
 *  • Esc           → إغلاق
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, CheckCircle2, Search, ScanBarcode, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";

interface LoadedItem {
  itemId:         string;
  itemCode:       string;
  itemNameAr:     string;
  itemNameEn:     string | null;
  itemCategory:   string;
  lotId:          string | null;
  expiryDate:     string | null;
  systemQtyMinor: string;
  unitCost:       string;
  alreadyCounted: boolean;
  majorUnitName:  string | null;
  mediumUnitName: string | null;
  minorUnitName:  string | null;
  majorToMedium:  string | null;
  majorToMinor:   string | null;
  mediumToMinor:  string | null;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  sessionId: string;
  onLoaded:  () => void;
}

function fmtQty(v: string | number) {
  return Number(v).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
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
  const [nameQ,        setNameQ]        = useState("");
  const [codeQ,        setCodeQ]        = useState("");
  const [barcodeQ,     setBarcodeQ]     = useState("");
  const [category,     setCategory]     = useState("all");
  const [includeAll,   setIncludeAll]   = useState(false);
  const [sinceDate,    setSinceDate]    = useState("");

  // debounced values
  const [dName,    setDName]    = useState("");
  const [dCode,    setDCode]    = useState("");
  const [dBarcode, setDBarcode] = useState("");

  const tName    = useRef<ReturnType<typeof setTimeout>>();
  const tCode    = useRef<ReturnType<typeof setTimeout>>();
  const tBarcode = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(tName.current);
    tName.current = setTimeout(() => setDName(nameQ), 350);
    return () => clearTimeout(tName.current);
  }, [nameQ]);
  useEffect(() => {
    clearTimeout(tCode.current);
    tCode.current = setTimeout(() => setDCode(codeQ), 350);
    return () => clearTimeout(tCode.current);
  }, [codeQ]);
  useEffect(() => {
    clearTimeout(tBarcode.current);
    tBarcode.current = setTimeout(() => setDBarcode(barcodeQ), 350);
    return () => clearTimeout(tBarcode.current);
  }, [barcodeQ]);

  // ── selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const key = (i: LoadedItem) => `${i.itemId}|${i.lotId ?? ""}`;

  // ── keyboard navigation ───────────────────────────────────────────────────
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const highlightRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const searchInputRef   = useRef<HTMLInputElement>(null);

  // ── server query ─────────────────────────────────────────────────────────
  const { data: items = [], isFetching } = useQuery<LoadedItem[]>({
    queryKey: [
      "/api/stock-count/load-items", sessionId,
      dName, dCode, dBarcode, category, includeAll, sinceDate,
    ],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dName)     p.set("q",                     dName);
      if (dCode)     p.set("code",                  dCode);
      if (dBarcode)  p.set("barcode",               dBarcode);
      if (category !== "all") p.set("category",     category);
      if (includeAll)         p.set("includeAll",   "true");
      if (sinceDate)  p.set("excludeCountedSinceDate", sinceDate);
      const res = await fetch(
        `/api/stock-count/sessions/${sessionId}/load-items?${p}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: open,
    staleTime: 30_000,
  });

  // Auto-select uncounted + reset highlight when items change
  const itemKeys = items.map(key).join(",");
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(items.filter(i => !i.alreadyCounted).map(key)));
    setHighlightedIdx(items.length > 0 ? 0 : -1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKeys, open]);

  // Scroll highlighted row into view
  useEffect(() => {
    if (highlightedIdx < 0) return;
    highlightRowRefs.current.get(highlightedIdx)?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  const isSelected = (i: LoadedItem) => selected.has(key(i));
  const toggle     = (i: LoadedItem) => setSelected(prev => {
    const n = new Set(prev);
    n.has(key(i)) ? n.delete(key(i)) : n.add(key(i));
    return n;
  });
  const toggleAll = () =>
    setSelected(selected.size === items.length ? new Set() : new Set(items.map(key)));
  const allChecked = items.length > 0 && selected.size === items.length;

  // ── search input keyboard handler ─────────────────────────────────────────
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx(prev => Math.min(prev + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === " ") {
      if (highlightedIdx >= 0 && highlightedIdx < items.length) {
        e.preventDefault();
        toggle(items[highlightedIdx]);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selected.size > 0 && !saveMutation.isPending) {
        saveMutation.mutate();
      } else if (highlightedIdx >= 0 && highlightedIdx < items.length) {
        toggle(items[highlightedIdx]);
      }
    } else if (e.key === "a" && e.ctrlKey) {
      e.preventDefault();
      toggleAll();
    }
  };

  // ── save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => {
      const body = items.filter(i => isSelected(i)).map(i => ({
        itemId:          i.itemId,
        lotId:           i.lotId,
        expiryDate:      i.expiryDate,
        systemQtyMinor:  i.systemQtyMinor,
        countedQtyMinor: i.systemQtyMinor,
        unitCost:        i.unitCost,
      }));
      return apiRequest("POST", `/api/stock-count/sessions/${sessionId}/lines`, body);
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
    setIncludeAll(false); setSinceDate(""); setSelected(new Set());
    setHighlightedIdx(-1);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-3" dir="rtl">
        <DialogHeader>
          <DialogTitle>تحميل أصناف المستودع</DialogTitle>
        </DialogHeader>

        {/* ── Filters ── */}
        <div className="bg-muted/30 p-3 rounded-lg space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {/* Name — auto-focused, keyboard-navigable */}
            <div className="relative col-span-2 md:col-span-1">
              <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                autoFocus
                className="pr-8 h-8 text-sm"
                placeholder="اسم الصنف (عربي / English)..."
                value={nameQ}
                onChange={e => setNameQ(e.target.value)}
                onKeyDown={handleSearchKeyDown}
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
          </div>

          {/* Toggles row */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={includeAll}
                onChange={e => setIncludeAll(e.target.checked)}
                data-testid="chk-include-all"
              />
              عرض صفري الرصيد أيضاً
            </label>

            {/* Exclude-counted-since date */}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">استثناء المجرود منذ:</span>
              <Input
                type="date"
                className="h-7 w-36 text-sm"
                value={sinceDate}
                onChange={e => setSinceDate(e.target.value)}
                data-testid="input-since-date"
                dir="ltr"
              />
              {sinceDate && (
                <button
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setSinceDate("")}
                >
                  إلغاء
                </button>
              )}
            </div>

            {isFetching && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> جاري البحث...
              </div>
            )}
          </div>

          {/* Hint when sinceDate is set */}
          {sinceDate && (
            <p className="text-xs text-amber-600 bg-amber-500/10 rounded px-2 py-1">
              سيتم استثناء الأصناف المجرودة في جلسات مرحّلة بدءاً من {sinceDate}
            </p>
          )}

          {/* Keyboard hint */}
          <p className="text-xs text-muted-foreground/70">
            ↑↓ تنقل · Space تحديد · Enter تأكيد · Ctrl+A الكل
          </p>
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
                    {sinceDate && " — جميع الأصناف مجرودة منذ " + sinceDate}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item, idx) => {
                  const isHighlighted = highlightedIdx === idx;
                  return (
                    <TableRow
                      key={`${item.itemId}-${item.lotId ?? idx}`}
                      ref={el => {
                        if (el) highlightRowRefs.current.set(idx, el);
                        else highlightRowRefs.current.delete(idx);
                      }}
                      className={[
                        "cursor-pointer transition-colors",
                        item.alreadyCounted ? "opacity-50" : "",
                        isHighlighted
                          ? "bg-primary/10 ring-1 ring-inset ring-primary"
                          : "hover:bg-muted/40",
                      ].join(" ")}
                      onClick={() => {
                        setHighlightedIdx(idx);
                        toggle(item);
                        searchInputRef.current?.focus();
                      }}
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
                        {item.itemNameEn && (
                          <p className="text-xs text-muted-foreground leading-tight">{item.itemNameEn}</p>
                        )}
                        {item.majorUnitName && (
                          <p className="text-xs text-muted-foreground">
                            {[item.majorUnitName, item.mediumUnitName, item.minorUnitName].filter(Boolean).join(" / ")}
                          </p>
                        )}
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
                        {item.minorUnitName && (
                          <span className="text-xs text-muted-foreground mr-0.5">{item.minorUnitName}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.alreadyCounted
                          ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
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
