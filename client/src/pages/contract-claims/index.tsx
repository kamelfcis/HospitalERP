/**
 * صفحة مطالبات التأمين — Contract Claims Management
 *
 * دورة الحياة: draft → submitted → responded → settled
 *
 * اللوحة اليسرى: قائمة دفعات المطالبات مع فلاتر
 * اللوحة اليمنى: تفاصيل الدفعة المختارة + سطورها + أزرار العمليات
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  SendHorizonal,
  CheckCircle2,
  XCircle,
  Coins,
  Ban,
  Search,
  ChevronLeft,
  FileText,
  Building2,
  Calendar,
  AlertCircle,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface ClaimLine {
  id:                   string;
  batchId:              string;
  patientInvoiceLineId?: string;
  salesInvoiceLineId?:  string;
  invoiceHeaderId:      string;
  contractMemberId?:    string;
  serviceDescription:   string;
  serviceDate:          string;
  listPrice:            string;
  contractPrice:        string;
  companyShareAmount:   string;
  patientShareAmount:   string;
  approvedAmount?:      string | null;
  status:               "pending" | "approved" | "rejected" | "settled";
  rejectionReason?:     string | null;
  approvedAt?:          string | null;
  settledAt?:           string | null;
}

interface ClaimBatch {
  id:                 string;
  companyId:          string;
  contractId:         string;
  batchNumber:        string;
  batchDate:          string;
  status:             "draft" | "submitted" | "responded" | "settled" | "cancelled";
  submittedAt?:       string | null;
  companyReferenceNo?: string | null;
  totalClaimed:       string;
  totalApproved:      string;
  totalRejected:      string;
  notes?:             string | null;
  journalEntryId?:    string | null;
  createdAt:          string;
  companyName?:       string;
  contractName?:      string;
  contractNumber?:    string;
  lines:              ClaimLine[];
}

// ─── Constants ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft:     "مسودة",
  submitted: "مُرسَلة",
  responded: "مُجابة",
  settled:   "مُسوَّاة",
  cancelled: "ملغاة",
};

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700 border-gray-300",
  submitted: "bg-blue-100 text-blue-700 border-blue-300",
  responded: "bg-yellow-100 text-yellow-700 border-yellow-300",
  settled:   "bg-green-100 text-green-700 border-green-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

const LINE_STATUS_LABELS: Record<string, string> = {
  pending:  "معلّق",
  approved: "مقبول",
  rejected: "مرفوض",
  settled:  "مُسوَّى",
};

const LINE_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-gray-100 text-gray-600 border-gray-300",
  approved: "bg-green-100 text-green-700 border-green-300",
  rejected: "bg-red-100 text-red-700 border-red-300",
  settled:  "bg-blue-100 text-blue-700 border-blue-300",
};

function fmt(val?: string | null) {
  if (!val) return "٠.٠٠";
  return parseFloat(val).toLocaleString("ar-EG", { minimumFractionDigits: 2 });
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function ContractClaimsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [filterStatus, setFilterStatus]   = useState<string>("all");
  const [filterSearch, setFilterSearch]   = useState<string>("");

  // Respond dialog
  const [respondOpen, setRespondOpen]     = useState(false);
  const [lineResponses, setLineResponses] = useState<Record<string, { status: "approved" | "rejected"; approvedAmount: string; rejectionReason: string }>>({});

  // Settle dialog
  const [settleOpen, setSettleOpen]       = useState(false);
  const [settleForm, setSettleForm]       = useState({ settlementDate: "", companyReferenceNo: "", bankAccountId: "", companyArAccountId: "", notes: "" });

  const { data: batches = [], isLoading } = useQuery<ClaimBatch[]>({
    queryKey: ["/api/contract-claims"],
  });

  const selected = useMemo(
    () => batches.find(b => b.id === selectedId) ?? null,
    [batches, selectedId]
  );

  const filtered = useMemo(() => {
    let list = batches;
    if (filterStatus !== "all") list = list.filter(b => b.status === filterStatus);
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      list = list.filter(b =>
        b.batchNumber.toLowerCase().includes(q) ||
        (b.companyName ?? "").toLowerCase().includes(q) ||
        (b.contractNumber ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [batches, filterStatus, filterSearch]);

  // ── Mutations ──────────────────────────────────────────────────────────

  const submitMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/contract-claims/${id}/submit`, {}),
    onSuccess: () => { toast({ title: "تم إرسال الدفعة للشركة" }); qc.invalidateQueries({ queryKey: ["/api/contract-claims"] }); },
    onError: (e: any) => toast({ title: e.message ?? "خطأ", variant: "destructive" }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/contract-claims/${id}/cancel`, {}),
    onSuccess: () => { toast({ title: "تم إلغاء الدفعة" }); qc.invalidateQueries({ queryKey: ["/api/contract-claims"] }); },
    onError: (e: any) => toast({ title: e.message ?? "خطأ", variant: "destructive" }),
  });

  const respondMut = useMutation({
    mutationFn: ({ id, responses }: { id: string; responses: any[] }) =>
      apiRequest("POST", `/api/contract-claims/${id}/respond`, { responses }),
    onSuccess: () => {
      toast({ title: "تم تسجيل رد الشركة" });
      qc.invalidateQueries({ queryKey: ["/api/contract-claims"] });
      setRespondOpen(false);
    },
    onError: (e: any) => toast({ title: e.message ?? "خطأ", variant: "destructive" }),
  });

  const settleMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("POST", `/api/contract-claims/${id}/settle`, data),
    onSuccess: () => {
      toast({ title: "تمت التسوية المالية بنجاح" });
      qc.invalidateQueries({ queryKey: ["/api/contract-claims"] });
      setSettleOpen(false);
    },
    onError: (e: any) => toast({ title: e.message ?? "خطأ", variant: "destructive" }),
  });

  // ── Respond init ───────────────────────────────────────────────────────

  function openRespondDialog() {
    if (!selected) return;
    const init: typeof lineResponses = {};
    for (const l of selected.lines) {
      init[l.id] = {
        status:          "approved",
        approvedAmount:  l.companyShareAmount,
        rejectionReason: "",
      };
    }
    setLineResponses(init);
    setRespondOpen(true);
  }

  function handleRespond() {
    if (!selected) return;
    const responses = Object.entries(lineResponses).map(([lineId, r]) => ({
      lineId,
      status:          r.status,
      approvedAmount:  r.status === "approved" ? r.approvedAmount : undefined,
      rejectionReason: r.status === "rejected" ? r.rejectionReason : undefined,
    }));
    respondMut.mutate({ id: selected.id, responses });
  }

  function handleSettle() {
    if (!selected || !settleForm.settlementDate) {
      toast({ title: "تاريخ التسوية مطلوب", variant: "destructive" });
      return;
    }
    settleMut.mutate({ id: selected.id, data: settleForm });
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full gap-0 overflow-hidden" dir="rtl">
      {/* ── LEFT: Batch List ──────────────────────────────────────────── */}
      <div className="w-80 border-l bg-muted/30 flex flex-col">
        <div className="p-3 border-b space-y-2">
          <h2 className="font-semibold text-sm flex items-center gap-1">
            <FileText className="h-4 w-4 text-primary" />
            دفعات المطالبات
          </h2>
          <div className="relative">
            <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="بحث..."
              className="pr-8 h-8 text-sm"
              data-testid="input-claims-search"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-claims-status">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              لا توجد دفعات
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  data-testid={`row-batch-${b.id}`}
                  className={`w-full text-right p-3 text-sm hover:bg-muted/60 transition-colors ${selectedId === b.id ? "bg-primary/10 border-r-2 border-primary" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-xs">{b.batchNumber}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[b.status] ?? ""}`}>
                      {STATUS_LABELS[b.status] ?? b.status}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs truncate">{b.companyName ?? "—"}</div>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>{b.batchDate}</span>
                    <span className="font-semibold text-foreground">{fmt(b.totalClaimed)} ج.م</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── RIGHT: Batch Detail ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <ChevronLeft className="h-8 w-8" />
            <span className="text-sm">اختر دفعة من القائمة</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base">{selected.batchNumber}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[selected.status]}`}>
                    {STATUS_LABELS[selected.status]}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{selected.companyName ?? "—"}</span>
                  <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{selected.contractNumber} — {selected.contractName}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{selected.batchDate}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {selected.status === "draft" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => submitMut.mutate(selected.id)}
                      disabled={submitMut.isPending}
                      data-testid="button-submit-batch"
                    >
                      {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <SendHorizonal className="h-4 w-4 ml-1" />}
                      إرسال للشركة
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => cancelMut.mutate(selected.id)}
                      disabled={cancelMut.isPending}
                      data-testid="button-cancel-batch"
                    >
                      <Ban className="h-4 w-4 ml-1" />
                      إلغاء
                    </Button>
                  </>
                )}
                {selected.status === "submitted" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openRespondDialog}
                      data-testid="button-respond-batch"
                    >
                      <CheckCircle2 className="h-4 w-4 ml-1" />
                      تسجيل رد الشركة
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => { setSettleOpen(true); setSettleForm({ settlementDate: new Date().toISOString().split("T")[0], companyReferenceNo: "", bankAccountId: "", companyArAccountId: "", notes: "" }); }}
                      data-testid="button-settle-batch"
                    >
                      <Coins className="h-4 w-4 ml-1" />
                      تسوية
                    </Button>
                  </>
                )}
                {selected.status === "responded" && (
                  <Button
                    size="sm"
                    onClick={() => { setSettleOpen(true); setSettleForm({ settlementDate: new Date().toISOString().split("T")[0], companyReferenceNo: selected.companyReferenceNo ?? "", bankAccountId: "", companyArAccountId: "", notes: "" }); }}
                    data-testid="button-settle-responded-batch"
                  >
                    <Coins className="h-4 w-4 ml-1" />
                    تسوية مالية
                  </Button>
                )}
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-3 divide-x-reverse divide-x border-b text-center">
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-1">إجمالي المطالبة</div>
                <div className="font-bold text-sm">{fmt(selected.totalClaimed)} <span className="text-xs font-normal">ج.م</span></div>
              </div>
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-1">المقبول</div>
                <div className="font-bold text-sm text-green-700">{fmt(selected.totalApproved)} <span className="text-xs font-normal">ج.م</span></div>
              </div>
              <div className="p-3">
                <div className="text-xs text-muted-foreground mb-1">المرفوض</div>
                <div className="font-bold text-sm text-red-600">{fmt(selected.totalRejected)} <span className="text-xs font-normal">ج.م</span></div>
              </div>
            </div>

            {/* Lines Table */}
            <ScrollArea className="flex-1">
              {selected.lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                  <AlertCircle className="h-5 w-5" />
                  لا توجد سطور في هذه الدفعة
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الخدمة</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">سعر القائمة</TableHead>
                      <TableHead className="text-right">سعر العقد</TableHead>
                      <TableHead className="text-right">حصة الشركة</TableHead>
                      <TableHead className="text-right">المعتمد</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.lines.map(line => (
                      <TableRow key={line.id} data-testid={`row-claim-line-${line.id}`}>
                        <TableCell className="text-sm font-medium max-w-xs truncate" title={line.serviceDescription}>
                          {line.serviceDescription}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{line.serviceDate}</TableCell>
                        <TableCell className="text-sm">{fmt(line.listPrice)}</TableCell>
                        <TableCell className="text-sm">{fmt(line.contractPrice)}</TableCell>
                        <TableCell className="text-sm font-semibold">{fmt(line.companyShareAmount)}</TableCell>
                        <TableCell className="text-sm">
                          {line.approvedAmount != null
                            ? <span className="text-green-700 font-semibold">{fmt(line.approvedAmount)}</span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`text-xs px-1.5 py-0.5 rounded border cursor-default ${LINE_STATUS_COLORS[line.status] ?? ""}`}>
                                  {LINE_STATUS_LABELS[line.status] ?? line.status}
                                </span>
                              </TooltipTrigger>
                              {line.rejectionReason && (
                                <TooltipContent side="top">
                                  <p className="text-xs max-w-xs">{line.rejectionReason}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </>
        )}
      </div>

      {/* ── Dialog: Respond ────────────────────────────────────────────── */}
      <Dialog open={respondOpen} onOpenChange={setRespondOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل رد الشركة — {selected?.batchNumber}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {selected?.lines.map(line => {
              const resp = lineResponses[line.id] ?? { status: "approved", approvedAmount: line.companyShareAmount, rejectionReason: "" };
              return (
                <div key={line.id} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{line.serviceDescription}</span>
                    <span className="text-xs text-muted-foreground">{fmt(line.companyShareAmount)} ج.م</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Label className="text-xs w-14 shrink-0">القرار</Label>
                    <Select
                      value={resp.status}
                      onValueChange={val => setLineResponses(prev => ({ ...prev, [line.id]: { ...resp, status: val as any } }))}
                    >
                      <SelectTrigger className="h-8 text-sm flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">مقبول</SelectItem>
                        <SelectItem value="rejected">مرفوض</SelectItem>
                      </SelectContent>
                    </Select>
                    {resp.status === "approved" && (
                      <>
                        <Label className="text-xs w-20 shrink-0">المبلغ المعتمد</Label>
                        <Input
                          value={resp.approvedAmount}
                          onChange={e => setLineResponses(prev => ({ ...prev, [line.id]: { ...resp, approvedAmount: e.target.value } }))}
                          className="h-8 text-sm w-32"
                          type="number"
                          min="0"
                        />
                      </>
                    )}
                  </div>
                  {resp.status === "rejected" && (
                    <div className="flex gap-2 items-start">
                      <Label className="text-xs w-14 shrink-0 mt-1">سبب الرفض</Label>
                      <Textarea
                        value={resp.rejectionReason}
                        onChange={e => setLineResponses(prev => ({ ...prev, [line.id]: { ...resp, rejectionReason: e.target.value } }))}
                        className="text-sm min-h-[60px] flex-1"
                        placeholder="سبب الرفض..."
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondOpen(false)}>إلغاء</Button>
            <Button onClick={handleRespond} disabled={respondMut.isPending} data-testid="button-confirm-respond">
              {respondMut.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              حفظ الرد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Settle ─────────────────────────────────────────────── */}
      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسوية مالية — {selected?.batchNumber}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-sm">تاريخ التسوية *</Label>
              <Input
                type="date"
                value={settleForm.settlementDate}
                onChange={e => setSettleForm(f => ({ ...f, settlementDate: e.target.value }))}
                className="text-sm"
                data-testid="input-settlement-date"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">رقم مرجع الشركة</Label>
              <Input
                value={settleForm.companyReferenceNo}
                onChange={e => setSettleForm(f => ({ ...f, companyReferenceNo: e.target.value }))}
                placeholder="رقم الإشعار / المرجع"
                className="text-sm"
                data-testid="input-company-ref"
              />
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              لتسجيل قيد محاسبي تلقائي، أدخل معرّفَي الحساب أدناه (اختياري):
            </p>
            <div className="space-y-1">
              <Label className="text-sm">حساب النقدية / البنك (مدين)</Label>
              <Input
                value={settleForm.bankAccountId}
                onChange={e => setSettleForm(f => ({ ...f, bankAccountId: e.target.value }))}
                placeholder="معرّف الحساب"
                className="text-sm"
                data-testid="input-bank-account"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">حساب ذمم الشركة (دائن)</Label>
              <Input
                value={settleForm.companyArAccountId}
                onChange={e => setSettleForm(f => ({ ...f, companyArAccountId: e.target.value }))}
                placeholder="معرّف الحساب"
                className="text-sm"
                data-testid="input-ar-account"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">ملاحظات</Label>
              <Textarea
                value={settleForm.notes}
                onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))}
                className="text-sm min-h-[60px]"
                data-testid="textarea-settle-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleOpen(false)}>إلغاء</Button>
            <Button onClick={handleSettle} disabled={settleMut.isPending} data-testid="button-confirm-settle">
              {settleMut.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              تأكيد التسوية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
