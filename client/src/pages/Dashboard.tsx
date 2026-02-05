import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
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
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "دليل الحسابات",
      value: stats?.totalAccounts || 0,
      icon: BookOpen,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "مراكز التكلفة",
      value: stats?.totalCostCenters || 0,
      icon: Building2,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    },
    {
      title: "القيود المُرحّلة",
      value: stats?.postedEntries || 0,
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "قيود مسودة",
      value: stats?.draftEntries || 0,
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mt-1">
            نظرة عامة على النظام المحاسبي
          </p>
        </div>
        {stats?.currentPeriod && (
          <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2">
            <span className="text-sm text-muted-foreground">الفترة الحالية:</span>
            <Badge variant="outline" className="font-medium">
              {stats.currentPeriod.name}
            </Badge>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index} className="hover-elevate">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold mt-2">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="text-lg font-semibold">إجمالي الحركات</CardTitle>
            <FileText className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span className="font-medium">إجمالي المدين</span>
              </div>
              <span className="text-lg font-bold text-primary accounting-number">
                {formatCurrency(stats?.totalDebits || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-5 w-5 text-emerald-600" />
                <span className="font-medium">إجمالي الدائن</span>
              </div>
              <span className="text-lg font-bold text-emerald-600 accounting-number">
                {formatCurrency(stats?.totalCredits || 0)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
            <CardTitle className="text-lg font-semibold">آخر القيود</CardTitle>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats?.recentEntries && stats.recentEntries.length > 0 ? (
              <div className="space-y-3">
                {stats.recentEntries.slice(0, 5).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {entry.entryNumber}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(entry.entryDate)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        entry.status === "posted"
                          ? "status-posted"
                          : entry.status === "draft"
                          ? "status-draft"
                          : "status-reversed"
                      }
                    >
                      {entry.status === "posted"
                        ? "مُرحّل"
                        : entry.status === "draft"
                        ? "مسودة"
                        : "ملغي"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-sm">لا توجد قيود حتى الآن</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
