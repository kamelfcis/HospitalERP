import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { IntegrityReport } from "./types";

interface IntegrityTabProps {
  integrityData: IntegrityReport | undefined;
  onRefresh: () => void;
}

export function IntegrityTab({ integrityData, onRefresh }: IntegrityTabProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-5 w-5" />تقرير سلامة البيانات</CardTitle>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-3 w-3 ml-1" />
            إعادة الفحص
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!integrityData ? (
          <div className="p-4 text-center text-gray-400">جاري الفحص...</div>
        ) : integrityData.clean ? (
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-medium text-green-800">البيانات سليمة</p>
              <p className="text-xs text-green-600">لا توجد أيتام ولا تعارضات</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {integrityData.orphanAllocations.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-700 mb-2">طلبات مرتبطة بفواتير ملغاة ({integrityData.orphanAllocations.length})</p>
                <div className="text-xs bg-red-50 rounded p-2 font-mono overflow-x-auto space-y-0.5">
                  {integrityData.orphanAllocations.map((o: any, i: number) => (
                    <div key={i}>PSA: {o.psa_id?.slice(-6)} | Invoice: {o.invoice_id?.slice(-6)} | {o.invoice_status}</div>
                  ))}
                </div>
              </div>
            )}
            {integrityData.statusMismatches.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">تعارض في حالة التسوية ({integrityData.statusMismatches.length})</p>
                <div className="text-xs bg-amber-50 rounded p-2 font-mono overflow-x-auto space-y-0.5">
                  {integrityData.statusMismatches.map((m: any, i: number) => (
                    <div key={i}>PSA {m.psa_status} ≠ PIL {m.stock_issue_status} / cost: {m.cost_status}</div>
                  ))}
                </div>
              </div>
            )}
            {integrityData.orphanJournalLinks.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-700 mb-2">قيود مرتبطة لكن مفقودة ({integrityData.orphanJournalLinks.length})</p>
                <div className="text-xs bg-red-50 rounded p-2 font-mono overflow-x-auto space-y-0.5">
                  {integrityData.orphanJournalLinks.map((j: any, i: number) => (
                    <div key={i}>Batch {j.batch_id?.slice(-6)} → JE {j.journal_entry_id?.slice(-6)} MISSING</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
