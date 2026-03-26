import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Save, Loader2, Barcode, Search, ShoppingCart,
} from "lucide-react";
import { salesInvoiceStatusLabels, customerTypeLabels } from "@shared/schema";
import type { Warehouse } from "@shared/schema";
import {
  CreditCustomerCombobox,
  type CreditCustomer,
} from "@/components/shared/CreditCustomerCombobox";

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
  barcodeDisplay, setBarcodeDisplay, barcodeLoading, barcodeInputRef,
  warehouses, finalizePending, readinessBadge,
  onBack, onFinalize, onBarcodeScan, onOpenSearch, onOpenServiceSearch,
}: Props) {
  return (
    <>
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
        {customerType === "contract" && (
          <div className="flex items-center gap-1">
            <span className="font-semibold">الشركة الأم:</span>
            {isDraft ? (
              <input
                type="text"
                value={contractCompany}
                onChange={(e) => setContractCompany(e.target.value)}
                placeholder="الشركة الأم"
                className="peachtree-input w-[160px]"
                data-testid="input-contract-company"
              />
            ) : (
              <span data-testid="text-contract-company">{contractCompany || "-"}</span>
            )}
          </div>
        )}
      </div>

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
          <Button variant="outline" size="sm" onClick={onOpenSearch} data-testid="button-open-search">
            <Search className="h-3 w-3 ml-1" />
            بحث
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
