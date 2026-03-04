import { Search, Warehouse } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salesInvoiceStatusLabels } from "@shared/schema";
import { formatNumber, formatDateShort } from "@/lib/formatters";
import { PendingInvoice } from "../hooks/usePendingInvoices";

function getStatusBadgeClass(status: string) {
  if (status === "finalized") return "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "collected") return "bg-blue-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "cancelled") return "bg-red-600 text-white no-default-hover-elevate no-default-active-elevate";
  if (status === "draft") return "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate";
  return "";
}

interface InvoiceTableProps {
  invoices: PendingInvoice[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  shiftUnitId: string;
  testPrefix: string;
}

export function InvoiceTable({ invoices, loading, search, setSearch, selected, setSelected, shiftUnitId, testPrefix }: InvoiceTableProps) {
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map(i => i.id)));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-row-reverse items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الفاتورة أو اسم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8 text-right"
            data-testid={`input-${testPrefix}-search`}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-1">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table dir="rtl" className="text-xs">
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="text-right w-8 py-1 px-2">
                  <Checkbox
                    checked={invoices.length > 0 && selected.size === invoices.length}
                    onCheckedChange={toggleAll}
                    data-testid={`checkbox-${testPrefix}-select-all`}
                  />
                </TableHead>
                <TableHead className="text-right py-1 px-2">رقم الفاتورة</TableHead>
                <TableHead className="text-right py-1 px-2">الإجمالي</TableHead>
                <TableHead className="text-right py-1 px-2">الصافي</TableHead>
                <TableHead className="text-right py-1 px-2">بواسطة</TableHead>
                <TableHead className="text-right py-1 px-2">التاريخ</TableHead>
                <TableHead className="text-right py-1 px-2">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-xs">
                    لا توجد فواتير معلّقة
                  </TableCell>
                </TableRow>
              ) : invoices.map(inv => {
                const isExternal = !inv.warehousePharmacyId || inv.warehousePharmacyId !== shiftUnitId;
                return (
                  <TableRow
                    key={inv.id}
                    className={`h-7 cursor-pointer ${selected.has(inv.id) ? "bg-muted" : isExternal ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
                    onClick={() => toggleOne(inv.id)}
                    data-testid={`row-${testPrefix}-${inv.id}`}
                  >
                    <TableCell className="py-1 px-2" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(inv.id)}
                        onCheckedChange={() => toggleOne(inv.id)}
                        data-testid={`checkbox-${testPrefix}-${inv.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium py-1 px-2">
                      <span className="flex items-center gap-1 justify-end flex-wrap">
                        {inv.invoiceNumber}
                        {isExternal && inv.warehouseName && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 no-default-hover-elevate no-default-active-elevate">
                            <Warehouse className="h-2.5 w-2.5 ml-0.5" />
                            {inv.warehouseName}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right py-1 px-2">{formatNumber(inv.subtotal)}</TableCell>
                    <TableCell className="text-right font-medium py-1 px-2">{formatNumber(inv.netTotal)}</TableCell>
                    <TableCell className="text-right py-1 px-2 text-muted-foreground">{inv.createdBy || "-"}</TableCell>
                    <TableCell className="text-right py-1 px-2">{formatDateShort(inv.createdAt)}</TableCell>
                    <TableCell className="text-right py-1 px-2">
                      <Badge className={`text-[10px] px-1.5 py-0 ${getStatusBadgeClass(inv.status)}`}>
                        {salesInvoiceStatusLabels[inv.status] || inv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
