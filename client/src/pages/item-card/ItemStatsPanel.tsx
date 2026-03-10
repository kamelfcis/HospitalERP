import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Plus, Pencil, Trash2, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import type { PurchaseTransaction, ItemDepartmentPriceWithDepartment, Department } from "@shared/schema";
import type { ItemWithFormType, AvgSalesResponse } from "./types";

interface ItemStatsPanelProps {
  item: ItemWithFormType | undefined;
  isNew: boolean;
  lastPurchases: PurchaseTransaction[] | undefined;
  avgSales: AvgSalesResponse | undefined;
  salesPeriod: string;
  setSalesPeriod: (v: string) => void;
  purchaseFromDate: string;
  setPurchaseFromDate: (v: string) => void;
  departmentPrices: ItemDepartmentPriceWithDepartment[] | undefined;
  availableDepartments: Department[];
  handleOpenDeptPriceDialog: (dp?: ItemDepartmentPriceWithDepartment) => void;
  onDeleteDeptPrice: (id: string) => void;
  deletingDeptPrice: boolean;
}

const TH_STYLE: React.CSSProperties = { fontSize: "10px", padding: "3px 5px", whiteSpace: "nowrap" };
const TD_STYLE: React.CSSProperties = { fontSize: "10px", padding: "2px 5px" };

export default function ItemStatsPanel({
  item,
  isNew,
  lastPurchases,
  avgSales,
  salesPeriod,
  setSalesPeriod,
  purchaseFromDate,
  setPurchaseFromDate,
  departmentPrices,
  availableDepartments,
  handleOpenDeptPriceDialog,
  onDeleteDeptPrice,
  deletingDeptPrice,
}: ItemStatsPanelProps) {
  const [purchaseTab, setPurchaseTab] = useState<"prices" | "bonuses">("prices");

  if (isNew) {
    return (
      <div className="col-span-4 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-[11px]">سيتم عرض إحصائيات الصنف</p>
          <p className="text-[11px]">بعد الحفظ</p>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-4 flex flex-col gap-2">

      {/* ── آخر المشتريات ────────────────────────────────────────── */}
      <fieldset className="peachtree-grid p-2">
        <legend className="text-[11px] font-semibold px-1 text-primary">آخر المشتريات</legend>

        {/* Filter row */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <Label className="text-[10px] shrink-0">من:</Label>
          <Input
            type="month"
            value={purchaseFromDate}
            onChange={(e) => setPurchaseFromDate(e.target.value)}
            className="h-5 text-[10px] px-1 py-0 w-28"
            data-testid="input-purchase-from-date"
          />
          {purchaseFromDate && (
            <button
              onClick={() => setPurchaseFromDate("")}
              className="text-muted-foreground hover:text-foreground"
              title="إزالة الفلتر"
              data-testid="btn-clear-purchase-date"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <span className="text-[9px] text-muted-foreground me-auto">
            {purchaseFromDate
              ? `${lastPurchases?.length ?? 0} سجل`
              : "آخر 5 مشتريات"}
          </span>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-0 mb-1.5 border-b border-border/50">
          <button
            onClick={() => setPurchaseTab("prices")}
            data-testid="tab-purchase-prices"
            className={`px-2.5 py-0.5 text-[10px] font-medium rounded-t-sm -mb-px border-b-2 transition-colors ${
              purchaseTab === "prices"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            الأسعار والكميات
          </button>
          <button
            onClick={() => setPurchaseTab("bonuses")}
            data-testid="tab-purchase-bonuses"
            className={`px-2.5 py-0.5 text-[10px] font-medium rounded-t-sm -mb-px border-b-2 transition-colors ${
              purchaseTab === "bonuses"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            الهدايا والفواتير
          </button>
        </div>

        {lastPurchases && lastPurchases.length > 0 ? (
          <div className="overflow-y-auto max-h-48 border border-border/40 rounded-sm">

            {/* ── Tab 1: Prices & Quantities ── */}
            {purchaseTab === "prices" && (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th style={TH_STYLE} className="text-center w-6">#</th>
                    <th style={TH_STYLE} className="text-right">التاريخ</th>
                    <th style={{...TH_STYLE, maxWidth: 80}} className="text-right">المورد</th>
                    <th style={TH_STYLE} className="text-center">الكمية</th>
                    <th style={TH_STYLE} className="text-left">سعر الشراء</th>
                    <th style={TH_STYLE} className="text-left">سعر البيع</th>
                  </tr>
                </thead>
                <tbody>
                  {lastPurchases.map((p, i) => (
                    <tr key={p.id} className="peachtree-grid-row" data-testid={`purchase-row-${i}`}>
                      <td style={TD_STYLE} className="text-center font-mono text-muted-foreground">
                        {i + 1}
                      </td>
                      <td style={TD_STYLE} className="font-mono whitespace-nowrap" dir="ltr">
                        {p.txDate || "-"}
                      </td>
                      <td
                        style={{ ...TD_STYLE, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={p.supplierName || "-"}
                      >
                        {p.supplierName || "-"}
                      </td>
                      <td style={TD_STYLE} className="text-center font-mono whitespace-nowrap">
                        {p.qty}
                      </td>
                      <td style={TD_STYLE} className="font-mono whitespace-nowrap" dir="ltr">
                        {formatCurrency(p.purchasePrice)}
                      </td>
                      <td style={TD_STYLE} className="font-mono whitespace-nowrap" dir="ltr">
                        {p.salePriceSnapshot ? formatCurrency(p.salePriceSnapshot) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ── Tab 2: Bonuses & Supplier Invoices ── */}
            {purchaseTab === "bonuses" && (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th style={TH_STYLE} className="text-center w-6">#</th>
                    <th style={TH_STYLE} className="text-right">التاريخ</th>
                    <th style={{...TH_STYLE, maxWidth: 80}} className="text-right">المورد</th>
                    <th style={TH_STYLE} className="text-center">الهدية</th>
                    <th style={{...TH_STYLE, minWidth: 90}} className="text-right">فاتورة المورد</th>
                  </tr>
                </thead>
                <tbody>
                  {lastPurchases.map((p, i) => {
                    const hasBonus = parseFloat(p.bonusQty || "0") > 0;
                    return (
                      <tr key={p.id} className="peachtree-grid-row" data-testid={`purchase-bonus-row-${i}`}>
                        <td style={TD_STYLE} className="text-center font-mono text-muted-foreground">
                          {i + 1}
                        </td>
                        <td style={TD_STYLE} className="font-mono whitespace-nowrap" dir="ltr">
                          {p.txDate || "-"}
                        </td>
                        <td
                          style={{ ...TD_STYLE, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={p.supplierName || "-"}
                        >
                          {p.supplierName || "-"}
                        </td>
                        <td style={TD_STYLE} className="text-center">
                          {hasBonus ? (
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1 py-0 bg-green-100 text-green-800 border-green-200"
                            >
                              {p.bonusQty}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/30 text-[9px]">—</span>
                          )}
                        </td>
                        <td style={TD_STYLE} className="font-mono text-muted-foreground whitespace-nowrap">
                          {p.supplierInvoiceNo || <span className="text-muted-foreground/30 text-[9px]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground text-center py-2">
            {purchaseFromDate ? "لا توجد مشتريات في هذه الفترة" : "لا توجد مشتريات بعد"}
          </div>
        )}
      </fieldset>

      {/* ── إحصائيات المبيعات ─────────────────────────────────────── */}
      <fieldset className="peachtree-grid p-2">
        <legend className="text-[11px] font-semibold px-1 text-primary">إحصائيات المبيعات</legend>
        <div className="flex items-center gap-1 mb-2">
          <Label className="text-[10px]">الفترة:</Label>
          <Select value={salesPeriod} onValueChange={setSalesPeriod}>
            <SelectTrigger className="h-5 text-[10px] px-1 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 شهور</SelectItem>
              <SelectItem value="6">6 شهور</SelectItem>
              <SelectItem value="12">سنة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="bg-blue-50 rounded p-1">
            <div className="text-[9px] text-muted-foreground">عدد الفواتير</div>
            <div className="text-sm font-bold text-blue-700">{avgSales?.invoiceCount || 0}</div>
          </div>
          <div className="bg-green-50 rounded p-1">
            <div className="text-[9px] text-muted-foreground">إجمالي الكمية</div>
            <div className="text-sm font-bold text-green-700">{avgSales?.totalQty || "0"}</div>
          </div>
          <div className="bg-purple-50 rounded p-1">
            <div className="text-[9px] text-muted-foreground">متوسط السعر</div>
            <div className="text-sm font-bold text-purple-700">{formatCurrency(avgSales?.avgPrice || "0")}</div>
          </div>
        </div>
      </fieldset>

      {/* ── أسعار حسب القسم ───────────────────────────────────────── */}
      <fieldset className="peachtree-grid p-2">
        <legend className="text-[11px] font-semibold px-1 text-primary">أسعار حسب القسم (للوحدة الكبرى)</legend>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground">
            السعر الافتراضي/{item?.majorUnitName || "وحدة"}: {formatCurrency(item?.salePriceCurrent || "0")}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="text-[10px] gap-0.5 px-1"
            onClick={() => handleOpenDeptPriceDialog()}
            disabled={availableDepartments.length === 0}
            data-testid="button-add-dept-price"
          >
            <Plus className="h-3 w-3" />
            إضافة سعر لقسم
          </Button>
        </div>
        {departmentPrices && departmentPrices.length > 0 ? (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-1 px-1 text-right font-medium">القسم</th>
                <th className="py-1 px-1 text-left font-medium">سعر البيع</th>
                <th className="py-1 px-1 text-center font-medium w-12">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {departmentPrices.map((dp, i) => (
                <tr key={dp.id} className={i < departmentPrices.length - 1 ? "border-b border-dashed" : ""}>
                  <td className="py-1 px-1">{dp.department?.nameAr || "-"}</td>
                  <td className="py-1 px-1 text-left font-mono">{formatCurrency(dp.salePrice)}</td>
                  <td className="py-1 px-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDeptPriceDialog(dp)}
                        data-testid={`button-edit-dept-price-${dp.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => onDeleteDeptPrice(dp.id)}
                        disabled={deletingDeptPrice}
                        data-testid={`button-delete-dept-price-${dp.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-[10px] text-muted-foreground text-center py-2">
            جميع الأقسام تستخدم السعر الافتراضي
          </div>
        )}
        <div className="mt-2 pt-2 border-t">
          <div className="text-[9px] text-muted-foreground mb-1">ملخص الأسعار:</div>
          <div className="text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span>السعر الافتراضي:</span>
              <span className="font-mono font-medium">{formatCurrency(item?.salePriceCurrent || "0")}</span>
            </div>
            {departmentPrices?.map((dp) => (
              <div key={dp.id} className="flex justify-between text-muted-foreground">
                <span>{dp.department?.nameAr}:</span>
                <span className="font-mono">{formatCurrency(dp.salePrice)}</span>
              </div>
            ))}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
