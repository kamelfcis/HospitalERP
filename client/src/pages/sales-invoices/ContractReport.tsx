/**
 * ContractReport — تقرير مبيعات التعاقدات في الصيدلية
 *
 * يعرض فواتير المبيعات من نوع "تعاقد" مع:
 *  - حالة المطالبة (claimStatus)
 *  - حصة الشركة وحصة المريض
 *  - فلاتر: تاريخ، حالة المطالبة، اسم الشركة / العميل
 */

import { useState, useMemo }  from "react";
import { useQuery }           from "@tanstack/react-query";
import { Link }               from "wouter";
import { formatNumber }       from "@/lib/formatters";
import { Button }             from "@/components/ui/button";
import { Input }              from "@/components/ui/input";
import { Label }              from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge }              from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton }           from "@/components/ui/skeleton";
import { ArrowRight, Printer } from "lucide-react";
import type { SalesInvoiceHeader } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// نوع الاستجابة
// ─────────────────────────────────────────────────────────────────────────────
interface InvoiceRow extends SalesInvoiceHeader {
  warehouseNameAr?: string;
  pharmacistName?: string | null;
}

interface InvoicesResponse {
  data: InvoiceRow[];
  total: number;
  totals: { subtotal: number; discountValue: number; netTotal: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// ألوان حالة المطالبة
// ─────────────────────────────────────────────────────────────────────────────
function claimBadge(status: string | null | undefined) {
  switch (status) {
    case "generating":  return <Badge variant="secondary" className="text-xs">جاري الإنشاء</Badge>;
    case "generated":   return <Badge variant="outline"   className="text-xs text-blue-600 border-blue-400">مُنشأة</Badge>;
    case "submitted":   return <Badge variant="outline"   className="text-xs text-indigo-600 border-indigo-400">مُرسلة</Badge>;
    case "accepted":    return <Badge className="text-xs bg-green-600">مقبولة</Badge>;
    case "rejected":    return <Badge className="text-xs bg-red-600">مرفوضة</Badge>;
    case "settled":     return <Badge className="text-xs bg-teal-600">مسوّاة</Badge>;
    case "failed":      return <Badge className="text-xs bg-orange-600">فشل الإنشاء</Badge>;
    default:            return <Badge variant="secondary" className="text-xs">—</Badge>;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// المكوّن الرئيسي
// ─────────────────────────────────────────────────────────────────────────────
export default function ContractReport() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [dateFrom,    setDateFrom]    = useState(firstOfMonth);
  const [dateTo,      setDateTo]      = useState(today);
  const [claimStatus, setClaimStatus] = useState("all");
  const [search,      setSearch]      = useState("");
  const [page,        setPage]        = useState(1);
  const PAGE_SIZE = 50;

  const params = useMemo(() => {
    const p = new URLSearchParams({
      customerType: "contract",
      status:       "finalized,collected", // فواتير مرحَّلة + محصَّلة من الكاشير
      dateFrom,
      dateTo,
      page:         String(page),
      pageSize:     String(PAGE_SIZE),
      includeCancelled: "false",
    });
    if (search)                        p.set("search", search);
    if (claimStatus !== "all")         p.set("claimStatus", claimStatus);
    return p.toString();
  }, [dateFrom, dateTo, search, page, claimStatus]);

  const { data, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ["/api/sales-invoices", "contract-report", dateFrom, dateTo, search, page, claimStatus],
    queryFn: () => fetch(`/api/sales-invoices?${params}`, { credentials: "include" }).then(r => r.json()),
  });

  // الفلتر يعمل server-side الآن — rows = البيانات كما جاءت من الخادم
  const rows = useMemo(() => data?.data ?? [], [data]);

  const totals = useMemo(() => {
    const companyTotal = rows.reduce((s, r) => s + parseFloat(String(r.companyShareTotal ?? "0")), 0);
    const patientTotal = rows.reduce((s, r) => s + parseFloat(String(r.patientShareTotal ?? "0")), 0);
    const net          = rows.reduce((s, r) => s + parseFloat(String(r.netTotal ?? "0")), 0);
    return { companyTotal, patientTotal, net };
  }, [rows]);

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div dir="rtl" className="p-4 space-y-4">
      {/* ── رأس الصفحة ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link href="/sales-invoices">
            <Button variant="ghost" size="sm" data-testid="button-back-contract-report">
              <ArrowRight className="h-4 w-4 ml-1" />
              السجل
            </Button>
          </Link>
          <h1 className="text-xl font-bold">تقرير مبيعات التعاقدات</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-contract-report">
          <Printer className="h-4 w-4 ml-1" />
          طباعة
        </Button>
      </div>

      {/* ── فلاتر ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-end bg-muted/40 p-3 rounded-lg print:hidden">
        <div>
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="h-8 text-sm w-36" data-testid="input-date-from" />
        </div>
        <div>
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="h-8 text-sm w-36" data-testid="input-date-to" />
        </div>
        <div>
          <Label className="text-xs">حالة المطالبة</Label>
          <Select value={claimStatus} onValueChange={v => { setClaimStatus(v); setPage(1); }}>
            <SelectTrigger className="h-8 text-sm w-36" data-testid="select-claim-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="generating">جاري الإنشاء</SelectItem>
              <SelectItem value="generated">مُنشأة</SelectItem>
              <SelectItem value="submitted">مُرسلة</SelectItem>
              <SelectItem value="accepted">مقبولة</SelectItem>
              <SelectItem value="rejected">مرفوضة</SelectItem>
              <SelectItem value="settled">مسوّاة</SelectItem>
              <SelectItem value="failed">فشل الإنشاء</SelectItem>
              <SelectItem value="none">بدون مطالبة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <Label className="text-xs">بحث (اسم عميل / شركة)</Label>
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="ابحث..." className="h-8 text-sm" data-testid="input-search-contract" />
        </div>
      </div>

      {/* ── بطاقات الإجماليات ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-700 text-white rounded-lg p-3 text-center">
          <p className="text-xs opacity-70">صافي الفواتير</p>
          <p className="text-lg font-bold text-green-300">{formatNumber(totals.net)}</p>
        </div>
        <div className="bg-slate-700 text-white rounded-lg p-3 text-center">
          <p className="text-xs opacity-70">حصة الشركات</p>
          <p className="text-lg font-bold text-blue-300">{formatNumber(totals.companyTotal)}</p>
        </div>
        <div className="bg-slate-700 text-white rounded-lg p-3 text-center">
          <p className="text-xs opacity-70">حصة المرضى</p>
          <p className="text-lg font-bold text-amber-300">{formatNumber(totals.patientTotal)}</p>
        </div>
      </div>

      {/* ── الجدول ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">لا توجد فواتير تعاقد في هذه الفترة</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="text-right">رقم الفاتورة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">العميل / المنتسب</TableHead>
                <TableHead className="text-right">الشركة</TableHead>
                <TableHead className="text-right">صافي</TableHead>
                <TableHead className="text-right">حصة الشركة</TableHead>
                <TableHead className="text-right">حصة المريض</TableHead>
                <TableHead className="text-right">المطالبة</TableHead>
                <TableHead className="text-right">المستودع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id} className="text-xs hover:bg-muted/50" data-testid={`row-contract-invoice-${row.id}`}>
                  <TableCell>
                    <Link href={`/sales-invoices?id=${row.id}`}>
                      <span className="text-blue-600 underline cursor-pointer font-medium">
                        #{row.invoiceNumber}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>{row.invoiceDate}</TableCell>
                  <TableCell>{row.customerName ?? "—"}</TableCell>
                  <TableCell>{row.contractCompany ?? "—"}</TableCell>
                  <TableCell className="font-mono">{formatNumber(parseFloat(String(row.netTotal ?? 0)))}</TableCell>
                  <TableCell className="font-mono text-blue-700">
                    {formatNumber(parseFloat(String(row.companyShareTotal ?? 0)))}
                  </TableCell>
                  <TableCell className="font-mono text-amber-700">
                    {formatNumber(parseFloat(String(row.patientShareTotal ?? 0)))}
                  </TableCell>
                  <TableCell>{claimBadge(row.claimStatus)}</TableCell>
                  <TableCell>{(row as any).warehouseNameAr ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── التنقل بين الصفحات ──────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 print:hidden">
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>التالي</Button>
          <span className="text-sm">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
        </div>
      )}
    </div>
  );
}
