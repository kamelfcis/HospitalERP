/**
 * BarcodeInput — قارئ الباركود لجلسة الجرد
 *
 * السلوك:
 *  - يبحث عن الصنف بالباركود في مستودع الجلسة
 *  - إذا وُجد سطر في الجلسة → ينادي onFocusLine(lineId)
 *  - إذا لم يُجد في الجلسة → ينادي onAddItem(lots) لإضافته
 *  - إذا لم يُجد أصلاً → يعرض تحذيراً
 *  - يُعيد ضبط حقل الإدخال بعد كل مسح
 */
import { useRef, useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScanBarcode, AlertTriangle, Loader2 } from "lucide-react";

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
  sessionId:    string;
  disabled?:    boolean;
  sessionLines: { id: string; itemId: string; lotId: string | null }[];
  onFocusLine:  (lineId: string) => void;
  onAddItems:   (lots: LoadedItem[]) => Promise<void>;
}

export function BarcodeInput({ sessionId, disabled, sessionLines, onFocusLine, onAddItems }: Props) {
  const [value,    setValue]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [lastMsg,  setLastMsg]  = useState<{ type: "ok" | "warn" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode.trim() || loading) return;
    setLoading(true);
    setLastMsg(null);

    try {
      const res = await fetch(
        `/api/stock-count/sessions/${sessionId}/lookup-barcode?barcode=${encodeURIComponent(barcode)}`,
        { credentials: "include" }
      );
      const data = await res.json();

      if (!res.ok || !data.found) {
        setLastMsg({ type: "warn", text: `باركود غير معروف: ${barcode}` });
        return;
      }

      const lots: LoadedItem[] = data.lots;

      // Check if any lot is already in the session
      const existingLine = sessionLines.find(sl =>
        lots.some(l => l.itemId === sl.itemId && (l.lotId === sl.lotId || (!l.lotId && !sl.lotId)))
      );

      if (existingLine) {
        // Focus the existing row
        onFocusLine(existingLine.id);
        setLastMsg({ type: "ok", text: `تم التركيز على: ${lots[0]?.itemNameAr ?? "الصنف"}` });
      } else {
        // Add to session
        await onAddItems(lots);
        setLastMsg({ type: "ok", text: `تم إضافة: ${lots[0]?.itemNameAr ?? "الصنف"}` });
      }
    } catch (err: any) {
      setLastMsg({ type: "error", text: err.message });
    } finally {
      setLoading(false);
      setValue("");
      // clear message after 3s
      clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setLastMsg(null), 3000);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [sessionId, sessionLines, onFocusLine, onAddItems, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(value);
    }
  };

  if (disabled) return null;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="relative flex-1 max-w-xs">
        <ScanBarcode className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        {loading && <Loader2 className="absolute left-2.5 top-2.5 h-4 w-4 animate-spin text-primary" />}
        <Input
          ref={inputRef}
          className="pr-9 font-mono text-sm"
          placeholder="امسح الباركود أو اكتبه..."
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          dir="ltr"
          data-testid="input-barcode-scan"
        />
      </div>
      {lastMsg && (
        <div className={`flex items-center gap-1 text-sm ${
          lastMsg.type === "ok"    ? "text-green-600" :
          lastMsg.type === "warn"  ? "text-amber-600" : "text-destructive"
        }`}>
          {lastMsg.type === "warn" && <AlertTriangle className="h-4 w-4" />}
          <span>{lastMsg.text}</span>
        </div>
      )}
    </div>
  );
}
