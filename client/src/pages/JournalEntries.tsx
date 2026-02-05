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
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">القيود اليومية</h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة القيود المحاسبية ({entries?.length || 0} قيد)
          </p>
        </div>
        <Link href="/journal-entries/new">
          <Button data-testid="button-add-journal-entry">
            <Plus className="h-4 w-4 ml-2" />
            قيد جديد
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم القيد أو البيان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
                data-testid="input-search-entries"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="posted">مُرحّل</SelectItem>
                <SelectItem value="reversed">ملغي</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
                placeholder="من تاريخ"
                data-testid="input-date-from"
              />
              <span className="text-muted-foreground">إلى</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
                placeholder="إلى تاريخ"
                data-testid="input-date-to"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entries Table */}
      <Card>
        <ScrollArea className="h-[calc(100vh-320px)]">
          <Table className="accounting-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">رقم القيد</TableHead>
                <TableHead className="w-[120px]">التاريخ</TableHead>
                <TableHead>البيان</TableHead>
                <TableHead className="w-[120px]">المرجع</TableHead>
                <TableHead className="w-[140px] text-left">المدين</TableHead>
                <TableHead className="w-[140px] text-left">الدائن</TableHead>
                <TableHead className="w-[100px]">الحالة</TableHead>
                <TableHead className="w-[140px]">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    لا توجد قيود
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry) => (
                  <TableRow key={entry.id} data-testid={`row-entry-${entry.id}`}>
                    <TableCell className="font-mono font-bold text-primary">
                      {entry.entryNumber}
                    </TableCell>
                    <TableCell>{formatDateShort(entry.entryDate)}</TableCell>
                    <TableCell className="font-medium max-w-[300px] truncate">
                      {entry.description}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.reference || "-"}
                    </TableCell>
                    <TableCell className="accounting-number debit-amount">
                      {formatCurrency(entry.totalDebit)}
                    </TableCell>
                    <TableCell className="accounting-number credit-amount">
                      {formatCurrency(entry.totalCredit)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getStatusBadgeClass(entry.status)}
                      >
                        {journalStatusLabels[entry.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link href={`/journal-entries/${entry.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-view-entry-${entry.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {entry.status === "draft" && (
                          <>
                            <Link href={`/journal-entries/${entry.id}/edit`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-edit-entry-${entry.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("هل تريد ترحيل هذا القيد؟ لن يمكن تعديله بعد الترحيل.")) {
                                  postMutation.mutate(entry.id);
                                }
                              }}
                              disabled={postMutation.isPending}
                              className="text-emerald-600 hover:text-emerald-700"
                              data-testid={`button-post-entry-${entry.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {entry.status === "posted" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("هل تريد إلغاء هذا القيد؟ سيتم إنشاء قيد عكسي.")) {
                                reverseMutation.mutate(entry.id);
                              }
                            }}
                            disabled={reverseMutation.isPending}
                            className="text-destructive hover:text-destructive/80"
                            data-testid={`button-reverse-entry-${entry.id}`}
                          >
                            <RotateCcw className="h-4 w-4" />
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
      </Card>

      {/* Summary */}
      {filteredEntries.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">إجمالي القيود:</span>
                  <Badge variant="secondary">{filteredEntries.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">مسودة:</span>
                  <Badge className="status-draft">
                    {filteredEntries.filter((e) => e.status === "draft").length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">مُرحّل:</span>
                  <Badge className="status-posted">
                    {filteredEntries.filter((e) => e.status === "posted").length}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">إجمالي المدين</p>
                  <p className="text-lg font-bold accounting-number debit-amount">
                    {formatCurrency(
                      filteredEntries.reduce(
                        (sum, e) => sum + parseFloat(e.totalDebit || "0"),
                        0
                      )
                    )}
                  </p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
                  <p className="text-lg font-bold accounting-number credit-amount">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
