import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Search, Filter, Calendar, History } from "lucide-react";
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
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">إنشاء</Badge>;
      case "update":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">تعديل</Badge>;
      case "delete":
        return <Badge className="bg-red-100 text-red-800 border-red-200">حذف</Badge>;
      case "post":
        return <Badge className="bg-green-100 text-green-800 border-green-200">ترحيل</Badge>;
      case "reverse":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">إلغاء</Badge>;
      default:
        return <Badge variant="secondary">{action}</Badge>;
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">سجل التدقيق</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تتبع جميع العمليات في النظام
          </p>
        </div>
        <Button variant="outline" size="sm" data-testid="button-export">
          <Download className="h-4 w-4 ml-2" />
          تصدير
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
                data-testid="input-search-audit"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-action-filter">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder="العملية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع العمليات</SelectItem>
                <SelectItem value="create">إنشاء</SelectItem>
                <SelectItem value="update">تعديل</SelectItem>
                <SelectItem value="delete">حذف</SelectItem>
                <SelectItem value="post">ترحيل</SelectItem>
                <SelectItem value="reverse">إلغاء</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-table-filter">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder="الجدول" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الجداول</SelectItem>
                <SelectItem value="accounts">الحسابات</SelectItem>
                <SelectItem value="journal_entries">القيود</SelectItem>
                <SelectItem value="cost_centers">مراكز التكلفة</SelectItem>
                <SelectItem value="fiscal_periods">الفترات</SelectItem>
                <SelectItem value="templates">النماذج</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <ScrollArea className="h-[calc(100vh-320px)]">
          <Table className="accounting-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">التاريخ والوقت</TableHead>
                <TableHead className="w-[120px]">المستخدم</TableHead>
                <TableHead className="w-[100px]">العملية</TableHead>
                <TableHead className="w-[120px]">الجدول</TableHead>
                <TableHead>معرّف السجل</TableHead>
                <TableHead className="w-[120px]">عنوان IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">لا توجد سجلات</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                    <TableCell className="font-mono text-sm">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      {log.user?.fullName || "غير معروف"}
                    </TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTableLabel(log.tableName)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {log.recordId.substring(0, 8)}...
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {log.ipAddress || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Summary */}
      {filteredLogs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">إجمالي السجلات:</span>
                <Badge variant="secondary">{filteredLogs.length}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
