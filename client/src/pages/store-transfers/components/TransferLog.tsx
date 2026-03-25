import { Loader2, Eye, Send, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateShort } from "@/lib/formatters";
import { transferStatusLabels } from "@shared/schema";
import type { StoreTransferWithDetails, Warehouse } from "@shared/schema";
import type { UseMutationResult } from "@tanstack/react-query";

interface Props {
  warehouses?: Warehouse[];
  transfers: StoreTransferWithDetails[];
  transfersLoading: boolean;
  totalPages: number;
  logPage: number;
  setLogPage: (p: number) => void;
  filterFromDate: string;
  setFilterFromDate: (v: string) => void;
  filterToDate: string;
  setFilterToDate: (v: string) => void;
  filterSourceWarehouse: string;
  setFilterSourceWarehouse: (v: string) => void;
  filterDestWarehouse: string;
  setFilterDestWarehouse: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  filterSearch: string;
  setFilterSearch: (v: string) => void;
  onOpenTransfer: (id: string) => void;
  postDraftMutation: UseMutationResult<any, any, string>;
  deleteDraftMutation: UseMutationResult<any, any, string>;
}

export function TransferLog({
  warehouses,
  transfers,
  transfersLoading,
  totalPages,
  logPage,
  setLogPage,
  filterFromDate,
  setFilterFromDate,
  filterToDate,
  setFilterToDate,
  filterSourceWarehouse,
  setFilterSourceWarehouse,
  filterDestWarehouse,
  setFilterDestWarehouse,
  filterStatus,
  setFilterStatus,
  filterSearch,
  setFilterSearch,
  onOpenTransfer,
  postDraftMutation,
  deleteDraftMutation,
}: Props) {
  return (
    <div className="space-y-2" dir="rtl">
      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Label className="text-[10px] text-muted-foreground whitespace-nowrap">تاريخ من</Label>
          <Input
            type="date"
            value={filterFromDate}
            onChange={(e) => setFilterFromDate(e.target.value)}
            className="h-7 text-[11px] px-1 w-[120px]"
            data-testid="filter-from-date"
          />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[10px] text-muted-foreground whitespace-nowrap">تاريخ إلى</Label>
          <Input
            type="date"
            value={filterToDate}
            onChange={(e) => setFilterToDate(e.target.value)}
            className="h-7 text-[11px] px-1 w-[120px]"
            data-testid="filter-to-date"
          />
        </div>
        <Select value={filterSourceWarehouse} onValueChange={setFilterSourceWarehouse}>
          <SelectTrigger className="h-7 text-[11px] px-1 w-[140px]" data-testid="filter-source-warehouse">
            <SelectValue placeholder="مخزن المصدر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {warehouses?.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterDestWarehouse} onValueChange={setFilterDestWarehouse}>
          <SelectTrigger className="h-7 text-[11px] px-1 w-[140px]" data-testid="filter-dest-warehouse">
            <SelectValue placeholder="مخزن الوجهة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {warehouses?.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-7 text-[11px] px-1 w-[100px]" data-testid="filter-status">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="executed">مُنفّذ</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="text"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          placeholder="بحث (استخدم % كمقطع)..."
          className="h-7 text-[11px] px-1 w-[160px]"
          data-testid="filter-search"
        />
      </div>

      <div className="peachtree-grid">
        {transfersLoading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]" dir="rtl" data-testid="table-transfer-log">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th className="py-1 px-2 text-right font-medium">رقم الإذن</th>
                    <th className="py-1 px-2 text-right font-medium">التاريخ</th>
                    <th className="py-1 px-2 text-right font-medium">المصدر</th>
                    <th className="py-1 px-2 text-right font-medium">الوجهة</th>
                    <th className="py-1 px-2 text-right font-medium">عدد الأصناف</th>
                    <th className="py-1 px-2 text-right font-medium">الحالة</th>
                    <th className="py-1 px-2 text-right font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.length > 0 ? (
                    transfers.map((t) => (
                      <tr key={t.id} className="peachtree-grid-row" data-testid={`row-transfer-${t.id}`}>
                        <td className="py-1 px-2 font-mono">{t.transferNumber}</td>
                        <td className="py-1 px-2">{formatDateShort(t.transferDate)}</td>
                        <td className="py-1 px-2">{t.sourceWarehouse?.nameAr || "—"}</td>
                        <td className="py-1 px-2">{t.destinationWarehouse?.nameAr || "—"}</td>
                        <td className="py-1 px-2">{t.lines?.length || 0}</td>
                        <td className="py-1 px-2">
                          {t.status === "executed" ? (
                            <Badge variant="default" className="text-[9px] bg-green-600 no-default-hover-elevate no-default-active-elevate">
                              {transferStatusLabels[t.status] || t.status}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px]">
                              {transferStatusLabels[t.status] || t.status}
                            </Badge>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenTransfer(t.id)}
                              data-testid={`button-open-transfer-${t.id}`}
                            >
                              <Eye className="h-3 w-3 ml-1" />
                              فتح
                            </Button>
                            {t.status === "draft" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={postDraftMutation.isPending}
                                  onClick={() => postDraftMutation.mutate(t.id)}
                                  data-testid={`button-post-draft-${t.id}`}
                                >
                                  {postDraftMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3 ml-1" />
                                  )}
                                  ترحيل
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={deleteDraftMutation.isPending}
                                  onClick={() => deleteDraftMutation.mutate(t.id)}
                                  data-testid={`button-delete-draft-${t.id}`}
                                >
                                  {deleteDraftMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3 ml-1" />
                                  )}
                                  حذف
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-muted-foreground">
                        لا توجد تحويلات مسجلة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-2 text-[11px]">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage <= 1}
                  onClick={() => setLogPage(Math.max(1, logPage - 1))}
                  data-testid="button-prev-page"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <span className="text-muted-foreground">صفحة {logPage} من {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage >= totalPages}
                  onClick={() => setLogPage(Math.min(totalPages, logPage + 1))}
                  data-testid="button-next-page"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
