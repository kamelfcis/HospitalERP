import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Account } from "@shared/schema";

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
  const [selectedAccountDisplay, setSelectedAccountDisplay] = useState<string>("");
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: accounts, isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery<AccountLedgerData>({
    queryKey: ["/api/reports/account-ledger", selectedAccountId, startDate, endDate],
    queryFn: async () => {
      if (!selectedAccountId) return null;
      const response = await fetch(
        `/api/reports/account-ledger?accountId=${selectedAccountId}&startDate=${startDate}&endDate=${endDate}`
      );
      if (!response.ok) throw new Error("Failed to fetch ledger");
      return response.json();
    },
    enabled: !!selectedAccountId,
  });

  const matchesPattern = (text: string, pattern: string): boolean => {
    if (!pattern) return true;
    const normalizedText = text.toLowerCase().trim();
    const normalizedPattern = pattern.toLowerCase().trim();
    
    if (normalizedPattern.includes("%")) {
      const parts = normalizedPattern.split("%").filter(p => p.length > 0);
      let lastIndex = 0;
      for (const part of parts) {
        const index = normalizedText.indexOf(part, lastIndex);
        if (index === -1) return false;
        lastIndex = index + part.length;
      }
      return true;
    }
    
    return normalizedText.includes(normalizedPattern);
  };

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    if (!searchQuery.trim()) {
      return accounts.filter(a => a.isActive).slice(0, 50);
    }
    
    const query = searchQuery.trim();
    const results = accounts.filter((account) => {
      if (!account.isActive) return false;
      
      if (matchesPattern(account.code, query)) return true;
      if (matchesPattern(account.name, query)) return true;
      
      const combinedText = `${account.code} ${account.name}`;
      return matchesPattern(combinedText, query);
    });
    
    results.sort((a, b) => {
      const aStartsWithCode = a.code.startsWith(query);
      const bStartsWithCode = b.code.startsWith(query);
      if (aStartsWithCode && !bStartsWithCode) return -1;
      if (!aStartsWithCode && bStartsWithCode) return 1;
      
      const aNameStarts = a.name.startsWith(query);
      const bNameStarts = b.name.startsWith(query);
      if (aNameStarts && !bNameStarts) return -1;
      if (!aNameStarts && bNameStarts) return 1;
      
      return a.code.localeCompare(b.code);
    });
    
    return results;
  }, [accounts, searchQuery]);

  const selectAccount = (account: Account) => {
    setSelectedAccountId(account.id);
    setSelectedAccountDisplay(`${account.code} - ${account.name}`);
    setShowDropdown(false);
    setSearchQuery("");
  };

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
          <div className="md:col-span-2 space-y-1 relative">
            <label className="text-xs font-medium">الحساب</label>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground z-10" />
              <input
                type="text"
                placeholder="ابحث بالكود أو الاسم..."
                value={showDropdown ? searchQuery : selectedAccountDisplay}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  setShowDropdown(true);
                  setSearchQuery("");
                }}
                className="peachtree-input w-full pr-7"
                data-testid="input-search-account"
              />
            </div>
            {showDropdown && (
              <div className="absolute z-50 top-full right-0 left-0 mt-1 bg-popover border rounded shadow-lg max-h-72 overflow-auto">
                <div className="sticky top-0 px-2 py-1.5 text-xs text-muted-foreground bg-muted border-b flex items-center justify-between">
                  <span>استخدم % للبحث المتقدم (مثال: خصم%مكتسب)</span>
                  <span className="text-primary font-medium">{filteredAccounts.length} نتيجة</span>
                </div>
                {filteredAccounts.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    لا توجد نتائج للبحث "{searchQuery}"
                  </div>
                ) : (
                  filteredAccounts.slice(0, 50).map((acc) => (
                    <div
                      key={acc.id}
                      className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent text-xs border-b border-muted/50 last:border-0 ${selectedAccountId === acc.id ? "bg-accent" : ""}`}
                      onClick={() => selectAccount(acc)}
                      data-testid={`option-account-${acc.id}`}
                    >
                      <span className="font-mono w-16 text-muted-foreground flex-shrink-0">{acc.code}</span>
                      <span className="flex-1">{acc.name}</span>
                    </div>
                  ))
                )}
                {filteredAccounts.length > 50 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground bg-muted text-center">
                    +{filteredAccounts.length - 50} نتيجة أخرى - حدد البحث أكثر
                  </div>
                )}
              </div>
            )}
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
