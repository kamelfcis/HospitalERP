import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Search,
  Eye,
  Edit2,
  CheckCircle,
  RotateCcw,
  Filter,
  Calendar,
} from "lucide-react";
import { formatCurrency, formatDateShort, journalStatusLabels } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { JournalEntry } from "@shared/schema";

export default function JournalEntries() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: entries, isLoading } = useQuery<JournalEntry[]>({
    queryKey: ["/api/journal-entries"],
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/journal-entries/${id}/post`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم ترحيل القيد بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/journal-entries/${id}/reverse`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم إلغاء القيد بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  // Filter entries
  const filteredEntries = entries?.filter((entry) => {
    const matchesSearch =
      searchQuery === "" ||
      entry.entryNumber.toString().includes(searchQuery) ||
      entry.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.reference && entry.reference.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === "all" || entry.status === statusFilter;

    let matchesDate = true;
    if (dateFrom) {
      matchesDate = matchesDate && entry.entryDate >= dateFrom;
    }
    if (dateTo) {
      matchesDate = matchesDate && entry.entryDate <= dateTo;
    }

    return matchesSearch && matchesStatus && matchesDate;
  }) || [];

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "posted":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "reversed":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "";
    }
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
    <div className="p-3 space-y-3">
      {/* Page Header - Peachtree Toolbar Style */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground">القيود اليومية</h1>
          <p className="text-xs text-muted-foreground">
            إدارة القيود المحاسبية ({entries?.length || 0} قيد)
          </p>
        </div>
        <Link href="/journal-entries/new">
          <Button size="sm" data-testid="button-add-journal-entry" className="text-xs h-7">
            <Plus className="h-3 w-3 ml-1" />
            قيد جديد
          </Button>
        </Link>
      </div>

      {/* Filters - Compact Peachtree Style */}
      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap rounded">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="بحث برقم القيد أو البيان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="peachtree-input pr-7 text-xs"
            data-testid="input-search-entries"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="peachtree-select w-[120px] text-xs" data-testid="select-status-filter">
            <Filter className="h-3 w-3 ml-1" />
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">جميع الحالات</SelectItem>
            <SelectItem value="draft" className="text-xs">مسودة</SelectItem>
            <SelectItem value="posted" className="text-xs">مُرحّل</SelectItem>
            <SelectItem value="reversed" className="text-xs">ملغي</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="peachtree-input w-[120px] text-xs"
            placeholder="من تاريخ"
            data-testid="input-date-from"
          />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="peachtree-input w-[120px] text-xs"
            placeholder="إلى تاريخ"
            data-testid="input-date-to"
          />
        </div>
      </div>

      {/* Entries Table - Peachtree Grid Style */}
      <div className="peachtree-grid rounded">
        <ScrollArea className="h-[calc(100vh-280px)]">
          <Table>
            <TableHeader className="peachtree-grid-header">
              <TableRow>
                <TableHead className="w-[70px] text-xs">رقم القيد</TableHead>
                <TableHead className="w-[90px] text-xs">التاريخ</TableHead>
                <TableHead className="text-xs">البيان</TableHead>
                <TableHead className="w-[100px] text-xs">المرجع</TableHead>
                <TableHead className="w-[110px] text-xs text-left">المدين</TableHead>
                <TableHead className="w-[110px] text-xs text-left">الدائن</TableHead>
                <TableHead className="w-[80px] text-xs">الحالة</TableHead>
                <TableHead className="w-[100px] text-xs">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-4 text-xs text-muted-foreground">
                    لا توجد قيود
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry) => (
                  <TableRow key={entry.id} className="peachtree-grid-row" data-testid={`row-entry-${entry.id}`}>
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      {entry.entryNumber}
                    </TableCell>
                    <TableCell className="text-xs">{formatDateShort(entry.entryDate)}</TableCell>
                    <TableCell className="text-xs font-medium max-w-[250px] truncate">
                      {entry.description}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.reference || "-"}
                    </TableCell>
                    <TableCell className="peachtree-amount peachtree-amount-debit font-mono text-xs">
                      {formatCurrency(entry.totalDebit)}
                    </TableCell>
                    <TableCell className="peachtree-amount peachtree-amount-credit font-mono text-xs">
                      {formatCurrency(entry.totalCredit)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${getStatusBadgeClass(entry.status)}`}
                      >
                        {journalStatusLabels[entry.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Link href={`/journal-entries/${entry.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            data-testid={`button-view-entry-${entry.id}`}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </Link>
                        {entry.status === "draft" && (
                          <>
                            <Link href={`/journal-entries/${entry.id}/edit`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                data-testid={`button-edit-entry-${entry.id}`}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-emerald-600 hover:text-emerald-700"
                              onClick={() => {
                                if (confirm("هل تريد ترحيل هذا القيد؟ لن يمكن تعديله بعد الترحيل.")) {
                                  postMutation.mutate(entry.id);
                                }
                              }}
                              disabled={postMutation.isPending}
                              data-testid={`button-post-entry-${entry.id}`}
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        {entry.status === "posted" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive/80"
                            onClick={() => {
                              if (confirm("هل تريد إلغاء هذا القيد؟ سيتم إنشاء قيد عكسي.")) {
                                reverseMutation.mutate(entry.id);
                              }
                            }}
                            disabled={reverseMutation.isPending}
                            data-testid={`button-reverse-entry-${entry.id}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Summary - Peachtree Totals Style */}
      {filteredEntries.length > 0 && (
        <div className="peachtree-totals rounded p-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">إجمالي القيود:</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{filteredEntries.length}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">مسودة:</span>
                <Badge className="status-draft text-[10px] px-1.5 py-0">
                  {filteredEntries.filter((e) => e.status === "draft").length}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">مُرحّل:</span>
                <Badge className="status-posted text-[10px] px-1.5 py-0">
                  {filteredEntries.filter((e) => e.status === "posted").length}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground">إجمالي المدين</p>
                <p className="text-sm font-bold peachtree-amount peachtree-amount-debit font-mono">
                  {formatCurrency(
                    filteredEntries.reduce(
                      (sum, e) => sum + parseFloat(e.totalDebit || "0"),
                      0
                    )
                  )}
                </p>
              </div>
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground">إجمالي الدائن</p>
                <p className="text-sm font-bold peachtree-amount peachtree-amount-credit font-mono">
                  {formatCurrency(
                    filteredEntries.reduce(
                      (sum, e) => sum + parseFloat(e.totalCredit || "0"),
                      0
                    )
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
