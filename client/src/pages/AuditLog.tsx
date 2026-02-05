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
import { Download, Search, Filter, History } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditLog as AuditLogType } from "@shared/schema";

interface AuditLogWithUser extends AuditLogType {
  user?: {
    fullName: string;
    username: string;
  };
}

export default function AuditLog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("all");

  const { data: logs, isLoading } = useQuery<AuditLogWithUser[]>({
    queryKey: ["/api/audit-log"],
  });

  const filteredLogs = logs?.filter((log) => {
    const matchesSearch =
      searchQuery === "" ||
      log.recordId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.user?.fullName && log.user.fullName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    const matchesTable = tableFilter === "all" || log.tableName === tableFilter;

    return matchesSearch && matchesAction && matchesTable;
  }) || [];

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
      {/* Page Header - Peachtree Toolbar Style */}
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

      {/* Filters - Compact Peachtree Style */}
      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-[240px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="peachtree-input w-full pr-7 text-xs"
            data-testid="input-search-audit"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <Select value={actionFilter} onValueChange={setActionFilter}>
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
          <Select value={tableFilter} onValueChange={setTableFilter}>
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
        <div className="flex items-center gap-1 mr-auto">
          <span className="text-xs text-muted-foreground">إجمالي:</span>
          <span className="text-xs font-mono font-semibold">{filteredLogs.length}</span>
        </div>
      </div>

      {/* Audit Log Table - Peachtree Grid Style */}
      <div className="peachtree-grid">
        <ScrollArea className="h-[calc(100vh-200px)]">
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
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">لا توجد سجلات</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="peachtree-grid-row" data-testid={`row-audit-${log.id}`}>
                    <td className="font-mono text-xs">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="text-xs">
                      {log.user?.fullName || "غير معروف"}
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
    </div>
  );
}
