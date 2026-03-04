import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Eye, KeyRound, Lock, Unlock } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import type { TreasurySummary } from "../types";

interface Props {
  summaries: TreasurySummary[];
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (t: TreasurySummary) => void;
  onDelete: (t: TreasurySummary) => void;
  onPassword: (t: TreasurySummary) => void;
  onStatement: (t: TreasurySummary) => void;
}

export function OverviewTab({ summaries, isLoading, onAdd, onEdit, onDelete, onPassword, onStatement }: Props) {
  const totals = {
    ob:  summaries.reduce((s, t) => s + parseFloat(t.openingBalance), 0),
    tin: summaries.reduce((s, t) => s + parseFloat(t.totalIn), 0),
    tout: summaries.reduce((s, t) => s + parseFloat(t.totalOut), 0),
    bal: summaries.reduce((s, t) => s + parseFloat(t.balance), 0),
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-right">قائمة الخزن</CardTitle>
        <Button size="sm" onClick={onAdd} data-testid="button-add-treasury">
          <Plus className="h-4 w-4 ml-1" />
          إضافة خزنة
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : summaries.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            لا توجد خزن — اضغط «إضافة خزنة» للبدء
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم الخزنة</TableHead>
                <TableHead className="text-right">الحساب</TableHead>
                <TableHead className="text-center">رصيد افتتاحي</TableHead>
                <TableHead className="text-center">وارد</TableHead>
                <TableHead className="text-center">منصرف</TableHead>
                <TableHead className="text-center">الرصيد الحالي</TableHead>
                <TableHead className="text-center">كلمة السر</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map(t => (
                <TableRow key={t.id} data-testid={`row-treasury-${t.id}`}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground ml-1">{t.glAccountCode}</span>
                    {t.glAccountName}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {formatNumber(parseFloat(t.openingBalance))}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm text-green-700 dark:text-green-400">
                    {formatNumber(parseFloat(t.totalIn))}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm text-red-700 dark:text-red-400">
                    {formatNumber(parseFloat(t.totalOut))}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm font-semibold">
                    <span className={parseFloat(t.balance) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}>
                      {formatNumber(parseFloat(t.balance))}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {t.hasPassword ? (
                      <Badge className="bg-green-600 text-white text-xs">
                        <Lock className="h-3 w-3 ml-1" />محمية
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-xs">
                        <Unlock className="h-3 w-3 ml-1" />مفتوحة
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={t.isActive ? "default" : "secondary"} className="text-xs">
                      {t.isActive ? "نشط" : "موقف"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => onStatement(t)} title="كشف الحساب" data-testid={`button-stmt-${t.id}`}>
                        <Eye className="h-3.5 w-3.5 ml-1" />كشف
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onPassword(t)} data-testid={`button-pwd-${t.id}`}>
                        <KeyRound className="h-3.5 w-3.5 ml-1" />
                        {t.hasPassword ? "تغيير السر" : "تعيين سر"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onEdit(t)} data-testid={`button-edit-${t.id}`}>
                        <Pencil className="h-3.5 w-3.5 ml-1" />تعديل
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onDelete(t)} data-testid={`button-delete-${t.id}`}>
                        <Trash2 className="h-3.5 w-3.5 ml-1" />حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {summaries.length > 1 && (
              <tfoot>
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={2} className="text-right px-3">الإجمالي</TableCell>
                  <TableCell className="text-center font-mono">{formatNumber(totals.ob)}</TableCell>
                  <TableCell className="text-center font-mono text-green-700 dark:text-green-400">{formatNumber(totals.tin)}</TableCell>
                  <TableCell className="text-center font-mono text-red-700 dark:text-red-400">{formatNumber(totals.tout)}</TableCell>
                  <TableCell className="text-center font-mono">{formatNumber(totals.bal)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </tfoot>
            )}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
