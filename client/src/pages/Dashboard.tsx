import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FileText,
  BookOpen,
  Building2,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpLeft,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { usePharmacyMode } from "@/hooks/use-pharmacy-mode";
import { NAV_GROUPS, type NavItem } from "@/components/layout/nav-config";
import type { JournalEntry, FiscalPeriod } from "@shared/schema";

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

function navItemVisible(
  item: NavItem,
  hasPermission: (p: string) => boolean,
  pharmacyMode: boolean,
  isOwner: boolean,
  pharmacyLoading: boolean,
): boolean {
  if (item.permission && !hasPermission(item.permission)) return false;
  if (pharmacyLoading && item.hospitalOnly) return false;
  if (pharmacyMode && !isOwner && item.hospitalOnly) return false;
  return true;
}

export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  const { pharmacyMode, isOwner, isLoading: pharmacyLoading } = usePharmacyMode();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const shortcutGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.href !== "/" &&
          navItemVisible(item, hasPermission, pharmacyMode, isOwner, pharmacyLoading),
      ),
    })).filter((g) => g.items.length > 0);
  }, [hasPermission, pharmacyMode, isOwner, pharmacyLoading]);

  const statItems = [
    {
      label: "دليل الحسابات",
      value: stats?.totalAccounts ?? 0,
      icon: BookOpen,
      accent: "from-sky-500/15 to-transparent",
      iconClass: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "مراكز التكلفة",
      value: stats?.totalCostCenters ?? 0,
      icon: Building2,
      accent: "from-emerald-500/15 to-transparent",
      iconClass: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "قيود مُرحّلة",
      value: stats?.postedEntries ?? 0,
      icon: CheckCircle2,
      accent: "from-green-500/15 to-transparent",
      iconClass: "text-green-600 dark:text-green-400",
    },
    {
      label: "قيود مسودة",
      value: stats?.draftEntries ?? 0,
      icon: Clock,
      accent: "from-amber-500/15 to-transparent",
      iconClass: "text-amber-600 dark:text-amber-400",
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-8 p-4 md:p-8">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const debits = parseFloat(String(stats?.totalDebits ?? 0));
  const credits = parseFloat(String(stats?.totalCredits ?? 0));
  const balanced =
    stats?.totalDebits != null && stats?.totalCredits != null && stats.totalDebits === stats.totalCredits;

  return (
    <div className="min-h-0 space-y-8 p-4 md:p-8">
      {/* Hero */}
      <section
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/80",
          "bg-gradient-to-br from-primary/[0.12] via-background to-emerald-600/[0.08]",
          "p-6 shadow-lg ring-1 ring-black/[0.04] dark:ring-white/[0.06] md:p-8",
        )}
      >
        <div
          className="pointer-events-none absolute -start-20 -top-20 size-56 rounded-full bg-primary/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 end-0 size-72 rounded-full bg-emerald-500/15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/60 px-3 py-1 text-xs font-medium text-primary backdrop-blur-sm">
              <Sparkles className="size-3.5" aria-hidden />
              نظرة عامة
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              لوحة التحكم
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground md:text-base">
              ملخص المحاسبة، حركة القيود، ومسارات سريعة إلى أهم شاشات النظام — مصمّمة لتسريع يوم العمل.
            </p>
            {user && (
              <p className="text-sm text-muted-foreground">
                مرحباً،{" "}
                <span className="font-semibold text-foreground">{user.fullName}</span>
              </p>
            )}
          </div>
          {stats?.currentPeriod && (
            <div className="flex flex-col items-stretch gap-2 md:items-end">
              <span className="text-xs font-medium text-muted-foreground">الفترة المحاسبية</span>
              <Badge variant="secondary" className="h-9 justify-center px-4 text-sm font-semibold shadow-sm">
                {stats.currentPeriod.name}
              </Badge>
            </div>
          )}
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statItems.map((stat) => (
          <Card
            key={stat.label}
            className="group relative overflow-hidden border-border/80 transition-shadow hover:shadow-md"
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90",
                stat.accent,
              )}
              aria-hidden
            />
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={cn("size-5 opacity-80", stat.iconClass)} aria-hidden />
            </CardHeader>
            <CardContent className="relative">
              <p className="text-3xl font-bold tabular-nums tracking-tight">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Shortcuts */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">مسارات سريعة</h2>
            <p className="text-sm text-muted-foreground">
              انتقال مباشر حسب صلاحياتك — نفس بنود القائمة الجانبية، مرتّبة بمجموعات.
            </p>
          </div>
          <Badge variant="outline" className="gap-1 font-normal">
            <LayoutDashboard className="size-3.5" aria-hidden />
            {shortcutGroups.reduce((n, g) => n + g.items.length, 0)} رابط
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {shortcutGroups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <Card key={group.id} className="border-border/80 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <GroupIcon className="size-4" aria-hidden />
                    </div>
                    <div>
                      <CardTitle className="text-base">{group.label}</CardTitle>
                      <CardDescription className="text-xs">اختصارات المجموعة</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link key={item.href + item.title} href={item.href} className="block min-w-0">
                          <span
                            className={cn(
                              "group flex items-center gap-3 rounded-xl border border-border/70 bg-card/80 p-3",
                              "text-start transition-all hover:border-primary/35 hover:bg-primary/[0.04] hover:shadow-sm",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/80 text-muted-foreground transition-colors group-hover:text-foreground">
                              <Icon className="size-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium leading-tight">{item.title}</span>
                            </span>
                            <ArrowUpLeft className="size-4 shrink-0 text-muted-foreground opacity-60" aria-hidden />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Separator className="opacity-60" />

      {/* Accounting summary + recent */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-primary" aria-hidden />
              إجمالي الحركات
            </CardTitle>
            <CardDescription>مدين / دائن والفرق</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="size-4 text-red-600 dark:text-red-400" aria-hidden />
                إجمالي المدين
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-red-700 dark:text-red-400">
                {formatCurrency(stats?.totalDebits ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingDown className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                إجمالي الدائن
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(stats?.totalCredits ?? 0)}
              </span>
            </div>
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border px-4 py-3",
                balanced
                  ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                  : "border-amber-500/35 bg-amber-500/[0.06]",
              )}
            >
              <span className="text-sm font-medium">الفرق</span>
              <span className="font-mono text-sm font-bold tabular-nums">
                {formatCurrency(Math.abs(debits - credits))}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-primary" aria-hidden />
                أحدث القيود
              </CardTitle>
              <CardDescription>آخر القيود المسجّلة في النظام</CardDescription>
            </div>
            {hasPermission("journal.view") && (
              <Link href="/journal-entries">
                <span className="text-xs font-medium text-primary hover:underline">عرض الكل</span>
              </Link>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {stats?.recentEntries && stats.recentEntries.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {stats.recentEntries.slice(0, 6).map((entry) => (
                  <li key={entry.id}>
                    <Link href={`/journal-entries/${entry.id}`}>
                      <span className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
                        <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                          {entry.entryNumber}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {entry.description}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                          {formatDateShort(entry.entryDate)}
                        </span>
                        <Badge
                          variant={entry.status === "posted" ? "default" : entry.status === "draft" ? "secondary" : "destructive"}
                          className="shrink-0 text-[10px]"
                        >
                          {entry.status === "posted" ? "مُرحّل" : entry.status === "draft" ? "مسودة" : "ملغي"}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
                <AlertCircle className="size-8 text-muted-foreground/50" aria-hidden />
                <p className="text-sm text-muted-foreground">لا توجد قيود حتى الآن</p>
                {hasPermission("journal.create") && (
                  <Link href="/journal-entries/new">
                    <span className="text-sm font-medium text-primary hover:underline">إنشاء قيد جديد</span>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Footer strip */}
      <Card className="border-dashed border-border/80 bg-muted/20 shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <span className="text-muted-foreground">
              إجمالي القيود:{" "}
              <span className="font-mono font-semibold text-foreground">{stats?.totalJournalEntries ?? 0}</span>
            </span>
            <Separator orientation="vertical" className="hidden h-4 sm:block" />
            <span className="text-muted-foreground">
              مُرحّلة:{" "}
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {stats?.postedEntries ?? 0}
              </span>
            </span>
            <span className="text-muted-foreground">
              مسودة:{" "}
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                {stats?.draftEntries ?? 0}
              </span>
            </span>
          </div>
          {hasPermission("journal.create") && (
            <Link href="/journal-entries/new">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90">
                <FileText className="size-3.5" aria-hidden />
                قيد يومية جديد
              </span>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
