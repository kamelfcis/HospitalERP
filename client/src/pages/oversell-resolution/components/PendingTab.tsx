import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle, Eye, XCircle } from "lucide-react";
import { psaBadge, costStatusBadge } from "./helpers";
import type { PendingAllocation } from "./types";

interface PendingTabProps {
  allocations: PendingAllocation[];
  isLoading: boolean;
  total: number;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleAll: () => void;
  onPreview: (alloc: PendingAllocation) => void;
  previewPending: boolean;
  onResolve: (ids: string[]) => void;
  resolvePending: boolean;
  onCancelAlloc: (id: string) => void;
  cancelPending: boolean;
}

export function PendingTab({
  allocations,
  isLoading,
  total,
  selectedIds,
  toggleSelect,
  toggleAll,
  onPreview,
  previewPending,
  onResolve,
  resolvePending,
  onCancelAlloc,
  cancelPending,
}: PendingTabProps) {
  return (
    <>
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <span className="text-sm font-medium text-blue-800">تم تحديد {selectedIds.size} بند</span>
          <Button size="sm" onClick={() => onResolve(Array.from(selectedIds))} disabled={resolvePending} data-testid="bulk-resolve-btn">
            {resolvePending ? "جاري التسوية..." : "تسوية المحدد"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => {}}>إلغاء التحديد</Button>
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">البنود المعلقة</CardTitle>
          <CardDescription>إجمالي {total} بند</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">جاري التحميل...</div>
          ) : allocations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
              لا توجد بنود معلقة
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right">
                    <input type="checkbox"
                      checked={selectedIds.size === allocations.filter(a => a.status !== "fully_resolved" && a.status !== "cancelled").length && allocations.length > 0}
                      onChange={toggleAll} className="cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="text-right">الصنف</TableHead>
                  <TableHead className="text-right">المريض / الفاتورة</TableHead>
                  <TableHead className="text-right">المخزن</TableHead>
                  <TableHead className="text-right">معلق / حالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">السبب</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((alloc) => {
                  const qtyPending   = parseFloat(alloc.qty_minor_pending);
                  const currentStock = parseFloat(alloc.current_stock_minor);
                  const canResolve   = currentStock >= qtyPending - 0.00005;
                  const isResolved   = alloc.status === "fully_resolved";
                  const isCancelled  = alloc.status === "cancelled";

                  return (
                    <TableRow key={alloc.id}
                      className={isCancelled ? "opacity-50" : selectedIds.has(alloc.id) ? "bg-blue-50" : ""}
                      data-testid={`oversell-row-${alloc.id}`}
                    >
                      <TableCell>
                        {!isResolved && !isCancelled && (
                          <input type="checkbox" checked={selectedIds.has(alloc.id)} onChange={() => toggleSelect(alloc.id)} className="cursor-pointer" />
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{alloc.item_name}</p>
                        {alloc.item_barcode && <p className="text-xs text-gray-400">{alloc.item_barcode}</p>}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{alloc.patient_name ?? "—"}</p>
                        {alloc.invoice_number && <p className="text-xs text-gray-400">#{alloc.invoice_number}</p>}
                      </TableCell>
                      <TableCell className="text-xs">{alloc.warehouse_name}</TableCell>
                      <TableCell>
                        <div>
                          <span className={`text-sm font-mono ${!canResolve ? "text-red-600" : "text-gray-700"}`}>
                            {qtyPending.toFixed(2)}
                          </span>
                          <span className="text-xs text-gray-400 mx-1">/</span>
                          <span className={`text-sm font-mono ${canResolve ? "text-green-600" : "text-red-600"}`}>
                            {currentStock.toFixed(2)}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">{alloc.item_minor_unit ?? ""}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {psaBadge(alloc.status)}
                          {costStatusBadge(alloc.cost_status)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-500 max-w-[90px] truncate block" title={alloc.reason ?? ""}>{alloc.reason ?? "—"}</span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(alloc.created_at).toLocaleDateString("ar")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {!isResolved && !isCancelled && (
                            <Button size="sm" variant="outline" onClick={() => onPreview(alloc)} disabled={previewPending} data-testid={`preview-btn-${alloc.id}`}>
                              <Eye className="h-3 w-3" />
                            </Button>
                          )}
                          {!isResolved && !isCancelled && canResolve && (
                            <Button size="sm" onClick={() => onResolve([alloc.id])} disabled={resolvePending} data-testid={`resolve-btn-${alloc.id}`}>
                              تسوية
                            </Button>
                          )}
                          {!isResolved && !isCancelled && !canResolve && (
                            <span className="text-xs text-red-500 self-center">رصيد ناقص</span>
                          )}
                          {!isResolved && !isCancelled && (
                            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 px-1"
                              onClick={() => onCancelAlloc(alloc.id)}
                              disabled={cancelPending} data-testid={`cancel-alloc-btn-${alloc.id}`} title="إلغاء">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
