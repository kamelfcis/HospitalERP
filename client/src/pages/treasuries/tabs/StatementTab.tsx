import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import type { TreasurySummary, TreasuryStatement } from "../types";

interface Props {
  summaries: TreasurySummary[];
  initialTreasuryId?: string;
}

const PAGE_SIZE = 100;

function computeRunningBalances(txns: TreasuryStatement["transactions"], openingBalance: number) {
  let bal = openingBalance;
  return txns.map(t => {
    bal += t.type === "in" ? parseFloat(t.amount) : -parseFloat(t.amount);
    return bal;
  });
}

export function StatementTab({ summaries, initialTreasuryId = "" }: Props) {
  const [treasuryId, setTreasuryId] = useState(initialTreasuryId);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const { data: statement, isFetching } = useQuery<TreasuryStatement>({
    queryKey: ["/api/treasuries", treasuryId, "statement", dateFrom, dateTo, page],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      const res = await apiRequest("GET", `/api/treasuries/${treasuryId}/statement?${p}`);
      return res.json();
    },
    enabled: !!treasuryId,
  });

  const totalPages = statement ? Math.max(1, Math.ceil(statement.total / PAGE_SIZE)) : 1;
  const runningBals = statement
    ? computeRunningBalances(statement.transactions, statement.pageOpeningBalance)
    : [];

  function handleTreasuryChange(v: string) {
    setTreasuryId(v);
    setPage(1);
  }
  function handleDateFromChange(v: string) {
    setDateFrom(v);
    setPage(1);
  }
  function handleDateToChange(v: string) {
    setDateTo(v);
    setPage(1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right">كشف حساب الخزنة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-sm font-medium mb-1.5 block">الخزنة</label>
            <Select value={treasuryId} onValueChange={handleTreasuryChange}>
              <SelectTrigger data-testid="select-stmt-treasury">
                <SelectValue placeholder="اختر خزنة..." />
              </SelectTrigger>
              <SelectContent>
                {summaries.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">من تاريخ</label>
            <Input type="date" value={dateFrom} onChange={e => handleDateFromChange(e.target.value)} className="w-38" data-testid="input-stmt-from" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">إلى تاريخ</label>
            <Input type="date" value={dateTo} onChange={e => handleDateToChange(e.target.value)} className="w-38" data-testid="input-stmt-to" />
          </div>
        </div>

        {!treasuryId && (
          <p className="text-center text-muted-foreground py-12">اختر خزنة لعرض كشف الحساب</p>
        )}

        {treasuryId && isFetching && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {treasuryId && !isFetching && statement && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-md p-3 text-center bg-green-50 dark:bg-green-950/20">
                <p className="text-xs text-muted-foreground mb-1">إجمالي الوارد</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-400" data-testid="text-total-in">
                  {formatNumber(parseFloat(statement.totalIn))}
                  <span className="text-xs font-normal mr-1">ج.م</span>
                </p>
              </div>
              <div className="border rounded-md p-3 text-center bg-red-50 dark:bg-red-950/20">
                <p className="text-xs text-muted-foreground mb-1">إجمالي المنصرف</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-400" data-testid="text-total-out">
                  {formatNumber(parseFloat(statement.totalOut))}
                  <span className="text-xs font-normal mr-1">ج.م</span>
                </p>
              </div>
              <div className="border rounded-md p-3 text-center bg-blue-50 dark:bg-blue-950/20">
                <p className="text-xs text-muted-foreground mb-1">الرصيد</p>
                <p
                  className={`text-xl font-bold ${parseFloat(statement.balance) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}
                  data-testid="text-balance"
                >
                  {formatNumber(parseFloat(statement.balance))}
                  <span className="text-xs font-normal mr-1">ج.م</span>
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center w-10">#</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">البيان</TableHead>
                  <TableHead className="text-center">وارد (ج.م)</TableHead>
                  <TableHead className="text-center">منصرف (ج.م)</TableHead>
                  <TableHead className="text-center">الرصيد (ج.م)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      لا توجد حركات في هذه الفترة
                    </TableCell>
                  </TableRow>
                ) : (
                  statement.transactions.map((txn, i) => {
                    const globalIdx = (page - 1) * PAGE_SIZE + i + 1;
                    return (
                      <TableRow key={txn.id} data-testid={`row-txn-${i}`}>
                        <TableCell className="text-center">{globalIdx}</TableCell>
                        <TableCell className="font-mono text-sm">{txn.transactionDate}</TableCell>
                        <TableCell>{txn.description || "—"}</TableCell>
                        <TableCell className="text-center font-medium text-green-700 dark:text-green-400">
                          {txn.type === "in" ? formatNumber(parseFloat(txn.amount)) : "—"}
                        </TableCell>
                        <TableCell className="text-center font-medium text-red-700 dark:text-red-400">
                          {txn.type === "out" ? formatNumber(parseFloat(txn.amount)) : "—"}
                        </TableCell>
                        <TableCell className={`text-center font-medium ${runningBals[i] >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}>
                          {formatNumber(runningBals[i])}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {statement.transactions.length > 0 && (
                <tfoot>
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3} className="text-right px-3">الإجمالي</TableCell>
                    <TableCell className="text-center text-green-700 dark:text-green-400">
                      {formatNumber(parseFloat(statement.totalIn))}
                    </TableCell>
                    <TableCell className="text-center text-red-700 dark:text-red-400">
                      {formatNumber(parseFloat(statement.totalOut))}
                    </TableCell>
                    <TableCell className={`text-center ${parseFloat(statement.balance) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}>
                      {formatNumber(parseFloat(statement.balance))}
                    </TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>

            {totalPages > 1 && (
              <div className="flex flex-row-reverse items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  عرض {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, statement.total)} من {statement.total} حركة
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="sm" className="h-6 px-2"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    data-testid="button-stmt-next-page"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs px-2">صفحة {page} من {totalPages}</span>
                  <Button
                    variant="outline" size="sm" className="h-6 px-2"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    data-testid="button-stmt-prev-page"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
