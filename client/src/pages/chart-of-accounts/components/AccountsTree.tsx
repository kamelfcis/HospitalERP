import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronLeft, Edit2, Trash2 } from "lucide-react";
import { formatCurrency, accountTypeLabels } from "@/lib/formatters";
import type { AccountTreeNode } from "../hooks/useChartOfAccounts";

interface AccountsTreeProps {
  flatTree: (AccountTreeNode & { displayLevel: number })[];
  expandedAccounts: Set<string>;
  toggleExpanded: (accountId: string) => void;
  handleOpenDialog: (account: any) => void;
  handleDelete: (id: string) => void;
}

const getAccountTypeBadgeColor = (type: string) => {
  switch (type) {
    case "asset":
      return "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
    case "liability":
      return "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700";
    case "equity":
      return "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700";
    case "revenue":
      return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700";
    case "expense":
      return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700";
    default:
      return "";
  }
};

export function AccountsTree({
  flatTree,
  expandedAccounts,
  toggleExpanded,
  handleOpenDialog,
  handleDelete,
}: AccountsTreeProps) {
  return (
    <div className="peachtree-grid">
      <table className="w-full">
        <thead className="peachtree-grid-header">
          <tr>
            <th className="text-right w-[140px]">رقم الحساب</th>
            <th className="text-right">اسم الحساب</th>
            <th className="text-center w-[90px]">النوع</th>
            <th className="text-center w-[80px]">م.تكلفة</th>
            <th className="text-left w-[110px]">الرصيد الافتتاحي</th>
            <th className="text-center w-[60px]">الحالة</th>
            <th className="text-center w-[70px]">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {flatTree.length === 0 ? (
            <tr className="peachtree-grid-row">
              <td colSpan={7} className="text-center py-4 text-xs text-muted-foreground">
                لا توجد حسابات
              </td>
            </tr>
          ) : (
            flatTree.map((account) => {
              const hasChildren = account.children.length > 0;
              const isExpanded = expandedAccounts.has(account.id);

              return (
                <tr
                  key={account.id}
                  className={`peachtree-grid-row ${!account.isActive ? "opacity-50" : ""}`}
                  data-testid={`row-account-${account.id}`}
                >
                  <td>
                    <div
                      className="flex items-center gap-1"
                      style={{ paddingRight: `${account.displayLevel * 16}px` }}
                    >
                      {hasChildren && (
                        <button
                          onClick={() => toggleExpanded(account.id)}
                          className="p-0.5 hover:bg-muted rounded"
                          data-testid={`button-expand-${account.id}`}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronLeft className="h-3 w-3" />
                          )}
                        </button>
                      )}
                      <span className="font-mono text-xs font-medium">{account.code}</span>
                    </div>
                  </td>
                  <td className="text-xs">{account.name}</td>
                  <td className="text-center">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${getAccountTypeBadgeColor(account.accountType)}`}
                    >
                      {accountTypeLabels[account.accountType]}
                    </Badge>
                  </td>
                  <td className="text-center text-xs">
                    {account.requiresCostCenter ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">مطلوب</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="peachtree-amount text-xs font-medium">
                    {formatCurrency(account.openingBalance)}
                  </td>
                  <td className="text-center">
                    <Badge 
                      variant={account.isActive ? "default" : "secondary"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {account.isActive ? "نشط" : "معطل"}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleOpenDialog(account)}
                        data-testid={`button-edit-account-${account.id}`}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleDelete(account.id)}
                        data-testid={`button-delete-account-${account.id}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
