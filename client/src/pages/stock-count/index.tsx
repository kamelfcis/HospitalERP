/**
 * StockCount — شاشة جرد الأصناف
 *
 * قائمة جلسات الجرد + إنشاء جلسة جديدة.
 * النقر على جلسة ينقل إلى صفحة التفاصيل.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, ClipboardList, Warehouse } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";
import type { Warehouse as WarehouseType } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
//  Status badge helper
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:     { label: "مسودة",    variant: "secondary" },
  posted:    { label: "مرحّل",    variant: "default" },
  cancelled: { label: "ملغي",     variant: "destructive" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SessionRow
// ─────────────────────────────────────────────────────────────────────────────
function SessionRow({ session, onClick }: { session: any; onClick: () => void }) {
  const diffValue = parseFloat(session.totalDifferenceValue ?? "0");
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onClick}
      data-testid={`row-stock-count-${session.id}`}
    >
      <TableCell className="font-mono font-semibold text-center">{session.sessionNumber}</TableCell>
      <TableCell>{formatDate(session.countDate)}</TableCell>
      <TableCell>{session.warehouseName}</TableCell>
      <TableCell className="text-center">{session.lineCount ?? 0}</TableCell>
      <TableCell className={`text-center font-semibold ${diffValue < 0 ? "text-destructive" : diffValue > 0 ? "text-green-600" : ""}`}>
        {diffValue.toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
      </TableCell>
      <TableCell className="text-center">
        <StatusBadge status={session.status} />
      </TableCell>
      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
        {session.notes ?? "—"}
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Create Session Dialog
// ─────────────────────────────────────────────────────────────────────────────
function CreateSessionDialog({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { toast }    = useToast();
  const queryClient  = useQueryClient();
  const [, navigate] = useLocation();

  const today = new Date().toISOString().slice(0, 10);
  const [warehouseId, setWarehouseId] = useState("");
  const [countDate,   setCountDate]   = useState(today);
  const [notes,       setNotes]       = useState("");

  const { data: warehouses = [], isLoading: wLoading } = useQuery<WarehouseType[]>({
    queryKey: ["/api/warehouses"],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/stock-count/sessions", { warehouseId, countDate, notes: notes || undefined }),
    onSuccess: async (session: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/stock-count/sessions"] });
      onClose();
      navigate(`/stock-count/${session.id}`);
    },
    onError: (err: any) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!warehouseId) { toast({ title: "تحذير", description: "اختر المستودع", variant: "destructive" }); return; }
    if (!countDate)   { toast({ title: "تحذير", description: "أدخل تاريخ الجرد", variant: "destructive" }); return; }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء جلسة جرد جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>المستودع *</Label>
            {wLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...</div>
            ) : (
              <Select value={warehouseId} onValueChange={setWarehouseId} dir="rtl">
                <SelectTrigger data-testid="select-warehouse">
                  <SelectValue placeholder="اختر مستودعاً..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1">
            <Label>تاريخ الجرد *</Label>
            <Input
              type="date"
              value={countDate}
              onChange={e => setCountDate(e.target.value)}
              data-testid="input-count-date"
            />
          </div>
          <div className="space-y-1">
            <Label>ملاحظات</Label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ملاحظات اختيارية..."
              data-testid="input-notes"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            data-testid="button-create-session"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            إنشاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function StockCountPage() {
  const [, navigate]   = useLocation();
  const [createOpen,   setCreateOpen]   = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page,         setPage]         = useState(1);
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery<{ sessions: any[]; total: number }>({
    queryKey: ["/api/stock-count/sessions", statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/stock-count/sessions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const sessions  = data?.sessions ?? [];
  const total     = data?.total    ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">جرد الأصناف</h1>
            <p className="text-sm text-muted-foreground">سجل جلسات الجرد والمقارنة مع الرصيد الدفتري</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-session">
          <Plus className="h-4 w-4 ml-1" />
          جلسة جديدة
        </Button>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">الحالة:</Label>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }} dir="rtl">
            <SelectTrigger className="w-36" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="posted">مرحّل</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground">
          {total} جلسة
        </span>
      </div>

      {/* ── Table ── */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center w-16">رقم</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>المستودع</TableHead>
              <TableHead className="text-center">الأصناف</TableHead>
              <TableHead className="text-center">قيمة الفرق (ج.م)</TableHead>
              <TableHead className="text-center">الحالة</TableHead>
              <TableHead>ملاحظات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Warehouse className="h-10 w-10 opacity-30" />
                    <p>لا توجد جلسات جرد</p>
                    <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                      إنشاء أول جلسة
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sessions.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onClick={() => navigate(`/stock-count/${s.id}`)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >السابق</Button>
          <span className="text-sm">{page} / {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >التالي</Button>
        </div>
      )}

      {/* ── Dialogs ── */}
      <CreateSessionDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
