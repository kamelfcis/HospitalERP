/**
 * LineTable — جدول سطور جلسة الجرد
 *
 * الميزات:
 *  • إدخال متعدد الوحدات (علبة / شريط / حبة) للأصناف ذات التحويل
 *  • تحديث فوري للفرق وقيمة الفرق أثناء الكتابة
 *  • فلتر: عرض الفروق فقط
 *  • فلتر: عرض غير المُعدَّل فقط
 *  • بحث سريع بالاسم / الكود
 *  • تلوين الصفوف (فائض/عجز/صفر)
 *  • تذييل ثابت بالمجاميع
 *  • حذف سطر مفرد
 *  • التمرير التلقائي للصف المُحدَّد عبر الباركود
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  X, Search, Loader2, TrendingUp, Minus, ZapIcon, AlertTriangle, Edit2,
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
  // unit conversion (null = single-unit item)
  majorUnitName:   string | null;
  mediumUnitName:  string | null;
  minorUnitName:   string | null;
  majorToMedium:   string | null;
  majorToMinor:    string | null;
  mediumToMinor:   string | null;
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
function fmtQty(minor: string | number) {
  return (Number(minor) / 1000).toLocaleString("ar-EG", { minimumFractionDigits: 3 });
}
function fmtMoney(v: number) {
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Decompose minor qty into major/medium/minor unit quantities
function decomposeMinor(
  totalMinor: number,
  majorToMinor: number,
  mediumToMinor: number
): { maj: number; med: number; min: number } {
  const maj = majorToMinor > 0 ? Math.floor(totalMinor / majorToMinor) : 0;
  const rem1 = totalMinor - maj * majorToMinor;
  const med = mediumToMinor > 0 ? Math.floor(rem1 / mediumToMinor) : 0;
  const min = rem1 - med * mediumToMinor;
  return { maj, med, min };
}

function calcMinorFromUom(
  maj: number, majorToMinor: number,
  med: number, mediumToMinor: number,
  min: number
): number {
  return Math.round(
    (isNaN(maj) ? 0 : maj) * majorToMinor +
    (isNaN(med) ? 0 : med) * mediumToMinor +
    (isNaN(min) ? 0 : min)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SmartQtyCell — single OR multi-UOM input
// ─────────────────────────────────────────────────────────────────────────────
function SmartQtyCell({
  line, sessionId, disabled,
  onLocalChange,
}: {
  line:           SessionLine;
  sessionId:      string;
  disabled:       boolean;
  onLocalChange:  (lineId: string, newMinor: string) => void;
}) {
  const { toast }   = useToast();
  const queryClient = useQueryClient();

  const majorToMinor  = parseFloat(line.majorToMinor  ?? "0");
  const mediumToMinor = parseFloat(line.mediumToMinor ?? "0");
  const hasMajor      = !!line.majorUnitName && majorToMinor > 0;
  const hasMedium     = !!line.mediumUnitName && mediumToMinor > 0;
  const hasMinor      = !!line.minorUnitName;

  const isMultiUom = hasMajor; // has at least a major-to-minor conversion

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

  if (disabled) {
    return (
      <span className="font-mono text-sm">
        {fmtQty(line.countedQtyMinor)}
        {line.minorUnitName && (
          <span className="text-xs text-muted-foreground mr-0.5">{line.minorUnitName}</span>
        )}
      </span>
    );
  }

  if (!isMultiUom) {
    return (
      <SingleQtyCell
        line={line}
        onSave={(v) => saveMutation.mutate(v)}
        isPending={saveMutation.isPending}
        onLocalChange={onLocalChange}
      />
    );
  }

  return (
    <MultiUomCell
      line={line}
      majorToMinor={majorToMinor}
      mediumToMinor={mediumToMinor}
      hasMajor={hasMajor}
      hasMedium={hasMedium}
      hasMinor={hasMinor}
      onSave={(v) => saveMutation.mutate(v)}
      isPending={saveMutation.isPending}
      onLocalChange={onLocalChange}
    />
  );
}

// ── SingleQtyCell ──────────────────────────────────────────────────────────
function SingleQtyCell({
  line, onSave, isPending, onLocalChange,
}: {
  line:           SessionLine;
  onSave:         (minor: string) => void;
  isPending:      boolean;
  onLocalChange:  (lineId: string, newMinor: string) => void;
}) {
  const [editing,  setEditing]  = useState(false);
  const [localVal, setLocalVal] = useState(() => (Number(line.countedQtyMinor) / 1000).toFixed(3));
  const { toast } = useToast();
  const inputRef  = useRef<HTMLInputElement>(null);

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

  const confirm = () => {
    const num = parseFloat(localVal.replace(/,/g, "."));
    if (isNaN(num) || num < 0) {
      toast({ title: "تحذير", description: "الكمية يجب أن تكون رقماً غير سالب", variant: "destructive" });
      return;
    }
    const minor = String(Math.round(num * 1000));
    setEditing(false);
    onSave(minor);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          className="h-7 w-24 text-left text-sm font-mono"
          value={localVal}
          onChange={e => {
            setLocalVal(e.target.value);
            const num = parseFloat(e.target.value.replace(/,/g, "."));
            if (!isNaN(num) && num >= 0) {
              onLocalChange(line.id, String(Math.round(num * 1000)));
            }
          }}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); confirm(); }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={confirm}
          dir="ltr"
          data-testid={`qty-input-${line.id}`}
        />
        {isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
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
      {line.minorUnitName && (
        <span className="text-xs text-muted-foreground">{line.minorUnitName}</span>
      )}
      <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
    </button>
  );
}

// ── MultiUomCell ──────────────────────────────────────────────────────────
function MultiUomCell({
  line, majorToMinor, mediumToMinor,
  hasMajor, hasMedium, hasMinor,
  onSave, isPending, onLocalChange,
}: {
  line:           SessionLine;
  majorToMinor:   number;
  mediumToMinor:  number;
  hasMajor:       boolean;
  hasMedium:      boolean;
  hasMinor:       boolean;
  onSave:         (minor: string) => void;
  isPending:      boolean;
  onLocalChange:  (lineId: string, newMinor: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();

  // Decompose current countedQtyMinor into maj/med/min
  const currentMinor = parseFloat(line.countedQtyMinor);
  const decomposed = decomposeMinor(currentMinor, majorToMinor, mediumToMinor);

  const [majVal, setMajVal] = useState(hasMajor  ? String(decomposed.maj || "") : "");
  const [medVal, setMedVal] = useState(hasMedium ? String(decomposed.med || "") : "");
  const [minVal, setMinVal] = useState(String(decomposed.min || ""));

  // Reset local when server value changes
  useEffect(() => {
    if (!editing) {
      const d = decomposeMinor(parseFloat(line.countedQtyMinor), majorToMinor, mediumToMinor);
      if (hasMajor)  setMajVal(d.maj > 0 ? String(d.maj) : "");
      if (hasMedium) setMedVal(d.med > 0 ? String(d.med) : "");
      setMinVal(d.min > 0 ? String(d.min) : "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.countedQtyMinor, editing]);

  const calcTotal = (mj = majVal, md = medVal, mn = minVal) => {
    return calcMinorFromUom(
      parseFloat(mj) || 0, hasMajor  ? majorToMinor  : 0,
      parseFloat(md) || 0, hasMedium ? mediumToMinor : 0,
      parseFloat(mn) || 0
    );
  };

  const handleChange = (
    field: "maj" | "med" | "min",
    val: string
  ) => {
    const mj = field === "maj" ? val : majVal;
    const md = field === "med" ? val : medVal;
    const mn = field === "min" ? val : minVal;
    if (field === "maj") setMajVal(val);
    if (field === "med") setMedVal(val);
    if (field === "min") setMinVal(val);
    const total = calcTotal(mj, md, mn);
    onLocalChange(line.id, String(total));
  };

  const confirm = () => {
    const total = calcTotal();
    if (total < 0) {
      toast({ title: "تحذير", description: "الكمية يجب أن تكون غير سالبة", variant: "destructive" });
      return;
    }
    setEditing(false);
    onSave(String(total));
  };

  // Display text (not editing)
  const displayParts: string[] = [];
  if (hasMajor  && decomposed.maj > 0) displayParts.push(`${decomposed.maj} ${line.majorUnitName}`);
  if (hasMedium && decomposed.med > 0) displayParts.push(`${decomposed.med} ${line.mediumUnitName}`);
  const minPart = hasMajor ? decomposed.min : Math.round(currentMinor);
  if (minPart > 0 || displayParts.length === 0) {
    displayParts.push(`${minPart} ${line.minorUnitName ?? ""}`);
  }

  if (!editing) {
    return (
      <button
        className="text-sm hover:text-primary focus:outline-none flex items-center gap-1 group text-start"
        onClick={() => setEditing(true)}
        data-testid={`qty-cell-${line.id}`}
      >
        <span className="font-medium">{displayParts.join(" + ") || "0"}</span>
        <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-0.5" onBlur={(e) => {
      // blur the whole group if focus leaves the container
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        confirm();
      }
    }}>
      {hasMajor && (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            className="h-6 w-16 text-left text-xs font-mono"
            placeholder="0"
            value={majVal}
            onChange={e => handleChange("maj", e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") setEditing(false); }}
            dir="ltr"
            data-testid={`qty-maj-${line.id}`}
          />
          <span className="text-xs text-muted-foreground">{line.majorUnitName}</span>
        </div>
      )}
      {hasMedium && (
        <div className="flex items-center gap-1">
          <Input
            className="h-6 w-16 text-left text-xs font-mono"
            placeholder="0"
            value={medVal}
            onChange={e => handleChange("med", e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") setEditing(false); }}
            dir="ltr"
            data-testid={`qty-med-${line.id}`}
          />
          <span className="text-xs text-muted-foreground">{line.mediumUnitName}</span>
        </div>
      )}
      {(hasMinor || !hasMedium) && (
        <div className="flex items-center gap-1">
          <Input
            className="h-6 w-16 text-left text-xs font-mono"
            placeholder="0"
            value={minVal}
            onChange={e => handleChange("min", e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") setEditing(false); }}
            dir="ltr"
            data-testid={`qty-min-${line.id}`}
          />
          <span className="text-xs text-muted-foreground">{line.minorUnitName ?? "وحدة"}</span>
        </div>
      )}
      {isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      {/* instant total preview */}
      <p className="text-xs text-muted-foreground font-mono">
        = {fmtQty(calcTotal())} {line.minorUnitName ?? ""}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LineTable
// ─────────────────────────────────────────────────────────────────────────────
export function LineTable({ lines, sessionId, isDraft, focusLineId, onFocused, onLoadItems }: Props) {
  const { toast }   = useToast();
  const queryClient = useQueryClient();

  const [searchTerm,    setSearchTerm]    = useState("");
  const [showVariance,  setShowVariance]  = useState(false);
  const [showUncounted, setShowUncounted] = useState(false);

  // local counts: Map<lineId, countedMinorString> — updated on every keystroke for instant diff
  const [localCounts, setLocalCounts] = useState<Map<string, string>>(new Map());

  const onLocalChange = useCallback((lineId: string, newMinor: string) => {
    setLocalCounts(prev => {
      const next = new Map(prev);
      next.set(lineId, newMinor);
      return next;
    });
  }, []);

  // Clear local counts when server data changes (after save)
  useEffect(() => {
    setLocalCounts(new Map());
  }, [lines]);

  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Auto-scroll to focused line (from barcode scan)
  useEffect(() => {
    if (!focusLineId) return;
    const el = rowRefs.current.get(focusLineId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "transition-all");
      const t = setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary");
        onFocused?.();
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [focusLineId, onFocused]);

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
        l.itemNameAr.includes(searchTerm) || l.itemCode.toLowerCase().includes(q)
      );
    }
    if (showVariance) {
      result = result.filter(l => {
        const counted = parseFloat(localCounts.get(l.id) ?? l.countedQtyMinor);
        const diff = counted - parseFloat(l.systemQtyMinor);
        return Math.abs(diff) > 0.0001;
      });
    }
    if (showUncounted) {
      result = result.filter(l => {
        const counted = parseFloat(localCounts.get(l.id) ?? l.countedQtyMinor);
        return Math.abs(counted - parseFloat(l.systemQtyMinor)) < 0.0001;
      });
    }
    return result;
  }, [lines, searchTerm, showVariance, showUncounted, localCounts]);

  // ── Totals (using localCounts for instant updates) ──────────────────────
  const totals = useMemo(() => {
    let surplus = 0, shortage = 0, net = 0;
    for (const l of lines) {
      const counted = parseFloat(localCounts.get(l.id) ?? l.countedQtyMinor);
      const diffMinor = counted - parseFloat(l.systemQtyMinor);
      const val = (diffMinor / 1000) * parseFloat(l.unitCost);
      net += val;
      if (val > 0) surplus += val;
      else if (val < 0) shortage += Math.abs(val);
    }
    return { surplus, shortage, net, count: lines.length };
  }, [lines, localCounts]);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* ── Toolbar ── */}
      {lines.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
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
      <div className="flex-1 overflow-auto rounded border min-h-0">
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
                // Use localCounts for instant feedback
                const countedMinor = parseFloat(localCounts.get(line.id) ?? line.countedQtyMinor);
                const systemMinor  = parseFloat(line.systemQtyMinor);
                const diff         = countedMinor - systemMinor;
                const diffVal      = (diff / 1000) * parseFloat(line.unitCost);

                const rowColor =
                  diff > 0.0001   ? "bg-green-500/5 hover:bg-green-500/10" :
                  diff < -0.0001  ? "bg-destructive/5 hover:bg-destructive/10" :
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
                        {line.majorUnitName ? (
                          <p className="text-xs text-muted-foreground">
                            {[line.majorUnitName, line.mediumUnitName, line.minorUnitName]
                              .filter(Boolean).join(" / ")}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{line.itemCategory}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {line.expiryDate ? formatDate(line.expiryDate) : "—"}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm text-muted-foreground">
                      {fmtQty(line.systemQtyMinor)}
                      {line.minorUnitName && (
                        <span className="text-xs text-muted-foreground mr-0.5">
                          {line.minorUnitName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <SmartQtyCell
                        line={line}
                        sessionId={sessionId}
                        disabled={!isDraft}
                        onLocalChange={onLocalChange}
                      />
                    </TableCell>
                    <TableCell className={`text-center font-mono text-sm font-semibold ${
                      diff > 0.0001  ? "text-green-600" :
                      diff < -0.0001 ? "text-destructive" :
                                       "text-muted-foreground"
                    }`}>
                      {diff > 0.0001 ? "+" : ""}{fmtQty(diff)}
                    </TableCell>
                    <TableCell className={`text-center font-mono text-sm font-semibold ${
                      diffVal > 0 ? "text-green-600" :
                      diffVal < 0 ? "text-destructive" :
                                    "text-muted-foreground"
                    }`}>
                      {diffVal !== 0 && diffVal > 0 ? "+" : ""}{fmtMoney(diffVal)}
                    </TableCell>
                    {isDraft && (
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteLineMutation.mutate(line.id)}
                              disabled={deleteLineMutation.isPending}
                              data-testid={`btn-delete-line-${line.id}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>حذف السطر</TooltipContent>
                        </Tooltip>
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
        <div className="sticky bottom-0 bg-background border-t rounded-b-md grid grid-cols-2 md:grid-cols-4 divide-x divide-x-reverse text-sm z-10 shadow-sm flex-shrink-0">
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
            totals.net > 0  ? "bg-green-500/5" :
            totals.net < 0  ? "bg-destructive/5" : ""
          }`}>
            <p className="text-xs text-muted-foreground">صافي الفرق</p>
            <p className={`font-bold ${
              totals.net > 0  ? "text-green-600" :
              totals.net < 0  ? "text-destructive" : ""
            }`}>
              {totals.net > 0 ? "+" : ""}{fmtMoney(totals.net)} ج.م
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
