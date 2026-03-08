import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiRequest, apiRequestJson, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Search,
  Eye,
  Edit2,
  CheckCircle,
  RotateCcw,
  Filter,
  CalendarIcon,
  FileText,
  Loader2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import { formatCurrency, formatDateShort, formatDateForInput, journalStatusLabels } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sourceTypeLabels } from "@shared/schema";
import type { JournalEntry } from "@shared/schema";

function DatePickerButton({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const dateObj = value ? new Date(value + "T00:00:00") : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs font-normal peachtree-select w-[110px] justify-between"
          data-testid={testId}
        >
          <span className={value ? "" : "text-muted-foreground"}>
            {value ? formatDateShort(value) : placeholder}
          </span>
          {value ? (
            <X
              className="h-3 w-3 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            />
          ) : (
            <CalendarIcon className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateObj}
          onSelect={(d) => {
            onChange(d ? formatDateForInput(d) : "");
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

const PAGE_SIZE = 50;

export default function JournalEntries() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(() => formatDateForInput(new Date()));
  const [dateTo, setDateTo] = useState(() => formatDateForInput(new Date()));
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const debounceTimer = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceTimer[0]) clearTimeout(debounceTimer[0]);
    debounceTimer[0] = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
  }, []);

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("pageSize", String(PAGE_SIZE));
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (sourceFilter !== "all") queryParams.set("sourceType", sourceFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  if (debouncedSearch) queryParams.set("search", debouncedSearch);

  const { data: result, isLoading } = useQuery<{ data: JournalEntry[]; total: number }>({
    queryKey: ["/api/journal-entries", page, statusFilter, sourceFilter, dateFrom, dateTo, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/journal-entries?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const entries = result?.data || [];
  const total = result?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

  const batchPostMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiRequestJson("POST", "/api/journal-entries/batch-post", { ids });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setSelectedIds(new Set());
      const errors: string[] = data.errors || [];
      if (data.posted === 0 && errors.length > 0) {
        const firstError = errors[0];
        toast({
          title: `لم يُرحَّل أي قيد (${data.total} محدد)`,
          description: firstError + (errors.length > 1 ? ` — و${errors.length - 1} سبب آخر` : ""),
          variant: "destructive",
        });
      } else if (errors.length > 0) {
        toast({
          title: `تم ترحيل ${data.posted} قيد — فشل ${errors.length}`,
          description: errors[0] + (errors.length > 1 ? ` — و${errors.length - 1} آخر` : ""),
          variant: "destructive",
        });
      } else {
        toast({ title: `تم ترحيل ${data.posted} قيد بنجاح` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في الترحيل الجماعي", description: error.message, variant: "destructive" });
    },
  });

  const draftEntries = entries.filter(e => e.status === "draft");
  const selectedDraftIds = Array.from(selectedIds).filter(id => draftEntries.some(e => e.id === id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedDraftIds.length === draftEntries.length && draftEntries.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(draftEntries.map(e => e.id)));
    }
  };

  const handleBatchPost = () => {
    if (selectedDraftIds.length === 0) return;
    if (confirm(`هل تريد ترحيل ${selectedDraftIds.length} قيد؟ لن يمكن تعديلها بعد الترحيل.`)) {
      batchPostMutation.mutate(selectedDraftIds);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "draft": return "bg-amber-100 text-amber-800 border-amber-200";
      case "posted": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "reversed": return "bg-red-100 text-red-800 border-red-200";
      default: return "";
    }
  };

  const sourceRouteMap: Record<string, string> = {
    sales_invoice: "/sales-invoices",
    patient_invoice: "/patient-invoices",
    receiving: "/supplier-receiving",
    purchase_invoice: "/purchase-invoices",
    cashier_collection: "/cashier",
    cashier_refund: "/cashier",
    warehouse_transfer: "/warehouse-transfer",
  };

  const getSourceBadge = (entry: JournalEntry) => {
    const sourceType = entry.sourceType;
    if (!sourceType) return null;
    const label = sourceTypeLabels[sourceType] || sourceType;
    const route = sourceRouteMap[sourceType];
    if (route) {
      return (
        <Link href={route}>
          <Badge variant="outline" className="text-[9px] px-1 py-0 mr-1 cursor-pointer hover:bg-primary/10" data-testid={`badge-source-${entry.id}`}>
            {label}
          </Badge>
        </Link>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] px-1 py-0 mr-1">
        {label}
      </Badge>
    );
  };

  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  if (isLoading && entries.length === 0) {
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
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div>
          <h1 className="text-sm font-bold text-foreground">القيود اليومية</h1>
          <p className="text-xs text-muted-foreground">
            إدارة القيود المحاسبية ({total} قيد)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedDraftIds.length > 0 && (
            <Button
              size="sm"
              variant="default"
              onClick={handleBatchPost}
              disabled={batchPostMutation.isPending}
              data-testid="button-batch-post"
              className="text-xs h-7"
            >
              {batchPostMutation.isPending ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <CheckSquare className="h-3 w-3 ml-1" />}
              ترحيل {selectedDraftIds.length} قيد
            </Button>
          )}
          <Link href="/journal-entries/new">
            <Button size="sm" data-testid="button-add-journal-entry" className="text-xs h-7">
              <Plus className="h-3 w-3 ml-1" />
              قيد جديد
            </Button>
          </Link>
        </div>
      </div>

      <div className="peachtree-toolbar flex items-center gap-2 flex-wrap rounded">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="بحث برقم القيد أو البيان..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="peachtree-input pr-7 text-xs"
            data-testid="input-search-entries"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
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
        <Select value={sourceFilter} onValueChange={handleFilterChange(setSourceFilter)}>
          <SelectTrigger className="peachtree-select w-[140px] text-xs" data-testid="select-source-filter">
            <FileText className="h-3 w-3 ml-1" />
            <SelectValue placeholder="المصدر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">جميع المصادر</SelectItem>
            {Object.entries(sourceTypeLabels).map(([key, label]) => (
              <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <CalendarIcon className="h-3 w-3 text-muted-foreground" />
          <DatePickerButton
            value={dateFrom}
            onChange={(v) => { setDateFrom(v); setPage(1); }}
            placeholder="من تاريخ"
            testId="input-date-from"
          />
          <span className="text-xs text-muted-foreground">إلى</span>
          <DatePickerButton
            value={dateTo}
            onChange={(v) => { setDateTo(v); setPage(1); }}
            placeholder="إلى تاريخ"
            testId="input-date-to"
          />
        </div>
      </div>

      <div className="peachtree-grid rounded">
        <ScrollArea className="h-[calc(100vh-320px)]">
          <Table>
            <TableHeader className="peachtree-grid-header">
              <TableRow>
                <TableHead className="w-[40px] text-xs">
                  <Checkbox
                    checked={draftEntries.length > 0 && selectedDraftIds.length === draftEntries.length}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
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
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-4 text-xs text-muted-foreground">
                    {isLoading ? "جارٍ التحميل..." : "لا توجد قيود"}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id} className="peachtree-grid-row" data-testid={`row-entry-${entry.id}`}>
                    <TableCell>
                      {entry.status === "draft" && (
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={() => toggleSelect(entry.id)}
                          data-testid={`checkbox-entry-${entry.id}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-primary">
                      {entry.entryNumber}
                    </TableCell>
                    <TableCell className="text-xs">{formatDateShort(entry.entryDate)}</TableCell>
                    <TableCell className="text-xs font-medium max-w-[250px]">
                      <div className="flex items-center gap-1 flex-wrap">
                        {getSourceBadge(entry)}
                        <span className="truncate">{entry.description}</span>
                      </div>
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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            صفحة {page} من {totalPages} ({total} قيد)
          </span>
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1}
            onClick={() => setPage(1)}
            data-testid="button-first-page"
          >
            <ChevronsRight className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            data-testid="button-prev-page"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }
            return (
              <Button
                key={pageNum}
                variant={pageNum === page ? "default" : "outline"}
                size="sm"
                className="h-7 w-7 text-xs p-0"
                onClick={() => setPage(pageNum)}
                data-testid={`button-page-${pageNum}`}
              >
                {pageNum}
              </Button>
            );
          })}
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            data-testid="button-next-page"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
            data-testid="button-last-page"
          >
            <ChevronsLeft className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
