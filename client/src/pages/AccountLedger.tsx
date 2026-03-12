import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Account } from "@shared/schema";
import { AccountLookup } from "@/components/lookups/AccountLookup";
import type { LookupItem } from "@/lib/lookupTypes";

interface LedgerLine {
  id: string;
  entryId: string;
  entryNumber: number;
  entryDate: string;
  description: string;
  lineDescription: string | null;
  debit: string;
  credit: string;
  runningBalance: string;
  reference: string | null;
}

interface AccountLedgerData {
  account: Account;
  openingBalance: string;
  lines: LedgerLine[];
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
}

export default function AccountLedger() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);

  const ledgerUrl = selectedAccountId
    ? `/api/reports/account-ledger?accountId=${selectedAccountId}&startDate=${startDate}&endDate=${endDate}`
    : null;

  const { data: ledger, isLoading: ledgerLoading } = useQuery<AccountLedgerData>({
    queryKey: [ledgerUrl],
    enabled: !!ledgerUrl,
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-3 space-y-3" dir="rtl">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">كشف حساب</h1>
            <p className="text-xs text-muted-foreground">
              عرض حركات الحساب بالمدين والدائن والرصيد
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={!ledger}
            className="h-7 text-xs no-print"
            data-testid="button-print"
          >
            <Printer className="h-3 w-3 ml-1" />
            طباعة
          </Button>
        </div>
      </div>

      <div className="peachtree-grid p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-medium">الحساب</label>
            <AccountLookup
              value={selectedAccountId}
              onChange={(item: LookupItem | null) => setSelectedAccountId(item?.id ?? "")}
              placeholder="ابحث بالكود أو الاسم..."
              clearable
              data-testid="lookup-account-ledger"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">من تاريخ</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="peachtree-input w-full"
              data-testid="input-start-date"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">إلى تاريخ</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="peachtree-input w-full"
              data-testid="input-end-date"
            />
          </div>
        </div>
      </div>

      {!selectedAccountId ? (
        <div className="peachtree-grid p-8 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">اختر حساباً لعرض الكشف</p>
          <p className="text-xs text-muted-foreground">
            حدد الحساب والفترة الزمنية لعرض جميع الحركات
          </p>
        </div>
      ) : ledgerLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : ledger ? (
        <div className="space-y-3 print:space-y-2">
          <div className="peachtree-grid p-3 print:border print:border-black">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold">{ledger.account.code} - {ledger.account.name}</h2>
                <p className="text-xs text-muted-foreground">
                  من {formatDate(startDate)} إلى {formatDate(endDate)}
                </p>
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground">الرصيد الافتتاحي</p>
                <p className={`text-sm font-bold ${parseFloat(ledger.openingBalance) >= 0 ? "peachtree-amount-debit" : "peachtree-amount-credit"}`}>
                  {formatCurrency(Math.abs(parseFloat(ledger.openingBalance)))}
                  {parseFloat(ledger.openingBalance) >= 0 ? " مدين" : " دائن"}
                </p>
              </div>
            </div>
          </div>

          <div className="peachtree-grid overflow-hidden print:border print:border-black">
            <table className="w-full">
              <thead>
                <tr className="peachtree-grid-header">
                  <th className="text-right w-24">التاريخ</th>
                  <th className="text-right w-16">رقم القيد</th>
                  <th className="text-right">البيان</th>
                  <th className="text-left w-28">مدين</th>
                  <th className="text-left w-28">دائن</th>
                  <th className="text-left w-32">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {ledger.lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                      لا توجد حركات في هذه الفترة
                    </td>
                  </tr>
                ) : (
                  ledger.lines.map((line) => (
                    <tr key={line.id} className="peachtree-grid-row" data-testid={`row-ledger-${line.id}`}>
                      <td className="text-xs">{formatDate(line.entryDate)}</td>
                      <td className="text-xs font-mono">{line.entryNumber}</td>
                      <td className="text-xs">
                        <div>{line.lineDescription || line.description}</div>
                        {line.reference && (
                          <span className="text-muted-foreground text-[10px]">
                            المرجع: {line.reference}
                          </span>
                        )}
                      </td>
                      <td className="text-left font-mono text-xs peachtree-amount-debit">
                        {parseFloat(line.debit) > 0 ? formatCurrency(parseFloat(line.debit)) : "-"}
                      </td>
                      <td className="text-left font-mono text-xs peachtree-amount-credit">
                        {parseFloat(line.credit) > 0 ? formatCurrency(parseFloat(line.credit)) : "-"}
                      </td>
                      <td className={`text-left font-mono text-xs font-medium ${parseFloat(line.runningBalance) >= 0 ? "peachtree-amount-debit" : "peachtree-amount-credit"}`}>
                        {formatCurrency(Math.abs(parseFloat(line.runningBalance)))}
                        <span className="text-[10px] mr-1">
                          {parseFloat(line.runningBalance) >= 0 ? "م" : "د"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="peachtree-grid-header font-bold">
                  <td colSpan={3} className="text-left text-xs">الإجمالي</td>
                  <td className="text-left font-mono text-xs peachtree-amount-debit">
                    {formatCurrency(parseFloat(ledger.totalDebit))}
                  </td>
                  <td className="text-left font-mono text-xs peachtree-amount-credit">
                    {formatCurrency(parseFloat(ledger.totalCredit))}
                  </td>
                  <td className={`text-left font-mono text-xs font-bold ${parseFloat(ledger.closingBalance) >= 0 ? "peachtree-amount-debit" : "peachtree-amount-credit"}`}>
                    {formatCurrency(Math.abs(parseFloat(ledger.closingBalance)))}
                    <span className="text-[10px] mr-1">
                      {parseFloat(ledger.closingBalance) >= 0 ? "م" : "د"}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="peachtree-grid p-3 print:border print:border-black">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">إجمالي المدين</p>
                <p className="text-sm font-bold peachtree-amount-debit">
                  {formatCurrency(parseFloat(ledger.totalDebit))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
                <p className="text-sm font-bold peachtree-amount-credit">
                  {formatCurrency(parseFloat(ledger.totalCredit))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الرصيد الختامي</p>
                <p className={`text-sm font-bold ${parseFloat(ledger.closingBalance) >= 0 ? "peachtree-amount-debit" : "peachtree-amount-credit"}`}>
                  {formatCurrency(Math.abs(parseFloat(ledger.closingBalance)))}
                  {parseFloat(ledger.closingBalance) >= 0 ? " مدين" : " دائن"}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
