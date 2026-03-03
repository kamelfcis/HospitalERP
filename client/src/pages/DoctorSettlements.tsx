import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Plus, Banknote, Stethoscope, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { SettlementDialog } from "@/components/doctor/SettlementDialog";
import type { DoctorSettlement, DoctorSettlementAllocation } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type SettlementWithAllocs = DoctorSettlement & { allocations: DoctorSettlementAllocation[] };

const METHOD_LABEL: Record<string, string> = { cash: "نقدي", bank: "بنكي", card: "بطاقة" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DoctorSettlements() {
  const [filterDoctor, setFilterDoctor] = useState("");
  const [formDoctor,   setFormDoctor]   = useState("");
  const [dlgOpen,      setDlgOpen]      = useState(false);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  // ── سجل التسويات ──
  const { data: settlements = [], isLoading } = useQuery<SettlementWithAllocs[]>({
    queryKey: ["/api/doctor-settlements", filterDoctor],
    queryFn: () => {
      const url = filterDoctor
        ? `/api/doctor-settlements?doctorName=${encodeURIComponent(filterDoctor)}`
        : "/api/doctor-settlements";
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
  });

  function handleOpenSettle() {
    if (!formDoctor.trim()) return;
    setDlgOpen(true);
  }

  return (
    <div className="p-3 space-y-3" dir="rtl" data-testid="page-doctor-settlements">
      {/* ── هيدر ── */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 rounded">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-blue-600" />
          <div>
            <h1 className="text-sm font-bold">تسوية مستحقات الأطباء</h1>
            <p className="text-xs text-muted-foreground">{settlements.length} تسوية مسجّلة</p>
          </div>
        </div>

        {/* ── إنشاء تسوية جديدة ── */}
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

      {/* ── فلتر السجل ── */}
      <div className="peachtree-toolbar rounded flex items-center gap-2">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          value={filterDoctor}
          onChange={e => setFilterDoctor(e.target.value)}
          placeholder="فلترة السجل بالطبيب..."
          className="peachtree-input flex-1 max-w-xs text-xs"
          data-testid="input-filter-doctor"
        />
      </div>

      {/* ── سجل التسويات ── */}
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
                      {s.allocations.map(a => (
                        <TableRow key={a.id} data-testid={`row-alloc-${a.id}`}>
                          <TableCell className="text-xs text-muted-foreground">{a.transferId.slice(0, 8)}…</TableCell>
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

      {/* ── Shared Settlement Dialog ── */}
      <SettlementDialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        doctorName={formDoctor.trim()}
      />
    </div>
  );
}
