import { useQuery } from "@tanstack/react-query";
import { 
  FileText, 
  BookOpen, 
  Building2, 
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { JournalEntry, Account, CostCenter, FiscalPeriod } from "@shared/schema";

interface DashboardStats {
  totalAccounts: number;
  totalCostCenters: number;
  totalJournalEntries: number;
  draftEntries: number;
  postedEntries: number;
  totalDebits: string;
  totalCredits: string;
  currentPeriod: FiscalPeriod | null;
  recentEntries: JournalEntry[];
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="p-2 space-y-2">
        <div className="peachtree-toolbar">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="peachtree-grid p-2">
              <Skeleton className="h-4 w-20 mb-1" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statItems = [
    { label: "دليل الحسابات", value: stats?.totalAccounts || 0, icon: BookOpen, color: "text-blue-700" },
    { label: "مراكز التكلفة", value: stats?.totalCostCenters || 0, icon: Building2, color: "text-emerald-700" },
    { label: "القيود المُرحّلة", value: stats?.postedEntries || 0, icon: CheckCircle2, color: "text-green-700" },
    { label: "قيود مسودة", value: stats?.draftEntries || 0, icon: Clock, color: "text-amber-700" },
  ];

  return (
    <div className="p-2 space-y-2">
      {/* Page Header - Peachtree Toolbar Style */}
      <div className="peachtree-toolbar flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">لوحة التحكم - نظرة عامة</h1>
        </div>
        {stats?.currentPeriod && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">الفترة:</span>
            <span className="font-semibold px-2 py-0.5 bg-white dark:bg-card border rounded text-xs">
              {stats.currentPeriod.name}
            </span>
          </div>
        )}
      </div>

      {/* Stats Row - Compact Grid Style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {statItems.map((stat, index) => (
          <div key={index} className="peachtree-grid p-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold font-mono mt-0.5">{stat.value}</p>
              </div>
              <stat.icon className={`h-5 w-5 ${stat.color} opacity-70`} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Transactions Summary */}
        <div className="peachtree-grid">
          <table className="w-full">
            <thead>
              <tr className="peachtree-grid-header">
                <th colSpan={2} className="text-right">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3 w-3" />
                    إجمالي الحركات
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="peachtree-grid-row">
                <td className="text-xs py-2 px-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3 w-3 text-red-600" />
                    إجمالي المدين
                  </div>
                </td>
                <td className="text-left py-2 px-3">
                  <span className="font-mono text-sm peachtree-amount peachtree-amount-debit font-semibold">
                    {formatCurrency(stats?.totalDebits || 0)}
                  </span>
                </td>
              </tr>
              <tr className="peachtree-grid-row">
                <td className="text-xs py-2 px-3">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-3 w-3 text-green-600" />
                    إجمالي الدائن
                  </div>
                </td>
                <td className="text-left py-2 px-3">
                  <span className="font-mono text-sm peachtree-amount peachtree-amount-credit font-semibold">
                    {formatCurrency(stats?.totalCredits || 0)}
                  </span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className={`${
                stats?.totalDebits === stats?.totalCredits 
                  ? "peachtree-totals-balanced" 
                  : "peachtree-totals"
              }`}>
                <td className="text-xs py-2 px-3 font-semibold">الفرق</td>
                <td className="text-left py-2 px-3">
                  <span className="font-mono text-sm peachtree-amount font-bold">
                    {formatCurrency(
                      Math.abs(
                        parseFloat(String(stats?.totalDebits || 0)) - 
                        parseFloat(String(stats?.totalCredits || 0))
                      )
                    )}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Recent Entries Table */}
        <div className="peachtree-grid">
          <table className="w-full">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="w-12 text-center">رقم</th>
                <th className="text-right">الوصف</th>
                <th className="w-20 text-center">التاريخ</th>
                <th className="w-16 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {stats?.recentEntries && stats.recentEntries.length > 0 ? (
                stats.recentEntries.slice(0, 6).map((entry) => (
                  <tr key={entry.id} className="peachtree-grid-row">
                    <td className="text-center py-1.5 px-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {entry.entryNumber}
                      </span>
                    </td>
                    <td className="text-xs py-1.5 px-2 truncate max-w-[200px]">
                      {entry.description}
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDateShort(entry.entryDate)}
                      </span>
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        entry.status === "posted"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : entry.status === "draft"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {entry.status === "posted" ? "مُرحّل" : entry.status === "draft" ? "مسودة" : "ملغي"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="peachtree-grid-row">
                  <td colSpan={4} className="text-center py-4 text-xs text-muted-foreground">
                    <AlertCircle className="h-4 w-4 mx-auto mb-1 opacity-50" />
                    لا توجد قيود حتى الآن
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="peachtree-totals flex items-center justify-between px-3 py-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">إجمالي القيود:</span>
          <span className="font-mono font-semibold">{stats?.totalJournalEntries || 0}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">مُرحّلة:</span>
          <span className="font-mono font-semibold text-green-700">{stats?.postedEntries || 0}</span>
          <span className="text-muted-foreground">مسودة:</span>
          <span className="font-mono font-semibold text-amber-700">{stats?.draftEntries || 0}</span>
        </div>
      </div>
    </div>
  );
}
