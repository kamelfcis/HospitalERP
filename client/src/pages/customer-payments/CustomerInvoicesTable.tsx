/*
 * CustomerInvoicesTable
 * Extracted from customer-payments/index.tsx — second-to-last large block.
 *
 * Owns internally:
 *   - sortKey / sortDir / handleSort   (pure UI sort state)
 *   - amountRefs / rowIds / handleKeyDown (keyboard navigation)
 *   - invoice sorting useMemo
 *   - SortHead sub-component
 *
 * Receives via props:
 *   - rawInvoices     — unsorted list (sorted here)
 *   - selected / callbacks — page owns these (needed for saveMutation + selectedRemaining)
 *   - amounts / onAmountChange
 *   - distributedTotal / totalAmount / selectedRemaining — for footer display
 *   - saveMutation    — page owns the mutation; button lives here in the footer
 */

import { useState, useMemo, useRef, memo, KeyboardEvent } from "react";
import { formatCurrency, formatDateShort }  from "@/lib/formatters";
import { Input }                            from "@/components/ui/input";
import { Button }                           from "@/components/ui/button";
import { Badge }                            from "@/components/ui/badge";
import { Checkbox }                         from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { Save, Loader2, ChevronUp, ChevronDown } from "lucide-react";

// ─── Local types ──────────────────────────────────────────────────────────────

type SortKey = "invoiceNumber" | "invoiceDate" | "netTotal" | "totalPaid" | "remaining";
type SortDir = "asc" | "desc";

export interface CustomerInvoiceRow {
  invoiceId:     string;
  invoiceNumber: string;
  invoiceDate:   string;
  netTotal:      string;
  totalPaid:     string;
  remaining:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

// ─── SortHead ─────────────────────────────────────────────────────────────────

function SortHead({
  label, sortKey, current, dir, onSort,
}: {
  label: string; sortKey: SortKey;
  current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap text-right px-2"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active
          ? (dir === "asc"
            ? <ChevronUp   className="h-3 w-3 text-blue-600" />
            : <ChevronDown className="h-3 w-3 text-blue-600" />)
          : <ChevronDown className="h-3 w-3 opacity-20" />
        }
      </span>
    </TableHead>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CustomerInvoicesTableProps {
  rawInvoices:      CustomerInvoiceRow[];
  selected:         Set<string>;
  onSelectAll:      (all: boolean) => void;
  onSelectToggle:   (id: string, checked: boolean | string) => void;
  amounts:          Record<string, string>;
  onAmountChange:   (id: string, value: string) => void;
  distributedTotal: number;
  totalAmount:      string;
  selectedRemaining: number | null;
  saveMutation:     { mutate: () => void; isPending: boolean };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const CustomerInvoicesTable = memo(function CustomerInvoicesTable({
  rawInvoices,
  selected,
  onSelectAll,
  onSelectToggle,
  amounts,
  onAmountChange,
  distributedTotal,
  totalAmount,
  selectedRemaining,
  saveMutation,
}: CustomerInvoicesTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowIds     = useRef<string[]>([]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const invoices = useMemo(() => {
    return [...rawInvoices].sort((a, b) => {
      let va: string | number = a[sortKey as keyof typeof a] as string;
      let vb: string | number = b[sortKey as keyof typeof b] as string;
      if (sortKey !== "invoiceDate") { va = parseFloat(va as string); vb = parseFloat(vb as string); }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rawInvoices, sortKey, sortDir]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const next = rowIds.current[idx + 1];
      if (next) amountRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = rowIds.current[idx - 1];
      if (prev) amountRefs.current[prev]?.focus();
    }
  };

  rowIds.current = invoices.map((inv) => inv.invoiceId);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="border rounded-md overflow-auto">
      <Table className="text-[12px]">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-8 px-2">
              <Checkbox
                checked={selected.size === invoices.length && invoices.length > 0}
                onCheckedChange={(v) => onSelectAll(!!v)}
                data-testid="checkbox-select-all"
              />
            </TableHead>
            <SortHead label="#"        sortKey="invoiceNumber" current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHead label="التاريخ" sortKey="invoiceDate"   current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHead label="المبلغ"  sortKey="netTotal"      current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHead label="محصّل"   sortKey="totalPaid"     current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHead label="متبقّي"  sortKey="remaining"     current={sortKey} dir={sortDir} onSort={handleSort} />
            <TableHead className="text-right px-2">مبلغ التحصيل</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                لا توجد فواتير
              </TableCell>
            </TableRow>
          )}
          {invoices.map((inv, idx) => {
            const isSelected = selected.has(inv.invoiceId);
            const remaining  = parseFloat(inv.remaining);
            const isPaid     = remaining <= 0.005;
            return (
              <TableRow
                key={inv.invoiceId}
                className={cx(
                  isSelected && "bg-blue-50/50 dark:bg-blue-900/10",
                  isPaid     && "opacity-60"
                )}
                data-testid={`row-invoice-${inv.invoiceId}`}
              >
                <TableCell className="px-2">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(v) => onSelectToggle(inv.invoiceId, v)}
                    data-testid={`checkbox-invoice-${inv.invoiceId}`}
                  />
                </TableCell>
                <TableCell className="tabular-nums px-2">{inv.invoiceNumber}</TableCell>
                <TableCell className="tabular-nums px-2">{formatDateShort(inv.invoiceDate)}</TableCell>
                <TableCell className="tabular-nums text-left px-2">{formatCurrency(inv.netTotal)}</TableCell>
                <TableCell className="tabular-nums text-left text-green-700 px-2">{formatCurrency(inv.totalPaid)}</TableCell>
                <TableCell className={cx(
                  "tabular-nums text-left px-2 font-semibold",
                  remaining > 0 ? "text-red-600" : "text-green-600"
                )}>
                  {formatCurrency(inv.remaining)}
                </TableCell>
                <TableCell className="px-2">
                  <Input
                    ref={(el) => { amountRefs.current[inv.invoiceId] = el; }}
                    type="number"
                    min={0}
                    max={remaining}
                    step={0.01}
                    value={amounts[inv.invoiceId] ?? ""}
                    onChange={(e) => onAmountChange(inv.invoiceId, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e as any, idx)}
                    placeholder="0.00"
                    className="h-6 w-[90px] text-xs text-left ltr px-1"
                    disabled={isPaid}
                    data-testid={`input-amount-${inv.invoiceId}`}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {invoices.length > 0 && (
          <TableFooter>
            {selected.size > 0 && selectedRemaining !== null && (
              <TableRow className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200">
                <TableCell colSpan={5} className="px-2 text-xs">
                  المحدد ({selected.size} فاتورة) — إجمالي المتبقي:
                </TableCell>
                <TableCell className="tabular-nums text-left font-bold px-2" colSpan={2}>
                  {formatCurrency(selectedRemaining.toFixed(2))}
                </TableCell>
              </TableRow>
            )}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={6} className="px-2 text-left text-xs">
                إجمالي الموزَّع:
                <span className={cx(
                  "mr-2 text-sm",
                  totalAmount && Math.abs(distributedTotal - parseFloat(totalAmount)) > 0.01
                    ? "text-red-600"
                    : "text-green-600"
                )}>
                  {formatCurrency(distributedTotal.toFixed(2))}
                </span>
              </TableCell>
              <TableCell className="px-2 text-left">
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || distributedTotal === 0}
                  className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                  data-testid="button-save-receipt"
                >
                  {saveMutation.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin ml-1" />
                    : <Save className="h-3 w-3 ml-1" />}
                  حفظ الإيصال
                </Button>
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
});
