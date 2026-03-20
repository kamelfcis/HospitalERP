import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Shield, Trash2 } from "lucide-react";
import { coverageRuleTypeLabels } from "@shared/schema";
import type { ContractCoverageRule } from "@shared/schema";
import type { UseMutationResult } from "@tanstack/react-query";
import { CoverageRuleTestPanel } from "./CoverageRuleTestPanel";
import type { EvalInput } from "../hooks/useCoverageRules";

interface Props {
  rules: ContractCoverageRule[];
  rulesLoading: boolean;
  canManage: boolean;
  onEdit: (r: ContractCoverageRule) => void;
  deleteRuleMutation: UseMutationResult<any, unknown, string, unknown>;
  evalInput: EvalInput;
  setEvalInput: (fn: (prev: EvalInput) => EvalInput) => void;
  evalResult: any;
  evalLoading: boolean;
  onRunEvaluate: () => void;
}

export function CoverageRulesTab({
  rules, rulesLoading, canManage,
  onEdit, deleteRuleMutation,
  evalInput, setEvalInput, evalResult, evalLoading, onRunEvaluate,
}: Props) {
  return (
    <TabsContent value="rules" className="overflow-auto flex-1 m-0 p-0 data-[state=inactive]:hidden flex flex-col">
      <div className="overflow-auto flex-1">
        {rulesLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-xs gap-2">
            <Shield className="h-6 w-6 opacity-40" />
            لا توجد قواعد تغطية — أضف قاعدة أولى
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="text-right w-8">#</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">التفاصيل</TableHead>
                <TableHead className="text-center w-16">الأولوية</TableHead>
                <TableHead className="text-center w-16">الحالة</TableHead>
                {canManage && <TableHead className="text-right w-24">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rules].sort((a, b) => a.priority - b.priority).map((r, idx) => (
                <TableRow key={r.id} data-testid={`row-rule-${r.id}`} className="text-xs">
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{r.ruleName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {coverageRuleTypeLabels[r.ruleType] ?? r.ruleType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[10px] space-x-1 space-x-reverse">
                    {r.discountPct   && <span>خصم {r.discountPct}%</span>}
                    {r.fixedPrice    && <span>سعر ثابت {r.fixedPrice} ج.م</span>}
                    {r.serviceId     && <span className="font-mono">خدمة: {r.serviceId.slice(0, 8)}…</span>}
                    {r.departmentId  && <span className="font-mono">قسم: {r.departmentId.slice(0, 8)}…</span>}
                    {r.serviceCategory && <span>فئة: {r.serviceCategory}</span>}
                    {r.notes         && <span className="italic">{r.notes}</span>}
                  </TableCell>
                  <TableCell className="text-center font-mono">{r.priority}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.isActive ? "outline" : "destructive"} className="text-[10px]">
                      {r.isActive ? "نشط" : "موقوف"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                          onClick={() => onEdit(r)} data-testid={`button-edit-rule-${r.id}`}>
                          تعديل
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => { if (confirm("حذف القاعدة؟")) deleteRuleMutation.mutate(r.id); }}
                          data-testid={`button-delete-rule-${r.id}`}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <CoverageRuleTestPanel
        evalInput={evalInput}
        setEvalInput={setEvalInput}
        evalResult={evalResult}
        evalLoading={evalLoading}
        onRun={onRunEvaluate}
      />
    </TabsContent>
  );
}
