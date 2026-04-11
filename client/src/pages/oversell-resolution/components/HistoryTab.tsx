import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, RotateCcw } from "lucide-react";
import { journalStatusBadge } from "./helpers";
import type { ResolutionBatch } from "./types";

interface HistoryTabProps {
  historyData: ResolutionBatch[] | undefined;
  onRefresh: () => void;
  onVoid: (batchId: string) => void;
  voidPending: boolean;
}

export function HistoryTab({ historyData, onRefresh, onVoid, voidPending }: HistoryTabProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">سجل دفعات التسوية</CardTitle>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3 ml-1" />
            تحديث
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!historyData?.length ? (
          <div className="p-8 text-center text-gray-400">لا توجد دفعات مسجّلة بعد</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الدفعة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">بواسطة</TableHead>
                <TableHead className="text-right">حالة القيد</TableHead>
                <TableHead className="text-right">ملاحظات</TableHead>
                <TableHead className="text-right">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyData.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell className="font-mono text-xs">{batch.id.slice(-8).toUpperCase()}</TableCell>
                  <TableCell className="text-xs text-gray-600">{new Date(batch.resolved_at).toLocaleDateString("ar")}</TableCell>
                  <TableCell className="text-xs">{batch.resolved_by_name ?? batch.resolved_by?.slice(-6)}</TableCell>
                  <TableCell>{journalStatusBadge(batch.journal_status)}</TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-[150px] truncate">{batch.notes ?? "—"}</TableCell>
                  <TableCell>
                    {batch.journal_status !== "voided" && (
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 text-xs"
                        onClick={() => onVoid(batch.id)} disabled={voidPending} data-testid={`void-batch-btn-${batch.id}`}>
                        <RotateCcw className="h-3 w-3 ml-1" />
                        عكس
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
