/**
 * InvoiceEditor — محرر فاتورة الشراء (Compound Component)
 *
 * يجمع: شريط العنوان + بيانات الرأس + جدول الأصناف + الإجماليات + نافذة الاعتماد.
 * لا يحمل حالة خاصة — كل شيء يأتي من الـ orchestrator (index.tsx).
 */
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Save, CheckCircle, Loader2, Check } from "lucide-react";
import { formatDateShort } from "@/lib/formatters";
import { purchaseInvoiceStatusLabels } from "@shared/schema";
import type { PurchaseInvoiceWithDetails } from "@shared/schema";

import { InvoiceLineTable } from "./InvoiceLineTable";
import { InvoiceTotals }    from "./InvoiceTotals";
import type { UseInvoiceLinesReturn }   from "../hooks/useInvoiceLines";
import type { UseInvoiceDiscountReturn } from "../hooks/useInvoiceDiscount";
import type { AutoSaveStatus }          from "../hooks/useAutoSave";

interface Props {
  // ── البيانات ──────────────────────────────────────────────────────────
  invoiceDetail:  PurchaseInvoiceWithDetails | undefined;
  isLoading:      boolean;
  invoiceLines:   UseInvoiceLinesReturn;
  discount:       UseInvoiceDiscountReturn;
  autoSaveStatus: AutoSaveStatus;
  isPending:      boolean;

  // ── حقول الرأس ─────────────────────────────────────────────────────────
  invoiceDate: string;
  notes:       string;
  onInvoiceDateChange: (v: string) => void;

  // ── actions ────────────────────────────────────────────────────────────
  onSave:    () => void;
  onApprove: () => void;

  // ── نافذة الاعتماد ─────────────────────────────────────────────────────
  confirmApproveOpen:    boolean;
  setConfirmApproveOpen: (v: boolean) => void;
}

export function InvoiceEditor({
  invoiceDetail, isLoading,
  invoiceLines, discount, autoSaveStatus, isPending,
  invoiceDate, notes, onInvoiceDateChange,
  onSave, onApprove,
  confirmApproveOpen, setConfirmApproveOpen,
}: Props) {
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoiceDetail) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground">لم يتم العثور على الفاتورة</p>
        <Button variant="outline" size="sm" className="mt-4"
          onClick={() => navigate("/purchase-invoices")} data-testid="button-back-not-found">
          <ArrowRight className="h-4 w-4 ml-1" /> رجوع
        </Button>
      </div>
    );
  }

  const isDraft      = invoiceDetail.status === "draft";
  const isApproved   = invoiceDetail.status === "approved_costed";

  return (
    <div className="flex flex-col h-full" dir="rtl">

      {/* ── شريط العنوان ────────────────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 sticky top-0 z-50">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm"
            onClick={() => navigate("/purchase-invoices")} data-testid="button-back">
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-sm font-bold">فاتورة شراء #{invoiceDetail.invoiceNumber}</h1>
          <Badge
            className={isApproved ? "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" : ""}
            variant={isDraft ? "secondary" : "default"}
            data-testid="badge-status"
          >
            {purchaseInvoiceStatusLabels[invoiceDetail.status] || invoiceDetail.status}
          </Badge>
        </div>

        {isDraft && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onSave} disabled={isPending} data-testid="button-save">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Save className="h-3 w-3 ml-1" />}
              حفظ
            </Button>
            <Button size="sm" onClick={() => setConfirmApproveOpen(true)} disabled={isPending} data-testid="button-approve">
              {isPending ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <CheckCircle className="h-3 w-3 ml-1" />}
              اعتماد وتسعير
            </Button>
            {autoSaveStatus === "saving" && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid="text-auto-save-status">
                <Loader2 className="h-3 w-3 animate-spin" /> جاري الحفظ التلقائي...
              </span>
            )}
            {autoSaveStatus === "saved" && (
              <span className="text-[10px] text-green-600 flex items-center gap-1" data-testid="text-auto-save-status">
                <Check className="h-3 w-3" /> تم الحفظ التلقائي
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── بيانات الرأس ────────────────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center gap-4 flex-wrap text-[12px]">
        <div className="flex items-center gap-1">
          <span className="font-semibold">المورد:</span>
          <span data-testid="text-supplier">{invoiceDetail.supplier?.nameAr}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-semibold">رقم فاتورة المورد:</span>
          <span data-testid="text-supplier-invoice">{invoiceDetail.supplierInvoiceNo}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-semibold">المخزن:</span>
          <span data-testid="text-warehouse">{invoiceDetail.warehouse?.nameAr}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-semibold">التاريخ:</span>
          {isDraft ? (
            <input type="date" value={invoiceDate} onChange={(e) => onInvoiceDateChange(e.target.value)}
              className="peachtree-input w-[130px]" data-testid="input-invoice-date" />
          ) : (
            <span data-testid="text-invoice-date">{formatDateShort(invoiceDate)}</span>
          )}
        </div>
      </div>

      {/* ── جدول الأصناف ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-2">
        <InvoiceLineTable
          lines={invoiceLines.lines}
          isDraft={isDraft}
          onPurchasePriceChange={invoiceLines.handlePurchasePriceChange}
          onDiscountPctChange={invoiceLines.handleDiscountPctChange}
          onDiscountValueChange={invoiceLines.handleDiscountValueChange}
          onVatRateChange={invoiceLines.handleVatRateChange}
        />
      </div>

      {/* ── الإجماليات ──────────────────────────────────────────────────── */}
      <InvoiceTotals
        summary={discount.summary}
        isDraft={isDraft}
        invoiceDiscountPct={discount.invoiceDiscountPct}
        invoiceDiscountVal={discount.invoiceDiscountVal}
        onDiscountPctChange={discount.handleInvoiceDiscountPctChange}
        onDiscountValChange={discount.handleInvoiceDiscountValChange}
      />

      {/* ── نافذة تأكيد الاعتماد ────────────────────────────────────────── */}
      <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الاعتماد والتسعير</DialogTitle>
            <DialogDescription>هل أنت متأكد من اعتماد هذه الفاتورة وتسعيرها؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmApproveOpen(false)} data-testid="button-cancel-approve">
              إلغاء
            </Button>
            <Button onClick={onApprove} disabled={isPending} data-testid="button-confirm-approve">
              {isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              تأكيد الاعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
