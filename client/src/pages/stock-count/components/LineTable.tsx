/**
 * LineTable — جدول سطور الجرد
 *
 * الميزات:
 *  • فلتر: عرض الفروق فقط
 *  • فلتر: عرض غير المُعدَّل فقط
 *  • بحث سريع بالاسم / الكود
 *  • تعديل الكمية المعدودة inline
 *  • تلوين الصفوف (فائض / عجز / صفر)
 *  • تذييل ثابت بالمجاميع
 *  • حذف سطر مفرد
 *  • التمرير التلقائي للصف المُحدَّد
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Edit2, X, Search, Filter, Loader2, TrendingUp, TrendingDown, Minus,
  ZapIcon, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
export interface SessionLine {
  id:              string;
  itemId:          string;
  itemCode:        string;
  itemNameAr:      string;
  itemCategory:    string;
  lotId:           string | null;
  expiryDate:      string | null;
  systemQtyMinor:  string;
  countedQtyMinor: string;
  differenceMinor: string;
  unitCost:        string;
  differenceValue: string;
}

interface Props {
  lines:        SessionLine[];
  sessionId:    string;
  isDraft:      boolean;
  focusLineId?: string | null;
  onFocused?:   () => void;
  onLoadItems:  () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtQty(v: string | number) {
  return (Number(v) / 1000).toLocaleString("ar-EG", { minimumFractionDigits: 3 });
}
function fmtMoney(v: string | number) {
  return Number(v).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
//  QtyCell — تعديل الكمية المعدودة inline مع دعم لوحة المفاتيح
// ─────────────────────────────────────────────────────────────────────────────
function QtyCell({
  line, sessionId, disabled, rowIndex, totalRows,
  onNavigate,
}: {
  line: SessionLine;
  sessionId: string;
  disabled: boolean;
  rowIndex: number;
  totalRows: number;
  onNavigate?: (delta: number) => void;
}) {
  const { toast }   = useToast();
  const queryClient = useQueryClient();
  const [editing,  setEditing]  = useState(false);
  const [localVal, setLocalVal] = useState(() => (Number(line.countedQtyMinor) / 1000).toFixed(3));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocalVal((Number(line.countedQtyMinor) / 1000).toFixed(3));
  }, [line.countedQtyMinor, editing]);

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.select();
        inputRef.current?.focus();
      }, 10);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (countedQtyMinor: string) =>
      apiRequest("POST", `/api/stock-count/sessions/${sessionId}/lines`, [{
        itemId:          line.itemId,
        lotId:           line.lotId,
        expiryDate:      line.expiryDate,
        systemQtyMinor:  line.systemQtyMinor,
        countedQtyMinor,
        unitCost:        line.unitCost,
      }]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const confirm = () => {
    const num = parseFloat(localVal.replace(/,/g, "."));
    if (isNaN(num) || num < 0) {
      toast({ title: "تحذير", description: "الكمية يجب أن تكون رقماً غير سالب", variant: "destructive" });
      return;
    }
    const minor = String(Math.round(num * 1000));
    setEditing(false);
    saveMutation.mutate(minor);
  };

  if (disabled) return <span className="font-mono text-sm">{fmtQty(line.countedQtyMinor)}</span>;

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          className="h-7 w-24 text-left text-sm font-mono"
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirm();
              onNavigate?.(1);
            } else if (e.key === "Escape") {
              setEditing(false);
            } else if (e.key === "Tab") {
              e.preventDefault();
              confirm();
              onNavigate?.(e.shiftKey ? -1 : 1);
            }
          }}
          onBlur={confirm}
          dir="ltr"
        />
        {saveMutation.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  return (
    <button
      className="font-mono text-sm hover:text-primary hover:underline focus:outline-none flex items-center gap-1 group"
      onClick={() => setEditing(true)}
      data-testid={`qty-cell-${line.id}`}
    >
      {fmtQty(line.countedQtyMinor)}
      <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LineTable
// ─────────────────────────────────────────────────────────────────────────────
export function LineTable({ lines, sessionId, isDraft, focusLineId, onFocused, onLoadItems }: Props) {
  const { toast }   = useToast();
  const queryClient = useQueryClient();

  const [searchTerm,     setSearchTerm]     = useState("");
  const [showVariance,   setShowVariance]   = useState(false);
  const [showUncounted,  setShowUncounted]  = useState(false);

  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Auto-scroll to focused line
  useEffect(() => {
    if (!focusLineId) return;
    const el = rowRefs.current.get(focusLineId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      const t = setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary");
        onFocused?.();
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [focusLineId, onFocused]);

  // Keyboard navigation between rows
  const navigateTo = useCallback((fromIndex: number, delta: number) => {
    const nextIndex = fromIndex + delta;
    if (nextIndex < 0 || nextIndex >= filteredLines.length) return;
    const nextLine = filteredLines[nextIndex];
    const btn = rowRefs.current.get(nextLine.id)?.querySelector<HTMLElement>("[data-testid^='qty-cell-']");
    btn?.click();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, showVariance, showUncounted, searchTerm]);

  // Delete single line
  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) =>
      apiRequest("DELETE", `/api/stock-count/sessions/${sessionId}/lines/${lineId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions", sessionId] });
    },
    onError: (err: any) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  // ── Filters ───────────────────────────────────────────────────────────────
  const filteredLines = useMemo(() => {
    let result = lines;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(l =>
        l.itemNameAr.includes(searchTerm) ||
        l.itemCode.toLowerCase().includes(q)
      );
    }
    if (showVariance) {
      result = result.filter(l => Math.abs(parseFloat(l.differenceMinor)) > 0.0001);
    }
    if (showUncounted) {
      // "uncounted" = counted qty still equals system qty (user hasn't changed it)
      result = result.filter(l => l.countedQtyMinor === l.systemQtyMinor);
    }
    return result;
  }, [lines, searchTerm, showVariance, showUncounted]);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let surplus = 0, shortage = 0, net = 0;
    for (const l of lines) {
      const val = parseFloat(l.differenceValue);
      net += val;
      if (val > 0) surplus += val;
      else if (val < 0) shortage += Math.abs(val);
    }
    return { surplus, shortage, net, count: lines.length };
  }, [lines]);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* ── Toolbar ── */}
      {lines.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pr-8 h-8 text-sm"
              placeholder="بحث سريع..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              data-testid="input-line-search"
            />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showVariance}
                onChange={e => setShowVariance(e.target.checked)}
                data-testid="chk-show-variance"
              />
              <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
              الفروق فقط
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showUncounted}
                onChange={e => setShowUncounted(e.target.checked)}
                data-testid="chk-show-uncounted"
              />
              <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              غير المُعدَّل
            </label>
          </div>
          <span className="text-xs text-muted-foreground mr-auto">
            {filteredLines.length} من {lines.length} سطر
          </span>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
            <TableRow>
              <TableHead className="w-8 text-center text-xs">#</TableHead>
              <TableHead className="text-xs">الكود</TableHead>
              <TableHead className="text-xs">الصنف</TableHead>
              <TableHead className="text-center text-xs">انتهاء</TableHead>
              <TableHead className="text-center text-xs">دفتري</TableHead>
              <TableHead className="text-center text-xs font-semibold">معدود ✎</TableHead>
              <TableHead className="text-center text-xs">الفرق</TableHead>
              <TableHead className="text-center text-xs">قيمة الفرق</TableHead>
              {isDraft && <TableHead className="w-8" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isDraft ? 9 : 8} className="text-center py-14 text-muted-foreground">
                  {lines.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <AlertTriangle className="h-10 w-10 opacity-20" />
                      <p className="font-medium">لا توجد أصناف بعد</p>
                      {isDraft && (
                        <Button size="sm" onClick={onLoadItems}>
                          <ZapIcon className="h-4 w-4 ml-1" />
                          تحميل أصناف المستودع
                        </Button>
                      )}
                    </div>
                  ) : "لا نتائج للفلاتر المحددة"}
                </TableCell>
              </TableRow>
            ) : (
              filteredLines.map((line, idx) => {
                const diff    = parseFloat(line.differenceMinor);
                const diffVal = parseFloat(line.differenceValue);
                const rowColor =
                  diff > 0.0001  ? "bg-green-500/5 hover:bg-green-500/10" :
                  diff < -0.0001 ? "bg-destructive/5 hover:bg-destructive/10" :
                                   "hover:bg-muted/40";
                return (
                  <TableRow
                    key={line.id}
                    ref={el => {
                      if (el) rowRefs.current.set(line.id, el);
                      else rowRefs.current.delete(line.id);
                    }}
                    className={`transition-colors ${rowColor}`}
                    data-testid={`row-line-${line.id}`}
                  >
                    <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{line.itemCode}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium leading-tight">{line.itemNameAr}</p>
                        <p className="text-xs text-muted-foreground">{line.itemCategory}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {line.expiryDate ? formatDate(line.expiryDate) : "—"}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm text-muted-foreground">
                      {fmtQty(line.systemQtyMinor)}
                    </TableCell>
                    <TableCell className="text-center">
                      <QtyCell
                        line={line}
                        sessionId={sessionId}
                        disabled={!isDraft}
                        rowIndex={idx}
                        totalRows={filteredLines.length}
                        onNavigate={(delta) => navigateTo(idx, delta)}
                      />
                    </TableCell>
                    <TableCell className={`text-center font-mono text-sm font-semibold ${
                      diff > 0.0001 ? "text-green-600" : diff < -0.0001 ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      {diff > 0.0001 ? "+" : ""}{fmtQty(line.differenceMinor)}
                    </TableCell>
                    <TableCell className={`text-center font-mono text-sm font-semibold ${
                      diffVal > 0 ? "text-green-600" : diffVal < 0 ? "text-destructive" : "text-muted-foreground"
                    }`}>
                      {diffVal !== 0 && diffVal > 0 ? "+" : ""}{fmtMoney(diffVal)}
                    </TableCell>
                    {isDraft && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteLineMutation.mutate(line.id)}
                          disabled={deleteLineMutation.isPending}
                          data-testid={`btn-delete-line-${line.id}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Sticky Footer Totals ── */}
      {lines.length > 0 && (
        <div className="sticky bottom-0 bg-background border-t rounded-b-md grid grid-cols-2 md:grid-cols-4 divide-x divide-x-reverse text-sm z-10 shadow-sm">
          <div className="px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الأصناف</p>
            <p className="font-bold">{totals.count}</p>
          </div>
          <div className="px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">فوائض</p>
            <p className="font-bold text-green-600">
              +{fmtMoney(totals.surplus)} ج.م
            </p>
          </div>
          <div className="px-4 py-2 text-center">
            <p className="text-xs text-muted-foreground">عجز</p>
            <p className="font-bold text-destructive">
              -{fmtMoney(totals.shortage)} ج.م
            </p>
          </div>
          <div className={`px-4 py-2 text-center ${
            totals.net > 0 ? "bg-green-500/5" : totals.net < 0 ? "bg-destructive/5" : ""
          }`}>
            <p className="text-xs text-muted-foreground">صافي الفرق</p>
            <p className={`font-bold ${
              totals.net > 0 ? "text-green-600" : totals.net < 0 ? "text-destructive" : ""
            }`}>
              {totals.net > 0 ? "+" : ""}{fmtMoney(totals.net)} ج.م
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
