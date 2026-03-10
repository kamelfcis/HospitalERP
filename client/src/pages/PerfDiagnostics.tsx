import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  Trash2,
  Database,
  Zap,
  AlertTriangle,
  Layers,
  Cpu,
  Clock,
  Search,
  BarChart2,
} from "lucide-react";

interface PerfEntry {
  timestamp: string;
  method: string;
  route: string;
  statusCode: number;
  totalMs: number;
  dbMs: number;
  backendMs: number;
  queryCount: number;
  slowestQueryMs: number;
  slowestQueryText: string;
  possibleCause: string;
}

const CAUSE_META: Record<
  string,
  { label: string; color: string; icon: typeof Database; hint: string }
> = {
  database_query: {
    label: "استعلام قاعدة بيانات",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Database,
    hint: "أكثر من 75% من وقت الطلب مُستهلك داخل قاعدة البيانات.",
  },
  missing_index: {
    label: "فهرس مفقود / JOIN ثقيل",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: AlertTriangle,
    hint: "أبطأ استعلام مفرد تجاوز 500ms — يُرجَّح غياب فهرس.",
  },
  large_data_fetch: {
    label: "جلب بيانات ضخمة",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    icon: Layers,
    hint: "عدد الاستعلامات تجاوز 20 — يُنصح بالتجميع أو التصفح.",
  },
  backend_processing: {
    label: "معالجة خلفية",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    icon: Cpu,
    hint: "وقت قاعدة البيانات منخفض؛ التأخير ناتج عن منطق الخادم.",
  },
};

function CauseBadge({ cause }: { cause: string }) {
  const meta = CAUSE_META[cause] ?? {
    label: cause,
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: Zap,
    hint: "",
  };
  const Icon = meta.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium cursor-default ${meta.color}`}
        >
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="max-w-xs text-xs">{meta.hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-green-100 text-green-800",
    POST: "bg-blue-100 text-blue-800",
    PUT: "bg-yellow-100 text-yellow-800",
    PATCH: "bg-yellow-100 text-yellow-800",
    DELETE: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-bold ${colors[method] ?? "bg-gray-100 text-gray-700"}`}
    >
      {method}
    </span>
  );
}

function TimeBar({
  totalMs,
  dbMs,
}: {
  totalMs: number;
  dbMs: number;
}) {
  const dbPct = totalMs > 0 ? Math.min(100, Math.round((dbMs / totalMs) * 100)) : 0;
  const backendPct = 100 - dbPct;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="h-2 rounded-full overflow-hidden bg-gray-100 w-24 flex cursor-default">
          <div className="bg-blue-400 h-full" style={{ width: `${dbPct}%` }} />
          <div className="bg-purple-300 h-full" style={{ width: `${backendPct}%` }} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">
          قاعدة البيانات: {dbPct}% — خادم: {backendPct}%
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function timeColor(ms: number): string {
  if (ms >= 2000) return "text-red-600 font-bold";
  if (ms >= 1000) return "text-orange-600 font-semibold";
  return "text-yellow-700";
}

export default function PerfDiagnostics() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: entries = [], isLoading, refetch } = useQuery<PerfEntry[]>({
    queryKey: ["/api/ops/perf-report"],
    refetchInterval: autoRefresh ? 10_000 : false,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ops/clear-logs"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ops/perf-report"] }),
  });

  const handleRefresh = useCallback(() => refetch(), [refetch]);

  // Summary stats
  const avgTotal =
    entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.totalMs, 0) / entries.length)
      : 0;
  const avgDb =
    entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.dbMs, 0) / entries.length)
      : 0;
  const maxTotal = entries.length > 0 ? Math.max(...entries.map((e) => e.totalMs)) : 0;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" />
            تشخيص أداء الصفحات
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            الطلبات التي تجاوزت 500ms — آخر {entries.length} سجل (يُحفظ حتى 200)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            data-testid="btn-toggle-autorefresh"
            className={autoRefresh ? "border-green-500 text-green-700" : ""}
          >
            <RefreshCw className={`w-4 h-4 me-1.5 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "تحديث تلقائي مفعّل" : "تحديث تلقائي"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            data-testid="btn-refresh"
          >
            <RefreshCw className="w-4 h-4 me-1.5" />
            تحديث
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending || entries.length === 0}
            data-testid="btn-clear-logs"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4 me-1.5" />
            مسح السجلات
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              إجمالي الطلبات البطيئة
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold" data-testid="stat-slow-count">
              {entries.length}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              متوسط وقت الاستجابة
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className={`text-3xl font-bold ${timeColor(avgTotal)}`} data-testid="stat-avg-total">
              {formatMs(avgTotal)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              متوسط وقت قاعدة البيانات
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className="text-3xl font-bold text-blue-600" data-testid="stat-avg-db">
              {formatMs(avgDb)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              أبطأ طلب
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <span className={`text-3xl font-bold ${timeColor(maxTotal)}`} data-testid="stat-max-total">
              {formatMs(maxTotal)}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">مفتاح الأسباب:</span>
        {Object.entries(CAUSE_META).map(([key, meta]) => {
          const Icon = meta.icon;
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${meta.color}`}
            >
              <Icon className="w-3 h-3" />
              {meta.label}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1 ms-4 text-xs text-muted-foreground">
          <span className="inline-block w-3 h-2 rounded-sm bg-blue-400" /> قاعدة بيانات
          <span className="inline-block w-3 h-2 rounded-sm bg-purple-300 ms-1" /> معالجة خادم
        </span>
      </div>

      {/* Entries list */}
      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Zap className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">
              لا توجد طلبات بطيئة محفوظة حتى الآن.
            </p>
            <p className="text-muted-foreground/60 text-xs">
              سيظهر هنا كل طلب API يتجاوز 500ms تلقائياً.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <Card key={idx} data-testid={`perf-entry-${idx}`} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  {/* Method + route */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MethodBadge method={entry.method} />
                    <span
                      className="font-mono text-sm truncate"
                      title={entry.route}
                      data-testid={`entry-route-${idx}`}
                    >
                      {entry.route}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {entry.statusCode}
                    </span>
                  </div>

                  {/* Cause */}
                  <CauseBadge cause={entry.possibleCause} />

                  {/* Timestamp */}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(entry.timestamp).toLocaleTimeString("ar-EG")}
                  </span>
                </div>

                {/* Timing row */}
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  {/* Total time */}
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">الإجمالي</span>
                    <span
                      className={`font-semibold ${timeColor(entry.totalMs)}`}
                      data-testid={`entry-total-${idx}`}
                    >
                      {formatMs(entry.totalMs)}
                    </span>
                  </div>

                  {/* DB time */}
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs text-muted-foreground">قاعدة البيانات</span>
                    <span className="font-semibold text-blue-600" data-testid={`entry-db-${idx}`}>
                      {formatMs(entry.dbMs)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({entry.totalMs > 0 ? Math.round((entry.dbMs / entry.totalMs) * 100) : 0}%)
                    </span>
                  </div>

                  {/* Backend time */}
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-xs text-muted-foreground">الخادم</span>
                    <span className="font-semibold text-purple-600">
                      {formatMs(entry.backendMs)}
                    </span>
                  </div>

                  {/* Time bar */}
                  <TimeBar totalMs={entry.totalMs} dbMs={entry.dbMs} />

                  {/* Query count */}
                  <div className="flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">الاستعلامات</span>
                    <Badge variant="secondary" className="text-xs px-1.5 py-0" data-testid={`entry-qcount-${idx}`}>
                      {entry.queryCount}
                    </Badge>
                  </div>

                  {/* Slowest query time */}
                  {entry.slowestQueryMs > 0 && (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs text-muted-foreground">أبطأ استعلام</span>
                      <span className="font-semibold text-orange-600">
                        {formatMs(entry.slowestQueryMs)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Slowest query text */}
                {entry.slowestQueryText && (
                  <details className="mt-3">
                    <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground">
                      عرض نص أبطأ استعلام
                    </summary>
                    <pre
                      className="mt-1.5 bg-muted rounded p-2 text-xs font-mono overflow-auto max-h-32 whitespace-pre-wrap break-all"
                      data-testid={`entry-query-${idx}`}
                      dir="ltr"
                    >
                      {entry.slowestQueryText}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-muted-foreground border-t pt-3">
        ملاحظة: هذه البيانات تُقاس على الخادم فقط. وقت عرض الصفحة في المتصفح (Frontend Rendering) لا يُحسب هنا.
        لقياس أداء الواجهة، استخدم أدوات المتصفح (DevTools → Performance).
      </p>
    </div>
  );
}
