import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Search, Filter, History, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import type { AuditLog as AuditLogType } from "@shared/schema";

interface AuditLogWithUser extends AuditLogType {
  user?: {
    fullName: string;
    username: string;
  };
}

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("pageSize", String(pageSize));
  if (actionFilter !== "all") queryParams.set("action", actionFilter);
  if (tableFilter !== "all") queryParams.set("tableName", tableFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);

  const { data, isLoading } = useQuery<{ data: AuditLogWithUser[]; total: number }>({
    queryKey: ["/api/audit-log", page, pageSize, actionFilter, tableFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
  });

  const logs = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "create":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs px-1.5 py-0">إنشاء</Badge>;
      case "update":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs px-1.5 py-0">تعديل</Badge>;
      case "delete":
        return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs px-1.5 py-0">حذف</Badge>;
      case "post":
        return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs px-1.5 py-0">ترحيل</Badge>;
      case "reverse":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs px-1.5 py-0">إلغاء</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs px-1.5 py-0">{action}</Badge>;
    }
  };

  const getTableLabel = (tableName: string) => {
    const labels: Record<string, string> = {
      accounts: "الحسابات",
      journal_entries: "القيود",
      cost_centers: "مراكز التكلفة",
      fiscal_periods: "الفترات المحاسبية",
      templates: "النماذج",
      users: "المستخدمين",
    };
    return labels[tableName] || tableName;
  };

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">سجل التدقيق</h1>
          <span className="text-xs text-muted-foreground">- تتبع جميع العمليات في النظام</span>
        </div>
        <Button variant="outline" size="sm" className="h-6 text-xs px-2" data-testid="button-export">
          <Download className="h-3 w-3 ml-1" />
          تصدير
        </Button>
      </div>

      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <Select value={actionFilter} onValueChange={handleFilterChange(setActionFilter)}>
            <SelectTrigger className="peachtree-select w-[120px] text-xs" data-testid="select-action-filter">
              <SelectValue placeholder="العملية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">جميع العمليات</SelectItem>
              <SelectItem value="create" className="text-xs">إنشاء</SelectItem>
              <SelectItem value="update" className="text-xs">تعديل</SelectItem>
              <SelectItem value="delete" className="text-xs">حذف</SelectItem>
              <SelectItem value="post" className="text-xs">ترحيل</SelectItem>
              <SelectItem value="reverse" className="text-xs">إلغاء</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <Select value={tableFilter} onValueChange={handleFilterChange(setTableFilter)}>
            <SelectTrigger className="peachtree-select w-[130px] text-xs" data-testid="select-table-filter">
              <SelectValue placeholder="الجدول" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">جميع الجداول</SelectItem>
              <SelectItem value="accounts" className="text-xs">الحسابات</SelectItem>
              <SelectItem value="journal_entries" className="text-xs">القيود</SelectItem>
              <SelectItem value="cost_centers" className="text-xs">مراكز التكلفة</SelectItem>
              <SelectItem value="fiscal_periods" className="text-xs">الفترات</SelectItem>
              <SelectItem value="templates" className="text-xs">النماذج</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">من:</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="text-xs w-[130px]"
            data-testid="input-date-from"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">إلى:</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="text-xs w-[130px]"
            data-testid="input-date-to"
          />
        </div>
        <div className="flex items-center gap-1 mr-auto">
          <span className="text-xs text-muted-foreground">إجمالي:</span>
          <span className="text-xs font-mono font-semibold" data-testid="text-total-count">{total}</span>
        </div>
      </div>

      <div className="peachtree-grid">
        <ScrollArea className="h-[calc(100vh-250px)]">
          <table className="w-full">
            <thead className="peachtree-grid-header sticky top-0">
              <tr>
                <th className="w-[150px] text-right">التاريخ والوقت</th>
                <th className="w-[100px] text-right">المستخدم</th>
                <th className="w-[70px] text-center">العملية</th>
                <th className="w-[90px] text-right">الجدول</th>
                <th className="text-right">معرّف السجل</th>
                <th className="w-[100px] text-left">عنوان IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">لا توجد سجلات</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="peachtree-grid-row" data-testid={`row-audit-${log.id}`}>
                    <td className="font-mono text-xs">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="text-xs">
                      {(log as AuditLogWithUser).user?.fullName || "غير معروف"}
                    </td>
                    <td className="text-center">{getActionBadge(log.action)}</td>
                    <td className="text-xs">
                      <Badge variant="outline" className="text-xs px-1.5 py-0">{getTableLabel(log.tableName)}</Badge>
                    </td>
                    <td className="font-mono text-xs text-muted-foreground">
                      {log.recordId.substring(0, 8)}...
                    </td>
                    <td className="font-mono text-xs text-muted-foreground text-left" dir="ltr">
                      {log.ipAddress || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            data-testid="button-next-page"
          >
            <ChevronLeft className="h-3 w-3" />
            التالي
          </Button>
          <span className="text-xs text-muted-foreground" data-testid="text-page-info">
            صفحة {page} من {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            data-testid="button-prev-page"
          >
            السابق
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
