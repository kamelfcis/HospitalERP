import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Banknote, Stethoscope, ChevronDown, ChevronUp, ChevronRight, ChevronLeft } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { SettlementDialog } from "@/components/doctor/SettlementDialog";
type SettlementWithAllocs = {
  id: string;
  doctorName: string;
  paymentMethod: string;
  paymentDate: string;
  amount: string;
  notes?: string | null;
  glPosted?: boolean | null;
  allocations: any[];
};
type PaginatedSettlements = { data: SettlementWithAllocs[]; total: number; page: number; pageSize: number };

const METHOD_LABEL: Record<string, string> = { cash: "نقدي", bank: "بنكي", card: "بطاقة" };
const PAGE_SIZE = 50;

export default function DoctorSettlements() {
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [formDoctor,   setFormDoctor]   = useState("");
  const [dlgOpen,      setDlgOpen]      = useState(false);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [page,         setPage]         = useState(1);

  const { data: result, isLoading } = useQuery<PaginatedSettlements>({
    queryKey: ["/api/doctor-settlements", filterDoctor, filterDateFrom, filterDateTo, page],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filterDoctor)   p.set("doctorName", filterDoctor);
      if (filterDateFrom) p.set("dateFrom",   filterDateFrom);
      if (filterDateTo)   p.set("dateTo",     filterDateTo);
      p.set("page",     String(page));
      p.set("pageSize", String(PAGE_SIZE));
      const r = await fetch(`/api/doctor-settlements?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error("unauthorized");
      return r.json();
    },
  });

  const settlements  = result?.data  ?? [];
  const total        = result?.total ?? 0;
  const totalPages   = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPage() { setPage(1); }

  function handleOpenSettle() {
    if (!formDoctor.trim()) return;
    setDlgOpen(true);
  }

  return (
    <div className="p-3 space-y-3" dir="rtl" data-testid="page-doctor-settlements">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-blue-600" />
          <div>
            <h1 className="text-sm font-bold">تسوية مستحقات الأطباء</h1>
            <p className="text-xs text-muted-foreground">{total} تسوية مسجّلة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={formDoctor}
            onChange={e => setFormDoctor(e.target.value)}
            placeholder="اسم الطبيب..."
            className="peachtree-input h-7 text-xs w-44"
            data-testid="input-settle-doctor"
          />
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs px-3"
            onClick={handleOpenSettle}
            disabled={!formDoctor.trim()}
            data-testid="button-settle-open-confirm"
          >
            <Plus className="h-3 w-3 ml-1" />
            تسوية جديدة
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar rounded flex items-center gap-2 flex-wrap">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          value={filterDoctor}
          onChange={e => { setFilterDoctor(e.target.value); resetPage(); }}
          placeholder="فلترة السجل بالطبيب..."
          className="peachtree-input flex-1 max-w-xs text-xs"
          data-testid="input-filter-doctor"
        />
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">من:</Label>
          <input
            type="date" value={filterDateFrom}
            onChange={e => { setFilterDateFrom(e.target.value); resetPage(); }}
            className="peachtree-input text-xs w-32"
            data-testid="input-settlements-date-from"
          />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">إلى:</Label>
          <input
            type="date" value={filterDateTo}
            onChange={e => { setFilterDateTo(e.target.value); resetPage(); }}
            className="peachtree-input text-xs w-32"
            data-testid="input-settlements-date-to"
          />
        </div>
        {(filterDoctor || filterDateFrom || filterDateTo) && (
          <Button
            variant="outline" size="sm" className="h-6 text-xs px-2"
            onClick={() => { setFilterDoctor(""); setFilterDateFrom(""); setFilterDateTo(""); resetPage(); }}
            data-testid="button-clear-settlements-filter"
          >
            مسح
          </Button>
        )}
      </div>

      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : settlements.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-10">لا توجد تسويات</p>
        ) : (
          settlements.map(s => (
            <Collapsible
              key={s.id}
              open={expandedId === s.id}
              onOpenChange={open => setExpandedId(open ? s.id : null)}
            >
              <CollapsibleTrigger asChild>
                <div
                  className="border rounded flex flex-row-reverse items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 select-none"
                  data-testid={`card-settlement-${s.id}`}
                >
                  <Stethoscope className="h-3 w-3 text-blue-600 shrink-0" />
                  <span className="text-sm font-medium">{s.doctorName}</span>
                  <Badge variant="outline" className="text-xs">{METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</Badge>
                  {s.glPosted && <Badge className="text-xs bg-green-100 text-green-700 border-green-300">GL</Badge>}
                  <div className="flex-1" />
                  <span className="text-xs text-muted-foreground">{formatDateShort(s.paymentDate as any)}</span>
                  <span className="font-bold text-sm">{formatCurrency(parseFloat(s.amount))}</span>
                  {expandedId === s.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t p-2 bg-muted/20 space-y-1">
                  {s.notes && <p className="text-xs text-muted-foreground">ملاحظات: {s.notes}</p>}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right text-xs">رقم المستحق</TableHead>
                        <TableHead className="text-left text-xs">المبلغ المخصص</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.allocations.map((a: any) => (
                        <TableRow key={a.id} data-testid={`row-alloc-${a.id}`}>
                          <TableCell className="text-xs text-muted-foreground">{String(a.transferId || a.transfer_id || "").slice(0, 8)}…</TableCell>
                          <TableCell className="text-xs font-medium text-left">{formatCurrency(parseFloat(a.amount))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            عرض {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} من {total} تسوية
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm" className="h-6 px-2"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              data-testid="button-settlements-prev-page"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <span className="text-xs px-2">صفحة {page} من {totalPages}</span>
            <Button
              variant="outline" size="sm" className="h-6 px-2"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              data-testid="button-settlements-next-page"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      <SettlementDialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        doctorName={formDoctor.trim()}
      />
    </div>
  );
}
