/**
 * AccountMappings — ربط الحسابات بالعمليات
 *
 * Thin orchestrator: composes hooks + components.
 * All business logic lives in useMappingRows / useMappingSave.
 * All UI primitives live in components/.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, Save, Loader2, Plus, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMappingRows } from "./hooks/useMappingRows";
import { useMappingSave }  from "./hooks/useMappingSave";
import { MappingFilters }              from "./components/MappingFilters";
import { MappingStatusBar }            from "./components/MappingStatusBar";
import { WarehouseTransferNotice }     from "./components/WarehouseTransferNotice";
import { MappingTable }                from "./components/MappingTable";
import { SalesReturnJournalPreview }   from "./components/SalesReturnJournalPreview";
import type { MappingRow } from "./types";

export default function AccountMappings() {
  const data = useMappingRows();
  const save = useMappingSave(data);

  // جلب returns_mode وربط sales_invoice عند عرض تبويب sales_return
  const isSalesReturnTab = data.selectedTxType === "sales_return";
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    enabled: isSalesReturnTab,
  });
  const returnsMode = settings?.returns_mode ?? "reverse_original";

  const { data: siMappingsRaw } = useQuery<MappingRow[]>({
    queryKey: ["/api/account-mappings", "sales_invoice"],
    queryFn: () => fetch("/api/account-mappings?transactionType=sales_invoice", { credentials: "include" }).then(r => r.json()),
    enabled: isSalesReturnTab && returnsMode === "reverse_original",
  });

  const showTransferNotice = data.selectedTxType === "warehouse_transfer" && !data.isLoading;
  const showStatusBar      = !data.isLoading && data.selectedTxType !== "warehouse_transfer";

  return (
    <div className="p-4 space-y-4" dir="rtl">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            ربط الحسابات بالعمليات
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={data.addRow} data-testid="button-add-row">
            <Plus className="h-4 w-4" />
            <span className="mr-1">إضافة سطر</span>
          </Button>
          <Button
            onClick={save.handleSave}
            disabled={save.isSaving}
            data-testid="button-save-mappings"
          >
            {save.isSaving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />}
            <span className="mr-1">حفظ</span>
          </Button>
        </div>
      </div>

      {/* ── Filters + mapping editor card ── */}
      <Card>
        <CardHeader className="pb-3">
          <MappingFilters
            selectedTxType={data.selectedTxType}
            onTxTypeChange={data.setSelectedTxType}
            selectedWarehouseId={data.selectedWarehouseId}
            onWarehouseChange={data.setSelectedWarehouseId}
            selectedPharmacyId={data.selectedPharmacyId}
            onPharmacyChange={data.setSelectedPharmacyId}
            selectedDepartmentId={data.selectedDepartmentId}
            onDepartmentChange={data.setSelectedDepartmentId}
            warehouses={data.warehouses}
            pharmacies={data.pharmacies}
            departments={data.departments}
            showWarehouseSelector={data.showWarehouseSelector}
            showPharmacySelector={data.showPharmacySelector}
            showDepartmentSelector={data.showDepartmentSelector}
          />
        </CardHeader>

        {showTransferNotice && <WarehouseTransferNotice />}

        {showStatusBar && (
          <MappingStatusBar
            setupComplete={data.setupComplete}
            requiredMissing={data.requiredMissing}
            conditionalMissing={data.conditionalMissing}
            configured={data.configured}
            isWarehouseView={data.isWarehouseView}
            isPharmacyView={data.isPharmacyView}
            isDepartmentView={data.isDepartmentView}
          />
        )}

        {data.selectedTxType === "supplier_payment" && (
          <div className="mx-4 mb-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200" dir="rtl">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">ملاحظة: حساب ذمم الموردين مُعيَّن على مستوى المورد</p>
              <p className="text-xs opacity-80">
                حساب الذمم (الجانب المدين) يُحدد تلقائياً من <strong>حساب GL المرتبط بالمورد</strong> في شاشة بيانات الموردين.
                كل مورد مربوط بحساب مختلف في دليل الحسابات — لا يحتاج الأدمن لتحديد حساب ذمم موحد هنا.
                الربط هنا يُستخدم فقط كاحتياطي في حالة عدم وجود حساب مرتبط بالمورد.
              </p>
            </div>
          </div>
        )}

        {data.selectedTxType === "patient_invoice" && (
          <div className="mx-4 mb-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200" dir="rtl">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">ملاحظة: حساب الذمم يُحدد تلقائياً من بيانات شركة التعاقد</p>
              <p className="text-xs opacity-80">
                لمرضى التعاقد: حساب الذمم (المدين) يُحدد أولاً من <strong>حساب GL المرتبط بالشركة</strong> في شاشة بيانات الشركات.
                كل شركة يمكن ربطها بحساب ذمم مختلف (مثلاً: ذمم حضانة، ذمم تكافل).
                الربط هنا يُستخدم فقط كاحتياطي إذا لم يكن للشركة حساب مخصص.
              </p>
            </div>
          </div>
        )}

        {data.selectedTxType === "cashier_shift_close" && (
          <div className="mx-4 mb-3 flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200" dir="rtl">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">ملاحظة: حسابات فروق الجرد مُعيَّنة على مستوى المستخدم</p>
              <p className="text-xs opacity-80">
                هنا تُعيَّن فقط <strong>حساب عهدة أمين الخزنة</strong> (المدين — يستلم النقدية).
                أما <strong>حسابا العجز والفائض</strong> فتُعيَّن لكل كاشير على حدة من صفحة إدارة المستخدمين.
              </p>
            </div>
          </div>
        )}

        <CardContent>
          <MappingTable
            rows={data.rows}
            txSpecs={data.txSpecs}
            txType={data.selectedTxType}
            usedLineTypes={data.usedLineTypes}
            isWarehouseView={data.isWarehouseView}
            isPharmacyView={data.isPharmacyView}
            isLoading={data.isLoading}
            onUpdateRow={data.updateRow}
            onRemoveRow={data.removeRow}
            onAddRow={data.addRow}
          />
        </CardContent>
      </Card>

      {/* ── معاينة بنود القيد لمردود المبيعات ── */}
      {isSalesReturnTab && !data.isLoading && (
        <SalesReturnJournalPreview
          rows={data.rows}
          returnsMode={returnsMode}
          siRows={siMappingsRaw ?? []}
        />
      )}

    </div>
  );
}
