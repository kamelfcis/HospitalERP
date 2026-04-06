import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Save, Loader2, Barcode, Search, ShoppingCart,
  CreditCard, CheckCircle2, XCircle, User,
} from "lucide-react";
import { salesInvoiceStatusLabels, customerTypeLabels } from "@shared/schema";
import type { Warehouse } from "@shared/schema";
import {
  CreditCustomerCombobox,
  type CreditCustomer,
} from "@/components/shared/CreditCustomerCombobox";
import {
  PatientSearchCombobox,
} from "@/components/shared/PatientSearchCombobox";
import {
  ContractSelectCombobox,
  type ContractResolved,
} from "@/components/shared/ContractSelectCombobox";

interface MemberResolved {
  memberId:         string;
  contractId:       string;
  companyId:        string;
  memberName:       string;
  companyName:      string;
  cardNumber:       string;
  companyCoveragePct: number;
}

interface Props {
  isNew: boolean;
  isDraft: boolean;
  invoiceNumber?: string;
  status?: string;
  fefoLoading: boolean;
  warehouseId: string;
  setWarehouseId: (v: string) => void;
  invoiceDate: string;
  setInvoiceDate: (v: string) => void;
  customerType: string;
  setCustomerType: (v: string) => void;
  customerId: string;
  setCustomerId: (id: string, c: CreditCustomer) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  contractCompany: string;
  setContractCompany: (v: string) => void;
  contractMemberId: string;
  // ── حقول المريض ─────────────────────────────────────────────────────────
  patientId:    string;
  patientName:  string;
  contractId:   string;
  onPatientChange:  (id: string, name: string) => void;
  onPatientClear:   () => void;
  onContractChange: (resolved: ContractResolved) => void;
  onContractClear:  () => void;
  // ────────────────────────────────────────────────────────────────────────
  barcodeDisplay: string;
  setBarcodeDisplay: (v: string) => void;
  barcodeLoading: boolean;
  barcodeInputRef: React.RefObject<HTMLInputElement>;
  warehouses: Warehouse[] | undefined;
  finalizePending: boolean;
  readinessBadge?: React.ReactNode;
  onBack: () => void;
  onFinalize: () => void;
  onBarcodeScan: () => void;
  onOpenSearch: () => void;
  onOpenServiceSearch: () => void;
  onMemberResolved?: (resolved: MemberResolved) => void;
  onMemberCleared?: () => void;
}

function statusBadge(status: string) {
  const label = salesInvoiceStatusLabels[status] || status;
  if (status === "finalized")
    return <Badge className="bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{label}</Badge>;
  if (status === "cancelled")
    return <Badge className="bg-red-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid="badge-status">{label}</Badge>;
  return <Badge variant="secondary" data-testid="badge-status">{label}</Badge>;
}

export function InvoiceHeaderBar({
  isNew, isDraft, invoiceNumber, status, fefoLoading,
  warehouseId, setWarehouseId, invoiceDate, setInvoiceDate,
  customerType, setCustomerType, customerId, setCustomerId,
  customerName, setCustomerName,
  contractCompany, setContractCompany,
  contractMemberId,
  patientId, patientName, contractId,
  onPatientChange, onPatientClear,
  onContractChange, onContractClear,
  barcodeDisplay, setBarcodeDisplay, barcodeLoading, barcodeInputRef,
  warehouses, finalizePending, readinessBadge,
  onBack, onFinalize, onBarcodeScan, onOpenSearch, onOpenServiceSearch,
  onMemberResolved, onMemberCleared,
}: Props) {
  // ── member card lookup state (local — self-contained) ──────────────────
  const [cardNumber,   setCardNumber]   = useState("");
  const [isLooking,    setIsLooking]    = useState(false);
  const [lookupError,  setLookupError]  = useState<string | null>(null);
  const [resolvedInfo, setResolvedInfo] = useState<MemberResolved | null>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const handleMemberLookup = useCallback(async () => {
    const card = cardNumber.trim();
    if (!card) return;
    setIsLooking(true);
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/contract-members/lookup?cardNumber=${encodeURIComponent(card)}&date=${invoiceDate}`
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "لم يُعثر على المنتسب");
      }
      const data = await res.json();
      const resolved: MemberResolved = {
        memberId:           data.member?.id           || "",
        contractId:         data.contract?.id         || "",
        companyId:          data.company?.id          || "",
        memberName:         data.member?.memberName   || data.member?.name || "",
        companyName:        data.company?.nameAr      || data.company?.name || "",
        cardNumber:         card,
        companyCoveragePct: parseFloat(data.contract?.companyCoveragePct || "100") || 100,
      };
      setResolvedInfo(resolved);
      setCardNumber("");
      onMemberResolved?.(resolved);
    } catch (err: any) {
      setLookupError(err.message || "خطأ في البحث");
    } finally {
      setIsLooking(false);
    }
  }, [cardNumber, invoiceDate, onMemberResolved]);

  const handleClearMember = useCallback(() => {
    setResolvedInfo(null);
    setCardNumber("");
    setLookupError(null);
    onMemberCleared?.();
  }, [onMemberCleared]);

  const effectiveResolved = contractMemberId ? resolvedInfo : null;

  return (
    <>
      {/* ── شريط العنوان والأزرار الرئيسية ─────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2 sticky top-0 z-50">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
            <ArrowRight className="h-4 w-4 ml-1" />
            رجوع
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-sm font-bold">
            {isNew ? "فاتورة بيع جديدة" : `فاتورة بيع #${invoiceNumber}`}
          </h1>
          {!isNew && status && statusBadge(status)}
          {fefoLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        </div>
        {isDraft && (
          <div className="flex items-center gap-2">
            {readinessBadge}
            <Button
              size="sm"
              onClick={onFinalize}
              disabled={finalizePending}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-finalize"
            >
              {finalizePending
                ? <Loader2 className="h-3 w-3 animate-spin ml-1" />
                : <Save className="h-3 w-3 ml-1" />}
              حفظ
              <span className="mr-1 text-[10px] opacity-70">[F9]</span>
            </Button>
          </div>
        )}
      </div>

      {/* ── معلومات الفاتورة الأساسية ────────────────────────────────────── */}
      <div className="peachtree-toolbar flex items-center gap-4 flex-wrap text-[12px]">
        <div className="flex items-center gap-1">
          <span className="font-semibold">المخزن:</span>
          {isDraft ? (
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="peachtree-select min-w-[140px]"
              data-testid="select-warehouse"
            >
              <option value="">اختر المخزن</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>{w.nameAr}</option>
              ))}
            </select>
          ) : (
            <span data-testid="text-warehouse">{warehouses?.find((w) => w.id === warehouseId)?.nameAr || ""}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="font-semibold">التاريخ:</span>
          {isDraft ? (
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="peachtree-input w-[130px]"
              data-testid="input-invoice-date"
            />
          ) : (
            <span data-testid="text-invoice-date">{invoiceDate}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="font-semibold">نوع العميل:</span>
          {isDraft ? (
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
              className="peachtree-select"
              data-testid="select-customer-type"
            >
              <option value="cash">نقدي</option>
              <option value="credit">آجل</option>
              <option value="delivery">توصيل منزلي</option>
              <option value="contract">تعاقد</option>
            </select>
          ) : (
            <span data-testid="text-customer-type">{customerTypeLabels[customerType] || customerType}</span>
          )}
        </div>

        {/* ── اسم العميل (للغير تعاقد) ─────────────────────────── */}
        {customerType !== "contract" && (
          <div className="flex items-center gap-1">
            <span className="font-semibold">العميل:</span>
            {isDraft && customerType === "credit" ? (
              <CreditCustomerCombobox
                value={customerId}
                onChange={(id, c) => {
                  setCustomerId(id, c);
                  setCustomerName(c.name);
                }}
              />
            ) : isDraft ? (
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="اسم العميل"
                className="peachtree-input w-[160px]"
                data-testid="input-customer-name"
              />
            ) : (
              <span data-testid="text-customer-name">{customerName || "-"}</span>
            )}
          </div>
        )}

        {/* ── عرض الشركة لغير المسودات (تعاقد) ───────────────────── */}
        {customerType === "contract" && !isDraft && (
          <>
            <div className="flex items-center gap-1">
              <span className="font-semibold">المريض:</span>
              <span data-testid="text-patient-name">{patientName || customerName || "-"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">الجهة:</span>
              <span data-testid="text-contract-company">{contractCompany || "-"}</span>
            </div>
          </>
        )}
      </div>

      {/* ── قسم التعاقد (للمسودات فقط) ──────────────────────────────────── */}
      {isDraft && customerType === "contract" && (
        <div className="peachtree-toolbar space-y-1.5 text-[12px]" dir="rtl">

          {/* ── الصف الأول: المريض ─────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-emerald-700">المريض:</span>
            </div>
            <PatientSearchCombobox
              value={patientId}
              selectedName={patientName}
              onChange={(id, name) => {
                onPatientChange(id, name);
                setCustomerName(name);
              }}
              onClear={() => {
                onPatientClear();
                setCustomerName("");
              }}
              data-testid="patient-search"
            />
          </div>

          {/* ── الصف الثاني: العقد / الجهة ─────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-blue-700">العقد / الجهة:</span>
            <ContractSelectCombobox
              value={contractId}
              onChange={(resolved) => {
                onContractChange(resolved);
                setContractCompany(resolved.companyName);
              }}
              onClear={() => {
                onContractClear();
                setContractCompany("");
              }}
              data-testid="contract-select"
            />
          </div>

          {/* ── الصف الثالث: المنتسب (اختياري) ────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-muted-foreground">
              بطاقة المنتسب:
              <span className="font-normal text-[10px] mr-1 text-muted-foreground">(اختياري)</span>
            </span>

            {effectiveResolved || (contractMemberId && !resolvedInfo) ? (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="font-medium text-blue-700 text-[11px]" data-testid="text-resolved-member">
                  {effectiveResolved?.memberName || customerName || "منتسب محدد"}
                </span>
                {effectiveResolved?.companyName && (
                  <span className="text-muted-foreground text-[10px]">— {effectiveResolved.companyName}</span>
                )}
                <button
                  onClick={handleClearMember}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                  data-testid="button-clear-member"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  ref={cardInputRef}
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleMemberLookup(); } }}
                  placeholder="رقم بطاقة المنتسب (اختياري)..."
                  className="peachtree-input w-[200px] font-mono"
                  dir="ltr"
                  data-testid="input-member-card"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMemberLookup}
                  disabled={isLooking || cardNumber.trim().length < 2}
                  className="h-[26px] px-2"
                  data-testid="button-lookup-member"
                >
                  {isLooking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                </Button>
              </div>
            )}

            {lookupError && (
              <span className="text-red-600 text-[11px]" data-testid="text-member-lookup-error">
                {lookupError}
              </span>
            )}
          </div>

          {/* ── helper text ─────────────────────────────────────────────── */}
          <p className="text-[10px] text-muted-foreground pr-1">
            في التأمينات الكبيرة مثل التأمين الصحي الشامل، يمكن اختيار المريض وترك المنتسب فارغاً
          </p>
        </div>
      )}

      {/* ── شريط الباركود ────────────────────────────────────────────────── */}
      {isDraft && (
        <div className="peachtree-toolbar flex items-center gap-2 text-[12px]">
          <Barcode className="h-4 w-4 text-muted-foreground" />
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeDisplay}
            onChange={(e) => setBarcodeDisplay(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onBarcodeScan(); } }}
            placeholder="امسح الباركود من أي مكان..."
            className="peachtree-input flex-1"
            disabled={barcodeLoading}
            data-testid="input-barcode"
          />
          {barcodeLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          <Button variant="outline" size="sm" onClick={onOpenSearch} data-testid="button-open-search" title="اختصار: F2">
            <Search className="h-3 w-3 ml-1" />
            بحث
            <span className="mr-1 text-[9px] text-muted-foreground font-mono opacity-70">[F2]</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenServiceSearch} data-testid="button-open-service-search">
            <ShoppingCart className="h-3 w-3 ml-1" />
            خدمة + مستهلكات
          </Button>
        </div>
      )}
    </>
  );
}
